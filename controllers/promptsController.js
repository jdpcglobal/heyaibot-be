const model = require("../models/promptsModel");

const fetch = require('node-fetch');
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

// ✅ Add a single prompt to promptsWithParams array
exports.addPromptWithParams = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const { promptname, key } = req.body;
    
    if (!promptname) {
      return res.status(400).json({ error: "promptname is required" });
    }
    
    if (!key) {
      return res.status(400).json({ error: "key is required" });
    }
    
    const promptData = { promptname, key };
    const result = await model.addPromptWithParams(websiteId, promptName, promptData);
    
    res.json({ message: "Prompt added successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Remove a single prompt from promptsWithParams array
exports.removePromptWithParams = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const { promptname } = req.body;
    
    if (!promptname) {
      return res.status(400).json({ error: "promptname is required" });
    }
    
    const result = await model.removePromptWithParams(websiteId, promptName, promptname);
    res.json({ message: "Prompt removed successfully", data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get a specific prompt from promptsWithParams array
exports.getPromptWithParams = async (req, res) => {
  try {
    const { websiteId, promptName, promptname } = req.params;
    const result = await model.getPromptWithParams(websiteId, promptName, promptname);
    
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

// ✅ Update a specific prompt in promptsWithParams array
exports.updatePromptWithParams = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const { promptname, key } = req.body;
    
    if (!promptname) {
      return res.status(400).json({ error: "promptname is required" });
    }
    
    const newPromptData = {};
    if (key !== undefined) newPromptData.key = key;
    
    const result = await model.updatePromptWithParams(
      websiteId, 
      promptName, 
      promptname, 
      newPromptData
    );
    
    res.json({ message: "Prompt updated successfully", data: result });
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
// ✅ Add backend API key
exports.addBackendApiKey = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const { backendApiKey } = req.body;
    
    if (!backendApiKey) {
      return res.status(400).json({ error: "backendApiKey is required" });
    }
    
    const result = await model.addBackendApiKey(websiteId, promptName, backendApiKey);
    res.json({ 
      message: "Backend API key added successfully", 
      data: result 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete backend API key
exports.deleteBackendApiKey = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const result = await model.deleteBackendApiKey(websiteId, promptName);
    
    res.json({ 
      message: "Backend API key deleted successfully", 
      data: result 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get by backend API key
exports.getByBackendApiKey = async (req, res) => {
  try {
    const { backendApiKey } = req.params;
    const result = await model.getByBackendApiKey(backendApiKey);
  
    if (!result.length) {
      return res.status(404).json({ 
        error: "No data found for this backend API key" 
      });
    }
    
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};



// ✅ Get filtered prompt set
exports.getFilteredPromptSet = async (req, res) => {
  try {
    const { websiteId, promptName } = req.params;
    const result = await model.getPromptSet(websiteId, promptName);

    if (!result) {
      return res.status(404).json({ error: "Prompt set not found" });
    }

    // Only return filtered fields
    const filteredData = {
      backendApiKey: result.backendApiKey,
      summaryList: result.summaryList,
      promptName: result.promptName,
      prompts: result.prompts,
      promptsWithParams: result.promptsWithParams,
      websiteId: result.websiteId
    };

    res.json(filteredData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


