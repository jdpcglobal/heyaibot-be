const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');

/* ─────────────────────────────
   GEMINI CALL
──────────────────────────── */
const gemini = async (prompt) => {
    try {
        const res = await axios.post(
            `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2 }
            }
        );
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        return null;
    }
};

/* ─────────────────────────────
   FLATTEN SERVICES
──────────────────────────── */
const flattenServices = (data = []) => {
    const services = [];
    data.forEach(section => {
        (section.value || []).forEach(v => {
            services.push({
                category: section.title || '',
                name: v.name,
                description: v.description,
                tags: v.tags || []
            });
        });
    });
    return services;
};

/* ─────────────────────────────
   GREETING CHECK
──────────────────────────── */
const GREETINGS = [
    'hi','hello','hey','hii','helo','sup','yo',
    'good morning','good afternoon','good evening',
    'namaste','salaam','hola','greetings','howdy'
];
const isGreeting = (text) => {
    const clean = text.trim().toLowerCase().replace(/[^a-z ]/g, '').trim();
    return GREETINGS.includes(clean);
};

/* ─────────────────────────────
   STEP 1: DIRECT TAG MATCH — No AI, instant
──────────────────────────── */
const directMatch = (question, services) => {
    const q = question.toLowerCase();
    let bestService = null;
    let bestScore = 0;

    services.forEach(service => {
        let score = 0;

        // Name words
        service.name.toLowerCase().split(' ').forEach(word => {
            if (word.length > 2 && q.includes(word)) score += 3;
        });

        // Tags
        service.tags.forEach(tag => {
            const tagLower = tag.toLowerCase();
            if (q.includes(tagLower)) score += 2;
            tagLower.split(' ').forEach(word => {
                if (word.length > 3 && q.includes(word)) score += 1;
            });
        });

        // Description keywords (light — just nouns longer than 5 chars)
        service.description.toLowerCase().split(/\W+/).forEach(word => {
            if (word.length > 5 && q.includes(word)) score += 1;
        });

        if (score > bestScore) {
            bestScore = score;
            bestService = service;
        }
    });

    return bestScore >= 2 ? bestService : null;
};

/* ─────────────────────────────
   STEP 2: AI DEEP MATCH
   Semantic matching — only called when direct fails
──────────────────────────── */
const aiMatch = async (question, services, categories) => {
    if (!services.length) return { relevant: true, serviceIndex: -1, intent: question };

    const serviceList = services.map((s, i) =>
`[${i}] Name: ${s.name}
Category: ${s.category}
Tags: ${s.tags.join(', ')}
Description: ${s.description}`
    ).join('\n\n');

    const res = await gemini(`
You are matching a user's question to the most relevant service from a knowledge base.

Business domain: ${categories.join(', ')}

User question: "${question}"

Available services:
${serviceList}

Instructions:
- Think about what the user TRULY wants, beyond literal word matching
- Consider synonyms, related concepts, and intent
- A question is "relevant" if it relates to this business in ANY way
- Only mark "relevant: false" if the question is completely unrelated to this business (e.g. asking about cooking recipes when the business is IT consulting)
- If multiple services partially match, pick the BEST one — do not return -1 just because it's not a perfect match
- When uncertain, pick the closest service rather than returning no match

Return ONLY valid JSON (no markdown):
{"relevant": true, "serviceIndex": 0, "intent": "what the user wants"}

No match found: {"relevant": true, "serviceIndex": -1, "intent": "what the user wants"}
Truly off-topic: {"relevant": false, "serviceIndex": -1, "intent": "out of scope"}
`);

    try {
        const clean = res?.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(clean);
        return {
            relevant: parsed.relevant !== false,
            serviceIndex: typeof parsed.serviceIndex === 'number' ? parsed.serviceIndex : -1,
            intent: parsed.intent || question
        };
    } catch {
        return { relevant: true, serviceIndex: -1, intent: question };
    }
};

/* ─────────────────────────────
   CONTEXTUAL ANSWER
   When a service IS matched — generate a tailored reply
   instead of dumping raw description
──────────────────────────── */
const generateContextualAnswer = async (question, service, businessCategories) => {
    return await gemini(`
You are a helpful assistant for a business in: ${businessCategories.join(', ')}

User asked: "${question}"

Most relevant topic from our knowledge base:
Name: ${service.name}
Category: ${service.category}
Description: ${service.description}
Tags: ${service.tags.join(', ')}

Write a helpful, conversational reply (2–3 sentences) that:
- Directly answers what the user asked using information from the topic
- Sounds natural — not like reading from a database
- Ends with one short follow-up offer (e.g. "Would you like more details?" or "Want a free quote?")

Return only the reply text, no labels or formatting.
`);
};

/* ─────────────────────────────
   KNOWLEDGE FALLBACK
   When no service matches but topic is relevant —
   answer using the full KB instead of saying "I don't know"
──────────────────────────── */
const generateKnowledgeFallback = async (question, services, categories) => {
    const kb = services
        .map(s => `• ${s.name} (${s.category}): ${s.description}`)
        .join('\n');

    return await gemini(`
You are a helpful assistant for a business in: ${categories.join(', ')}

User asked: "${question}"

Our full knowledge base:
${kb}

The user's question didn't match a specific topic exactly. Write a helpful reply that:
- Uses whatever is most relevant from the knowledge base to partially answer
- If a related topic exists, mention it by name
- If nothing is directly relevant, acknowledge kindly and mention 1–2 topics you CAN help with
- Never say "I don't know" or "outside our scope" — always offer something useful
- Max 3 sentences, conversational tone

Return only the reply text.
`);
};

/* ─────────────────────────────
   BEST MENU SUGGESTION
──────────────────────────── */
const getBestMenu = (serviceName, customPrompt) => {
    if (!serviceName || !customPrompt.length) return -1;
    const serviceWords = serviceName.toLowerCase().split(' ');
    let bestIndex = -1;
    let bestScore = 0;
    customPrompt.forEach((p, i) => {
        const pLower = p.toLowerCase();
        let score = 0;
        serviceWords.forEach(word => {
            if (word.length > 2 && pLower.includes(word)) score++;
        });
        if (score > bestScore) { bestScore = score; bestIndex = i; }
    });
    return bestScore > 0 ? bestIndex : -1;
};

/* ─────────────────────────────
   SUGGESTIONS
──────────────────────────── */
const getSuggestions = (customPrompt, menuIndex) => {
    if (!customPrompt.length) return [];
    if (menuIndex >= 0 && menuIndex < customPrompt.length) return [customPrompt[menuIndex]];
    return customPrompt;
};

/* ─────────────────────────────
   MAIN API
──────────────────────────── */
router.post('/generate-ai-response', async (req, res) => {
    try {
        const { question, apiKey } = req.body;

        if (!question || !apiKey) {
            return res.json({ success: false, message: "question and apiKey required" });
        }

        const website = await getWebsiteDataByApiKey(apiKey);
        if (!website.success) {
            return res.json({ success: false, message: "Invalid apiKey" });
        }

        const data = website.data;
        const services = flattenServices(data.aifuture);

        /* ── GREETING ── */
        if (isGreeting(question)) {
            return res.json({
                success: true,
                intent: "greeting",
                response: data.systemPrompt?.[0] || "Hello! How can I help you today?",
                suggestions: data.customPrompt
            });
        }

        /* ── STEP 1: DIRECT TAG/NAME MATCH — fast, no AI ── */
        let service = directMatch(question, services);
        let intent = question;
        let menuIndex = -1;

        if (service) {
            menuIndex = getBestMenu(service.name, data.customPrompt);
        }

        /* ── STEP 2: AI DEEP MATCH — only if direct match failed ── */
        if (!service) {
            const analysis = await aiMatch(question, services, data.category || []);
            intent = analysis.intent;

            if (!analysis.relevant) {
                // Truly off-topic — generate a redirect
                const msg = await gemini(`
User asked: "${question}"
Our services: ${(data.category || []).join(', ')}
Write 2 sentences:
1. Kindly say this is outside our area.
2. Ask one short question about what we offer: ${(data.category || []).join(', ')}
Return only the text.
`);
                return res.json({
                    success: true,
                    intent: "out_of_scope",
                    response: msg || `That's a bit outside our area of expertise. Are you looking for help with ${(data.category || []).join(' or ')}?`,
                    suggestions: data.customPrompt
                });
            }

            if (analysis.serviceIndex >= 0 && analysis.serviceIndex < services.length) {
                service = services[analysis.serviceIndex];
                menuIndex = getBestMenu(service.name, data.customPrompt);
            }
        }

        /* ── SERVICE FOUND — generate contextual answer ── */
        if (service) {
            const answer = await generateContextualAnswer(question, service, data.category || []);
            const suggestions = getSuggestions(data.customPrompt, menuIndex);

            return res.json({
                success: true,
                intent,
                response: answer || `${service.name}\n\n${service.description}\n\nWould you like more details?`,
                suggestions
            });
        }

        /* ── NO SERVICE MATCH but topic is relevant ──
           Use full KB as context — never say "I don't know"  ── */
        const fallback = await generateKnowledgeFallback(question, services, data.category || []);

        return res.json({
            success: true,
            intent,
            response: fallback || `I'm not sure I have the exact answer, but I'd love to help — could you tell me more about what you're looking for?`,
            suggestions: data.customPrompt
        });

    } catch (err) {
        console.error(err);
        res.json({ success: false, message: "Server error" });
    }
});

module.exports = router;
