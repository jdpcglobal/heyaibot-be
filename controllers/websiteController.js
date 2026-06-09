const websiteModel = require('../models/websiteModel');

// ── CREATE ──
exports.createWebsite = async (req, res) => {
  const result = await websiteModel.saveWebsite(req.body);
  res.status(result.success ? 201 : 400).json(result);
};

// ── READ ALL ──
exports.getWebsites = async (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  const isSuperAdmin = req.query.superadmin === 'true';

  if (apiKey) {
    const result = await websiteModel.getWebsiteByApiKey(apiKey);
    res.status(result.success ? 200 : 404).json(result);
  } else {
    const result = await websiteModel.getAllWebsites(null, isSuperAdmin);
    res.status(result.success ? 200 : 400).json(result);
  }
};

// ── READ ONE BY ID ──
exports.getWebsiteById = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.getWebsiteById(id);
  res.status(result.success ? 200 : 404).json(result);
};

// ── READ ONE BY API KEY ──
exports.getWebsiteByApiKey = async (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  if (!apiKey) return res.status(400).json({ success: false, error: 'Missing apiKey' });
  const result = await websiteModel.getWebsiteByApiKey(apiKey);
  res.status(result.success ? 200 : 404).json(result);
};

// ── UPDATE FULL ──
exports.updateWebsite = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.updateWebsite(id, req.body);
  res.status(result.success ? 200 : 400).json(result);
};

// ── UPDATE CUSTOM DATA ──
exports.updateWebsiteCustomData = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.updateWebsiteCustomData(id, req.body);
  res.status(result.success ? 200 : 400).json(result);
};

// ── UPDATE STATUS ──
exports.updateWebsiteStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const result = await websiteModel.updateWebsiteStatus(id, status);
  res.status(result.success ? 200 : 500).json(result.success ? result : { error: result.error });
};

// ── PERMANENT DELETE (SuperAdmin only) ──
exports.deleteWebsite = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.deleteWebsite(id);
  res.status(result.success ? 200 : 400).json(result);
};

// ── ADMIN SOFT DELETE ──
exports.adminSoftDeleteWebsite = async (req, res) => {
  const { id, userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.softDeleteWebsiteByAdmin(id, userId);
  res.status(result.success ? 200 : 400).json(result);
};

// ── RESTORE (SuperAdmin only) ──
exports.restoreWebsite = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.restoreSoftDeletedWebsite(id);
  res.status(result.success ? 200 : 400).json(result);
};

