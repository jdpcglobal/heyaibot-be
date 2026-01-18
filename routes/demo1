const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

const GEMINI_API_URL = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * POST: Generate AI Response
 */
router.post('/generate-ai-response', async (req, res) => {
  try {
    const { question, websiteTitle, categories = [] } = req.body;

    // Validation
    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please ask a question! 😊'
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'AI service is updating... 🔄'
      });
    }

    // Create smart prompt
    const systemPrompt = `
You are a friendly assistant for "${websiteTitle || 'Support'}".

Categories I can help with: ${categories.length > 0 ? categories.join(', ') : 'anything'}

Question: "${question}"

Rules:
1. Answer ONLY if question relates to: ${categories.join(', ')}
2. Keep response SHORT and FRIENDLY (2-3 lines max)
3. Use simple language with emojis 😊
4. If unrelated, politely say: "I can help with ${categories.join(', ')}"

Examples:
• Medical question: "Rest well and drink water! 💧"
• IT question: "Try restarting your computer! 🔄"
• General: "I'd love to help! Tell me more. 🤗"

Now respond:
`;

    // API Call
    const geminiResponse = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ text: systemPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 150,
          topP: 0.9,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 8000
      }
    );

    const responseText = geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text || 
      "I'm here to help! 😊";

    // Response
    res.json({
      success: true,
      response: responseText.trim()
    });

  } catch (error) {
    console.error('Error:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Please try again! 🔄'
    });
  }
});

module.exports = router;