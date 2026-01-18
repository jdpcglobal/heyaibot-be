const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

const GEMINI_API_URL =
  process.env.GEMINI_API_URL ||
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/* ======================
   HELPER FUNCTIONS
====================== */

// Format simple string array
const formatStringArray = (title, array) => {
  if (!array || !Array.isArray(array) || array.length === 0) {
    return `No ${title} information available`;
  }
  
  return array.map(item => `- ${item}`).join('\n');
};

// Process aifuture data
const processAifutureData = (aifutureData) => {
  const data = {};
  
  if (aifutureData && Array.isArray(aifutureData)) {
    aifutureData.forEach(item => {
      if (item.title && Array.isArray(item.value)) {
        const formattedTitle = item.title.charAt(0).toUpperCase() + item.title.slice(1);
        data[formattedTitle] = item.value;
      }
    });
  }
  
  return data;
};

// AI Personality Config
const getPersonalityConfig = (personality = {}) => {
  const defaultPersonality = {
    tone: 'friendly',
    emojiLevel: 'moderate',
    detailLevel: 'minimal',
    useMarkdown: false,
    includeExamples: false,
    beEnthusiastic: true
  };

  return { ...defaultPersonality, ...personality };
};

// Get Emoji Set based on personality
const getEmojiSet = (emojiLevel) => {
  const sets = {
    minimal: ['😊', '👍', '✨'],
    moderate: ['🌟', '🎯', '💡', '🚀', '🤝', '💫', '🎉', '✅', '🔥', '📚'],
    high: ['🤩', '🎊', '💖', '🌈', '⚡', '💎', '🎨', '🤗', '👏', '🏆', '💭', '🔍', '🎯', '📌', '📍']
  };
  return sets[emojiLevel] || sets.moderate;
};

// Format AI Response with personality
const formatResponseWithPersonality = (response, personality) => {
  const config = getPersonalityConfig(personality);
  const emojis = getEmojiSet(config.emojiLevel);
  
  let formatted = response.trim();
  
  // Add friendly opening
  const openings = [
    `🌟 ${formatted}`,
    `💫 ${formatted}`,
    `✨ ${formatted}`,
    `🎯 ${formatted}`,
    `🚀 ${formatted}`
  ];
  
  if (config.beEnthusiastic) {
    formatted = openings[Math.floor(Math.random() * openings.length)];
  }
  
  // Enhance with emojis for excitement
  if (config.emojiLevel !== 'minimal') {
    const excitementWords = ['excellent', 'great', 'perfect', 'awesome', 'amazing', 'fantastic', 'wonderful'];
    excitementWords.forEach(word => {
      if (formatted.toLowerCase().includes(word)) {
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        formatted = formatted.replace(new RegExp(word, 'gi'), `${word} ${emoji}`);
      }
    });
  }
  
  // Format with markdown if enabled
  if (config.useMarkdown) {
    // Convert lists to bullet points
    if (formatted.includes('\n-')) {
      formatted = formatted.replace(/\n-/g, '\n•');
    }
    
    // Add bold to key terms
    const keyTerms = ['important', 'note', 'tip', 'warning', 'remember', 'key', 'essential'];
    keyTerms.forEach(term => {
      if (formatted.toLowerCase().includes(term)) {
        formatted = formatted.replace(new RegExp(`(${term})`, 'gi'), '**$1**');
      }
    });
  }
  
  return formatted;
};

