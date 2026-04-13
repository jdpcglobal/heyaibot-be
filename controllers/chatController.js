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

  // Create new chat request
  createChatRequest: async (req, res) => {
    try {
      const { websiteId, collectedData, backendApiKey, status = 'pending' } = req.body;

      console.log('📝 Creating chat request:', { 
        websiteId, 
        backendApiKey: backendApiKey ? '***' + backendApiKey.slice(-4) : 'missing',
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
        backendApiKey,
        status
      });

      res.status(201).json({
        success: true,
        message: 'Chat request created successfully',
        data: chatRequest
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

  // Get all chat requests (with optional filters) - NO LIMIT
  getAllChatRequests: async (req, res) => {
    try {
      const { status, websiteId, backendApiKey } = req.query;

      console.log('📋 Fetching all chat requests (NO LIMIT):', { 
        status, 
        websiteId, 
        backendApiKey: backendApiKey ? '***' + backendApiKey.slice(-4) : 'all' 
      });

      let chatRequests;

      if (backendApiKey) {
        chatRequests = await ChatRequest.getByBackendApiKey(backendApiKey);
      } else if (websiteId) {
        chatRequests = await ChatRequest.getByWebsiteId(websiteId);
      } else if (status) {
        chatRequests = await ChatRequest.getByStatus(status);
      } else {
        chatRequests = await ChatRequest.getAll();
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
        data: []
      });
    }
  },

  // Get chat requests by backend API Key - NO LIMIT
  getChatRequestsByBackendApiKey: async (req, res) => {
    try {
      const { backendApiKey } = req.params;
      const { status } = req.query;

      console.log('📋 Fetching ALL chat requests for backend API Key (NO LIMIT):', '***' + backendApiKey.slice(-4));

      let chatRequests = await ChatRequest.getByBackendApiKey(backendApiKey);
      
      // Filter by status if provided
      if (status) {
        chatRequests = chatRequests.filter(req => req.status === status);
      }

      console.log(`✅ Returning ${chatRequests.length} records`);

      res.json({
        success: true,
        data: chatRequests,
        count: chatRequests.length,
        backendApiKey: backendApiKey
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

  // Get chat requests by website ID - NO LIMIT
  getChatRequestsByWebsite: async (req, res) => {
    try {
      const { websiteId } = req.params;
      const { status } = req.query;

      console.log('📋 Fetching ALL chat requests for website (NO LIMIT):', websiteId);

      let chatRequests = await ChatRequest.getByWebsiteId(websiteId);
      
      // Filter by status if provided
      if (status) {
        chatRequests = chatRequests.filter(req => req.status === status);
      }

      console.log(`✅ Returning ${chatRequests.length} records`);

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

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

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

  // Get count by backendApiKey
  getCountByBackendApiKey: async (req, res) => {
    try {
      const { backendApiKey } = req.params;

      console.log('🔢 Getting count for backend API Key:', '***' + backendApiKey.slice(-4));

      if (!backendApiKey) {
        return res.status(400).json({
          success: false,
          message: 'Backend API Key is required'
        });
      }

      const count = await ChatRequest.getCountByBackendApiKey(backendApiKey);

      res.json({
        success: true,
        count: count,
        backendApiKey: backendApiKey
      });
    } catch (error) {
      console.error('❌ Get count error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  },

  // Get chat requests statistics
  getChatStats: async (req, res) => {
    try {
      const { websiteId, backendApiKey } = req.query;

      console.log('📊 Fetching chat statistics (NO LIMIT):', { 
        websiteId, 
        backendApiKey: backendApiKey ? '***' + backendApiKey.slice(-4) : 'all' 
      });

      let allRequests;
      
      if (backendApiKey) {
        allRequests = await ChatRequest.getByBackendApiKey(backendApiKey);
      } else if (websiteId) {
        allRequests = await ChatRequest.getByWebsiteId(websiteId);
      } else {
        allRequests = await ChatRequest.getAll();
      }

      const stats = {
        total: allRequests.length,
        pending: allRequests.filter(req => req.status === 'pending').length,
        confirmed: allRequests.filter(req => req.status === 'confirmed').length,
        cancelled: allRequests.filter(req => req.status === 'cancelled').length,
        completed: allRequests.filter(req => req.status === 'completed').length,
        recent: allRequests.slice(0, 10)
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