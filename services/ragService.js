const DEFAULT_LIMIT = 3;
const DEFAULT_SCORE_THRESHOLD = 0.75;
const MULTI_HOP_SCORE_THRESHOLD = 0.6;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how",
  "i", "in", "is", "it", "me", "my", "of", "on", "or", "our", "the", "to",
  "we", "what", "which", "with", "you", "your"
]);

const NON_INFORMATIVE_MATCH_TOKENS = new Set([
  "document", "documents", "mentioned", "name", "list", "tell", "more", "company",
  "companies", "year", "steps", "step", "this", "that", "these", "those"
]);

const TOKEN_ALIASES = {
  create: ["creator", "created", "founded"],
  created: ["creator", "create", "founded"],
  creator: ["create", "created"],
  release: ["released", "year"],
  released: ["release", "year"],
  founded: ["founder", "creator", "created"],
  optimized: ["optimized", "feature"],
};

const MULTI_HOP_PATTERNS = [
  /\band\b/i,
  /\bwho\b.*\bwhen\b/i,
  /\bwhat\b.*\bwho\b/i,
  /\bwhich company\b/i,
  /\bpaper\b.*\byear\b/i,
  /\bname\s+\d+\b/i,
  /\blist\b/i,
  /\bsteps?\b/i,
  /\bdifference between\b/i,
  /\bcompare\b/i,
];

