// controllers/websiteController.js
const websiteModel = require('../models/websiteModel');

// CREATE
exports.createWebsite = async (req, res) => {
  const result = await websiteModel.saveWebsite(req.body);
  res.status(result.success ? 201 : 400).json(result);
};

// READ ALL
exports.getWebsites = async (req, res) => {
  // Check if API key is provided for single website lookup
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  
  if (apiKey) {
    // If API key provided, return specific website
    const result = await websiteModel.getWebsiteByApiKey(apiKey);
    res.status(result.success ? 200 : 404).json(result);
  } else {
    // Otherwise return all websites
    const result = await websiteModel.getAllWebsites();
    res.status(result.success ? 200 : 400).json(result);
  }
};

// READ ONE BY ID
exports.getWebsiteById = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.getWebsiteById(id);
  res.status(result.success ? 200 : 404).json(result);
};

// READ ONE BY API KEY
exports.getWebsiteByApiKey = async (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing apiKey' 
    });
  }

  const result = await websiteModel.getWebsiteByApiKey(apiKey);
  res.status(result.success ? 200 : 404).json(result);
};

// UPDATE FULL WEBSITE BY ID
exports.updateWebsite = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.updateWebsite(id, req.body);
  res.status(result.success ? 200 : 400).json(result);
};

// UPDATE CUSTOM DATA ONLY BY ID
exports.updateWebsiteCustomData = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.updateWebsiteCustomData(id, req.body);
  res.status(result.success ? 200 : 400).json(result);
};

// UPDATE STATUS ONLY BY ID
exports.updateWebsiteStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!['active', 'inactive'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const result = await websiteModel.updateWebsiteStatus(id, status);
  res.status(result.success ? 200 : 500).json(
    result.success ? result : { error: result.error }
  );
};

// DELETE BY ID
exports.deleteWebsite = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.deleteWebsite(id);
  res.status(result.success ? 200 : 400).json(result);
};

// SYNC FROM EXTERNAL API
exports.syncWebsites = async (req, res) => {
  const { apiBaseUrl, backendApiKey } = req.body;
  
  if (!apiBaseUrl || !backendApiKey) {
    return res.status(400).json({
      success: false,
      error: 'Missing apiBaseUrl or backendApiKey'
    });
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/websites`, {
      headers: { Authorization: `Bearer ${backendApiKey}` },
    });

    if (!response.ok) throw new Error('Failed to fetch websites');

    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No websites found'
      });
    }

    const savedItems = [];
    for (const item of data.items) {
      const result = await websiteModel.saveWebsite(item);
      if (result.success) savedItems.push(result.item);
    }

    const allWebsites = await websiteModel.getAllWebsites();
    
    res.json({
      success: true,
      message: `Fetched and synced ${savedItems.length} websites`,
      items: allWebsites.items
    });

  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};