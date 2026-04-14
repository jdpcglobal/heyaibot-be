const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');

/* CLEAN TEXT */
const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
};

/* PROCESS DATA */
const processAifutureData = (data) => {

    const services = [];

    if (!Array.isArray(data)) return services;

    data.forEach(item => {

        if (!item.title || !Array.isArray(item.value)) return;

        item.value.forEach(v => {

            services.push({
                category: item.title,
                name: v.name || '',
                description: cleanText(v.description || ''),
                tags: Array.isArray(v.tags) ? v.tags : []
            });

        });

    });

    return services;
};

/* GEMINI CALL */
const callGemini = async (prompt) => {

    try {

        const response = await axios.post(
            `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 200
                }
            }
        );

        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    } catch (err) {
        console.error("Gemini Error:", err.message);
        return null;
    }
};

/* INTENT DETECT */
const detectIntent = async (question) => {

    const prompt = `
User question: "${question}"

Return short intent in 2-4 words.

JSON:
{"intent":""}
`;

    const raw = await callGemini(prompt);

    try {
        const parsed = JSON.parse(raw.replace(/```json|```/g,''));
        return parsed.intent || question;
    } catch {
        return question;
    }
};

/* TAG MATCH */
const matchByTags = (intent, services) => {

    const i = intent.toLowerCase();

    return services.find(service =>
        service.tags.some(tag =>
            i.includes(tag.toLowerCase())
        )
    );
};

/* VALUE MATCH */
const matchByValue = (intent, services) => {

    const i = intent.toLowerCase();

    return services.find(service =>
        i.includes(service.name.toLowerCase())
    );
};

/* GEMINI FALLBACK */
const geminiFallback = async (question, categories) => {

    const prompt = `
User question: "${question}"

Reply politely in formal language.
Then ask a follow-up question related to these categories:

${categories.join(', ')}

Keep answer short.
`;

    return await callGemini(prompt);
};

/* MAIN API */

router.post('/generate-ai-response', async (req, res) => {

try {

    const { question, apiKey } = req.body;

    if(!question || !apiKey){
        return res.status(400).json({
            success:false,
            message:"question and apiKey required"
        });
    }

    /* DB DATA */
    const websiteResult = await getWebsiteDataByApiKey(apiKey);

    if(!websiteResult.success){
        return res.status(404).json({
            success:false,
            message:"Invalid API key"
        });
    }

    const services = processAifutureData(
        websiteResult.data.aifuture || []
    );

    /* 1. INTENT */
    const intent = await detectIntent(question);

    /* 2. TAG MATCH */
    let match = matchByTags(intent, services);

    /* 3. VALUE MATCH */
    if(!match){
        match = matchByValue(intent, services);
    }

    /* RESPONSE */
    let response;
    let suggestions = [];

    if(match){

        response =
`${match.name} ${match.description} Would you like to know more about this service?`;

        suggestions = [match.name];

    }else{

        const categories = [...new Set(
            services.map(s => s.category)
        )];

        response = await geminiFallback(question, categories);

    }

    return res.json({
        success:true,
        intent,
        response,
        suggestions
    });

} catch(err){

    console.error("API Error:", err);

    res.status(500).json({
        success:false,
        message:"Server error"
    });
}

});

module.exports = router;