const path = require('path');
const axios = require('axios');

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'how', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'their',
  'this', 'to', 'was', 'were', 'will', 'with', 'you', 'your'
]);

const stripCodeFences = (value = '') =>
  String(value || '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();

const toArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed)
        ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
        : [String(parsed || '').trim()].filter(Boolean);
    } catch (error) {
      return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return [String(value).trim()].filter(Boolean);
};

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const normalizeText = (value = '') =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const toTitleCase = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (match) => match.toUpperCase())
    .trim();

const fileNameToTitle = (fileName = '') =>
  toTitleCase(
    path.basename(String(fileName || ''), path.extname(String(fileName || '')))
      .replace(/[_-]+/g, ' ')
  );

const tokenize = (value = '') =>
  String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 2 && !STOP_WORDS.has(token));

const summarizeText = (value = '', maxSentences = 2) => {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return normalized.slice(0, 220);
  }

  return sentences.slice(0, maxSentences).join(' ').slice(0, 320).trim();
};

const extractTopTags = (texts = [], limit = 6) => {
  const counts = new Map();

  texts.forEach((text) => {
    tokenize(text).forEach((token) => {
      counts.set(token, (counts.get(token) || 0) + 1);
    });
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([token]) => token);
};

const buildChunkFallbackMetadata = (chunk = {}, globalTags = []) => {
  const baseTitle = normalizeText(chunk.title) || 'General';
  const description = summarizeText(chunk.text, 2) || `Summary for ${baseTitle}`;
  const tags = unique([...extractTopTags([baseTitle, chunk.text], 4), ...globalTags.slice(0, 2)]).slice(0, 6);
  const customPrompt = unique([
    `Explain ${baseTitle}`,
    `Summarize ${baseTitle}`,
    `Key points about ${baseTitle}`,
  ]).slice(0, 3);

  return {
    title: baseTitle,
    description,
    tags,
    customPrompt,
    aifuture: [
      {
        title: baseTitle,
        value: [
          {
            name: baseTitle,
            description,
            tags,
          },
        ],
      },
    ],
  };
};

const buildFallbackMetadata = (document = {}) => {
  const chunks = Array.isArray(document.chunks) ? document.chunks : [];
  const firstUsefulChunk = chunks.find((chunk) => normalizeText(chunk.title) && normalizeText(chunk.title).toLowerCase() !== 'general');
  const title = firstUsefulChunk?.title || fileNameToTitle(document.fileName) || 'Uploaded PDF';
  const websiteName = fileNameToTitle(document.fileName) || title;
  const category = unique([
    ...extractTopTags(chunks.slice(0, 5).map((chunk) => chunk.title), 3).map(toTitleCase),
    title,
  ]).slice(0, 4);
  const description = summarizeText(
    chunks.slice(0, 3).map((chunk) => chunk.text).join(' '),
    3
  ) || `Knowledge extracted from ${title}.`;
  const tags = extractTopTags([
    title,
    description,
    ...chunks.slice(0, 8).flatMap((chunk) => [chunk.title, chunk.text]),
  ]);
  const systemPrompt = [
    `Answer from the uploaded PDF knowledge for ${title}. If the PDF does not contain the answer, say so clearly.`,
  ];
  const customPrompt = unique([
    `What is ${title} about?`,
    `Summarize the uploaded PDF`,
    `List the main topics in ${title}`,
  ]).slice(0, 4);
  const chunkMetadata = chunks.map((chunk) => buildChunkFallbackMetadata(chunk, tags));
  const aifuture = unique(chunkMetadata.map((item) => item.title)).map((chunkTitle) => {
    const matchingChunk = chunkMetadata.find((item) => item.title === chunkTitle);
    return matchingChunk
      ? {
          title: matchingChunk.title,
          value: [
            {
              name: matchingChunk.title,
              description: matchingChunk.description,
              tags: matchingChunk.tags,
            },
          ],
        }
      : null;
  }).filter(Boolean);

  return {
    title,
    category,
    websiteName,
    systemPrompt,
    description,
    tags,
    customPrompt,
    aifuture,
    chunkMetadata,
  };
};

const parseJsonObject = (value = '') => {
  const cleaned = stripCodeFences(value);
  if (!cleaned) {
    return null;
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch (nestedError) {
      return null;
    }
  }
};

const gemini = async (prompt) => {
  if (!process.env.GEMINI_API_URL || !process.env.GEMINI_API_KEY) {
    return null;
  }

  try {
    const response = await axios.post(
      `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2 },
      },
      {
        timeout: 20000,
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (error) {
    return null;
  }
};

const sanitizeAiFuture = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => ({
      title: normalizeText(item?.title) || 'General',
      value: Array.isArray(item?.value)
        ? item.value
            .map((entry) => ({
              name: normalizeText(entry?.name),
              description: normalizeText(entry?.description),
              tags: toArray(entry?.tags),
            }))
            .filter((entry) => entry.name || entry.description || entry.tags.length)
        : [],
    }))
    .filter((item) => item.value.length > 0);
};

const sanitizeChunkMetadata = (chunks = [], chunkMetadata = [], fallback = {}) => {
  return chunks.map((chunk, index) => {
    const candidate = chunkMetadata.find((item) => normalizeText(item?.title).toLowerCase() === normalizeText(chunk.title).toLowerCase())
      || chunkMetadata[index]
      || {};

    const fallbackChunk = buildChunkFallbackMetadata(chunk, fallback.tags || []);

    return {
      title: normalizeText(chunk.title) || fallbackChunk.title,
      description: normalizeText(candidate.description) || fallbackChunk.description,
      tags: toArray(candidate.tags).slice(0, 8).length ? toArray(candidate.tags).slice(0, 8) : fallbackChunk.tags,
      customPrompt: toArray(candidate.customPrompt).slice(0, 5).length ? toArray(candidate.customPrompt).slice(0, 5) : fallbackChunk.customPrompt,
      aifuture: sanitizeAiFuture(candidate.aifuture).length ? sanitizeAiFuture(candidate.aifuture) : fallbackChunk.aifuture,
    };
  });
};

const generatePdfMetadata = async (document = {}) => {
  const fallback = buildFallbackMetadata(document);
  const chunks = Array.isArray(document.chunks) ? document.chunks : [];

  const prompt = `
You are generating structured metadata for one uploaded PDF.
Return ONLY valid JSON.

Required JSON shape:
{
  "title": "string",
  "category": ["string"],
  "websiteName": "string",
  "systemPrompt": ["string"],
  "description": "string",
  "tags": ["string"],
  "customPrompt": ["string"],
  "aifuture": [
    {
      "title": "string",
      "value": [
        {
          "name": "string",
          "description": "string",
          "tags": ["string"]
        }
      ]
    }
  ],
  "chunkMetadata": [
    {
      "title": "chunk title",
      "description": "string",
      "tags": ["string"],
      "customPrompt": ["string"],
      "aifuture": [
        {
          "title": "string",
          "value": [
            {
              "name": "string",
              "description": "string",
              "tags": ["string"]
            }
          ]
        }
      ]
    }
  ]
}

Rules:
- Base every field only on the PDF content.
- Keep tags short and useful.
- Keep description under 320 characters.
- Keep chunkMetadata aligned with the provided chunks.
- Use concise business-friendly prompts.

Document file: ${document.fileName || 'document.pdf'}
Document summary: ${document.summary || ''}

Chunks:
${chunks.slice(0, 12).map((chunk, index) => (
  `[${index + 1}] ${chunk.title || 'General'}\n${String(chunk.text || '').slice(0, 600)}`
)).join('\n\n')}
`;

  const aiResponse = await gemini(prompt);
  const parsed = parseJsonObject(aiResponse);

  if (!parsed) {
    return fallback;
  }

  const metadata = {
    title: normalizeText(parsed.title) || fallback.title,
    category: toArray(parsed.category).length ? unique(toArray(parsed.category)).slice(0, 6) : fallback.category,
    websiteName: normalizeText(parsed.websiteName) || fallback.websiteName,
    systemPrompt: toArray(parsed.systemPrompt).length ? unique(toArray(parsed.systemPrompt)).slice(0, 4) : fallback.systemPrompt,
    description: normalizeText(parsed.description) || fallback.description,
    tags: toArray(parsed.tags).length ? unique(toArray(parsed.tags)).slice(0, 8) : fallback.tags,
    customPrompt: toArray(parsed.customPrompt).length ? unique(toArray(parsed.customPrompt)).slice(0, 6) : fallback.customPrompt,
    aifuture: sanitizeAiFuture(parsed.aifuture).length ? sanitizeAiFuture(parsed.aifuture) : fallback.aifuture,
  };

  metadata.chunkMetadata = sanitizeChunkMetadata(chunks, Array.isArray(parsed.chunkMetadata) ? parsed.chunkMetadata : [], metadata);

  if (!metadata.aifuture.length) {
    metadata.aifuture = fallback.aifuture;
  }

  return metadata;
};

const mergePdfMetadata = (generated = {}, overrides = {}) => {
  const merged = {
    title: normalizeText(overrides.title) || generated.title || '',
    category: toArray(overrides.category).length ? toArray(overrides.category) : toArray(generated.category),
    websiteName: normalizeText(overrides.websiteName) || generated.websiteName || '',
    systemPrompt: toArray(overrides.systemPrompt).length ? toArray(overrides.systemPrompt) : toArray(generated.systemPrompt),
    description: normalizeText(overrides.description) || generated.description || '',
    tags: toArray(overrides.tags).length ? toArray(overrides.tags) : toArray(generated.tags),
    customPrompt: toArray(overrides.customPrompt).length ? toArray(overrides.customPrompt) : toArray(generated.customPrompt),
    aifuture: Array.isArray(overrides.aifuture) && overrides.aifuture.length ? overrides.aifuture : (generated.aifuture || []),
    role: toArray(overrides.role),
  };

  return merged;
};

const attachMetadataToDocument = (document = {}, metadata = {}) => {
  const chunkMetadata = Array.isArray(metadata.chunkMetadata) ? metadata.chunkMetadata : [];
  const nextChunks = Array.isArray(document.chunks)
    ? document.chunks.map((chunk, index) => {
        const matched = chunkMetadata.find((item) => normalizeText(item.title).toLowerCase() === normalizeText(chunk.title).toLowerCase())
          || chunkMetadata[index]
          || {};

        return {
          ...chunk,
          description: normalizeText(matched.description),
          tags: toArray(matched.tags),
          customPrompt: toArray(matched.customPrompt),
          aifuture: sanitizeAiFuture(matched.aifuture),
        };
      })
    : [];

  return {
    ...document,
    title: metadata.title || document.title || '',
    category: toArray(metadata.category),
    websiteName: metadata.websiteName || '',
    systemPrompt: toArray(metadata.systemPrompt),
    description: metadata.description || '',
    tags: toArray(metadata.tags),
    customPrompt: toArray(metadata.customPrompt),
    aifuture: sanitizeAiFuture(metadata.aifuture),
    chunks: nextChunks,
  };
};

module.exports = {
  generatePdfMetadata,
  mergePdfMetadata,
  attachMetadataToDocument,
  toArray,
};
