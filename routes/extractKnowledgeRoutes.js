// routes/extractKnowledgeRoutes.js
// Accepts a URL or raw text (from a PDF parsed client-side),
// fetches/uses the content, calls Gemini to categorize,
// and returns a structured aifuture-compatible categories array.

const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

/* ─────────────────────────────
   GEMINI CALL (same pattern as aiRoutes.js)
──────────────────────────── */
const gemini = async (prompt) => {
    try {
        const res = await axios.post(
            `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
            }
        );
        return res.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    } catch (err) {
        console.error('Gemini error:', err?.response?.data || err.message);
        return null;
    }
};

/* ─────────────────────────────
   STRIP HTML → plain text
──────────────────────────── */
const htmlToText = (html) =>
    html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s{2,}/g, ' ')
        .trim();

/* ─────────────────────────────
   POST /api/extract-knowledge
   Body: { type: 'url'|'text', url?, text? }
──────────────────────────── */
router.post('/extract-knowledge', async (req, res) => {
    try {
        const { type, url, text } = req.body;

        if (!type || (type === 'url' && !url) || (type === 'text' && !text)) {
            return res.status(400).json({ success: false, error: 'Missing required fields: type and url or text.' });
        }

        let rawText = '';

        // ── 1. Get raw text ──────────────────────────────────────────────────
        if (type === 'url') {
            try {
                const response = await axios.get(url, {
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HeyAiBot/1.0)' },
                    maxContentLength: 2 * 1024 * 1024 // 2 MB cap
                });
                rawText = htmlToText(String(response.data)).slice(0, 12000);
            } catch (err) {
                return res.status(400).json({ success: false, error: `Could not fetch URL: ${err.message}` });
            }
        } else {
            rawText = String(text).slice(0, 12000);
        }

        if (!rawText || rawText.length < 50) {
            return res.status(400).json({ success: false, error: 'Not enough content extracted to categorize.' });
        }

        // ── 2. Gemini categorization ─────────────────────────────────────────
        const prompt = `You are a knowledge-base organizer. Analyze the following content and extract structured categories with topics.

Rules:
- Identify 2–8 broad CATEGORIES (e.g. "Services", "Products", "Pricing", "About Us", "FAQ", "Contact")
- Under each category, list 1–8 specific TOPICS
- Each topic needs: name (short, 2–5 words), description (80–200 chars explaining what it's about), tags (3–6 comma-separated keywords)
- Only include information actually present in the content
- Output ONLY valid JSON, no explanation, no markdown code fences

Output format:
{
  "categories": [
    {
      "title": "Category Name",
      "value": [
        {
          "name": "Topic Name",
          "description": "Clear description of what this topic covers and who it's for.",
          "tags": ["tag1", "tag2", "tag3"]
        }
      ]
    }
  ]
}

Content to analyze:
${rawText}`;

        const aiResponse = await gemini(prompt);

        if (!aiResponse) {
            return res.status(500).json({ success: false, error: 'AI did not return a response. Please try again.' });
        }

        // Strip accidental markdown fences
        const jsonStr = aiResponse
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '')
            .trim();

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            return res.status(500).json({ success: false, error: 'AI returned invalid JSON. Please try again.', raw: aiResponse });
        }

        if (!parsed.categories || !Array.isArray(parsed.categories)) {
            return res.status(500).json({ success: false, error: 'Unexpected AI response structure.', raw: aiResponse });
        }

        return res.status(200).json({ success: true, categories: parsed.categories });

    } catch (err) {
        console.error('❌ extract-knowledge error:', err);
        res.status(500).json({ success: false, error: `Server error: ${err.message}` });
    }
});

module.exports = router;
