const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');
const {
    retrieveRelevantChunks,
    formatChunksForPrompt,
    getSuggestionsFromChunks,
    isMultiHopQuestion
} = require('../services/ragService');
const {
    applyTypos,
    classifySupportIntent,
    isGenericQuestion,
    buildClarificationPrompt
} = require('../services/intentService');

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

const stripCodeFences = (value = '') =>
    String(value || '')
        .replace(/```json/gi, '```')
        .replace(/```/g, '')
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
                return { answer: cleaned };
            }
        }

        return { answer: cleaned };
    }
};

const GREETINGS = [
    'hi', 'hello', 'hey', 'hii', 'helo', 'sup', 'yo',
    'good morning', 'good afternoon', 'good evening',
    'namaste', 'salaam', 'hola', 'greetings', 'howdy'
];

const isGreeting = (text) => {
    const clean = text.trim().toLowerCase().replace(/[^a-z ]/g, '').trim();
    return GREETINGS.includes(clean);
};

const getIntro = async (question) => {
    return await gemini(
        `User asked: "${question}"\nWrite 1 short friendly professional reply. Max 10 words. Return only the line.`
    ) || "Sure, I can help you with that.";
};

router.post('/generate-ai-response', async (req, res) => {
    try {
        const { question, apiKey } = req.body;

        if (!question || !apiKey) {
            return res.json({ success: false, message: 'question and apiKey required' });
        }

        const website = await getWebsiteDataByApiKey(apiKey);
        if (!website.success) {
            return res.json({ success: false, message: 'Invalid apiKey' });
        }

        const data = website.data;

        if (isGreeting(question)) {
            return res.json({
                success: true,
                intent: 'greeting',
                response: data.systemPrompt?.[0] || 'Hello! How can I help you today?',
                suggestions: data.customPrompt
            });
        }

        const normalizedQuestion = applyTypos(question);
        const multiHop = isMultiHopQuestion(question);
        const retrieval = retrieveRelevantChunks(normalizedQuestion, data, {
            limit: multiHop ? 4 : 3,
            scoreThreshold: multiHop ? 0.6 : 0.75,
            multiHop,
        });
        const detectedIntent = classifySupportIntent(question, retrieval.chunks, data);
        const suggestions = getSuggestionsFromChunks(retrieval.chunks, data.customPrompt);

        const shouldClarify =
            isGenericQuestion(question) ||
            detectedIntent.needsClarification &&
            !retrieval.hasStrongMatch &&
            !retrieval.hasClearWinner;

        if (shouldClarify) {
            return res.json({
                success: true,
                intent: 'clarification_needed',
                selectedArea: detectedIntent.areaLabel,
                normalizedQuestion,
                response: buildClarificationPrompt(detectedIntent, data.customPrompt),
                suggestions: suggestions.length ? suggestions : data.customPrompt
            });
        }

        const promptContext = formatChunksForPrompt(retrieval.chunks);
        const ragPrompt = `
You are answering as a business website assistant.
Use only the retrieved business context below.
If the context is partial, be honest and keep the answer grounded in it.
Do not invent services, prices, policies, or PDF details that are not in the context.
Always reply in clear English, even if the user writes in Hindi or Hinglish.
Do not copy long lines from the source word-for-word. Rewrite the answer in a clear, natural, customer-friendly way.
If there are multiple useful points, use short bullets.
Keep the answer friendly and concise.
Prefer the single strongest matching fact instead of combining weak matches.
Do not ask the user to choose between sections when the context already contains a likely answer.
If one chunk is clearly the best match, answer from that chunk directly.
If the question needs multiple facts, combine only the retrieved facts that directly support the answer.
For list or multi-step questions, preserve all key items from the retrieved context.

User question: "${question}"
Normalized question: "${normalizedQuestion}"
Business categories: ${(data.category || []).join(', ')}
Detected support area: ${detectedIntent.areaLabel}
Detected intent key: ${detectedIntent.intent}
Question type: ${multiHop ? 'multi-hop' : 'single-hop'}

Retrieved context:
${promptContext}

Return ONLY this JSON:
{"intent":"short intent","selectedArea":"best matching support area","answer":"final customer-facing answer"}
`;

        const ragResult = await gemini(ragPrompt);
        const parsed = parseRagResponse(ragResult);

        const topServiceChunk = retrieval.chunks.find((chunk) => chunk.type === 'service');
        const introText = await getIntro(question);
        const fallbackAnswer = topServiceChunk
            ? `${introText}\n\n${topServiceChunk.title}\n${topServiceChunk.text.replace(/^Section:.*?\|\s*/i, '')}\n\nWould you like more details or a quote?`
            : `${introText}\n\nBased on what I found, ${retrieval.chunks[0].text}`;

        return res.json({
            success: true,
            intent: parsed?.intent || detectedIntent.intent || 'retrieval_answer',
            selectedArea: parsed?.selectedArea || detectedIntent.areaLabel,
            normalizedQuestion,
            response: parsed?.answer || fallbackAnswer,
            suggestions
        });
    } catch (err) {
        console.error(err);
        res.json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
