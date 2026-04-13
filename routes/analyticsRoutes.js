// routes/analyticsRoutes.js
const express = require('express');
const router  = express.Router();
const { analyticsController } = require('../controllers/analyticsController');


router.get('/graph', analyticsController);

module.exports = router;