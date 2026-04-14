const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');

/* ── Helpers ────────────────────────────────────────────────────── */

const cleanText = (text) => {
    if (!text) return '';
    const parts = text.split('||').map(p => p.trim()).filter(Boolean);
    return [...new Set(parts)].join(' ').replace(/\s+/g, ' ').trim();
};

const processAifutureData = (aifutureData) => {
    const data = {};
    if (!Array.isArray(aifutureData)) return data;

    aifutureData.forEach(item => {
        if (!item.title || !Array.isArray(item.value)) return;
        const key = item.title.toLowerCase().trim();
        data[key] = {
            originalTitle: item.title,
            values: item.value.map(v => {
                if (typeof v === 'object' && v !== null) {
                    return {
                        name: v.name || '',
                        price: v.price || '',
                        description: cleanText(v.description || ''),
                        tags: Array.isArray(v.tags) ? v.tags : []
                    };
                }
                return { name: String(v), price: '', description: '', tags: [] };
            })
        };
    });
    return data;
};

/* ── Step 0: Greeting / Goodbye / Thanks check ──────────────────── */

const checkMessageType = (question) => {
    const q = question.toLowerCase().trim();
    const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'namaste'];
    const goodbyes  = ['bye', 'goodbye', 'see you', 'take care', 'farewell'];
    const thanks    = ['thank', 'thanks', 'thx', 'appreciate', 'grateful'];

    if (greetings.some(g => q === g || q.startsWith(g + ' '))) return { type: 'greeting' };
    if (goodbyes.some(g => q.includes(g)))  return { type: 'goodbye' };
    if (thanks.some(t => q.includes(t)))    return { type: 'thanks' };
    return null;
};

/* ── Gemini API call ────────────────────────────────────────────── */

