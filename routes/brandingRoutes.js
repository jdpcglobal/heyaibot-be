// routes/brandingRoutes.js
const express = require('express');
const router = express.Router();
const brandingController = require('../controllers/brandingController');

// POST /api/branding - Create or update branding
router.post('/branding', brandingController.saveBranding.bind(brandingController));

// GET /api/branding/:apiKey - Get branding by API key
router.get('/branding/:apiKey', brandingController.getBranding.bind(brandingController));

// PUT /api/branding/:apiKey/header-color - Update only header color
router.put('/branding/:apiKey/header-color', brandingController.updateHeaderColor.bind(brandingController));

// DELETE /api/branding/:apiKey - Delete branding
router.delete('/branding/:apiKey', brandingController.deleteBranding.bind(brandingController));

module.exports = router;