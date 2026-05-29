const TYPO_REPLACEMENTS = [
  ['website crush', 'website crash'],
  ['my website crush', 'my website crash'],
  ['intergation', 'integration'],
  ['webiste', 'website'],
  ['rankng', 'ranking'],
  ['hostng', 'hosting'],
  ['analitics', 'analytics'],
  ['seoo', 'seo'],
  ['appp', 'app'],
];

const GENERIC_HELP_PATTERNS = [
  /^tell me more$/,
  /^more$/,
  /^help$/,
  /^details$/,
  /^explain$/,
  /^can you explain$/,
  /^what about this$/,
  /^what about that$/,
];

const normalizeText = (value = '') =>
  String(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const applyTypos = (text) => {
  let normalized = normalizeText(text);

  TYPO_REPLACEMENTS.forEach(([from, to]) => {
    normalized = normalized.replace(
      new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
      to
    );
  });

  return normalized.replace(/\s+/g, ' ').trim();
};

const unique = (values = []) => [...new Set(values.filter(Boolean))];

const isGenericQuestion = (question = '') => {
  const normalizedQuestion = applyTypos(question);
  if (!normalizedQuestion) {
    return true;
  }

  if (GENERIC_HELP_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return true;
  }

  const tokens = normalizedQuestion.split(' ').filter((token) => token.length > 2);
  return tokens.length <= 1;
};

const buildDomainAreas = (website = {}, retrievalChunks = []) => {
  const areas = new Map();
  const knowledgeHints = [];

  const addArea = (label, source, hints = []) => {
    const cleanLabel = String(label || '').trim();
    if (!cleanLabel) {
      return;
    }

    const key = normalizeText(cleanLabel);
    if (!key) {
      return;
    }

    if (!areas.has(key)) {
      areas.set(key, {
        key,
        label: cleanLabel,
        source,
        hints: [],
      });
    }

    const area = areas.get(key);
    area.hints = unique([
      ...area.hints,
      ...hints.map((hint) => String(hint || '').trim()).filter(Boolean),
    ]);
  };

  (website.aifuture || []).forEach((section) => {
    knowledgeHints.push(section?.title);
    addArea(section?.title, 'section');

    (section?.value || []).forEach((service) => {
      knowledgeHints.push(service?.name, service?.description, ...(Array.isArray(service?.tags) ? service.tags : []));
      addArea(service?.name, 'service', [
        section?.title,
        service?.description,
        ...(Array.isArray(service?.tags) ? service.tags : []),
      ]);
    });
  });

  (website.customPrompt || []).forEach((prompt) => {
    knowledgeHints.push(prompt);
    addArea(prompt, 'prompt');
  });

  retrievalChunks.forEach((chunk) => {
    knowledgeHints.push(chunk?.title, chunk?.text);
    addArea(chunk?.title, chunk?.type || 'retrieval', [chunk?.text]);
  });

  (website.category || []).forEach((category) =>
    addArea(category, 'category', knowledgeHints)
  );

  if (areas.size === 0) {
    addArea('General Support', 'fallback');
  }

  return Array.from(areas.values());
};

const scoreArea = (normalizedQuestion, area) => {
  const haystack = normalizedQuestion;
  const normalizedLabel = normalizeText(area.label);
  const hintText = normalizeText(area.hints.join(' '));
  let score = 0;

  if (normalizedLabel && haystack.includes(normalizedLabel)) {
    score += normalizedLabel.includes(' ') ? 9 : 6;
  }

  normalizedLabel.split(' ').forEach((part) => {
    if (part.length > 2 && haystack.includes(part)) {
      score += 3;
    }
  });

  area.hints.forEach((hint) => {
    const normalizedHint = normalizeText(hint);
    if (!normalizedHint) {
      return;
    }

    if (haystack.includes(normalizedHint)) {
      score += normalizedHint.includes(' ') ? 5 : 2;
      return;
    }

    normalizedHint.split(' ').forEach((part) => {
      if (part.length > 3 && haystack.includes(part)) {
        score += 1;
      }
    });
  });

  if (hintText && hintText.includes(haystack) && haystack.length > 5) {
    score += 4;
  }

  return score;
};

const classifySupportIntent = (question, retrievalChunks = [], website = {}) => {
  const normalizedQuestion = applyTypos(question);
  const domainAreas = buildDomainAreas(website, retrievalChunks);

  const rankedAreas = domainAreas
    .map((area) => ({
      ...area,
      score: scoreArea(normalizedQuestion, area),
    }))
    .sort((a, b) => b.score - a.score);

  const topArea = rankedAreas[0];
  const secondArea = rankedAreas[1];

  if (!topArea || topArea.score <= 0) {
    return {
      normalizedQuestion,
      areaKey: 'general_support',
      areaLabel: domainAreas[0]?.label || 'General Support',
      intent: 'general_support',
      confidence: 'low',
      needsClarification: true,
      reason: 'no_match',
      rankedAreas,
      domainAreas,
    };
  }

  const scoreGap = topArea.score - (secondArea?.score || 0);
  const confidence = topArea.score >= 8 && scoreGap >= 3
    ? 'high'
    : topArea.score >= 5
      ? 'medium'
      : 'low';

  return {
    normalizedQuestion,
    areaKey: topArea.key,
    areaLabel: topArea.label,
    intent: normalizeText(topArea.label).replace(/\s+/g, '_') || 'general_support',
    confidence,
    needsClarification: confidence === 'low',
    reason: confidence === 'low' ? 'ambiguous' : 'matched',
    rankedAreas,
    domainAreas,
  };
};

const buildClarificationPrompt = (classification, fallbackSuggestions = []) => {
  const topOptions = classification.rankedAreas
    .filter((area) => area.score > 0)
    .slice(0, 3)
    .map((area) => area.label);

  const options = topOptions.length > 0
    ? topOptions
    : (fallbackSuggestions || []).slice(0, 3);

  if (!options.length) {
    return 'Could you tell me a little more about what you need help with?';
  }

  return `To help correctly, is this about ${options.join(', ')}?`;
};

module.exports = {
  TYPO_REPLACEMENTS,
  normalizeText,
  applyTypos,
  isGenericQuestion,
  buildDomainAreas,
  classifySupportIntent,
  buildClarificationPrompt,
};
