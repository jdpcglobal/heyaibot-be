const express = require('express');
const router = express.Router();
const websiteController = require('../controllers/websiteController');

// ================= API KEY BASED (ALWAYS FIRST) =================
router.get('/client-config', websiteController.getClientWebsiteConfig);
router.get('/header', websiteController.getWebsitesHeader);
router.get('/chat-config', websiteController.getChatConfig);

// ================= WEBSITE LEVEL DESCRIPTION & TAGS =================
// Search websites by description
router.get('/search/description', websiteController.searchWebsitesByDescription);
// Get websites by tag
router.get('/tags/:tag', websiteController.getWebsitesByTag);
// Add/remove tags to website
router.post('/:id/tags', websiteController.addTagToWebsite);
router.delete('/:id/tags', websiteController.removeTagFromWebsite);

// ================= SERVICE OPERATIONS (AIFUTURE) =================
// Service description and tags management
router.post('/:id/aifuture/:title/service/:serviceName/description', websiteController.addServiceDescription);
router.post('/:id/aifuture/:title/service/:serviceName/tags', websiteController.addServiceTags);
router.delete('/:id/aifuture/:title/service/:serviceName/tag/:tag', websiteController.removeServiceTag);
router.get('/:id/aifuture/:title/service/:serviceName', websiteController.getServiceDetails);
router.put('/:id/aifuture/:title/service/:serviceName', websiteController.updateServiceItem);
router.delete('/:id/aifuture/:title/service/:serviceName', websiteController.deleteServiceItem);
router.get('/:id/aifuture/services/tag/:tag', websiteController.getServicesByTag);

// ================= AIFUTURE ROUTES =================
router.put('/:id/aifuture', websiteController.updateWebsiteAifuture);
router.get('/:id/aifuture', websiteController.getWebsiteAifuture);
router.delete('/:id/aifuture', websiteController.clearAifuture);
router.post('/:id/aifuture/items', websiteController.addToAifuture);
router.get('/:id/aifuture/titles', websiteController.getAllAifutureTitles);
router.get('/:id/aifuture/items/:title', websiteController.getAifutureItemByTitle);
router.put('/:id/aifuture/items/:title', websiteController.updateAifutureItemByTitle);
router.delete('/:id/aifuture/items/:title', websiteController.deleteAifutureItemByTitle);
router.delete('/:id/aifuture/items/:title/values/:value', websiteController.deleteValueFromAifutureItem);

// ================= ROLE-AWARE STATUS =================
// SuperAdmin lock system
router.patch('/:id/status/role-aware', websiteController.updateWebsiteStatusRoleAware);

// ── RESTORE (SuperAdmin only) — adminDeleted website wapas lao ──
router.patch('/:id/restore', websiteController.restoreWebsite);

// ================= MAIN CRUD =================
router.post('/', websiteController.createWebsite);
// GET all — ?superadmin=true pass karo SuperAdmin ke liye (adminDeleted bhi aayenge)
router.get('/', websiteController.getWebsites);
router.get('/:id', websiteController.getWebsiteById);
router.put('/:id', websiteController.updateWebsite);
router.patch('/:id/custom-data', websiteController.updateWebsiteCustomData);
router.patch('/:id/status', websiteController.updateWebsiteStatus);
// Permanent delete — SuperAdmin only
router.delete('/:id', websiteController.deleteWebsite);

// Sync
router.post('/sync', websiteController.syncWebsites);

// ================= USER-SPECIFIC OPERATIONS =================

// GET ALL WEBSITES FOR USER
// ?superadmin=true → adminDeleted wale bhi dikhenge (SuperAdmin use kare)
router.get('/user/:userId/websites', websiteController.getAllWebsitesByUserId);

// GET / UPDATE specific website for user
router.get('/user/:userId/websites/:id', websiteController.getWebsiteByIdAndUserId);
router.put('/user/:userId/websites/:id', websiteController.updateWebsiteByUserId);

// ── ADMIN SOFT DELETE ──
// Ye route admin ke liye hai — sirf adminDeleted=true flag lagta hai
// Database mein rehta hai, SuperAdmin ko dikhta rehta hai
router.delete('/user/:userId/websites/:id/soft', websiteController.adminSoftDeleteWebsite);

// Regular delete (by userId) — ye bhi soft delete karta hai ab
router.delete('/user/:userId/websites/:id', websiteController.deleteWebsiteByUserId);

// ROLE MANAGEMENT
router.post('/user/:userId/websites/:id/roles', websiteController.addRoleToWebsiteByUserId);
router.delete('/user/:userId/websites/:id/roles', websiteController.removeRoleFromWebsiteByUserId);

// AIFUTURE WITH USER VERIFICATION
router.put('/user/:userId/websites/:id/aifuture', websiteController.updateWebsiteAifutureByUserId);

// STATUS WITH USER VERIFICATION
router.patch('/user/:userId/websites/:id/status', websiteController.updateWebsiteStatusByUserId);
router.patch('/user/:userId/websites/:id/status/role-aware', websiteController.updateWebsiteStatusByUserIdRoleAware);

// SEARCH & FILTER
router.get('/user/:userId/websites/search', websiteController.searchWebsitesByUserId);
router.get('/user/:userId/websites/by-role', websiteController.getWebsitesByRoleAndUserId);

// BULK OPERATIONS
router.delete('/user/:userId/websites', websiteController.bulkDeleteWebsitesByUserId);

