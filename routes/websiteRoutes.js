// routes/websiteRoutes.js
const express = require('express');
const router = express.Router();
const websiteController = require('../controllers/websiteController');

// ================= AIFUTURE ROUTES =================
// Complete AIFuture operations
router.put('/:id/aifuture', websiteController.updateWebsiteAifuture);
router.get('/:id/aifuture', websiteController.getWebsiteAifuture);
router.delete('/:id/aifuture', websiteController.clearAifuture);

// Add to AIFuture
router.post('/:id/aifuture/items', websiteController.addToAifuture);

// Specific AIFuture item operations
router.get('/:id/aifuture/titles', websiteController.getAllAifutureTitles);
router.get('/:id/aifuture/items/:title', websiteController.getAifutureItemByTitle);
router.put('/:id/aifuture/items/:title', websiteController.updateAifutureItemByTitle);
router.delete('/:id/aifuture/items/:title', websiteController.deleteAifutureItemByTitle);

// Delete specific value from AIFuture item
router.delete('/:id/aifuture/items/:title/values/:value', websiteController.deleteValueFromAifutureItem);

// ================= EXISTING ROUTES =================
router.get('/client-config', websiteController.getClientWebsiteConfig);
// 🔑 API-key based (ALWAYS FIRST)
router.get('/header', websiteController.getWebsitesHeader);
router.get('/chat-config', websiteController.getChatConfig);

// CRUD
router.post('/', websiteController.createWebsite);
router.get('/', websiteController.getWebsites);
router.get('/:id', websiteController.getWebsiteById);

// Updates
router.put('/:id', websiteController.updateWebsite);
router.patch('/:id/custom-data', websiteController.updateWebsiteCustomData);
router.patch('/:id/status', websiteController.updateWebsiteStatus);

// Delete
router.delete('/:id', websiteController.deleteWebsite);

// Sync
router.post('/sync', websiteController.syncWebsites);

module.exports = router;