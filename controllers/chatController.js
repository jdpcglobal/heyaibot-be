// controllers/chatController.js
const ChatRequest = require('../models/ChatRequest');

const chatController = {
  // Test endpoint to check connection
  testConnection: async (req, res) => {
    try {
      const result = await ChatRequest.testConnection();
      res.json({
        success: true,
        connected: result.connected,
        error: result.error,
        table: process.env.TABLE_NAME || 'ChatRequest'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        connected: false,
        error: error.message
      });
    }
  },

  // Create new chat request - UPDATED with backendApiKey
  createChatRequest: async (req, res) => {
    try {
      const { websiteId, collectedData, backendApiKey, status = 'pending' } = req.body;

      console.log('📝 Creating chat request:', { 
        websiteId, 
        collectedData: typeof collectedData,
        backendApiKey: backendApiKey ? '***' + backendApiKey.slice(-4) : 'missing', // Log safely
        status 
      });

      if (!websiteId) {
        return res.status(400).json({
          success: false,
          message: 'Website ID is required'
        });
      }

      if (!backendApiKey) {
        return res.status(400).json({
          success: false,
          message: 'Backend API Key is required'
        });
      }

      if (!collectedData || (typeof collectedData === 'object' && Object.keys(collectedData).length === 0)) {
        return res.status(400).json({
          success: false,
          message: 'Collected data is required'
        });
      }

      const chatRequest = await ChatRequest.create({
        websiteId,
        collectedData,
        backendApiKey, // ✅ NEW FIELD
        status
      });

     

      res.status(201).json({
        success: true,
        message: 'Chat request created successfully',
        
      });
    } catch (error) {
      console.error('❌ Create chat request error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get all chat requests (admin) - UPDATED with backendApiKey filter
  getAllChatRequests: async (req, res) => {
    try {
      const { limit = 100, status, websiteId, backendApiKey } = req.query;

      console.log('📋 Fetching all chat requests:', { 
        limit, 
        status, 
        websiteId, 
        backendApiKey: backendApiKey ? '***' + backendApiKey.slice(-4) : 'all' 
      });

      let chatRequests;

      if (backendApiKey) {
        // ✅ NEW: Get by backendApiKey
        chatRequests = await ChatRequest.getByBackendApiKey(backendApiKey, parseInt(limit));
      } else if (websiteId) {
        // Get by website ID
        chatRequests = await ChatRequest.getByWebsiteId(websiteId, parseInt(limit));
      } else if (status) {
        // Get by status
        chatRequests = await ChatRequest.getByStatus(status, parseInt(limit));
      } else {
        // Get all
        chatRequests = await ChatRequest.getAll(parseInt(limit));
      }

      console.log(`✅ Found ${chatRequests.length} chat requests`);

      res.json({
        success: true,
        data: chatRequests,
        count: chatRequests.length
      });
    } catch (error) {
      console.error('❌ Get all chat requests error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
        data: [] // Return empty array instead of failing
      });
    }
  },

  // ✅ NEW: Get chat requests by backend API Key
  getChatRequestsByBackendApiKey: async (req, res) => {
    try {
      const { backendApiKey } = req.params;
      const { limit = 50 } = req.query;

      console.log('📋 Fetching chat requests for backend API Key:', '***' + backendApiKey.slice(-4));

      const chatRequests = await ChatRequest.getByBackendApiKey(backendApiKey, parseInt(limit));

      res.json({
        success: true,
        data: chatRequests,
        count: chatRequests.length
      });
    } catch (error) {
      console.error('❌ Get chat requests by backendApiKey error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get chat requests by website ID
  getChatRequestsByWebsite: async (req, res) => {
    try {
      const { websiteId } = req.params;
      const { limit = 50 } = req.query;

      console.log('📋 Fetching chat requests for website:', websiteId);

      const chatRequests = await ChatRequest.getByWebsiteId(websiteId, parseInt(limit));

      res.json({
        success: true,
        data: chatRequests,
        count: chatRequests.length
      });
    } catch (error) {
      console.error('❌ Get chat requests error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get chat request by ID
  getChatRequestById: async (req, res) => {
    try {
      const { id } = req.params;

      console.log('🔍 Fetching chat request:', id);

      const chatRequest = await ChatRequest.getById(id);

      if (!chatRequest) {
        return res.status(404).json({
          success: false,
          message: 'Chat request not found'
        });
      }

      res.json({
        success: true,
        data: chatRequest
      });
    } catch (error) {
      console.error('❌ Get chat request error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Update chat request status
  updateChatRequestStatus: async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      console.log('🔄 Updating chat request status:', { id, status });

      if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be: pending, confirmed, cancelled, or completed'
        });
      }

      // Check if chat request exists
      const existingRequest = await ChatRequest.getById(id);
      if (!existingRequest) {
        return res.status(404).json({
          success: false,
          message: 'Chat request not found'
        });
      }

      const updatedRequest = await ChatRequest.updateStatus(id, status);

      res.json({
        success: true,
        message: `Chat request ${status} successfully`,
        data: updatedRequest
      });
    } catch (error) {
      console.error('❌ Update chat request error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Delete chat request
  deleteChatRequest: async (req, res) => {
    try {
      const { id } = req.params;

      console.log('🗑️ Deleting chat request:', id);

      // Check if chat request exists
      const existingRequest = await ChatRequest.getById(id);
      if (!existingRequest) {
        return res.status(404).json({
          success: false,
          message: 'Chat request not found'
        });
      }

      await ChatRequest.delete(id);

      res.json({
        success: true,
        message: 'Chat request deleted successfully'
      });
    } catch (error) {
      console.error('❌ Delete chat request error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get chat requests statistics - UPDATED with backendApiKey support
  getChatStats: async (req, res) => {
    try {
      const { websiteId, backendApiKey } = req.query;

      console.log('📊 Fetching chat statistics:', { 
        websiteId, 
        backendApiKey: backendApiKey ? '***' + backendApiKey.slice(-4) : 'all' 
      });

      const allRequests = await ChatRequest.getAll(1000);
      
      // Filter data
      let filteredRequests = allRequests;
      if (backendApiKey) {
        filteredRequests = filteredRequests.filter(req => req.backendApiKey === backendApiKey);
      }
      if (websiteId) {
        filteredRequests = filteredRequests.filter(req => req.websiteId === websiteId);
      }

      const stats = {
        total: filteredRequests.length,
        pending: filteredRequests.filter(req => req.status === 'pending').length,
        confirmed: filteredRequests.filter(req => req.status === 'confirmed').length,
        cancelled: filteredRequests.filter(req => req.status === 'cancelled').length,
        completed: filteredRequests.filter(req => req.status === 'completed').length,
        recent: filteredRequests.slice(0, 10)
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('❌ Get chat stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
};

module.exports = chatController;