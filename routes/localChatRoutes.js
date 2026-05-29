const express = require('express');
const multer = require('multer');
const axios = require('axios');
const { parsePdfBuffer } = require('../services/pdfService');
const {
  generatePdfMetadata,
  mergePdfMetadata,
  attachMetadataToDocument,
  toArray,
} = require('../services/pdfMetadataService');
const {
  retrieveRelevantChunks,
  formatChunksForPrompt,
  getSuggestionsFromChunks,
  isMultiHopQuestion,
} = require('../services/ragService');
const {
  applyTypos,
  classifySupportIntent,
  isGenericQuestion,
  buildClarificationPrompt,
} = require('../services/intentService');
const {
  savePdfDocument,
  getKnowledge,
  clearKnowledge,
} = require('../services/localKnowledgeService');

require('dotenv').config();

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const buildUploadMetadata = (body = {}, document = {}) => ({
  id: body.id || document.id,
  fileName: document.fileName || '',
  title: body.title || document.fileName || document.chunks?.[0]?.title || '',
  category: toArray(body.category),
  websiteName: body.websiteName || '',
  systemPrompt: toArray(body.systemPrompt),
  description: body.description || '',
  tags: toArray(body.tags),
  customPrompt: toArray(body.customPrompt),
  aifuture: Array.isArray(body.aifuture) ? body.aifuture : [],
  role: toArray(body.role),
});

const buildUploadChunkSummary = (document = {}, metadata = {}) =>
  (document.chunks || []).map((chunk) => ({
    id: chunk.id,
    title: chunk.title || '',
    description: chunk.description || metadata.description || '',
    tags: chunk.tags || metadata.tags || [],
    customPrompt: chunk.customPrompt || metadata.customPrompt || [],
    aifuture: chunk.aifuture || metadata.aifuture || [],
  }));

const stripCodeFences = (value = '') =>
  String(value || '')
    .replace(/```json/gi, '```')
    .replace(/```/g, '')
    .trim();

const cleanChunkText = (value = '') =>
  String(value || '')
    .replace(/Document:\s*[^|]+(\|\s*)?/gi, '')
    .replace(/Page count:\s*\d+(\|\s*)?/gi, '')
    .replace(/\s*\|\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const parseRagResponse = (ragResult) => {
  const cleaned = stripCodeFences(ragResult);
  if (!cleaned) {
    return null;
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (nestedError) {
        return {
          answer: cleaned,
        };
      }
    }

    return {
      answer: cleaned,
    };
  }
};

const buildFriendlyFallbackAnswer = (question, chunks = []) => {
  const topChunk = chunks[0];
  if (!topChunk) {
    return 'I could not find a clear answer in the uploaded PDF. Please ask a more specific question.';
  }

  const intro = 'Based on the uploaded PDF, here is the clearest answer I could find:';

  const summaryLines = chunks.slice(0, 2).map((chunk) => {
    const title = chunk.title ? `${chunk.title}: ` : '';
    const text = cleanChunkText(chunk.text)
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join(' ')
      .trim();

    return `${title}${text}`.trim();
  });

  return `${intro}\n\n${summaryLines.join('\n\n')}`;
};

const gemini = async (prompt) => {
  try {
    const res = await axios.post(
      `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 }
      }
    );

    return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  } catch (err) {
    return null;
  }
};

router.post('/pdf-upload', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'PDF file is required' });
  }

  try {
    const parsedDocument = await parsePdfBuffer(req.file.buffer, req.file.originalname);
    const generatedMetadata = await generatePdfMetadata(parsedDocument);
    const metadata = buildUploadMetadata(
      {
        ...mergePdfMetadata(generatedMetadata, req.body),
        id: req.body.id,
        fileName: parsedDocument.fileName,
      },
      parsedDocument
    );
    const document = attachMetadataToDocument(parsedDocument, {
      ...metadata,
      chunkMetadata: generatedMetadata.chunkMetadata,
    });
    const store = savePdfDocument(document);
    const chunks = buildUploadChunkSummary(document, metadata);

    return res.json({
      success: true,
      message: 'PDF uploaded and saved locally',
      item: {
        id: metadata.id,
        fileName: metadata.fileName,
        title: metadata.title,
        category: metadata.category,
        websiteName: metadata.websiteName,
        systemPrompt: metadata.systemPrompt,
      },
      chunks,
      document,
      pdfDocuments: store.pdfDocuments,
      updatedAt: store.updatedAt,
    });
  } catch (error) {
    return res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/knowledge', (req, res) => {
  const store = getKnowledge();
  res.json({
    success: true,
    pdfDocuments: store.pdfDocuments || [],
    updatedAt: store.updatedAt || null,
    count: (store.pdfDocuments || []).length,
  });
});

