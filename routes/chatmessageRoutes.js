const express = require('express');
const router = express.Router();
const ChatController = require('../controllers/chatmessageController');

// ============ SESSION-BASED ENDPOINTS ============

// Add user message to session (auto create/update)
router.post('/session/:apiKey/:sessionId/user-message', ChatController.addUserMessageToSession);

// Add bot reply to session
router.post('/session/:apiKey/:sessionId/bot-reply', ChatController.addBotReplyToSession);

// Bulk insert conversations to session
router.post('/session/:apiKey/:sessionId/bulk', ChatController.bulkInsertToSession);

// Get session data
router.get('/session/:apiKey/:sessionId', ChatController.getSessionData);

// Get all sessions for an API key
router.get('/sessions/:apiKey', ChatController.getAllSessions);

// ============ GET CHATS BY API KEY ============
router.get('/chats/apikey/:apiKey', ChatController.getChatsByApiKey);

// ============ MESSAGE RETRIEVAL ENDPOINTS ============

// Get all messages by chat ID
router.get('/chats/:chatId/messages', ChatController.getChatMessages);

// Get messages by thread ID
router.get('/chats/:chatId/threads/:threadId/messages', ChatController.getThreadMessages);

// ============ BULK OPERATIONS ============

// Bulk insert - Create new chat with multiple conversations
router.post('/chats/bulk', ChatController.bulkInsertChat);

// Append conversations to existing chat
router.post('/chats/:chatId/append', ChatController.appendConversations);

// Get append history
router.get('/chats/:chatId/append-history', ChatController.getAppendHistory);

// ============ TRADITIONAL CHAT ENDPOINTS ============

// Create new chat
router.post('/chats', ChatController.createChat);

// Get chat by ID
router.get('/chats/:chatId', ChatController.getChatById);

// Get conversation summary
router.get('/chats/:chatId/summary', ChatController.getConversationSummary);

// Get specific thread
router.get('/chats/:chatId/threads/:threadId', ChatController.getThread);

// Get chat stats only
router.get('/chats/:chatId/stats', ChatController.getChatStats);

// Delete chat
router.delete('/chats/:chatId', ChatController.deleteChat);

module.exports = router;