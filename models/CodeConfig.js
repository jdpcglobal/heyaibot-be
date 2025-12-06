const {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const dynamo = require("../config/dynamoClient");

const TABLE_NAME = "CodeConfigurations";

class CodeConfig {
  // 🟢 Create or update configuration
  static async saveConfig(configData) {
    const item = {
      apiKey: configData.apiKey,
      superAdminUrl: configData.superAdminUrl || "",
      superAdminChatUrl: configData.superAdminChatUrl || "",
      integrationCode: configData.integrationCode || "",
      websiteName: configData.websiteName || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const params = {
      TableName: TABLE_NAME,
      Item: item,
    };

    try {
      await dynamo.send(new PutCommand(params));
      return { success: true, data: item };
    } catch (error) {
      console.error("❌ DynamoDB PutCommand Error:", error);
      throw new Error(`Error saving configuration: ${error.message}`);
    }
  }

  // 🟢 Get configuration by apiKey
  static async getConfigByApiKey(apiKey) {
    const params = {
      TableName: TABLE_NAME,
      Key: { apiKey },
    };

    try {
      const result = await dynamo.send(new GetCommand(params));
      return result.Item || null;
    } catch (error) {
      console.error("❌ DynamoDB GetCommand Error:", error);
      throw new Error(`Error fetching configuration: ${error.message}`);
    }
  }

  // 🟢 Update configuration
  static async updateConfig(apiKey, updateData) {
    const existing = await this.getConfigByApiKey(apiKey);
    if (!existing) throw new Error("Configuration not found");

    let updateExp = "SET updatedAt = :updatedAt";
    const exprAttr = { ":updatedAt": new Date().toISOString() };

    for (const [key, value] of Object.entries(updateData)) {
      updateExp += `, ${key} = :${key}`;
      exprAttr[`:${key}`] = value;
    }

    const params = {
      TableName: TABLE_NAME,
      Key: { apiKey },
      UpdateExpression: updateExp,
      ExpressionAttributeValues: exprAttr,
      ReturnValues: "ALL_NEW",
    };

    try {
      const result = await dynamo.send(new UpdateCommand(params));
      return { success: true, data: result.Attributes };
    } catch (error) {
      console.error("❌ DynamoDB UpdateCommand Error:", error);
      throw new Error(`Error updating configuration: ${error.message}`);
    }
  }

  // 🟢 Delete configuration
  static async deleteConfig(apiKey) {
    const params = {
      TableName: TABLE_NAME,
      Key: { apiKey },
    };

    try {
      await dynamo.send(new DeleteCommand(params));
      return { success: true, message: "Configuration deleted" };
    } catch (error) {
      console.error("❌ DynamoDB DeleteCommand Error:", error);
      throw new Error(`Error deleting configuration: ${error.message}`);
    }
  }

  // 🟢 Get all configurations
  static async getAllConfigs() {
    const params = { TableName: TABLE_NAME };
    try {
      const result = await dynamo.send(new ScanCommand(params));
      return result.Items || [];
    } catch (error) {
      console.error("❌ DynamoDB ScanCommand Error:", error);
      throw new Error(`Error fetching all configurations: ${error.message}`);
    }
  }
}

module.exports = CodeConfig;
