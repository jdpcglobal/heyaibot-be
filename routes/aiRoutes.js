const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');

/* ── Helper: Clean Text ────────────────────────────────────────── */
const cleanText = (text) => {
    if (!text) return '';
    const parts = text.split('||').map(p => p.trim()).filter(Boolean);
    return [...new Set(parts)].join(' ').replace(/\s+/g, ' ').trim();
};

/* ── Helper: Process AI Future Data ────────────────────────────── */
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

/* ── Gemini API Call ────────────────────────────────────────────── */
const callGeminiAPI = async (prompt) => {
    try {
        const response = await axios.post(
            `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    temperature: 0.1, 
                    maxOutputTokens: 500, 
                    topP: 0.8, 
                    topK: 40 
                }
            },
            { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
        );
        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (err) {
        console.error('Gemini API Error:', err.message);
        return null;
    }
};

/* ── Step 1: EXTRACT INTENT FROM QUESTION ONLY ──────────────────── */
/*    BILKUL DATABASE KI MAA CHOD DI - SIRF GEMINI SE INTENT NIKAL */
const extractIntentFromQuestion = async (question) => {
    const prompt = `You are an intent extraction system. Extract the MAIN intent from the user's question.

User Question: "${question}"

CRITICAL RULES:
1. Return ONLY the intent as a short phrase (2-5 words maximum)
2. Do NOT return "Service", "General", "Help", "Support" - these are NOT intents
3. Be SPECIFIC - extract the actual service or product being asked about

EXAMPLES:
- "Do you provide SEO services?" → "SEO Services"
- "Can you build a gaming website?" → "Gaming Website Development"
- "What is your pricing for app development?" → "App Development Pricing"
- "Do you offer digital marketing?" → "Digital Marketing"
- "How much for a WordPress site?" → "WordPress Website"
- "Can you fix my database?" → "Database Repair"
- "Do you do content writing?" → "Content Writing"

Intent:`;

    const intent = await callGeminiAPI(prompt);
    const cleaned = intent?.trim().replace(/[^a-zA-Z0-9\s]/g, '') || "General Inquiry";
    
    // Agar "Service" ya "Help" jaise generic words aaye toh reject karo
    if (cleaned.toLowerCase() === 'service' || 
        cleaned.toLowerCase() === 'help' || 
        cleaned.toLowerCase() === 'support' ||
        cleaned.toLowerCase() === 'general') {
        return "General Inquiry";
    }
    
    return cleaned;
};

/* ── Step 2: Check if service exists in database (optional match) ─ */
const matchWithDatabase = (intent, aifutureData) => {
    if (!intent || Object.keys(aifutureData).length === 0) {
        return { matched: false, category: null, service: null };
    }
    
    const intentLower = intent.toLowerCase();
    
    for (const [, category] of Object.entries(aifutureData)) {
        const categoryLower = category.originalTitle.toLowerCase();
        
        // Check category match
        if (intentLower.includes(categoryLower) || categoryLower.includes(intentLower)) {
            return { 
                matched: true, 
                category: category.originalTitle,
                service: null,
                type: 'category'
            };
        }
        
        // Check specific service match
        for (const svc of category.values) {
            const svcNameLower = svc.name.toLowerCase();
            if (intentLower.includes(svcNameLower) || svcNameLower.includes(intentLower)) {
                return {
                    matched: true,
                    category: category.originalTitle,
                    service: svc,
                    type: 'service'
                };
            }
        }
    }
    
    return { matched: false, category: null, service: null };
};

/* ── Step 3: Generate Response ──────────────────────────────────── */
const generateResponse = async (question, intent, dbMatch, aifutureData) => {
    
    // CASE 1: Database match mil gaya - specific response with details
    if (dbMatch.matched && dbMatch.type === 'service' && dbMatch.service) {
        const svc = dbMatch.service;
        let response = `Yes, we provide ${svc.name}.`;
        if (svc.price) response += ` It is available at ${svc.price}.`;
        if (svc.description) response += ` ${svc.description.split('||')[0]}`;
        response += ` Would you like to know more about this service?`;
        return response;
    }
    
    // CASE 2: Category match mil gaya
    if (dbMatch.matched && dbMatch.type === 'category') {
        return `Yes, we offer ${dbMatch.category} services. Could you please specify which ${dbMatch.category} service you're interested in so I can provide more details?`;
    }
    
    // CASE 3: NO DATABASE MATCH - Gemini se response generate kar, lekin intent use kar
    const prompt = `Generate a helpful response for this customer inquiry.

User Question: "${question}"
Detected Intent: "${intent}"

RULES:
1. Be honest - acknowledge their intent: "${intent}"
2. If you don't know if you offer it, say you'll check
3. Ask for more specific details
4. Keep it under 2 sentences
5. Do NOT just say "Service" - use their actual intent

Response:`;

    const aiResponse = await callGeminiAPI(prompt);
    
    return aiResponse || `I understand you're asking about ${intent}. Let me check if we offer this service. Could you please share more specific details about what you need?`;
};

/* ── Step 4: Generate Suggestions ───────────────────────────────── */
const getSuggestions = async (question, intent, dbMatch, customPrompts) => {
    // Agar database match hai aur service hai toh uske related suggestions
    if (dbMatch.matched && dbMatch.type === 'service' && dbMatch.service) {
        const related = customPrompts.filter(p => 
            p.toLowerCase().includes(dbMatch.service.name.toLowerCase()) ||
            dbMatch.service.name.toLowerCase().includes(p.toLowerCase())
        );
        if (related.length > 0) return related.slice(0, 3);
    }
    
    // Gemini se suggestions generate karo based on intent
    const prompt = `Based on this user question: "${question}" and detected intent: "${intent}"
Generate 3 relevant follow-up questions or suggestions that the user might want to ask next.
Return as a JSON array of strings.
Example: ["Tell me about pricing", "Show me packages", "Do you have custom plans?"]

Suggestions:`;

    const aiSuggestions = await callGeminiAPI(prompt);
    try {
        const cleaned = aiSuggestions.replace(/```json|```/g, '').trim();
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return parsed.slice(0, 3);
            }
        }
    } catch (err) {
        console.error('Suggestion parse error:', err.message);
    }
    
    // Fallback suggestions
    return [`Tell me more about ${intent}`, `What is the pricing for ${intent}?`, `Do you have any packages for ${intent}?`];
};

