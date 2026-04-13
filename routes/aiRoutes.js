const express = require('express');
const router = express.Router();
require('dotenv').config();
const axios = require('axios');

const { getWebsiteDataByApiKey } = require('../models/websiteModel');

/* ── Helper Functions ────────────────────────────────────────────── */

const cleanText = (text) => {
    if (!text) return '';
    const parts = text.split('||').map(p => p.trim()).filter(Boolean);
    const deduped = [...new Set(parts)];
    let cleaned = deduped.join(' ');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
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

// Check message type
const checkMessageType = (question) => {
    const q = question.toLowerCase().trim();
    
    const greetings = ['hi', 'hello', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening', 'namaste'];
    const goodbyes = ['bye', 'goodbye', 'see you', 'take care', 'farewell'];
    const thanks = ['thank', 'thanks', 'thx', 'appreciate', 'grateful'];
    
    if (greetings.some(g => q === g || q.startsWith(g))) {
        return { type: 'greeting' };
    }
    if (goodbyes.some(g => q.includes(g))) {
        return { type: 'goodbye' };
    }
    if (thanks.some(t => q.includes(t))) {
        return { type: 'thanks' };
    }
    
    return null;
};

// Call Gemini API
const callGeminiAPI = async (prompt) => {
    try {
        const apiUrl = process.env.GEMINI_API_URL;
        const apiKey = process.env.GEMINI_API_KEY;
        
        const response = await axios.post(
            `${apiUrl}?key=${apiKey}`,
            {
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 200,
                    topP: 0.8,
                    topK: 40
                }
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 15000
            }
        );
        
        if (response.data && response.data.candidates && response.data.candidates[0]) {
            return response.data.candidates[0].content.parts[0].text;
        }
        return null;
    } catch (error) {
        console.error('Gemini API Error:', error.message);
        return null;
    }
};

// Step 1: Detect Intent
const detectIntent = async (question, databaseContext) => {
    try {
        const q = question.toLowerCase();
        
        // Check for traffic/visitors question first
        if (q.includes('visitor') || q.includes('traffic') || q.includes('not getting')) {
            return { primary: 'SEO', confidence: 0.95 };
        }
        
        const allServices = [];
        Object.values(databaseContext.aifutureData || {}).forEach(category => {
            category.values.forEach(service => {
                allServices.push(service.name);
            });
        });
        
        const prompt = `
Analyze user question and return ONLY JSON with intent.

User Question: "${question}"

Available Services: ${allServices.join(', ')}

Return: {"intent": "TYPE"}

Types: SEO, SALES, MARKETING, PRICING, WEBSITE, MAINTENANCE, SOFTWARE, GENERAL
`;

        const response = await callGeminiAPI(prompt);
        
        if (response) {
            const cleaned = response.replace(/```json/g, '').replace(/```/g, '').trim();
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const intent = JSON.parse(jsonMatch[0]);
                return { primary: intent.intent || 'GENERAL', confidence: 0.8 };
            }
        }
        return { primary: 'GENERAL', confidence: 0.5 };
        
    } catch (error) {
        console.error('Intent detection failed:', error.message);
        return { primary: 'GENERAL', confidence: 0.5 };
    }
};

// Step 2: Search in Roles
const searchInRoles = (question, roles) => {
    if (!Array.isArray(roles) || roles.length === 0) return null;
    
    const q = question.toLowerCase();
    
    for (const role of roles) {
        const roleLower = role.toLowerCase();
        if (q.includes(roleLower)) {
            return {
                type: 'role',
                matched: role,
                confidence: 0.9
            };
        }
    }
    return null;
};

// Step 3 & 4: Search in Role Values and Tags
const searchInRoleValuesAndTags = (question, aifutureData, intent) => {
    const q = question.toLowerCase();
    let bestMatch = null;
    let highestScore = 0;
    
    for (const [categoryTitle, titleData] of Object.entries(aifutureData)) {
        for (const svc of titleData.values) {
            let score = 0;
            const serviceName = svc.name.toLowerCase();
            
            // Intent-based boost
            if (intent.primary === 'SEO' && serviceName === 'seo') {
                score += 5.0;
            }
            
            // Exact service name match
            if (q.includes(serviceName)) {
                score += 3.0;
            }
            
            // Partial name match
            serviceName.split(/\s+/).forEach(word => {
                if (word.length > 2 && q.includes(word)) {
                    score += 1.0;
                }
            });
            
            // Tag matching (Step 4)
            if (Array.isArray(svc.tags) && svc.tags.length > 0) {
                svc.tags.forEach(tag => {
                    const tagLower = tag.toLowerCase();
                    
                    // Exact tag match
                    if (q.includes(tagLower)) {
                        score += 2.0;
                    }
                    
                    // Partial tag match
                    if (tagLower.split(' ').some(word => word.length > 2 && q.includes(word))) {
                        score += 1.0;
                    }
                    
                    // Intent keyword match with tag
                    if (intent.primary === 'SEO' && (tagLower.includes('seo') || tagLower.includes('rank') || tagLower.includes('traffic'))) {
                        score += 2.0;
                    }
                });
            }
            
            if (score > highestScore && score >= 1.5) {
                highestScore = score;
                bestMatch = {
                    type: 'role_value',
                    service: svc,
                    price: svc.price,
                    description: svc.description,
                    tags: svc.tags,
                    confidence: Math.min(score / 6, 1)
                };
            }
        }
    }
    
    return bestMatch;
};