// Build system prompt with personality
const buildSystemPrompt = (websiteTitle, data, question, personality, conversationHistory = []) => {
  const config = getPersonalityConfig(personality);
  
  // Check if we have any data
  const dataKeys = Object.keys(data);
  
  let prompt = `You are an AI support assistant for ${websiteTitle || 'HeyAIBot'}.

**PERSONALITY CONFIGURATION:**
- Tone: ${config.tone} and helpful
- Detail Level: ${config.detailLevel}
- Communication Style: Use ${config.emojiLevel} emojis, be ${config.beEnthusiastic ? 'enthusiastic' : 'professional'}
- Format: ${config.useMarkdown ? 'Use Markdown for better readability' : 'Plain text'}

`;

  // Add conversation history context
  if (conversationHistory.length > 0) {
    prompt += "**CONVERSATION HISTORY CONTEXT:**\n";
    conversationHistory.forEach(msg => {
      prompt += `${msg.role}: ${msg.content}\n`;
    });
    prompt += "\n";
  }

  if (dataKeys.length === 0) {
    prompt += `**KNOWLEDGE BASE STATUS:** I don't have specific business information yet.
    
**RESPONSE GUIDELINES:**
1. Be warm, friendly, and helpful
2. Admit when you don't have information
3. Offer to connect with human support if needed
4. Keep responses concise but thorough
5. ${config.useMarkdown ? 'Use **bold** for emphasis and • for lists' : 'Use clear formatting'}

**USER QUESTION:**
"${question}"

**YOUR RESPONSE (remember your personality!):**`;
    return prompt;
  }
  
  prompt += `**KNOWLEDGE BASE INFORMATION:**\nYou MUST use ONLY this information to answer:\n\n`;

  // Add all data sections
  dataKeys.forEach(title => {
    const value = data[title];
    if (Array.isArray(value) && value.length > 0) {
      prompt += `**${title.toUpperCase()}:**\n${formatStringArray(title, value)}\n\n`;
    }
  });

  // Generate dynamic categories list
  const categories = dataKeys.map(key => key.toLowerCase()).join(', ');
  
  prompt += `**RESPONSE RULES:**
1. Answer ONLY if the question is related to ${categories} mentioned above
2. Use the exact information provided - DO NOT invent or add information
3. If unrelated, politely say: "${config.emojiLevel !== 'minimal' ? '🤔 ' : ''}I can only help with questions about our ${categories}"
4. Be ${config.tone} and ${config.beEnthusiastic ? 'enthusiastic' : 'professional'}
5. ${config.detailLevel === 'detailed' ? 'Provide thorough explanations with examples if relevant' : 'Keep answers concise but complete'}
6. ${config.useMarkdown ? 'Format your response nicely with Markdown (bold, lists, etc.)' : 'Use clear paragraph structure'}
7. ${config.emojiLevel !== 'minimal' ? 'Use relevant emojis to make the response engaging' : 'Focus on clear communication'}

**USER QUESTION:**
"${question}"

**YOUR RESPONSE (remember to be ${config.tone} and use your personality config):**`;

  return prompt;
};

// Generate rich formatted response
const generateRichResponse = (aiText, question, data, personality) => {
  const config = getPersonalityConfig(personality);
  const emojis = getEmojiSet(config.emojiLevel);
  
  let response = aiText.trim();
  
  // Enhance common patterns
  if (response.includes('?')) {
    const questionEnhancers = [
      'Great question!',
      'Interesting question!',
      'I\'d be happy to explain!',
      'Let me break this down for you!',
      'Perfect timing for this question!'
    ];
    response = `${questionEnhancers[Math.floor(Math.random() * questionEnhancers.length)]} ${response}`;
  }
  
  // Add relevant emojis based on content
  if (config.emojiLevel !== 'minimal') {
    const contentEmojis = {
      'help': '🤝',
      'thank': '🙏',
      'welcome': '😊',
      'information': '💡',
      'service': '⚡',
      'support': '🛠️',
      'product': '📦',
      'price': '💰',
      'contact': '📞',
      'email': '📧',
      'website': '🌐',
      'time': '⏰',
      'date': '📅',
      'location': '📍',
      'quality': '🏆',
      'best': '🌟',
      'fast': '🚀',
      'easy': '✨',
      'free': '🎉',
      'discount': '🔥',
      'guarantee': '✅',
      'expert': '👨‍💼',
      'team': '👥'
    };
    
    Object.entries(contentEmojis).forEach(([word, emoji]) => {
      if (response.toLowerCase().includes(word)) {
        // Add emoji after the word occasionally
        if (Math.random() > 0.7) {
          response = response.replace(new RegExp(`\\b${word}\\b`, 'gi'), `$& ${emoji}`);
        }
      }
    });
  }
  
  // Format lists and bullet points
  if (config.useMarkdown) {
    // Convert numbered lists
    response = response.replace(/(\d+\.\s)/g, '**$1**');
    
    // Add section breaks for longer responses
    if (response.length > 150) {
      const sentences = response.split('. ');
      if (sentences.length > 3) {
        response = sentences.join('. \n\n');
      }
    }
  }
  
  // Add friendly closing if appropriate
  if (!response.includes('?') && response.length > 50) {
    const closings = [
      '\n\nHope this helps! 😊',
      '\n\nLet me know if you need more details! 👍',
      '\n\nFeel free to ask more questions! 💬',
      '\n\nIs there anything else I can help with? 🌟'
    ];
    
    if (Math.random() > 0.5) {
      response += closings[Math.floor(Math.random() * closings.length)];
    }
  }
  
  return response;
};

/* ======================
   MAIN API ROUTE - ENHANCED
====================== */

