const { PDFParse } = require('pdf-parse');
const { v4: uuidv4 } = require('uuid');

const MAX_TOTAL_TEXT_LENGTH = 24000;
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;
const MAX_HEADING_LENGTH = 48;
const TABLE_ROW_CHUNK_LIMIT = 25;

const normalizeWhitespace = (text = '') =>
  String(text)
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeLine = (text = '') =>
  String(text)
    .replace(/\r/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\u0000/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const looksLikeHeading = (line = '') => {
  const clean = normalizeLine(line);
  if (!clean || clean.length > MAX_HEADING_LENGTH) {
    return false;
  }

  if (/[.!?]$/.test(clean)) {
    return false;
  }

  const words = clean.split(' ').filter(Boolean);
  return words.length <= 6;
};

const looksLikeTableHeading = (line = '') => {
  const clean = normalizeLine(line);
  if (!clean || clean.length < 12) {
    return false;
  }

  if (/[.!?]$/.test(clean) || /^chapter\b/i.test(clean) || /^--\s*\d+/i.test(clean)) {
    return false;
  }

  const words = clean.split(' ').filter(Boolean);
  if (words.length < 3 || words.length > 10) {
    return false;
  }

  const capitalizedWords = words.filter((word) => /^[A-Z0-9][\p{L}\p{N}/()+-]*$/u.test(word));
  return capitalizedWords.length >= Math.ceil(words.length * 0.75);
};

const isStructuredTableHeading = (line = '') => {
  const normalizedLine = normalizeLine(line).toLowerCase();
  return (
    normalizedLine.includes('comparison') ||
    normalizedLine.includes('parameters') ||
    normalizedLine.includes('record') ||
    normalizedLine.includes('location') ||
    normalizedLine.includes('data') ||
    normalizedLine.includes('companies') ||
    normalizedLine.includes('framework') ||
    normalizedLine.includes('languages') ||
    normalizedLine.includes('facts')
  );
};

const countSentencePunctuation = (text = '') => (String(text || '').match(/[.!?]/g) || []).length;

const shouldExpandTableRows = (title = '', text = '') => {
  if (!looksLikeTableHeading(title) || !isStructuredTableHeading(title)) {
    return false;
  }

  const normalizedText = normalizeLine(text);
  if (!normalizedText) {
    return false;
  }

  const punctuationCount = countSentencePunctuation(text);
  const wordCount = normalizedText.split(' ').filter(Boolean).length;

  if (punctuationCount >= 4 && wordCount / Math.max(punctuationCount, 1) < 18) {
    return false;
  }

  return true;
};

const extractTableRows = (title = '', text = '') => {
  const clean = normalizeLine(text);
  if (!clean) {
    return [];
  }

  const normalizedTitle = normalizeLine(title).toLowerCase();
  const patterns = [];

  if (normalizedTitle.includes('framework')) {
    patterns.push(/\b(?:TensorFlow|PyTorch|Scikit-learn|Keras|XGBoost|JAX)\b/g);
  }

  if (normalizedTitle.includes('model') || normalizedTitle.includes('llm')) {
    patterns.push(/\b(?:GPT-\d|Claude \d|Gemini Ultra|LLaMA \d+ \d+B|Mistral Large|Command R\+)\b/g);
  }

  if (normalizedTitle.includes('planet') || normalizedTitle.includes('solar system')) {
    patterns.push(/\b(?:Mercury|Venus|Earth|Mars|Jupiter|Saturn|Uranus|Neptune)\b/g);
  }

  if (normalizedTitle.includes('company')) {
    patterns.push(/\b(?:Microsoft|Google \(Alphabet\)|OpenAI|Anthropic|Meta AI|Nvidia|Infosys|TCS)\b/g);
  }

  if (normalizedTitle.includes('record') || normalizedTitle.includes('location')) {
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
      return rows.slice(0, TABLE_ROW_CHUNK_LIMIT);
    }
  }

  return [];
};

const splitIntoChunks = (text) => {
  const chunks = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    const chunk = text.slice(start, end).trim();

    if (chunk) {
      chunks.push({
        id: uuidv4(),
        text: chunk,
      });
    }

    if (end >= text.length) {
      break;
    }

    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks;
};

const buildSectionChunks = (rawText = '') => {
  const lines = String(rawText)
    .split(/\n+/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  const sections = [];
  let currentHeading = 'General';
  let currentLines = [];

  const flushSection = () => {
    if (!currentLines.length) {
      return;
    }

    const combined = currentLines.join(' ');
    const isTableSection = shouldExpandTableRows(currentHeading, combined);

    if (isTableSection) {
      const tableRows = extractTableRows(currentHeading, combined);
      tableRows.forEach((row, rowIndex) => {
        sections.push({
          id: uuidv4(),
          title: `${currentHeading} | Row ${rowIndex + 1}`,
          text: `${currentHeading}: ${row}`,
        });
      });
    }

    splitIntoChunks(combined).forEach((chunk) => {
      sections.push({
        id: uuidv4(),
        title: currentHeading,
        text: chunk.text,
      });
    });

    currentLines = [];
  };

  lines.forEach((line, index) => {
    if (looksLikeHeading(line) && index !== 0) {
      flushSection();
      currentHeading = line;
      return;
    }

    if (index === 0 && looksLikeHeading(line)) {
      currentHeading = line;
      return;
    }

    currentLines.push(line);
  });

  flushSection();
  return sections;
};

const parsePdfBuffer = async (buffer, originalName) => {
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();
  const rawText = result.text || '';
  const normalizedText = normalizeWhitespace(rawText);

  if (!normalizedText) {
    throw new Error('Could not extract readable text from this PDF');
  }

  const truncatedText = normalizedText.slice(0, MAX_TOTAL_TEXT_LENGTH);
  const sectionChunks = buildSectionChunks(rawText)
    .map((chunk) => ({
      ...chunk,
      text: chunk.text.slice(0, MAX_TOTAL_TEXT_LENGTH),
    }))
    .filter((chunk) => chunk.text.length > 0);

  const chunks = sectionChunks.length > 0
    ? sectionChunks
    : splitIntoChunks(truncatedText).map((chunk) => ({
        ...chunk,
        title: 'General',
      }));

  return {
    id: uuidv4(),
    fileName: originalName || 'document.pdf',
    uploadedAt: new Date().toISOString(),
    pageCount: result.numpages || 0,
    textLength: truncatedText.length,
    truncated: normalizedText.length > truncatedText.length,
    summary: truncatedText.slice(0, 500),
    chunks,
  };
};

module.exports = {
  parsePdfBuffer,
};
