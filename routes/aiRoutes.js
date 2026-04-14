const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');

/* ── Gemini API Call ────────────────────────────────────────────── */
const callGeminiAPI = async (prompt) => {
    try {
        const response = await axios.post(
            `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    temperature: 0, 
                    maxOutputTokens: 200
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

/* ── Step 1: Intent Extraction - Keyword based ─────────────────── */
const extractIntentFromKeywords = (question) => {
    const q = question.toLowerCase();
    
    const intents = {
        'seo': 'SEO Services',
        'gaming website': 'Gaming Website Development',
        'app development': 'App Development',
        'digital marketing': 'Digital Marketing',
        'web development': 'Web Development',
        'content writing': 'Content Writing',
        'pricing': 'Pricing Inquiry',
        'wordpress': 'WordPress Development',
        'ecommerce': 'E-commerce Development',
        'logo design': 'Logo Design',
        'graphic design': 'Graphic Design'
    };
    
    for (const [key, value] of Object.entries(intents)) {
        if (q.includes(key)) {
            return value;
        }
    }
    return null;
};

/* ── Step 2: Intent nikal (pehle keyword, fir Gemini) ──────────── */
const getIntent = async (question) => {
    // Pehle keyword se try
    let intent = extractIntentFromKeywords(question);
    if (intent) {
        return { intent, method: 'keyword' };
    }
    
    // Nahi toh Gemini se
    const prompt = `Extract the main service intent from: "${question}"
Return ONLY 2-4 words.
Examples:
"Do you provide SEO?" → "SEO Services"
"Can you build a gaming website?" → "Gaming Website Development"

Intent:`;
    
    const geminiIntent = await callGeminiAPI(prompt);
    intent = geminiIntent?.trim().replace(/["']/g, '') || 'General Inquiry';
    return { intent, method: 'gemini' };
};

/* ── Step 3: Database mein check karo - service hai ya nahi ─────── */
const checkServiceInDatabase = (intent, aifutureData) => {
    if (!aifutureData || Object.keys(aifutureData).length === 0) {
        return { exists: false, reason: 'No data in database' };
    }
    
    const intentLower = intent.toLowerCase();
    
    // Check in categories
    for (const [key, category] of Object.entries(aifutureData)) {
        const categoryLower = category.originalTitle.toLowerCase();
        
        // Exact category match
        if (intentLower === categoryLower || 
            categoryLower.includes(intentLower) || 
            intentLower.includes(categoryLower)) {
            return { 
                exists: true, 
                type: 'category',
                data: category,
                confidence: 'high'
            };
        }
        
        // Check in service names
        for (const service of category.values) {
            const serviceNameLower = service.name.toLowerCase();
            if (intentLower === serviceNameLower ||
                serviceNameLower.includes(intentLower) ||
                intentLower.includes(serviceNameLower)) {
                return {
                    exists: true,
                    type: 'service',
                    data: service,
                    category: category.originalTitle,
                    confidence: 'high'
                };
            }
            
            // Check in tags
            if (service.tags && Array.isArray(service.tags)) {
                for (const tag of service.tags) {
                    if (intentLower.includes(tag.toLowerCase())) {
                        return {
                            exists: true,
                            type: 'service',
                            data: service,
                            category: category.originalTitle,
                            confidence: 'medium'
                        };
                    }
                }
            }
        }
    }
    
    return { exists: false, reason: 'Service not found in database' };
};

/* ── Step 4: Response generate - match ho ya na ho ──────────────── */
const generateFinalResponse = async (question, intent, dbCheck, aifutureData) => {
    
    // CASE 1: Service database mein MIL GAYI
    if (dbCheck.exists) {
        if (dbCheck.type === 'service' && dbCheck.data) {
            const service = dbCheck.data;
            let response = `✅ Yes, we provide ${service.name}.`;
            if (service.price) response += ` Price: ${service.price}.`;
            if (service.description) response += ` ${service.description.split('||')[0]}`;
            response += ` Would you like to know more?`;
            return response;
        }
        
        if (dbCheck.type === 'category') {
            return `✅ Yes, we offer ${dbCheck.data.originalTitle} services. Which specific service are you interested in?`;
        }
    }
    
    // CASE 2: Service database mein NAHI MILI - lekin jo intent nikala woh batao
    const prompt = `User asked: "${question}"
Detected intent: "${intent}"

We DON'T have this exact service in our database.

Generate a response that:
1. Acknowledges they asked about: ${intent}
2. Politely says we'll check if we offer it
3. Asks for more specific details
4. Keep it friendly and under 2 sentences

Response:`;

    const aiResponse = await callGeminiAPI(prompt);
    return aiResponse || `I see you're asking about ${intent}. Let me check if we offer this service. Could you please share more specific requirements?`;
};

/* ── Step 5: Suggestions banao ──────────────────────────────────── */
const getSuggestions = async (question, intent, dbCheck, customPrompts) => {
    // Agar database mein service mili hai toh uske related suggestions
    if (dbCheck.exists && dbCheck.type === 'service' && dbCheck.data) {
        const serviceName = dbCheck.data.name;
        const related = customPrompts.filter(p => 
            p.toLowerCase().includes(serviceName.toLowerCase())
        );
        if (related.length > 0) return related.slice(0, 3);
        
        return [
            `Tell me more about ${serviceName}`,
            `What is the pricing for ${serviceName}?`,
            `Do you have packages for ${serviceName}?`
        ];
    }
    
    // Warna intent-based suggestions
    return [
        `Tell me more about ${intent}`,
        `What is the pricing for ${intent}?`,
        `Do you offer different packages for ${intent}?`
    ];
};

/* ── MAIN API ───────────────────────────────────────────────────── */
router.post('/generate-ai-response', async (req, res) => {
    try {
        const { question, apiKey } = req.body;

        if (!question?.trim()) {
            return res.status(400).json({ 
                success: false, 
                error: 'Question required!' 
            });
        }
        
        if (!apiKey) {
            return res.status(400).json({ 
                success: false, 
                error: 'API key required!' 
            });
        }

        // Get website data from database
        const websiteResult = await getWebsiteDataByApiKey(apiKey);
        if (!websiteResult.success || !websiteResult.data) {
            return res.status(404).json({ 
                success: false, 
                error: 'Invalid API key or website not found' 
            });
        }

        const websiteData = websiteResult.data;
        const aifutureData = websiteData.aifuture || [];
        const customPrompts = Array.isArray(websiteData.customPrompt) ? websiteData.customPrompt : [];

        // STEP 1: INTENT NIKAL
        const { intent, method } = await getIntent(question);
        console.log('Intent:', intent, '(Method:', method + ')');

        // STEP 2: DATABASE MEIN CHECK KAR
        const dbCheck = checkServiceInDatabase(intent, aifutureData);
        console.log('Database Check:', dbCheck);

        // STEP 3: RESPONSE GENERATE KAR
        const response = await generateFinalResponse(question, intent, dbCheck, aifutureData);

        // STEP 4: SUGGESTIONS
        const suggestions = await getSuggestions(question, intent, dbCheck, customPrompts);

        // FINAL RESPONSE
        return res.json({
            success: true,
            intent: intent,                    // Intent jo nikla
            intent_method: method,              // keyword ya gemini
            service_available: dbCheck.exists,  // database mein hai ya nahi
            response: response,
            suggestions: suggestions
        });

    } catch (err) {
        console.error('API Error:', err);
        return res.status(500).json({ 
            success: false, 
            error: 'Server error!' 
        });
    }
});

module.exports = router;
/* ── MAIN ROUTE ──────────────────────────────────────────────────── */


module.exports = router;