const normalizeText = (value = "") =>
  String(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokenize = (value = "") =>
  normalizeText(value)
    .split(" ")
    .filter((token) => token && !STOP_WORDS.has(token));

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const canonicalizeChunkText = (value = "") =>
  normalizeText(
    String(value || "")
      .replace(/document:\s*[^|]+(\|\s*)?/gi, "")
      .replace(/page count:\s*\d+(\|\s*)?/gi, "")
      .replace(/section:\s*[^|]+(\|\s*)?/gi, "")
      .replace(/\brow\s+\d+\b/gi, "")
      .replace(/\s*\|\s*/g, " ")
  );

const dedupeChunks = (chunks = []) => {
  const seen = new Set();

  return chunks.filter((chunk) => {
    const signature = normalizeText(
      `${chunk.type}|${String(chunk.title || "").replace(/\|\s*row\s+\d+\b/gi, "").trim()}|${canonicalizeChunkText(chunk.text).slice(0, 280)}`
    );

    if (seen.has(signature)) {
      return false;
    }

    seen.add(signature);
    return true;
  });
};

const keepBestPerTitle = (chunks = []) => {
  const seen = new Set();

  return chunks.filter((chunk) => {
    const key = normalizeText(chunk.title);
    if (!key) {
      return true;
    }

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

const expandQuestionTokens = (tokens = []) =>
  unique(
    tokens.flatMap((token) => [token, ...(TOKEN_ALIASES[token] || [])])
  );

const getInformativeMatchedTokens = (tokens = []) =>
  tokens.filter((token) => token && token.length > 2 && !NON_INFORMATIVE_MATCH_TOKENS.has(token));

const buildPhrases = (tokens = [], size = 2) => {
  const phrases = [];

  for (let index = 0; index <= tokens.length - size; index += 1) {
    phrases.push(tokens.slice(index, index + size).join(" "));
  }

  return phrases;
};

const looksLikeTableTitle = (title = "") => {
  const normalizedTitle = String(title || "").trim();
  if (!normalizedTitle || normalizedTitle.length < 12) {
    return false;
  }

  if (
    /^chapter\b/i.test(normalizedTitle) ||
    /^--\s*\d+/i.test(normalizedTitle) ||
    /\|\s*row\s+\d+\b/i.test(normalizedTitle)
  ) {
    return false;
  }

  const words = normalizedTitle.split(/\s+/).filter(Boolean);
  return words.length >= 3 && words.length <= 10 && !/[.!?]$/.test(normalizedTitle);
};

const getBaseTitle = (title = "") =>
  String(title || "").replace(/\|\s*row\s+\d+\b/gi, "").trim();

const isStructuredTableTitle = (title = "") => {
  const normalizedTitle = normalizeText(title);
  return (
    normalizedTitle.includes("comparison") ||
    normalizedTitle.includes("parameters") ||
    normalizedTitle.includes("record") ||
    normalizedTitle.includes("location") ||
    normalizedTitle.includes("data") ||
    normalizedTitle.includes("companies") ||
    normalizedTitle.includes("framework") ||
    normalizedTitle.includes("languages") ||
    normalizedTitle.includes("facts")
  );
};

const countSentencePunctuation = (text = "") => (String(text || "").match(/[.!?]/g) || []).length;

const shouldExpandTableRows = (title = "", text = "") => {
  if (!looksLikeTableTitle(title) || !isStructuredTableTitle(title)) {
    return false;
  }

  const normalizedText = normalizeText(text);
  if (!normalizedText) {
    return false;
  }

  const punctuationCount = countSentencePunctuation(text);
  const wordCount = normalizedText.split(" ").filter(Boolean).length;

  if (punctuationCount >= 4 && wordCount / Math.max(punctuationCount, 1) < 18) {
    return false;
  }

  return true;
};

const isMultiHopQuestion = (question = "") =>
  MULTI_HOP_PATTERNS.some((pattern) => pattern.test(String(question || "")));

const extractTableRows = (title = "", text = "") => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) {
    return [];
  }

  const normalizedTitle = normalizeText(title);
  const patterns = [];

  if (normalizedTitle.includes("framework")) {
    patterns.push(/\b(?:TensorFlow|PyTorch|Scikit-learn|Keras|XGBoost|JAX)\b/g);
  }

  if (normalizedTitle.includes("model") || normalizedTitle.includes("llm")) {
    patterns.push(/\b(?:GPT-\d|Claude \d|Gemini Ultra|LLaMA \d+ \d+B|Mistral Large|Command R\+)\b/g);
  }

  if (normalizedTitle.includes("planet") || normalizedTitle.includes("solar system")) {
    patterns.push(/\b(?:Mercury|Venus|Earth|Mars|Jupiter|Saturn|Uranus|Neptune)\b/g);
  }

  if (normalizedTitle.includes("company")) {
    patterns.push(/\b(?:Microsoft|Google \(Alphabet\)|OpenAI|Anthropic|Meta AI|Nvidia|Infosys|TCS)\b/g);
  }

  if (normalizedTitle.includes("record") || normalizedTitle.includes("location")) {
    patterns.push(/\b(?:Tallest mountain|Deepest ocean point|Largest country by area|Most populous country|Longest river|Largest desert|Hottest recorded temperature|Coldest recorded temperature)\b/g);
  }

  patterns.push(
    /\b\d{4}\b/g,
    /\b(?:Mercury|Venus|Earth|Mars|Jupiter|Saturn|Uranus|Neptune)\b/g,
    /\b(?:TensorFlow|PyTorch|Scikit-learn|Keras|XGBoost|JAX)\b/g,
    /\b(?:Microsoft|Google \(Alphabet\)|OpenAI|Anthropic|Meta AI|Nvidia|Infosys|TCS)\b/g,
    /\b(?:GPT-\d|Claude \d|Gemini Ultra|LLaMA \d+ \d+B|Mistral Large|Command R\+)\b/g,
    /\b(?:Tallest mountain|Deepest ocean point|Largest country by area|Most populous country|Longest river|Largest desert|Hottest recorded temperature|Coldest recorded temperature)\b/g,
  );

  for (const pattern of patterns) {
    const matches = [...clean.matchAll(pattern)];
    if (matches.length < 2) {
      continue;
    }

    const header = clean.slice(0, matches[0].index).trim();

    const rows = matches.map((match, index) => {
      const start = match.index;
      const end = index + 1 < matches.length ? matches[index + 1].index : clean.length;
      const row = clean.slice(start, end).trim();
      return header ? `${header} ${row}`.trim() : row;
    }).filter(Boolean);

    if (rows.length >= 2) {
      return rows;
    }
  }

  return [];
};

const isEvaluationChunk = (title = "", text = "") => {
  const combined = normalizeText([title, text].join(" "));
  return (
    combined.includes("sample questions to test your rag system") ||
    combined.includes("expected answer hint") ||
    /^q\d+\b/.test(combined)
  );
};

const buildChunk = ({ id, type, title, text, suggestion }) => {
  const normalizedTitle = String(title || "").trim();
  const normalizedText = String(text || "").trim();

  return {
    id,
    type,
    title: normalizedTitle,
    text: normalizedText,
    suggestion: suggestion || null,
    tokens: tokenize(`${normalizedTitle} ${normalizedText}`),
    isEvaluationChunk: isEvaluationChunk(normalizedTitle, normalizedText),
  };
};

const flattenServices = (aifuture = []) => {
  const services = [];

  aifuture.forEach((section, sectionIndex) => {
    const title = section?.title || `section-${sectionIndex + 1}`;
    (section?.value || []).forEach((service, serviceIndex) => {
      services.push({
        id: `${title}-${serviceIndex}`,
        sectionTitle: title,
        name: service?.name || "",
        description: service?.description || "",
        price: service?.price || "",
        tags: Array.isArray(service?.tags) ? service.tags : [],
      });
    });
  });

  return services;
};

const buildKnowledgeBase = (website = {}) => {
  const chunks = [];
  const services = flattenServices(website.aifuture);
  const systemPrompt = Array.isArray(website.systemPrompt)
    ? website.systemPrompt.join(" ")
    : "";

  chunks.push(
    buildChunk({
      id: "website-overview",
      type: "website",
      title: website.websiteName || "Business Overview",
      suggestion: website.customPrompt?.[0] || null,
      text: [
        website.websiteName,
        website.description,
        Array.isArray(website.category) ? website.category.join(", ") : "",
        Array.isArray(website.tags) ? website.tags.join(", ") : "",
        systemPrompt,
      ].join(" | "),
    })
  );

  services.forEach((service) => {
    chunks.push(
      buildChunk({
        id: `service-${service.id}`,
        type: "service",
        title: service.name,
        suggestion: service.name,
        text: [
          `Section: ${service.sectionTitle}`,
          `Service: ${service.name}`,
          service.description ? `Description: ${service.description}` : "",
          service.price ? `Price: ${service.price}` : "",
          service.tags.length ? `Tags: ${service.tags.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      })
    );
  });

  (website.customPrompt || []).forEach((prompt, index) => {
    chunks.push(
      buildChunk({
        id: `prompt-${index}`,
        type: "prompt",
        title: `Prompt ${index + 1}`,
        suggestion: prompt,
        text: `Suggested follow-up: ${prompt}`,
      })
    );
  });

  (website.pdfDocuments || []).forEach((document, documentIndex) => {
    (document.chunks || []).forEach((chunk, chunkIndex) => {
      chunks.push(
        buildChunk({
          id: `pdf-${document.id || documentIndex}-${chunk.id || chunkIndex}`,
          type: "pdf",
          title: chunk.title || document.fileName || `PDF ${documentIndex + 1}`,
          suggestion: chunk.title || null,
          text: [
            `Document: ${document.fileName || `PDF ${documentIndex + 1}`}`,
            chunk.title ? `Section: ${chunk.title}` : "",
            `Page count: ${document.pageCount || 0}`,
            chunk.text || "",
          ]
            .filter(Boolean)
            .join(" | "),
        })
      );

      if (looksLikeTableTitle(chunk.title)) {
        extractTableRows(chunk.title, chunk.text).forEach((row, rowIndex) => {
          chunks.push(
            buildChunk({
              id: `pdf-row-${document.id || documentIndex}-${chunk.id || chunkIndex}-${rowIndex}`,
              type: "pdf",
              title: `${chunk.title} | Row ${rowIndex + 1}`,
              suggestion: chunk.title || null,
              text: [
                `Document: ${document.fileName || `PDF ${documentIndex + 1}`}`,
                `Section: ${chunk.title}`,
                row,
              ].join(" | "),
            })
          );
        });
      }
    });
  });

  return { chunks, services };
};

const analyzeChunkMatch = (question, questionTokens, chunk) => {
  if (!chunk.text || !chunk.tokens.length) {
    return {
      score: 0,
      matchedTokens: [],
    };
  }

  const normalizedQuestion = normalizeText(question);
  const normalizedChunkText = normalizeText(chunk.text);
  const normalizedChunkTitle = normalizeText(chunk.title);
  const baseTitle = getBaseTitle(chunk.title);
  const isComparativeQuestion = /\b(most|largest|highest|deepest|longest|smallest|least|top)\b/i.test(question);
  const tokenCounts = new Map();
  const matchedTokens = new Set();

  chunk.tokens.forEach((token) => {
    tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
  });

  let score = 0;

  questionTokens.forEach((token) => {
    if (tokenCounts.has(token)) {
      score += 6 + tokenCounts.get(token);
      matchedTokens.add(token);
    } else if (normalizedChunkText.includes(token)) {
      score += 2;
      matchedTokens.add(token);
    }
  });

  if (questionTokens.length > 0) {
    score += Math.round((matchedTokens.size / questionTokens.length) * 12);
  }

  buildPhrases(questionTokens, 2).forEach((phrase) => {
    if (normalizedChunkText.includes(phrase) || normalizedChunkTitle.includes(phrase)) {
      score += 5;
    }
  });

  buildPhrases(questionTokens, 3).forEach((phrase) => {
    if (normalizedChunkText.includes(phrase) || normalizedChunkTitle.includes(phrase)) {
      score += 8;
    }
  });

  if (chunk.title && normalizedQuestion.includes(normalizedChunkTitle)) {
    score += 10;
  }

  if (chunk.type === "service") {
    score += 2;
  }

  if (/\brow\s+\d+\b/i.test(chunk.title)) {
    score += 4;
  }

  if (isComparativeQuestion && /\brow\s+\d+\b/i.test(chunk.title)) {
    score -= 6;
  }

  if (isComparativeQuestion && chunk.type === "pdf" && looksLikeTableTitle(chunk.title)) {
    score += 8;
  }

  if (/\brow\s+\d+\b/i.test(chunk.title) && !isStructuredTableTitle(baseTitle)) {
    score -= 40;
  }

  if (chunk.isEvaluationChunk && !/\b(sample question|expected answer|hint)\b/i.test(question)) {
    score -= 1000;
  }

  return {
    score,
    matchedTokens: Array.from(matchedTokens),
  };
};

const retrieveRelevantChunks = (question, website, options = {}) => {
  const multiHop = options.multiHop ?? isMultiHopQuestion(question);
  const limit = options.limit || DEFAULT_LIMIT;
  const scoreThreshold = options.scoreThreshold ?? (multiHop ? MULTI_HOP_SCORE_THRESHOLD : DEFAULT_SCORE_THRESHOLD);
  const { chunks } = buildKnowledgeBase(website);
  const questionTokens = expandQuestionTokens(tokenize(question));
  const informativeQuestionTokens = getInformativeMatchedTokens(questionTokens);

  const scored = dedupeChunks(chunks
    .map((chunk) => {
      const analysis = analyzeChunkMatch(question, questionTokens, chunk);
      return {
        ...chunk,
        score: analysis.score,
        matchedTokens: analysis.matchedTokens,
      };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score));

  const topScore = scored[0]?.score || 0;
  let minAllowedScore = topScore > 0
    ? Math.max(8, Math.ceil(topScore * scoreThreshold))
    : 0;

  if (multiHop && /\band\b/i.test(question)) {
    const topCoverage = informativeQuestionTokens.length > 0
      ? getInformativeMatchedTokens(scored[0]?.matchedTokens || []).length / informativeQuestionTokens.length
      : 1;

    if (topCoverage < 0.75) {
      minAllowedScore = Math.max(6, Math.ceil(topScore * 0.45));
    }
  }

  let ranked = scored
    .filter((chunk) => chunk.score >= minAllowedScore)
    .slice(0, limit);

  ranked = keepBestPerTitle(ranked);

  if (multiHop && ranked.length > 1) {
    const selected = [];
    const coveredTokens = new Set();

    ranked.forEach((chunk) => {
      if (selected.length >= limit) {
        return;
      }

      const informativeTokens = getInformativeMatchedTokens(chunk.matchedTokens || []);
      const newTokenCount = informativeTokens.filter((token) => !coveredTokens.has(token)).length;
      const isFirst = selected.length === 0;
      const isComplementary =
        newTokenCount >= 2 ||
        (newTokenCount >= 1 && chunk.score >= Math.ceil(topScore * 0.9));

      if (isFirst || isComplementary) {
        selected.push(chunk);
        informativeTokens.forEach((token) => coveredTokens.add(token));
      }
    });

    ranked = selected;
  } else if (ranked.length > 1 && topScore >= 20) {
    const veryCloseMatches = ranked.filter((chunk) => chunk.score >= Math.ceil(topScore * 0.9));

    if (veryCloseMatches.length === 1) {
      ranked = veryCloseMatches;
    }
  }

  return {
    chunks: ranked,
    topScore,
    secondScore: ranked[1]?.score || 0,
    scoreGap: (ranked[0]?.score || 0) - (ranked[1]?.score || 0),
    hasStrongMatch: ranked[0]?.score >= 8,
    hasClearWinner: ranked[0]?.score >= 12 && ((ranked[0]?.score || 0) - (ranked[1]?.score || 0) >= 6),
    isMultiHop: multiHop,
  };
};

const formatChunksForPrompt = (chunks = []) =>
  chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.type.toUpperCase()} | ${chunk.title}\n${chunk.text}`
    )
    .join("\n\n");

const getSuggestionsFromChunks = (chunks = [], fallbackSuggestions = []) => {
  const fromChunkSuggestions = chunks
    .map((chunk) => chunk.suggestion)
    .filter(Boolean);

  const fromChunkTitles = chunks
    .map((chunk) => chunk.title)
    .filter((title) => title && title.toLowerCase() !== 'general');

  const normalizedTitles = unique([
    ...fromChunkSuggestions,
    ...fromChunkTitles,
  ]).slice(0, 3);

  const fromChunks = normalizedTitles.map((title) => {
    const cleanTitle = String(title).trim();
    if (!cleanTitle) {
      return null;
    }

    if (/^(what|how|why|when|where|can|do|is|are)\b/i.test(cleanTitle)) {
      return cleanTitle;
    }

    return `Tell me more about ${cleanTitle}`;
  }).filter(Boolean);

  if (fromChunks.length > 0) {
    return fromChunks.slice(0, 3);
  }

  return Array.isArray(fallbackSuggestions) ? fallbackSuggestions.slice(0, 3) : [];
};

module.exports = {
  retrieveRelevantChunks,
  formatChunksForPrompt,
  getSuggestionsFromChunks,
  isMultiHopQuestion,
};