/* ── MAIN ROUTE ──────────────────────────────────────────────────── */
router.post('/generate-ai-response', async (req, res) => {
    try {
        const { question, apiKey } = req.body;

        // Validation
        if (!question?.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Question required bhenchod!' 
            });
        }
        
        if (!apiKey) {
            return res.status(400).json({ 
                success: false, 
                message: 'API key required!' 
            });
        }

        // Get website data from database (optional, for matching)
        const websiteResult = await getWebsiteDataByApiKey(apiKey);
        if (!websiteResult.success || !websiteResult.data) {
            return res.status(404).json({ 
                success: false, 
                message: 'Invalid API key or website not found' 
            });
        }

        const websiteData = websiteResult.data;
        const aifutureData = processAifutureData(websiteData.aifuture || []);
        const customPrompts = Array.isArray(websiteData.customPrompt) ? websiteData.customPrompt : [];

        // STEP 1: INTENT NIKAL - SIRF QUESTION SE, DATABASE KI MAA CHOD
        console.log('Extracting intent from question:', question);
        const extractedIntent = await extractIntentFromQuestion(question);
        console.log('Extracted Intent:', extractedIntent);

        // STEP 2: DATABASE SE MATCH KARNE KI KOSHISH - HOGA TO TIK, NAHI TO BHI TIK
        const dbMatch = matchWithDatabase(extractedIntent, aifutureData);
        console.log('Database Match:', dbMatch);

        // STEP 3: RESPONSE GENERATE KAR - INTENT HAMESHA BHEJEGA
        const response = await generateResponse(question, extractedIntent, dbMatch, aifutureData);
        
        // STEP 4: SUGGESTIONS GENERATE KAR
        const suggestions = await getSuggestions(question, extractedIntent, dbMatch, customPrompts);

        // FINAL RESPONSE - INTENT JO BHI NIKLA HAI, WOHI BHEJ
        return res.json({
            success: true,
            intent: extractedIntent,        // YAHI DEKHNA - "SEO SERVICES" AAYEGA, "SERVICE" NAHI
            matched: dbMatch.matched,
            response: response,
            suggestions: suggestions
        });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ 
            success: false, 
            message: 'Unable to process your request. Gand phat gayi!',
            error: err.message 
        });
    }
});

module.exports = router;