const callGeminiAPI = async (prompt) => {
    try {
        const response = await axios.post(
            `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 200, topP: 0.8, topK: 40 }
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (err) {
        console.error('Gemini API Error:', err.message);
        return null;
    }
};

/* ── Step 1: Dynamic intent detection (fully AI-driven) ─────────── */
/*
   - Collect ALL unique service names + tags from database
   - Send them to AI along with the question
   - AI returns the best matching intent keyword from the actual data
   - No hardcoded SEO/SOFTWARE/WEBSITE — intent = whatever the business has
*/

const detectIntent = async (question, aifutureData) => {
    try {
        // Build a flat list of all category titles (these become intent options)
        const intentOptions = Object.values(aifutureData).map(c => c.originalTitle);
        const intentsMayBe=[];

        if (intentOptions.length === 0) return { primary: 'General', confidence: 0.5 };

        // Quick keyword scan before AI call (saves latency)
        const q = question.toLowerCase();
        for (const [, category] of Object.entries(aifutureData)) {
            const title = category.originalTitle.toLowerCase();
            if (q.includes(title)) {
                //return { primary: category.originalTitle, confidence: 0.95 };
                //intentsMayBe.push(category.originalTitle);
            }
            // Check if any service name in this category appears in question
            for (const svc of category.values) {
                if (svc.name && q.includes(svc.name.toLowerCase())) {
                    //return { primary: category.originalTitle, confidence: 0.9 };
                    intentsMayBe.push(svc);
                }
            }
        }

        // AI call for semantic matching
        const prompt = `
You are an intent classifier. Return ONLY a JSON object.

User Question: "${question}"

Available Categories (pick the closest one): ${intentsMayBe.map(s => s.name).join(', ')}

Return: {"intent": "<category name from the list above>"}

Rules:
- You MUST pick one from the list — do not invent a new category.
- Pick the category most semantically related to the question.
- If nothing fits, pick the first category from the list.
`;
        const raw = await callGeminiAPI(prompt);
        if (raw) {
            const cleaned = raw.replace(/```json|```/g, '').trim();
            const match = cleaned.match(/\{[\s\S]*\}/);
            if (match) {
                const parsed = JSON.parse(match[0]);
                const detected = parsed.intent?.trim();
                // Validate: must be one of our categories (case-insensitive)
                const found = intentOptions.find(o => o.toLowerCase() === detected?.toLowerCase());
                if (found) return { primary: found, confidence: 0.8 };
            }
        }

        // Fallback: return first available category
        return { primary: intentOptions[0], confidence: 0.5 };

    } catch (err) {
        console.error('Intent detection error:', err.message);
        const fallback = Object.values(aifutureData)[0]?.originalTitle || 'General';
        return { primary: fallback, confidence: 0.5 };
    }
};

/* ── Step 2: Role match ─────────────────────────────────────────── */

const searchInRoles = (question, roles) => {
    if (!Array.isArray(roles) || roles.length === 0) return null;
    const q = question.toLowerCase();

    for (const role of roles) {
        if (q.includes(role.toLowerCase())) {
            return { type: 'role', matched: role, confidence: 0.9 };
        }
    }
    return null;
};

/* ── Step 3 & 4: Value + Tag match ─────────────────────────────── */

const searchInValuesAndTags = (question, aifutureData, intent) => {
    const q = question.toLowerCase();
    let bestMatch = null;
    let highestScore = 0;

    for (const [, category] of Object.entries(aifutureData)) {
        const isIntentCategory = category.originalTitle.toLowerCase() === intent.primary.toLowerCase();

        for (const svc of category.values) {
            if (!svc.name) continue;
            let score = 0;
            const svcName = svc.name.toLowerCase();

            // Boost if service belongs to detected intent's category
            if (isIntentCategory) score += 3.0;

            // Exact service name in question
            if (q.includes(svcName)) {
                score += 5.0;
            }

            // Partial word match on service name
            svcName.split(/\s+/).forEach(word => {
                if (word.length > 2 && q.includes(word)) score += 1.0;
            });

            // Direct ask patterns ("do you provide X", "do you offer X")
            if (
                q.includes(`provide ${svcName}`) ||
                q.includes(`offer ${svcName}`) ||
                q.includes(`${svcName} service`) ||
                q.includes(`${svcName} available`)
            ) {
                score += 4.0;
            }

            // Tag matching (Step 4)
            if (Array.isArray(svc.tags)) {
                svc.tags.forEach(tag => {
                    const tagLower = tag.toLowerCase();
                    if (q.includes(tagLower)) score += 2.5;
                    else {
                        // Partial tag word match
                        tagLower.split(' ').forEach(word => {
                            if (word.length > 2 && q.includes(word)) score += 0.8;
                        });
                    }
                });
            }

            if (score > highestScore && score >= 1.5) {
                highestScore = score;
                bestMatch = {
                    type: 'service',
                    service: svc,
                    confidence: Math.min(score / 10, 1)
                };
            }
        }
    }

    return bestMatch;
};

/* ── Step 5: Generate Response ──────────────────────────────────── */

const generateResponse = ({ messageType, roleMatch, serviceMatch, intent, question, categories }) => {

    // Greeting / Goodbye / Thanks
    if (messageType?.type === 'greeting') return "Hello! How may I assist you today?";
    if (messageType?.type === 'goodbye')  return "Thank you for connecting with us. Have a great day!";
    if (messageType?.type === 'thanks')   return "You're welcome! Feel free to reach out anytime.";

    // Role match
    if (roleMatch) {
        return `I can connect you with our ${roleMatch.matched} team. They will assist you with your requirements. Would you like me to proceed?`;
    }

    // Service / Value / Tag match
    if (serviceMatch?.service) {
        const svc = serviceMatch.service;
        const q = question.toLowerCase();
        const isDirectAsk = q.includes('do you provide') || q.includes('do you offer') || q.includes('available');

        let response = isDirectAsk ? `Yes, we provide ${svc.name}. ` : `${svc.name}`;

        if (!isDirectAsk && svc.price?.trim()) response += ` — ${svc.price}`;
        if (isDirectAsk && svc.price?.trim()) response += `It is available at ${svc.price}. `;

        const description = (svc.description || '').split('||')[0].trim();
        if (description) response += ` ${description}`;

        response += ' Would you like to know more about this service?';
        return response;
    }

    // No match — return intent + ask for more details
    const categoryList = categories.length > 0 ? categories.join(', ') : intent.primary;
    return `I understand you're asking about ${intent.primary}. We offer services in: ${categoryList}. Could you please share more specific details about what you need so I can assist you better?`;
};

/* ── Suggestions ────────────────────────────────────────────────── */

const getSuggestions = ({ serviceMatch, roleMatch, customPrompts, intent }) => {
    const prompts = Array.isArray(customPrompts) ? customPrompts : [];
    if (prompts.length === 0 || (!serviceMatch && !roleMatch)) return [];

    const intentLower = intent.primary.toLowerCase();

    // Match suggestions to service name or intent keyword
    if (serviceMatch?.service) {
        const svcLower = serviceMatch.service.name.toLowerCase();
        const relevant = prompts.filter(p =>
            p.toLowerCase().includes(svcLower) || p.toLowerCase().includes(intentLower)
        );
        if (relevant.length > 0) return relevant.slice(0, 4);
    }

    if (roleMatch) {
        const roleLower = roleMatch.matched.toLowerCase();
        const relevant = prompts.filter(p => p.toLowerCase().includes(roleLower));
        if (relevant.length > 0) return relevant.slice(0, 4);
    }

    // Fallback: intent-based suggestions
    const intentBased = prompts.filter(p => p.toLowerCase().includes(intentLower));
    return intentBased.slice(0, 4);
};

/* ── Main Route ─────────────────────────────────────────────────── */

router.post('/generate-ai-response', async (req, res) => {
    try {
        const { question, apiKey } = req.body;

        if (!question?.trim()) return res.status(400).json({ success: false, message: 'Question required' });
        if (!apiKey)           return res.status(400).json({ success: false, message: 'API key required' });

        const websiteResult = await getWebsiteDataByApiKey(apiKey);
        if (!websiteResult.success || !websiteResult.data) {
            return res.status(404).json({ success: false, message: 'Invalid API key or website not found' });
        }

        const websiteData    = websiteResult.data;
        const aifutureData   = processAifutureData(websiteData.aifuture || []);
        const customPrompts  = Array.isArray(websiteData.customPrompt) ? websiteData.customPrompt : [];
        const categories     = websiteData.category || [];
        const roles          = websiteData.role || [];

        // Step 0: Greeting check
        const messageType = checkMessageType(question);

        let intent       = { primary: Object.values(aifutureData)[0]?.originalTitle || 'General', confidence: 0.5 };
        let roleMatch    = null;
        let serviceMatch = null;

        if (!messageType) {
            // Step 1: Detect intent dynamically from DB categories
            intent = await detectIntent(question, aifutureData);
            console.log('Intent:', intent.primary);

            // Step 2: Role match
            roleMatch = searchInRoles(question, roles);
            console.log('Role match:', roleMatch?.matched || 'none');

            // Step 3 & 4: Value + Tag match (only if no role match)
            if (!roleMatch) {
                serviceMatch = searchInValuesAndTags(question, aifutureData, intent);
                console.log('Service match:', serviceMatch?.service?.name || 'none');
            }
        }

        const response = generateResponse({ messageType, roleMatch, serviceMatch, intent, question, categories });
        const suggestions = getSuggestions({ serviceMatch, roleMatch, customPrompts, intent });

        return res.json({
            success: true,
            intent: intent.primary,
            response,
            suggestions
        });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ success: false, message: 'Unable to process your request.' });
    }
});

module.exports = router;