router.delete('/knowledge', (req, res) => {
  const store = clearKnowledge();
  res.json({
    success: true,
    message: 'Local knowledge cleared',
    pdfDocuments: store.pdfDocuments,
    updatedAt: store.updatedAt,
  });
});

router.post('/chat', async (req, res) => {
  const { question } = req.body;

  if (!question) {
    return res.status(400).json({ success: false, error: 'question is required' });
  }

  const store = getKnowledge();
  if (!store.pdfDocuments || store.pdfDocuments.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Upload a PDF first before asking questions',
    });
  }

  const knowledge = {
    websiteName: 'Local PDF Knowledge',
    pdfDocuments: store.pdfDocuments,
    customPrompt: [],
    category: [],
    aifuture: [],
  };

  const normalizedQuestion = applyTypos(question);
  const multiHop = isMultiHopQuestion(question);
  const retrieval = retrieveRelevantChunks(normalizedQuestion, knowledge, {
    limit: multiHop ? 4 : 3,
    scoreThreshold: multiHop ? 0.6 : 0.75,
    multiHop,
  });
  const detectedIntent = classifySupportIntent(question, retrieval.chunks, knowledge);
  const suggestions = getSuggestionsFromChunks(retrieval.chunks, []);

  const shouldClarify =
    !retrieval.chunks.length ||
    isGenericQuestion(question) ||
    (
      detectedIntent.needsClarification &&
      !retrieval.hasStrongMatch &&
      !retrieval.hasClearWinner
    );

  if (shouldClarify) {
    return res.json({
      success: true,
      intent: 'clarification_needed',
      selectedArea: detectedIntent.areaLabel,
      normalizedQuestion,
      response: buildClarificationPrompt(detectedIntent, suggestions),
      suggestions,
    });
  }

  const promptContext = formatChunksForPrompt(retrieval.chunks);
  const ragPrompt = `
You are a friendly AI assistant answering from uploaded PDF knowledge only.
Use only the retrieved context below.
Never invent details outside the PDF context.
If the PDF only partly answers the question, clearly say that.
Always reply in clear English, even if the user writes in Hindi or Hinglish.
Do not copy long lines from the PDF word-for-word. Rewrite the answer in a natural, human-friendly way that is easier to understand.
Keep the answer concise but useful.
If the answer contains multiple points, format them as short bullets.
Avoid mentioning internal retrieval, chunk numbers, or technical RAG wording.
Prefer the single strongest matching fact instead of combining weak matches.
Do not ask the user to choose between sections when the context already contains a likely answer.
If one chunk is clearly the best match, answer from that chunk directly.
If the question needs multiple facts, combine only the retrieved facts that directly support the answer.
For list or multi-step questions, preserve all key items from the retrieved context.

User question: "${question}"
Normalized question: "${normalizedQuestion}"
Detected area: ${detectedIntent.areaLabel}
Question type: ${multiHop ? 'multi-hop' : 'single-hop'}

Retrieved context:
${promptContext}

Return ONLY this JSON:
{"intent":"short intent","selectedArea":"best matching area","answer":"final customer-facing answer"}
`;

  const ragResult = await gemini(ragPrompt);
  const parsed = parseRagResponse(ragResult);
  const fallbackAnswer = buildFriendlyFallbackAnswer(question, retrieval.chunks);

  return res.json({
    success: true,
    intent: parsed?.intent || detectedIntent.intent || 'pdf_answer',
    selectedArea: parsed?.selectedArea || detectedIntent.areaLabel,
    normalizedQuestion,
    response: parsed?.answer || fallbackAnswer,
    suggestions,
    matches: retrieval.chunks.map((chunk) => ({
      title: chunk.title,
      type: chunk.type,
      score: chunk.score,
    })),
  });
});

module.exports = router;
