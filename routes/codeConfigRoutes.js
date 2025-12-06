const express = require("express");
const router = express.Router();
const codeConfigController = require("../controllers/codeConfigController");

router.post("/", codeConfigController.createConfig);
router.get("/", codeConfigController.getAllConfigs);
router.get("/:apiKey", codeConfigController.getConfig);
router.put("/:apiKey", codeConfigController.updateConfig);
router.delete("/:apiKey", codeConfigController.deleteConfig);

module.exports = router;