// Step 5: Generate Response based on match found
const generateResponse = (match, roleMatch, databaseContext, messageType, intent) => {
    
    // Greeting responses
    if (messageType?.type === 'greeting') {
        return "Hello! How may I assist you with our services today?";
    }
    if (messageType?.type === 'goodbye') {
        return "Thank you for connecting with us. Have a great day!";
    }
    if (messageType?.type === 'thanks') {
        return "You're welcome! Feel free to reach out if you need any assistance.";
    }
    
    // Step 2 Result: Role match found
    if (roleMatch) {
        return `I can connect you with our ${roleMatch.matched} team. They will assist you with your requirements. Would you like me to proceed?`;
    }
    
    // Step 3 & 4 Result: Role value or tag match found
    if (match && match.service) {
        let response = match.service.name;
        if (match.price && match.price.trim()) {
            response += ` — ${match.price}`;
        }
        response += '. ';
        
        // Clean description
        let description = match.service.description || '';
        if (description.includes('||')) {
            description = description.split('||')[0];
        }
        
        if (description.trim()) {
            response += description;
        }
        response += ' Would you be interested in learning more about this service?';
        return response;
    }
    
    // Step 5: No match found - Categories related formal message
    const categories = databaseContext.categories;
    
    if (categories.length === 1) {
        return `Based on our services in ${categories[0]}, could you please provide more specific details about your requirements so I can assist you better?`;
    }
    
    if (categories.length > 1) {
        const categoryList = categories.join(', ');
        return `Based on our services in ${categoryList}, could you please provide more specific details about your requirements so I can assist you better?`;
    }
    
    return "Could you please provide more specific details about your requirements so I can assist you better?";
};

// Get suggestions from custom prompts - RETURNS EMPTY ARRAY WHEN NO MATCH
const getSuggestions = (match, roleMatch, customPrompts, intent) => {
    const prompts = Array.isArray(customPrompts) ? customPrompts : [];
    
    if (prompts.length === 0) {
        return [];
    }
    
    // ONLY return suggestions if there is a match (role or service)
    if (!match && !roleMatch) {
        // NO MATCH FOUND - return empty array
        return [];
    }
    
    // If service match found
    if (match && match.service) {
        const serviceName = match.service.name.toLowerCase();
        
        const relevantPrompts = prompts.filter(prompt => {
            const promptLower = prompt.toLowerCase();
            return promptLower.includes(serviceName) || 
                   (intent.primary === 'SEO' && promptLower.includes('seo'));
        });
        
        if (relevantPrompts.length > 0) {
            return relevantPrompts.slice(0, 4);
        }
    }
    
    // If role match found
    if (roleMatch) {
        const roleName = roleMatch.matched.toLowerCase();
        const relevantPrompts = prompts.filter(prompt => 
            prompt.toLowerCase().includes(roleName)
        );
        if (relevantPrompts.length > 0) {
            return relevantPrompts.slice(0, 4);
        }
    }
    
    // Intent-based suggestions (only if match exists)
    if (intent.primary === 'SEO' && (match || roleMatch)) {
        const seoPrompts = prompts.filter(p => 
            p.toLowerCase().includes('seo') || 
            p.toLowerCase().includes('rank') ||
            p.toLowerCase().includes('traffic')
        );
        if (seoPrompts.length > 0) {
            return seoPrompts.slice(0, 4);
        }
    }
    
    // Return empty array if no relevant prompts found
    return [];
};

/* ── Main Route ─────────────────────────────────────────── */

router.post('/generate-ai-response', async (req, res) => {
    try {
        const { question, apiKey } = req.body;

        if (!question?.trim()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Question required' 
            });
        }
        
        if (!apiKey) {
            return res.status(400).json({ 
                success: false, 
                message: 'API key required' 
            });
        }

        // Get website data from database
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
        const categories = websiteData.category || [];
        const roles = websiteData.role || [];

        // Check message type
        const messageType = checkMessageType(question);
        
        // Create database context
        const databaseContext = {
            categories: categories,
            aifutureData: aifutureData,
            customPrompts: customPrompts,
            roles: roles
        };

        let intent = { primary: 'GENERAL', confidence: 0.5 };
        let roleMatch = null;
        let match = null;
        
        // Only process if not greeting/goodbye/thanks
        if (!messageType) {
            // Step 1: Detect intent
            intent = await detectIntent(question, databaseContext);
            console.log('Intent detected:', intent);
            
            // Step 2: Search in roles
            roleMatch = searchInRoles(question, roles);
            console.log('Role match:', roleMatch);
            
            // Step 3 & 4: Search in role values and tags (if no role match)
            if (!roleMatch) {
                match = searchInRoleValuesAndTags(question, aifutureData, intent);
                console.log('Service/tag match:', match?.service?.name);
            }
        }
        
        // Step 5: Generate response
        const response = generateResponse(match, roleMatch, databaseContext, messageType, intent);
        
        // Get suggestions - will be empty array if no match found
        const suggestions = getSuggestions(match, roleMatch, customPrompts, intent);

        return res.json({
            success: true,
            intent: intent.primary,
            response: response,
            suggestions: suggestions
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Unable to process your request.'
        });
    }
});

module.exports = router;