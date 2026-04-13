// routes/chatRoutes.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');

// Test connection
router.get('/chat-requests/test', chatController.testConnection);

// Create new chat request
router.post('/chat-requests', chatController.createChatRequest);

// Get all chat requests (with optional filters) - NO LIMIT
router.get('/chat-requests', chatController.getAllChatRequests);

// Get chat requests by backend API Key - NO LIMIT
router.get('/chat-requests/backend-api-key/:backendApiKey', chatController.getChatRequestsByBackendApiKey);

// Get count by backend API Key
router.get('/chat-requests/backend-api-key/:backendApiKey/count', chatController.getCountByBackendApiKey);

// Get chat requests by website ID - NO LIMIT
router.get('/chat-requests/website/:websiteId', chatController.getChatRequestsByWebsite);

// Get chat request by ID
router.get('/chat-requests/:id', chatController.getChatRequestById);

// Update chat request status
router.put('/chat-requests/:id/status', chatController.updateChatRequestStatus);

// Delete chat request
router.delete('/chat-requests/:id', chatController.deleteChatRequest);

// Get chat statistics
router.get('/chat-stats', chatController.getChatStats);

module.exports = router;