router.post('/generate-ai-response', async (req, res) => {
  try {
    const { 
      question, 
      websiteTitle, 
      aifuture,
      personality = {},
      conversationHistory = []
    } = req.body;

    // Validation
    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a question 📝"
      });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "AI service is currently unavailable 🔧"
      });
    }

    // Process data
    const dynamicData = processAifutureData(aifuture);
    
    // Build enhanced prompt
    const systemPrompt = buildSystemPrompt(
      websiteTitle, 
      dynamicData, 
      question, 
      personality,
      conversationHistory
    );

    // Call Gemini API
    const geminiResponse = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ 
              text: systemPrompt 
            }]
          }
        ],
        generationConfig: {
          temperature: 0.3, // Slightly higher for more creativity
          maxOutputTokens: 500, // More tokens for detailed responses
          topP: 0.8,
          topK: 40
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      },
      {
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        timeout: 15000 // Increased timeout
      }
    );

    // Extract response
    const aiText =
      geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      (Object.keys(dynamicData).length > 0 
        ? `🌟 I can help with questions about our ${Object.keys(dynamicData).join(', ').toLowerCase()}. What would you like to know? 😊`
        : "🤔 I don't have specific business information yet, but I'd be happy to help with general questions or connect you with human support! 💬");

    // Generate rich formatted response
    const formattedResponse = generateRichResponse(
      aiText, 
      question, 
      dynamicData, 
      personality
    );

    res.json({
      success: true,
      response: formattedResponse,
      rawResponse: aiText,
      formattedResponse: formattedResponse,
      hasData: Object.keys(dynamicData).length > 0,
      dataSections: Object.keys(dynamicData),
      personalityUsed: getPersonalityConfig(personality)
    });

  } catch (error) {
    console.error("AI Generation Error:", error.message);
    
    // Friendly error messages
    let userMessage = "😕 Oops! I'm having trouble connecting to my knowledge base right now.";
    let debugMessage = error.message;
    
    if (error.code === 'ECONNABORTED') {
      userMessage = "⏰ Request timeout. Please try your question again!";
    } else if (error.response?.status === 429) {
      userMessage = "🌀 Too many requests. Please try again in a moment!";
    } else if (error.response?.status === 400) {
      userMessage = "🔧 Technical hiccup. Could you rephrase your question?";
    } else if (error.response?.data?.error?.message) {
      debugMessage = error.response.data.error.message;
      userMessage = "⚠️ AI service error. Please try a different question!";
    }

    res.status(error.response?.status || 500).json({
      success: false,
      message: userMessage,
      error: debugMessage,
      fallbackResponse: "🌟 I'm your friendly assistant! While I'm having technical issues, feel free to ask me anything about our services, and I'll do my best to help once I'm back online! 😊"
    });
  }
});

/* ======================
   ENHANCED SUPPORTING ROUTES
====================== */

// GET endpoint to check available data with preview
router.get('/available-data', (req, res) => {
  const { aifuture } = req.query;
  let data = {};
  
  try {
    if (aifuture) {
      data = processAifutureData(JSON.parse(aifuture));
    }
    
    const sections = Object.keys(data);
    const totalItems = Object.values(data).reduce((sum, arr) => 
      sum + (Array.isArray(arr) ? arr.length : 0), 0
    );
    
    const sectionDetails = sections.map(section => ({
      name: section,
      items: data[section].length,
      sampleItems: data[section].slice(0, 3)
    }));
    
    res.json({
      success: true,
      data: data,
      sections: sections,
      sectionDetails: sectionDetails,
      totalItems: totalItems,
      hasData: sections.length > 0,
      summary: sections.length > 0 
        ? `📊 Knowledge base has ${sections.length} sections with ${totalItems} total items`
        : '📭 Knowledge base is empty'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: "Invalid data format 📄"
    });
  }
});

// POST endpoint to validate and preview data with examples
router.post('/preview-prompt', async (req, res) => {
  try {
    const { websiteTitle, aifuture, question, personality } = req.body;
    
    if (!question) {
      return res.status(400).json({
        success: false,
        message: "Question is required for preview ❓"
      });
    }
    
    const dynamicData = processAifutureData(aifuture);
    const config = getPersonalityConfig(personality);
    const prompt = buildSystemPrompt(websiteTitle, dynamicData, question, personality);
    
    // Generate example response
    let exampleResponse = "🌟 Here's how I would typically respond:\n\n";
    
    if (Object.keys(dynamicData).length > 0) {
      exampleResponse += `For a question about "${question.substring(0, 50)}...", I would:\n`;
      exampleResponse += `1. Check if it's related to ${Object.keys(dynamicData).join(', ')}\n`;
      exampleResponse += `2. Use the specific information available\n`;
      exampleResponse += `3. Format the response ${config.useMarkdown ? 'with Markdown' : 'clearly'}\n`;
      exampleResponse += `4. Use a ${config.tone} tone with ${config.emojiLevel} emojis\n\n`;
      exampleResponse += `**Example:** "✨ Great question! Based on our ${Object.keys(dynamicData)[0]} information, here's what I can tell you..."`;
    } else {
      exampleResponse += "Since I don't have specific business data, I would:\n";
      exampleResponse += "1. Politely admit the limitation\n";
      exampleResponse += "2. Offer general assistance\n";
      exampleResponse += "3. Suggest contacting human support\n\n";
      exampleResponse += "**Example:** \"🤔 I don't have specific information about that yet, but I'd be happy to help with general questions or connect you with our team! 💬\"";
    }
    
    res.json({
      success: true,
      sections: Object.keys(dynamicData),
      itemCount: Object.values(dynamicData).reduce((sum, arr) => 
        sum + (Array.isArray(arr) ? arr.length : 0), 0
      ),
      hasData: Object.keys(dynamicData).length > 0,
      personalityConfig: config,
      promptPreview: prompt.length > 1000 
        ? prompt.substring(0, 1000) + "...\n\n[📝 Prompt truncated for preview]" 
        : prompt,
      promptLength: prompt.length,
      exampleResponse: exampleResponse,
      estimatedTokens: Math.ceil(prompt.length / 4)
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error generating preview 🔧"
    });
  }
});

