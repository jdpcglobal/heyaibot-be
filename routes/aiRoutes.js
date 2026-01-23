const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

// DynamoDB functions import
const { getWebsiteDataByApiKey } = require('../models/websiteModel');

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

// Process aifuture data - UPDATED STRUCTURE
const processAifutureData = (aifutureData) => {
  const data = {};
  
  if (aifutureData && Array.isArray(aifutureData)) {
    aifutureData.forEach(item => {
      if (item.title && Array.isArray(item.value)) {
        const formattedTitle = item.title.toLowerCase().trim();
        data[formattedTitle] = {
          originalTitle: item.title,
          values: item.value
        };
      }
    });
  }
  
  return data;
};

// Get AI response from Gemini
const getAIResponse = async (prompt) => {
  try {
    const response = await axios.post(
      `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [{ 
              text: prompt 
            }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 200,
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
        timeout: 10000
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    return '';
  }
};

// Clean text from emojis and special characters
const cleanText = (text) => {
  if (!text) return '';
  
  // Remove emojis and special characters, keep only letters, numbers, spaces, and basic punctuation
  let cleaned = text.replace(/[^\w\s.,!?\-]/g, '');
  
  // Remove extra spaces
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  return cleaned;
};

// Check if question matches any category
const checkCategoryMatch = (question, categories) => {
  if (!question || !categories || !Array.isArray(categories)) {
    return false;
  }
  
  const questionLower = question.toLowerCase();
  
  // Check each category
  for (const category of categories) {
    if (typeof category === 'string') {
      const categoryLower = category.toLowerCase();
      
      // Direct match
      if (questionLower.includes(categoryLower) || categoryLower.includes(questionLower)) {
        return true;
      }
      
      // Word match
      const categoryWords = categoryLower.split(/\s+/);
      const questionWords = questionLower.split(/\s+/);
      
      for (const cWord of categoryWords) {
        if (cWord.length > 3) {
          for (const qWord of questionWords) {
            if (qWord.length > 3 && (cWord.includes(qWord) || qWord.includes(cWord))) {
              return true;
            }
          }
        }
      }
    }
  }
  
  return false;
};

// OLD: Find matching value in aifuture data (पहले वाला logic)
const findMatchingValue = (question, aifutureData) => {
  const processedData = processAifutureData(aifutureData);
  const questionLower = question.toLowerCase();
  
  let bestMatch = null;
  let bestMatchTitle = '';
  let highestScore = 0;
  
  // Search through all titles and values
  Object.entries(processedData).forEach(([title, titleData]) => {
    if (Array.isArray(titleData.values)) {
      titleData.values.forEach(value => {
        if (typeof value === 'string') {
          const valueLower = value.toLowerCase();
          
          // Calculate match score
          let score = 0;
          
          // Split into words
          const questionWords = questionLower.split(/\W+/).filter(w => w.length > 2);
          const valueWords = valueLower.split(/\W+/).filter(w => w.length > 2);
          
          // Check for word matches
          questionWords.forEach(qWord => {
            valueWords.forEach(vWord => {
              if (qWord.includes(vWord) || vWord.includes(qWord)) {
                score += 1;
              }
            });
          });
          
          // Check for direct substring match
          if (questionLower.includes(valueLower) || valueLower.includes(questionLower)) {
            score += 3;
          }
          
          // Update best match if this is better
          if (score > highestScore) {
            highestScore = score;
            bestMatch = value;
            bestMatchTitle = titleData.originalTitle;
          }
        }
      });
    }
  });
  
  // Only return if we have a decent match
  if (highestScore >= 1) {
    return {
      value: bestMatch,
      title: bestMatchTitle,
      score: highestScore
    };
  }
  
  return null;
};

// NEW: Find matching title in aifuture data
const findMatchingTitle = (question, aifutureData) => {
  const processedData = processAifutureData(aifutureData);
  const questionLower = question.toLowerCase().trim();
  
  // List of common keywords that might indicate asking for services
  const serviceKeywords = [
    'provide', 'offer', 'give', 'have', 'do', 'service', 'services', 
    'work', 'product', 'products', 'what', 'which', 'list', 'tell'
  ];
  
  // First, check for direct title matches
  for (const [titleKey, titleData] of Object.entries(processedData)) {
    const title = titleKey;
    const originalTitle = titleData.originalTitle.toLowerCase();
    
    // Check if question contains the title or vice versa
    if (questionLower.includes(title) || title.includes(questionLower)) {
      return {
        titleKey: titleKey,
        originalTitle: titleData.originalTitle,
        values: titleData.values,
        matchType: 'direct_title_match'
      };
    }
    
    // Check if original title is in question
    if (questionLower.includes(originalTitle) || originalTitle.includes(questionLower)) {
      return {
        titleKey: titleKey,
        originalTitle: titleData.originalTitle,
        values: titleData.values,
        matchType: 'original_title_match'
      };
    }
  }
  
  // Second, check for keyword-based matches
  let bestMatch = null;
  let highestScore = 0;
  
  for (const [titleKey, titleData] of Object.entries(processedData)) {
    const title = titleKey;
    let score = 0;
    
    // Split into words
    const titleWords = title.split(/\s+/);
    const questionWords = questionLower.split(/\s+/);
    
    // Check for word matches
    titleWords.forEach(tWord => {
      if (tWord.length > 3) {
        questionWords.forEach(qWord => {
          if (qWord.length > 3) {
            if (qWord.includes(tWord) || tWord.includes(qWord)) {
              score += 2;
            }
          }
        });
      }
    });
    
    // Check if question has service keywords
    serviceKeywords.forEach(keyword => {
      if (questionLower.includes(keyword) && (title.includes('service') || title.includes('product'))) {
        score += 1;
      }
    });
    
    // Update best match if score is higher
    if (score > highestScore) {
      highestScore = score;
      bestMatch = {
        titleKey: titleKey,
        originalTitle: titleData.originalTitle,
        values: titleData.values,
        matchType: 'keyword_match',
        score: score
      };
    }
  }
  
  // Return best match if score is good enough
  if (bestMatch && highestScore >= 1) {
    return bestMatch;
  }
  
  return null;
};

// OLD: Generate response from matched data (पहले वाला logic)
const generateResponseFromMatch = (matchedValue, matchedTitle) => {
  if (!matchedValue || !matchedTitle) {
    return null;
  }
  
  // Clean the matched value
  const cleanValue = cleanText(matchedValue);
  
  if (!cleanValue) {
    return null;
  }
  
  // Create simple response
  let response = `We offer ${cleanValue}`;
  
  // Use the title from database
  const cleanTitle = cleanText(matchedTitle.toLowerCase());
  response += ` ${cleanTitle} to boost your online business!`;
  
  // Extract first meaningful word for call to action
  const words = cleanValue.split(' ');
  let firstWord = words[0] || 'service';
  
  // Make sure first word is meaningful
  if (firstWord.length < 3 || ['the', 'our', 'your', 'with', 'for'].includes(firstWord.toLowerCase())) {
    firstWord = words.length > 1 ? words[1] : 'service';
  }
  
  response += ` Would you like me to start the ${firstWord} process?`;
  
  // Final cleanup
  response = cleanText(response);
  
  return response;
};

// NEW: Generate response from matched title with all values
const generateResponseFromTitleMatch = (matchedTitle, values) => {
  if (!matchedTitle || !values || !Array.isArray(values)) {
    return null;
  }
  
  // Format the response
  let response = '';
  
  // If it's "services" or similar
  if (matchedTitle.toLowerCase().includes('service')) {
    response = `We provide the following ${matchedTitle}:\n\n`;
    values.forEach(service => {
      response += `✅ ${service}\n`;
    });
    response += `\nWhich ${matchedTitle.toLowerCase()} are you interested in?`;
  } 
  // If it's products
  else if (matchedTitle.toLowerCase().includes('product')) {
    response = `We offer these ${matchedTitle}:\n\n`;
    values.forEach(product => {
      response += `🎯 ${product}\n`;
    });
    response += `\nWould you like more information about any specific ${matchedTitle.toLowerCase()}?`;
  }
  // Generic response for other titles
  else {
    response = `Here are our ${matchedTitle}:\n\n`;
    values.forEach(item => {
      response += `• ${item}\n`;
    });
    response += `\nLet me know if you need details about any specific item from our ${matchedTitle.toLowerCase()}.`;
  }
  
  return response;
};

// Check if question is asking for list/overview of services/products
const isAskingForList = (question) => {
  const questionLower = question.toLowerCase();
  const listKeywords = [
    'what services', 'what products', 'list', 'tell me about', 
    'all services', 'all products', 'everything', 'overview',
    'what do you provide', 'what do you offer', 'what do you have',
    'types of', 'kinds of', 'variety of'
  ];
  
  for (const keyword of listKeywords) {
    if (questionLower.includes(keyword)) {
      return true;
    }
  }
  
  return false;
};

/* ======================
   MAIN API ROUTE - UPDATED
====================== */

router.post('/generate-ai-response', async (req, res) => {
  try {
    const { 
      question, 
      apiKey 
    } = req.body;

    // Validation
    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide a question"
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "API key is required"
      });
    }

    // Step 1: Get website data by API key
    const websiteResult = await getWebsiteDataByApiKey(apiKey);
    
    if (!websiteResult.success || !websiteResult.data) {
      return res.status(404).json({
        success: false,
        message: "Invalid API key or website not found"
      });
    }

    const websiteData = websiteResult.data;
    const websiteTitle = websiteData.websiteName || '';
    const categories = Array.isArray(websiteData.category) ? websiteData.category : ['General'];
    const aifuture = websiteData.aifuture || [];

    // Step 2: Check if user is asking for list of services/products
    const askingForList = isAskingForList(question);
    
    // Step 3: Try different matching strategies in priority order
    let finalResponse = '';
    let responseType = '';
    let matchedData = null;

    if (askingForList) {
      // User is asking for list/overview - use title match
      const titleMatch = findMatchingTitle(question, aifuture);
      if (titleMatch) {
        finalResponse = generateResponseFromTitleMatch(titleMatch.originalTitle, titleMatch.values);
      
      
      }
    }
    
    // If no response yet, try old value matching (for specific service/product queries)
    if (!finalResponse) {
      const valueMatch = findMatchingValue(question, aifuture);
      if (valueMatch) {
        finalResponse = generateResponseFromMatch(valueMatch.value, valueMatch.title);
    
     
      }
    }
    
    // If still no response, try title matching (for other general title queries)
    if (!finalResponse) {
      const titleMatch = findMatchingTitle(question, aifuture);
      if (titleMatch) {
        finalResponse = generateResponseFromTitleMatch(titleMatch.originalTitle, titleMatch.values);
       
      
      }
    }

    // Step 4: If no match found, fallback to category logic
    if (!finalResponse) {
      // No title match, check category
      const isCategoryRelated = checkCategoryMatch(question, categories);
      
      if (isCategoryRelated && aifuture.length > 0) {
        // Category related but no match - show available titles
        const processedData = processAifutureData(aifuture);
        const availableTitles = Object.values(processedData).map(item => item.originalTitle);
        
        if (availableTitles.length > 0) {
          finalResponse = `I can help you with information about our ${availableTitles.join(', ')}. `;
          finalResponse += `For example, you can ask "What ${availableTitles[0].toLowerCase()} do you provide?"`;
          responseType = 'available_titles';
        } else {
          // No data available
          finalResponse = `I can help you with ${categories.join(', ')}. Please ask about our services or products.`;
          responseType = 'category_only';
        }
      } else {
        // Not related to category
        finalResponse = `I can only help with questions about our ${categories.join(', ')}. `;
        finalResponse += `Please ask something related to our services or products.`;
        responseType = 'category_mismatch';
      }
    }

    // Ensure we have a response
    if (!finalResponse || finalResponse.trim() === '') {
      finalResponse = `I can help you with our services. What specific information are you looking for?`;
      responseType = 'default';
    }

    // Step 5: Return response
    res.json({
      success: true,
      response: finalResponse,
    
      
      
      
    });

  } catch (error) {
    console.error("API Error:", error.message);
    
    let userMessage = "Unable to process your request at the moment.";
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      userMessage = "API key not found.";
      statusCode = 404;
    } else if (error.code === 'ECONNABORTED') {
      userMessage = "Request timeout. Please try again.";
    } else if (error.response?.status === 429) {
      userMessage = "Too many requests. Please wait a moment.";
      statusCode = 429;
    }

    res.status(statusCode).json({
      success: false,
      message: userMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/* ======================
   SIMPLE DIRECT RESPONSE ENDPOINT - UPDATED
====================== */

router.post('/direct-response', async (req, res) => {
  try {
    const { question, apiKey } = req.body;

    // Basic validation
    if (!question || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "Question is required"
      });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "API key is required"
      });
    }

    // Get website data
    const websiteResult = await getWebsiteDataByApiKey(apiKey);
    
    if (!websiteResult.success || !websiteResult.data) {
      return res.status(404).json({
        success: false,
        message: "Invalid API key"
      });
    }

    const websiteData = websiteResult.data;
    const categories = Array.isArray(websiteData.category) ? websiteData.category : ['General'];
    const aifuture = websiteData.aifuture || [];

    // Check what type of question it is
    const askingForList = isAskingForList(question);
    
    let response = '';
    let matchedData = null;
    let hasMatch = false;

    if (askingForList) {
      // Try title match first for list questions
      const titleMatch = findMatchingTitle(question, aifuture);
      if (titleMatch) {
        response = generateResponseFromTitleMatch(titleMatch.originalTitle, titleMatch.values);
        matchedData = {
          title: titleMatch.originalTitle,
          values: titleMatch.values
        };
        hasMatch = true;
      }
    } else {
      // Try value match first for specific questions
      const valueMatch = findMatchingValue(question, aifuture);
      if (valueMatch) {
        response = generateResponseFromMatch(valueMatch.value, valueMatch.title);
        matchedData = {
          value: valueMatch.value,
          title: valueMatch.title
        };
        hasMatch = true;
      } else {
        // If no value match, try title match
        const titleMatch = findMatchingTitle(question, aifuture);
        if (titleMatch) {
          response = generateResponseFromTitleMatch(titleMatch.originalTitle, titleMatch.values);
          matchedData = {
            title: titleMatch.originalTitle,
            values: titleMatch.values
          };
          hasMatch = true;
        }
      }
    }

    if (hasMatch && response) {
      res.json({
        success: true,
        response: response,
        matchedData: matchedData,
        hasMatch: true,
        matchType: askingForList ? 'title_match' : 'value_match'
      });
      return;
    }

    // No match found - show available titles
    const processedData = processAifutureData(aifuture);
    const availableTitles = Object.values(processedData).map(item => item.originalTitle);
    
    response = `I can help you with information about our ${categories.join(', ')}. `;
    
    if (availableTitles.length > 0) {
      response += `We have data about: ${availableTitles.join(', ')}. `;
      response += `Try asking about any of these.`;
    } else {
      response += `Please ask about our services or products.`;
    }
    
    res.json({
      success: true,
      response: response,
      hasMatch: false,
      availableTitles: availableTitles,
      availableCategories: categories
    });

  } catch (error) {
    console.error("Direct Response Error:", error.message);
    
    res.status(500).json({
      success: false,
      message: "Unable to process your request",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/* ======================
   HEALTH CHECK
====================== */

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: "AI Response API is running",
    timestamp: new Date().toISOString(),
    hasApiKey: !!GEMINI_API_KEY,
    environment: process.env.NODE_ENV || 'development'
  });
});

/* ======================
   API KEY VALIDATION
====================== */

router.post('/validate-api-key', async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "API key is required"
      });
    }

    const websiteResult = await getWebsiteDataByApiKey(apiKey);
    
    if (websiteResult.success && websiteResult.data) {
      const websiteData = websiteResult.data;
      const processedData = processAifutureData(websiteData.aifuture || []);
      const availableTitles = Object.values(processedData).map(item => item.originalTitle);
      
      res.json({
        success: true,
        valid: true,
        website: {
          name: websiteData.websiteName || '',
          url: websiteData.websiteUrl || '',
          categories: Array.isArray(websiteData.category) ? websiteData.category : ['General'],
          hasAifutureData: websiteData.aifuture && websiteData.aifuture.length > 0,
          availableTitles: availableTitles
        }
      });
    } else {
      res.json({
        success: true,
        valid: false,
        message: "Invalid API key"
      });
    }

  } catch (error) {
    console.error("API Key Validation Error:", error.message);
    
    res.status(500).json({
      success: false,
      message: "Unable to validate API key",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;