// ── SYNC ──
exports.syncWebsites = async (req, res) => {
  const { apiBaseUrl, backendApiKey } = req.body;
  if (!apiBaseUrl || !backendApiKey) return res.status(400).json({ success: false, error: 'Missing apiBaseUrl or backendApiKey' });
  try {
    const response = await fetch(`${apiBaseUrl}/api/websites`, {
      headers: { Authorization: `Bearer ${backendApiKey}` },
    });
    if (!response.ok) throw new Error('Failed to fetch websites');
    const data = await response.json();
    if (!data.items || data.items.length === 0) return res.status(404).json({ success: false, error: 'No websites found' });
    const savedItems = [];
    for (const item of data.items) {
      const result = await websiteModel.saveWebsite(item);
      if (result.success) savedItems.push(result.item);
    }
    const allWebsites = await websiteModel.getAllWebsites();
    res.json({ success: true, message: `Synced ${savedItems.length} websites`, items: allWebsites.items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getWebsitesHeader = async (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  if (!apiKey) return res.status(400).json({ success: false, error: 'Missing apiKey' });
  const result = await websiteModel.getWebsiteByApiKey(apiKey);
  if (!result.success) return res.status(404).json(result);
  return res.status(200).json({ success: true, item: { websiteName: result.item.websiteName, status: result.item.status, websiteUrl: result.item.websiteUrl } });
};

exports.getChatConfig = async (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  if (!apiKey) return res.status(400).json({ success: false, error: 'Missing apiKey' });
  const result = await websiteModel.getWebsiteByApiKey(apiKey);
  if (!result.success) return res.status(404).json(result);
  return res.status(200).json({ success: true, item: { systemPrompt: result.item.systemPrompt, customPrompt: result.item.customPrompt, category: result.item.category, aifuture: result.item.aifuture } });
};

exports.getClientWebsiteConfig = async (req, res) => {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  if (!apiKey) return res.status(400).json({ success: false, error: 'Missing apiKey' });
  try {
    const result = await websiteModel.getWebsiteByApiKey(apiKey);
    if (!result.success || !result.item) return res.status(404).json({ success: false, error: 'Website not found' });
    const website = result.item;
    return res.status(200).json({ success: true, item: { id: website.id, userId: website.userId || null, websiteName: website.websiteName, status: website.status, systemPrompt: website.systemPrompt || [], customPrompt: website.customPrompt || [], category: website.category || [], aifuture: website.aifuture || [] } });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ── AIFUTURE SERVICE OPERATIONS ──
exports.addServiceDescription = async (req, res) => {
  const { id, title, serviceName } = req.params;
  const { description } = req.body;
  
  if (!description) {
    return res.status(400).json({ success: false, error: 'description required' });
  }
  
  const result = await websiteModel.addServiceDescription(id, title, serviceName, description);
  res.status(result.success ? 200 : 400).json(result);
};

exports.addServiceTags = async (req, res) => {
  const { id, title, serviceName } = req.params;
  const { tags } = req.body;
  
  if (!tags) {
    return res.status(400).json({ success: false, error: 'tags required' });
  }
  
  const result = await websiteModel.addServiceTags(id, title, serviceName, tags);
  res.status(result.success ? 200 : 400).json(result);
};

exports.removeServiceTag = async (req, res) => {
  const { id, title, serviceName, tag } = req.params;
  
  if (!tag) {
    return res.status(400).json({ success: false, error: 'tag required' });
  }
  
  const result = await websiteModel.removeServiceTag(id, title, serviceName, tag);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getServiceDetails = async (req, res) => {
  const { id, title, serviceName } = req.params;
  const result = await websiteModel.getServiceDetails(id, title, serviceName);
  res.status(result.success ? 200 : 404).json(result);
};

exports.updateServiceItem = async (req, res) => {
  const { id, title, serviceName } = req.params;
  const result = await websiteModel.updateServiceItem(id, title, serviceName, req.body);
  res.status(result.success ? 200 : 400).json(result);
};

exports.deleteServiceItem = async (req, res) => {
  const { id, title, serviceName } = req.params;
  const result = await websiteModel.deleteServiceItem(id, title, serviceName);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getServicesByTag = async (req, res) => {
  const { id, tag } = req.params;
  const result = await websiteModel.getServicesByTag(id, tag);
  res.status(result.success ? 200 : 400).json(result);
};

// ── WEBSITE LEVEL TAG OPERATIONS ──
exports.addTagToWebsite = async (req, res) => {
  const { id } = req.params;
  const { tag } = req.body;
  if (!tag) return res.status(400).json({ success: false, error: 'tag required' });
  const result = await websiteModel.addTagToWebsite(id, tag);
  res.status(result.success ? 200 : 400).json(result);
};

exports.removeTagFromWebsite = async (req, res) => {
  const { id } = req.params;
  const { tag } = req.body;
  if (!tag) return res.status(400).json({ success: false, error: 'tag required' });
  const result = await websiteModel.removeTagFromWebsite(id, tag);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getWebsitesByTag = async (req, res) => {
  const { tag } = req.params;
  if (!tag) return res.status(400).json({ success: false, error: 'tag required' });
  const result = await websiteModel.getWebsitesByTag(tag);
  res.status(result.success ? 200 : 400).json(result);
};

exports.searchWebsitesByDescription = async (req, res) => {
  const { query } = req.query;
  if (!query) return res.status(400).json({ success: false, error: 'search query required' });
  try {
    const result = await websiteModel.getAllWebsites();
    if (!result.success || !result.items) return res.status(200).json({ success: true, items: [], count: 0 });
    const searchTerm = query.toLowerCase();
    const filteredItems = result.items.filter(website =>
      website.description && website.description.toLowerCase().includes(searchTerm)
    );
    res.status(200).json({ success: true, items: filteredItems, count: filteredItems.length, searchQuery: query });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── AIFUTURE OPERATIONS ──
exports.updateWebsiteAifuture = async (req, res) => {
  const { id } = req.params;
  const { aifuture } = req.body;
  if (aifuture === undefined) return res.status(400).json({ success: false, error: 'Missing aifuture data' });
  const result = await websiteModel.updateWebsiteAifuture(id, aifuture);
  res.status(result.success ? 200 : 400).json(result);
};

exports.addToAifuture = async (req, res) => {
  const { id } = req.params;
  const item = req.body;
  if (!item || (!item.title && !item.value)) return res.status(400).json({ success: false, error: 'Missing aifuture item data' });
  const result = await websiteModel.addToAifuture(id, item);
  res.status(result.success ? 200 : 400).json(result);
};

exports.updateAifutureItemByTitle = async (req, res) => {
  const { id, title } = req.params;
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ success: false, error: 'Missing value' });
  const result = await websiteModel.updateAifutureItemByTitle(id, title, value);
  res.status(result.success ? 200 : 404).json(result);
};

exports.deleteAifutureItemByTitle = async (req, res) => {
  const { id, title } = req.params;
  if (!title) return res.status(400).json({ success: false, error: 'Missing title' });
  const result = await websiteModel.deleteAifutureItemByTitle(id, title);
  res.status(result.success ? 200 : 404).json(result);
};

exports.deleteValueFromAifutureItem = async (req, res) => {
  const { id, title, value } = req.params;
  if (!title || !value) return res.status(400).json({ success: false, error: 'Missing title or value' });
  const result = await websiteModel.deleteValueFromAifutureItem(id, title, value);
  res.status(result.success ? 200 : 404).json(result);
};

exports.clearAifuture = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.clearAifuture(id);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getAifutureItemByTitle = async (req, res) => {
  const { id, title } = req.params;
  if (!title) return res.status(400).json({ success: false, error: 'Missing title' });
  const result = await websiteModel.getAifutureItemByTitle(id, title);
  res.status(result.success ? 200 : 404).json(result);
};

exports.getAllAifutureTitles = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.getAllAifutureTitles(id);
  res.status(result.success ? 200 : 404).json(result);
};

exports.getWebsiteAifuture = async (req, res) => {
  const { id } = req.params;
  const result = await websiteModel.getWebsiteById(id);
  if (!result.success) return res.status(404).json(result);
  res.status(200).json({ success: true, aifuture: result.item.aifuture || [] });
};

// ── USER-SPECIFIC OPERATIONS ──
exports.getWebsiteByIdAndUserId = async (req, res) => {
  const { id, userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.getWebsiteByIdAndUserId(id, userId);
  res.status(result.success ? 200 : 404).json(result);
};

exports.updateWebsiteByUserId = async (req, res) => {
  const { id, userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.updateWebsiteByUserId(id, req.body, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.deleteWebsiteByUserId = async (req, res) => {
  const { id, userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.deleteWebsiteByUserId(id, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getAllWebsitesByUserId = async (req, res) => {
  const { userId } = req.params;
  const isSuperAdmin = req.query.superadmin === 'true';
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.getAllWebsitesByUserId(userId, isSuperAdmin);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getWebsitesByUserId = async (req, res) => {
  const { userId } = req.params;
  const isSuperAdmin = req.query.superadmin === 'true';
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.getWebsitesByUserId(userId, isSuperAdmin);
  res.status(result.success ? 200 : 400).json(result);
};

exports.addRoleToWebsiteByUserId = async (req, res) => {
  const { id, userId } = req.params;
  const { role } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  if (!role) return res.status(400).json({ success: false, error: 'role required' });
  const result = await websiteModel.addRoleToWebsiteByUserId(id, role, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.removeRoleFromWebsiteByUserId = async (req, res) => {
  const { id, userId } = req.params;
  const { role } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  if (!role) return res.status(400).json({ success: false, error: 'role required' });
  const result = await websiteModel.removeRoleFromWebsiteByUserId(id, role, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.updateWebsiteAifutureByUserId = async (req, res) => {
  const { id, userId } = req.params;
  const { aifuture } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  if (aifuture === undefined) return res.status(400).json({ success: false, error: 'Missing aifuture data' });
  const result = await websiteModel.updateWebsiteAifutureByUserId(id, aifuture, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.updateWebsiteStatusByUserId = async (req, res) => {
  const { id, userId } = req.params;
  const { status } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const result = await websiteModel.updateWebsiteStatusByUserId(id, status, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getWebsitesByRoleAndUserId = async (req, res) => {
  const { userId } = req.params;
  const { role } = req.query;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  if (!role) return res.status(400).json({ success: false, error: 'role query required' });
  const result = await websiteModel.getWebsitesByRoleAndUserId(role, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.bulkDeleteWebsitesByUserId = async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.bulkDeleteWebsitesByUserId(userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.countWebsitesByUserId = async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.countWebsitesByUserId(userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getWebsitesWithoutUserId = async (req, res) => {
  const result = await websiteModel.getWebsitesWithoutUserId();
  res.status(result.success ? 200 : 400).json(result);
};

exports.assignUserToWebsite = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  const result = await websiteModel.assignUserToWebsite(id, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getWebsiteWithUser = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, error: 'userId query required' });
  const result = await websiteModel.getWebsiteByIdAndUserId(id, userId);
  res.status(result.success ? 200 : 404).json(result);
};

exports.updateWebsiteWithUser = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, error: 'userId query required' });
  const result = await websiteModel.updateWebsiteByUserId(id, req.body, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.deleteWebsiteWithUser = async (req, res) => {
  const { id } = req.params;
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ success: false, error: 'userId query required' });
  const result = await websiteModel.deleteWebsiteByUserId(id, userId);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getUserDashboardStats = async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  try {
    const countResult = await websiteModel.countWebsitesByUserId(userId);
    const websitesResult = await websiteModel.getAllWebsitesByUserId(userId);
    let activeCount = 0, inactiveCount = 0;
    if (websitesResult.success && websitesResult.items) {
      websitesResult.items.forEach(website => {
        if (website.status === 'active') activeCount++;
        else inactiveCount++;
      });
    }
    res.status(200).json({ success: true, userId, stats: { totalWebsites: countResult.count || 0, activeWebsites: activeCount, inactiveWebsites: inactiveCount }, websites: websitesResult.success ? websitesResult.items.slice(0, 5) : [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.searchWebsitesByUserId = async (req, res) => {
  const { userId } = req.params;
  const { query } = req.query;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  if (!query) return res.status(400).json({ success: false, error: 'search query required' });
  try {
    const result = await websiteModel.getAllWebsitesByUserId(userId);
    if (!result.success || !result.items) return res.status(200).json({ success: true, items: [], count: 0 });
    const searchTerm = query.toLowerCase();
    const filteredItems = result.items.filter(website =>
      (website.websiteName && website.websiteName.toLowerCase().includes(searchTerm)) ||
      (website.websiteUrl && website.websiteUrl.toLowerCase().includes(searchTerm)) ||
      (website.id && website.id.toLowerCase().includes(searchTerm)) ||
      (website.description && website.description.toLowerCase().includes(searchTerm))
    );
    res.status(200).json({ success: true, items: filteredItems, count: filteredItems.length, userId, searchQuery: query });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.getApiKeyAndWebsiteName = async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  try {
    const result = await websiteModel.getApiKeyAndWebsiteNameByUserId(userId);
    if (!result.success) return res.status(404).json(result);
    res.status(200).json({ success: true, userId, credentials: result.credentials || result.data || [], count: result.count, totalToken: result.totalTokens });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ── STATUS WITH ROLE LOCK ──
exports.updateWebsiteStatusRoleAware = async (req, res) => {
  const { id } = req.params;
  const { status, changedBy } = req.body;
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  if (!['superadmin', 'admin'].includes(changedBy)) return res.status(400).json({ success: false, error: 'Invalid changedBy' });
  const result = await websiteModel.updateWebsiteStatusRoleAware(id, status, changedBy);
  if (!result.success && result.locked) return res.status(403).json(result);
  res.status(result.success ? 200 : 400).json(result);
};

exports.updateWebsiteStatusByUserIdRoleAware = async (req, res) => {
  const { id, userId } = req.params;
  const { status, changedBy } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  if (!['active', 'inactive'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
  if (!['superadmin', 'admin'].includes(changedBy)) return res.status(400).json({ success: false, error: 'Invalid changedBy' });
  if (changedBy === 'admin') {
    const existing = await websiteModel.getWebsiteByIdAndUserId(id, userId);
    if (!existing.success) return res.status(403).json({ success: false, error: 'Not authorized' });
  }
  const result = await websiteModel.updateWebsiteStatusRoleAware(id, status, changedBy);
  if (!result.success && result.locked) return res.status(403).json(result);
  res.status(result.success ? 200 : 400).json(result);
};

exports.getPrimaryApiKeyAndWebsiteName = async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
  try {
    const result = await websiteModel.getApiKeyAndWebsiteNameByUserId(userId);
    if (!result.success || !result.credentials || result.credentials.length === 0) return res.status(404).json({ success: false, error: `No websites found for user: ${userId}` });
    res.status(200).json({ success: true, userId, apiKey: result.credentials[0].apiKey, websiteName: result.credentials[0].websiteName });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};