// Test endpoint with sample conversation
router.post('/test-conversation', async (req, res) => {
  try {
    const { aifuture, personality, sampleQuestions = [] } = req.body;
    
    const dynamicData = processAifutureData(aifuture);
    const config = getPersonalityConfig(personality);
    
    const defaultQuestions = [
      "What services do you offer?",
      "How can I contact support?",
      "Tell me about your products",
      "What are your business hours?"
    ];
    
    const questions = sampleQuestions.length > 0 ? sampleQuestions : defaultQuestions;
    
    const testResults = [];
    
    for (const question of questions.slice(0, 3)) { // Test max 3 questions
      const prompt = buildSystemPrompt("Test Website", dynamicData, question, config);
      
      testResults.push({
        question: question,
        hasRelevantData: Object.keys(dynamicData).some(section => 
          question.toLowerCase().includes(section.toLowerCase().slice(0, 10))
        ),
        promptLength: prompt.length,
        dataSectionsUsed: Object.keys(dynamicData).filter(section =>
          prompt.toLowerCase().includes(section.toLowerCase())
        )
      });
    }
    
    res.json({
      success: true,
      testResults: testResults,
      summary: {
        totalSections: Object.keys(dynamicData).length,
        totalItems: Object.values(dynamicData).reduce((sum, arr) => 
          sum + (Array.isArray(arr) ? arr.length : 0), 0
        ),
        personality: config,
        coverage: `${testResults.filter(r => r.hasRelevantData).length}/${testResults.length} questions have relevant data`
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Test failed ⚠️"
    });
  }
});

// Health check with AI status
router.get('/health', async (req, res) => {
  const health = {
    success: true,
    message: "🤖 AI Response API is running smoothly",
    timestamp: new Date().toISOString(),
    hasApiKey: !!GEMINI_API_KEY,
    apiKeyLength: GEMINI_API_KEY ? GEMINI_API_KEY.length : 0,
    environment: process.env.NODE_ENV || 'development',
    features: [
      "Enhanced AI responses",
      "Personality customization",
      "Markdown formatting",
      "Emoji support",
      "Conversation history",
      "Error handling"
    ]
  };
  
  // Test AI connectivity
  try {
    if (GEMINI_API_KEY) {
      const testResponse = await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`,
        { timeout: 5000 }
      );
      health.aiStatus = "connected ✅";
      health.availableModels = testResponse.data?.models?.length || 0;
    } else {
      health.aiStatus = "not configured ⚠️";
    }
  } catch (error) {
    health.aiStatus = "connection failed ❌";
    health.aiError = error.message;
  }
  
  res.json(health);
});

// Personality configuration endpoint
router.get('/personality-options', (req, res) => {
  const personalities = {
    friendly: {
      tone: 'friendly',
      emojiLevel: 'moderate',
      detailLevel: 'balanced',
      description: 'Warm, helpful, with moderate emojis'
    },
    professional: {
      tone: 'professional',
      emojiLevel: 'minimal',
      detailLevel: 'detailed',
      description: 'Formal, detailed, minimal emojis'
    },
    enthusiastic: {
      tone: 'enthusiastic',
      emojiLevel: 'high',
      detailLevel: 'balanced',
      description: 'Excited, engaging, lots of emojis'
    },
    concise: {
      tone: 'direct',
      emojiLevel: 'minimal',
      detailLevel: 'brief',
      description: 'Short, to the point, no fluff'
    }
  };
  
  res.json({
    success: true,
    personalities: personalities,
    emojiLevels: {
      minimal: 'Few emojis (😊 👍 ✨)',
      moderate: 'Regular emojis (🌟 🎯 💡 🚀)',
      high: 'Many emojis (🤩 🎊 💖 🌈 ⚡)'
    },
    detailLevels: {
      brief: 'Short answers',
      balanced: 'Moderate detail',
      detailed: 'Comprehensive explanations'
    }
  });
});

module.exports = router;