// DASHBOARD & STATS
router.get('/user/:userId/dashboard', websiteController.getUserDashboardStats);
router.get('/user/:userId/count', websiteController.countWebsitesByUserId);

// CREDENTIALS
router.get('/user/:userId/credentials', websiteController.getApiKeyAndWebsiteName);
router.get('/user/:userId/primary-credential', websiteController.getPrimaryApiKeyAndWebsiteName);

// USER-SPECIFIC SERVICE OPERATIONS
// Service description and tags for user's websites
router.post('/user/:userId/websites/:id/aifuture/:title/service/:serviceName/description', async (req, res) => {
  const { id, userId, title, serviceName } = req.params;
  const { description } = req.body;
  
  // Verify ownership first
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').addServiceDescription(id, title, serviceName, description);
  res.status(result.success ? 200 : 400).json(result);
});

router.post('/user/:userId/websites/:id/aifuture/:title/service/:serviceName/tags', async (req, res) => {
  const { id, userId, title, serviceName } = req.params;
  const { tags } = req.body;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').addServiceTags(id, title, serviceName, tags);
  res.status(result.success ? 200 : 400).json(result);
});

router.delete('/user/:userId/websites/:id/aifuture/:title/service/:serviceName/tag/:tag', async (req, res) => {
  const { id, userId, title, serviceName, tag } = req.params;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').removeServiceTag(id, title, serviceName, tag);
  res.status(result.success ? 200 : 400).json(result);
});

router.get('/user/:userId/websites/:id/aifuture/:title/service/:serviceName', async (req, res) => {
  const { id, userId, title, serviceName } = req.params;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').getServiceDetails(id, title, serviceName);
  res.status(result.success ? 200 : 404).json(result);
});

router.put('/user/:userId/websites/:id/aifuture/:title/service/:serviceName', async (req, res) => {
  const { id, userId, title, serviceName } = req.params;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').updateServiceItem(id, title, serviceName, req.body);
  res.status(result.success ? 200 : 400).json(result);
});

router.delete('/user/:userId/websites/:id/aifuture/:title/service/:serviceName', async (req, res) => {
  const { id, userId, title, serviceName } = req.params;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').deleteServiceItem(id, title, serviceName);
  res.status(result.success ? 200 : 400).json(result);
});

router.get('/user/:userId/websites/:id/aifuture/services/tag/:tag', async (req, res) => {
  const { id, userId, tag } = req.params;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').getServicesByTag(id, tag);
  res.status(result.success ? 200 : 400).json(result);
});

// USER-SPECIFIC WEBSITE TAG OPERATIONS
router.post('/user/:userId/websites/:id/tags', async (req, res) => {
  const { id, userId } = req.params;
  const { tag } = req.body;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').addTagToWebsite(id, tag);
  res.status(result.success ? 200 : 400).json(result);
});

router.delete('/user/:userId/websites/:id/tags', async (req, res) => {
  const { id, userId } = req.params;
  const { tag } = req.body;
  
  const ownershipResult = await require('../models/websiteModel').getWebsiteByIdAndUserId(id, userId);
  if (!ownershipResult.success) {
    return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  
  const result = await require('../models/websiteModel').removeTagFromWebsite(id, tag);
  res.status(result.success ? 200 : 400).json(result);
});

// ================= SIMPLIFIED (QUERY PARAMS) =================
router.get('/websites/:id/user', websiteController.getWebsiteWithUser);
router.put('/websites/:id/user', websiteController.updateWebsiteWithUser);
router.delete('/websites/:id/user', websiteController.deleteWebsiteWithUser);

// ================= ADMIN ROUTES =================
router.get('/websites/unassigned', websiteController.getWebsitesWithoutUserId);
router.post('/websites/:id/assign-user', websiteController.assignUserToWebsite);

// ================= TOKEN DETAILS =================
// Query parameter version (GET /api/websites/token-details?userId=123)
router.get('/token-details', async (req, res) => {
  const { userId } = req.query;
  
  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId is required' });
  }

  try {
    const dynamo = require('../config/dynamoClient');
    const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
    const WEBSITES_TABLE = process.env.WEBSITES_TABLE || 'Websites';

    const result = await dynamo.send(new ScanCommand({
      TableName: WEBSITES_TABLE,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId.trim() }
    }));

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: `No websites found for user: ${userId}` 
      });
    }

    const credentials = [];
    let totalTokens = 0;

    for (const item of result.Items) {
      const apiKey = item.apiKey || '';
      let websiteTokens = 0;
      
      if (apiKey) {
        try {
          const ChatModel = require('../models/Chat');
          const chats = await ChatModel.getByApiKey(apiKey);
          websiteTokens = chats.reduce((sum, chat) => sum + (chat.tokens?.total || 0), 0);
        } catch (error) {
          console.error(`Error fetching chats:`, error.message);
        }
      }
      
      credentials.push({
        apiKey: apiKey,
        websiteName: item.websiteName || '',
        websiteDescription: item.description || '',
        websiteTags: item.tags || [],
        token: websiteTokens
      });
      
      totalTokens += websiteTokens;
    }

    return res.status(200).json({
      success: true,
      userId: userId,
      credentials: credentials,
      count: credentials.length,
      totalToken: totalTokens
    });

  } catch (error) {
    console.error("Error fetching token details:", error);
    return res.status(500).json({ 
      success: false, 
      error: "Internal Server Error" 
    });
  }
});

module.exports = router;