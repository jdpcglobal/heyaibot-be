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
    if (!process.env.GEMINI_API_URL || !process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_URL or GEMINI_API_KEY environment variable is not set on the server.');
    }
    const res = await axios.post(
        `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
        {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        }
    );
    const candidate = res.data?.candidates?.[0];
    if (!candidate) {
        const blockReason = res.data?.promptFeedback?.blockReason;
        throw new Error(blockReason ? `Blocked by safety filter: ${blockReason}` : 'No candidates in Gemini response');
    }
    if (!candidate.content) {
        throw new Error(`Gemini stopped: ${candidate.finishReason || 'unknown reason'}`);
    }
    return candidate.content.parts?.[0]?.text?.trim() || null;
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

        // ── 2. Gemini categorization + action extraction ─────────────────────
        const prompt = `You are a chatbot knowledge-base organizer. Analyze the following content and extract two things:

1. KNOWLEDGE BASE CATEGORIES with topics
2. CHATBOT ACTION BUTTONS with child options for lead capture

━━━ Rules for CATEGORIES ━━━
- Identify 2–8 broad categories (e.g. "Services", "Products", "Pricing", "About Us", "FAQ")
- Under each category, list 1–8 specific topics
- Each topic needs: name (short 2–5 words), description (80–200 chars about what it covers), tags (3–6 keywords)
- Only include information actually present in the content

━━━ Rules for ACTIONS (chatbot quick questions) ━━━
- Identify 4–7 natural questions a visitor would type or tap in a chatbot for this business
- Phrase each as what a real user would say — a question or short request, NOT a CTA label
- Good examples: "What are your pricing plans?", "How do I book a free consultation?", "What services do you offer?", "Can I get a free quote?", "How can I contact you?"
- Bad examples (do NOT use): "Get Free Enquiry", "Request Demo", "Contact Us" — these sound like buttons, not human questions
- Include at least 1–2 that capture leads (e.g. "Can I get a free quote?", "How do I book a consultation?")
- For each question, add 2–4 SHORT child options the user taps to narrow down their need — phrased as what the user would tap (e.g. "Send me pricing", "Book a demo call", "Call me back", "Email me details")
- Infer the business type intelligently from the content

━━━ Output Format ━━━
Output ONLY valid JSON, no explanation, no markdown code fences:
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
  ],
  "actions": [
    {
      "text": "Can I get a free quote?",
      "children": [
        { "text": "Send me pricing", "children": [] },
        { "text": "Schedule a call", "children": [] },
        { "text": "Email me details", "children": [] }
      ]
    },
    {
      "text": "How can I contact you?",
      "children": [
        { "text": "Call me back", "children": [] },
        { "text": "Send a message", "children": [] }
      ]
    }
  ]
}

Content to analyze:
${rawText}`;

        let aiResponse;
        try {
            aiResponse = await gemini(prompt);
        } catch (geminiErr) {
            const detail = geminiErr?.response?.data?.error?.message || geminiErr.message;
            console.error('❌ Gemini call failed:', detail);
            return res.status(500).json({ success: false, error: `AI error: ${detail}` });
        }

        if (!aiResponse) {
            return res.status(500).json({ success: false, error: 'AI returned an empty response. Please try again.' });
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

        return res.status(200).json({
            success: true,
            categories: parsed.categories,
            actions: Array.isArray(parsed.actions) ? parsed.actions : []
        });

    } catch (err) {
        console.error('❌ extract-knowledge error:', err);
        res.status(500).json({ success: false, error: `Server error: ${err.message}` });
    }
});

module.exports = router;
