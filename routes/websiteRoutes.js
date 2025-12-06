// routes/websiteRoutes.js
const express = require('express');
const router = express.Router();
const websiteController = require('../controllers/websiteController');

// CREATE
router.post('/', websiteController.createWebsite);

// READ ALL
router.get('/', websiteController.getWebsites);

// READ ONE BY ID
router.get('/:id', websiteController.getWebsiteById);

// READ ONE BY API KEY
router.get('/by-api-key/key', websiteController.getWebsiteByApiKey);

// UPDATE FULL WEBSITE BY ID
router.put('/:id', websiteController.updateWebsite);

// UPDATE CUSTOM DATA ONLY BY ID
router.patch('/:id/custom-data', websiteController.updateWebsiteCustomData);

// UPDATE STATUS ONLY BY ID
router.patch('/:id/status', websiteController.updateWebsiteStatus);

// DELETE BY ID
router.delete('/:id', websiteController.deleteWebsite);

// SYNC
router.post('/sync', websiteController.syncWebsites);

module.exports = router;