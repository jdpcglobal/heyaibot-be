const CodeConfig = require("../models/CodeConfig");

const codeConfigController = {
  async createConfig(req, res) {
    try {
      const { apiKey, superAdminUrl, superAdminChatUrl, integrationCode, websiteName } = req.body;
      if (!apiKey) return res.status(400).json({ success: false, message: "API Key is required" });

      const configData = { apiKey, superAdminUrl, superAdminChatUrl, integrationCode, websiteName };
      const result = await CodeConfig.saveConfig(configData);

      res.status(201).json({ success: true, message: "Configuration saved", data: result.data });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getConfig(req, res) {
    try {
      const { apiKey } = req.params;
      if (!apiKey) return res.status(400).json({ success: false, message: "API Key is required" });

      const config = await CodeConfig.getConfigByApiKey(apiKey);
      if (!config) return res.status(404).json({ success: false, message: "Configuration not found" });

      res.status(200).json({ success: true, data: config });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async updateConfig(req, res) {
    try {
      const { apiKey } = req.params;
      const updateData = req.body;

      const result = await CodeConfig.updateConfig(apiKey, updateData);
      res.status(200).json({ success: true, message: "Configuration updated", data: result.data });
    } catch (err) {
      if (err.message === "Configuration not found")
        return res.status(404).json({ success: false, message: err.message });
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async deleteConfig(req, res) {
    try {
      const { apiKey } = req.params;
      await CodeConfig.deleteConfig(apiKey);
      res.status(200).json({ success: true, message: "Deleted successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getAllConfigs(req, res) {
    try {
      const configs = await CodeConfig.getAllConfigs();
      res.status(200).json({ success: true, count: configs.length, data: configs });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

module.exports = codeConfigController;
