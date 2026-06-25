const express = require('express');
const router = express.Router();
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
`[${i}] ${s.name} | ${s.tags.join(', ')}`
    ).join('\n');

    const res = await gemini(`Match this question to a service. Business: ${categories.join(', ')}
Question: "${question}"
Services:
${serviceList}
Return ONLY JSON: {"relevant":true,"serviceIndex":0,"intent":"brief intent"}
Off-topic: {"relevant":false,"serviceIndex":-1,"intent":"out of scope"}
No match: {"relevant":true,"serviceIndex":-1,"intent":"brief intent"}`);

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
You are a concise assistant for a business in: ${businessCategories.join(', ')}

User asked: "${question}"

Topic: ${service.name} — ${service.description}

Reply in 1–2 short sentences. Answer directly, sound natural, end with one brief offer (e.g. "Want more details?"). No lists, no bullet points, no formatting.
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
You are a concise assistant for a business in: ${categories.join(', ')}

User asked: "${question}"

Knowledge base:
${kb}

Reply in 1–2 short sentences using the most relevant topic. Mention one topic by name if helpful. No lists, no formatting.
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
In one sentence: politely say this is outside our area and mention what we can help with.
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
