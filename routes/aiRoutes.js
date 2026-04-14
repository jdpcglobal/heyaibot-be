const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');

/* ───────────────────────────────── */

const cleanText = (text) => {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
};

const processAifutureData = (data) => {
    const services = [];

    if (!Array.isArray(data)) return services;

    data.forEach(item => {
        if (!item.title || !Array.isArray(item.value)) return;

        item.value.forEach(v => {
            services.push({
                category: item.title,
                name: v.name || '',
                price: v.price || '',
                description: cleanText(v.description || ''),
                tags: Array.isArray(v.tags) ? v.tags : []
            });
        });
    });

    return services;
};

/* ───────────────────────────────── */
/* GEMINI */

const callGemini = async (prompt) => {
    try {
        const response = await axios.post(
            `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    maxOutputTokens: 150
                }
            }
        );

        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    } catch (err) {
        console.error("Gemini Error:", err.message);
        return null;
    }
};

/* ───────────────────────────────── */
/* INTENT FROM QUESTION ONLY */

const detectIntent = async (question) => {

    const prompt = `
User question: "${question}"

Identify user intent in 2-4 words.
Do not use categories.

Return JSON:
{"intent":"short intent"}
`;

    const raw = await callGemini(prompt);

    if(!raw) return "User inquiry";

    try {
        const parsed = JSON.parse(raw.replace(/```json|```/g,''));
        return parsed.intent || "User inquiry";
    } catch {
        return "User inquiry";
    }
};

/* ───────────────────────────────── */
/* SEARCH TAGS -> VALUE */

const searchServices = (question, services) => {

    const q = question.toLowerCase();
    const matches = [];

    services.forEach(service => {

        let score = 0;

        /* TAG MATCH */
        service.tags.forEach(tag=>{
            if(q.includes(tag.toLowerCase()))
                score += 3;
        });

        /* VALUE MATCH */
        if(q.includes(service.name.toLowerCase()))
            score += 5;

        /* PARTIAL MATCH */
        service.name.split(" ").forEach(word=>{
            if(word.length > 2 && q.includes(word.toLowerCase()))
                score += 1;
        });

        if(score > 0){
            matches.push({
                service,
                score
            });
        }
    });

    return matches;
};

/* ───────────────────────────────── */
/* AI BEST PICK */

const pickBestMatch = async (question, matches) => {

    if(matches.length === 1)
        return matches[0].service;

    const list = matches.map(m=>m.service.name).join(', ');

    const prompt = `
User question: "${question}"

Choose most relevant:
${list}

Return only name
`;

    const raw = await callGemini(prompt);

    if(!raw) return matches[0].service;

    const found = matches.find(m =>
        raw.toLowerCase().includes(m.service.name.toLowerCase())
    );

    return found ? found.service : matches[0].service;
};

/* ───────────────────────────────── */
/* MAIN API */

router.post('/generate-ai-response', async (req, res) => {

try {

    const { question, apiKey } = req.body;

    if(!question?.trim()){
        return res.status(400).json({
            success:false,
            message:"Question required"
        });
    }

    if(!apiKey){
        return res.status(400).json({
            success:false,
            message:"API key required"
        });
    }

    const websiteResult = await getWebsiteDataByApiKey(apiKey);

    if(!websiteResult.success){
        return res.status(404).json({
            success:false,
            message:"Invalid API key"
        });
    }

    /* PROCESS DATA */
    const services = processAifutureData(
        websiteResult.data.aifuture || []
    );

    /* INTENT (QUESTION BASED) */
    const intent = await detectIntent(question);

    /* SEARCH */
    const matches = searchServices(question, services);

    let response = "Sorry, I couldn't find relevant service.";
    let suggestions = [];

    if(matches.length > 0){

        const best = await pickBestMatch(question, matches);

        response =
`${best.name} ${best.description} Would you like to know more about this service?`;

        suggestions = [best.name];
    }

    return res.json({
        success:true,
        intent,
        response,
        suggestions
    });

} catch(err){

    console.error("API Error:", err);

    return res.status(500).json({
        success:false,
        message:"Server error"
    });
}

});

module.exports = router;