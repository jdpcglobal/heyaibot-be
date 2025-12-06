const model = require("../models/promptsModel");

// ✅ Health check
exports.healthCheck = (req, res) => {
  res.status(200).json({ message: "ChildPrompt API is running ✅" });
};

// ✅ Save or update prompt with API keys array
exports.savePromptSet = async (req, res) => {
  try {
    const result = await model.saveOrUpdatePromptSet(req.body);
    res.status(200).json({ message: "Saved successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get a single prompt set
exports.getPromptSet = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const result = await model.getPromptSet(websiteId, promptName);
    if (!result) return res.status(404).json({ error: "Not found" });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Validate API key
exports.validateApiKey = async (req, res) => {
  try {
    const { websiteId, promptName, apiKey } = req.params;
    const result = await model.validateApiKey(websiteId, promptName, apiKey);
    
    if (!result.valid) {
      return res.status(401).json({ error: result.message });
    }
    
    res.json({ valid: true, data: result.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Add API key to array
exports.addApiKey = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: "apiKey is required" });
    }
    
    const result = await model.addApiKey(websiteId, promptName, apiKey);
    res.json({ message: "API key added successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Remove API key from array
exports.removeApiKey = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: "apiKey is required" });
    }
    
    const result = await model.removeApiKey(websiteId, promptName, apiKey);
    res.json({ message: "API key removed successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update entire API keys array
exports.updateApiKeys = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const { apiKeys } = req.body;
    
    const result = await model.updateApiKeys(websiteId, promptName, apiKeys);
    res.json({ message: "API keys updated successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ List all prompt sets for a website
exports.listPromptSets = async (req, res) => {
  try {
    const { websiteId } = req.params;
    const result = await model.listPromptSets(websiteId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update prompt details
exports.updatePromptSet = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const result = await model.updatePromptSet(websiteId, promptName, req.body);
    res.json({ message: "Updated successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update prompt name
exports.updatePromptName = async (req, res) => {
  try {
    const { websiteId, oldPromptName } = req.params;
    const { newPromptName } = req.body;

    if (!newPromptName) {
      return res.status(400).json({ error: "newPromptName is required" });
    }

    const result = await model.updatePromptName(websiteId, oldPromptName, newPromptName);
    res.json({ message: "Prompt name updated successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete prompt set
exports.deletePromptSet = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const result = await model.deletePromptSet(websiteId, promptName);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};