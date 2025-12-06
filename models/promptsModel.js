const {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} = require("@aws-sdk/lib-dynamodb");
const dynamo = require("../config/dynamoClient");

const TABLE_NAME = "Childprompt";

/**
 * ✅ Save or Update a prompt set with API keys array
 */
exports.saveOrUpdatePromptSet = async (data) => {
  const now = new Date().toISOString();
  const item = {
    pk: `website#${data.websiteId}`,
    sk: `prompt#${data.promptName}`,
    websiteId: data.websiteId,
    promptName: data.promptName,
    promptList: data.promptList || [],
    prompts: data.prompts || [],
    urls: data.urls || [],
    apiKeys: data.apiKeys || [], // Changed to array like urls
    createdAt: now,
    updatedAt: now,
  };

  await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
};

/**
 * ✅ Get a single prompt set
 */
exports.getPromptSet = async (websiteId, promptName) => {
  const pk = `website#${websiteId}`;
  const sk = `prompt#${promptName}`;

  const result = await dynamo.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { pk, sk } })
  );
  return result.Item;
};

/**
 * ✅ Validate if API key exists in the array
 */
exports.validateApiKey = async (websiteId, promptName, apiKey) => {
  const promptSet = await this.getPromptSet(websiteId, promptName);
  
  if (!promptSet) {
    return { valid: false, message: "Prompt set not found" };
  }
  
  if (!promptSet.apiKeys || promptSet.apiKeys.length === 0) {
    return { valid: false, message: "No API keys configured" };
  }
  
  if (!promptSet.apiKeys.includes(apiKey)) {
    return { valid: false, message: "Invalid API key" };
  }
  
  return { valid: true, data: promptSet };
};

/**
 * ✅ Add API key to array
 */
exports.addApiKey = async (websiteId, promptName, apiKey) => {
  websiteId = websiteId.trim();
  promptName = promptName.trim();
  
  const pk = `website#${websiteId}`;
  const sk = `prompt#${promptName}`;
  const now = new Date().toISOString();

  const result = await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
      UpdateExpression: "SET apiKeys = list_append(if_not_exists(apiKeys, :emptyList), :apiKey), updatedAt = :ua",
      ExpressionAttributeValues: {
        ":apiKey": [apiKey], // Add as array element
        ":emptyList": [],
        ":ua": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};

/**
 * ✅ Remove API key from array
 */
exports.removeApiKey = async (websiteId, promptName, apiKey) => {
  websiteId = websiteId.trim();
  promptName = promptName.trim();
  
  // First get current apiKeys
  const promptSet = await this.getPromptSet(websiteId, promptName);
  
  if (!promptSet || !promptSet.apiKeys) {
    throw new Error("Prompt set not found or no API keys configured");
  }
  
  // Filter out the apiKey to remove
  const updatedApiKeys = promptSet.apiKeys.filter(key => key !== apiKey);
  
  const pk = `website#${websiteId}`;
  const sk = `prompt#${promptName}`;
  const now = new Date().toISOString();

  const result = await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
      UpdateExpression: "SET apiKeys = :ak, updatedAt = :ua",
      ExpressionAttributeValues: {
        ":ak": updatedApiKeys,
        ":ua": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};

/**
 * ✅ Update entire API keys array
 */
exports.updateApiKeys = async (websiteId, promptName, apiKeys) => {
  websiteId = websiteId.trim();
  promptName = promptName.trim();

  const pk = `website#${websiteId}`;
  const sk = `prompt#${promptName}`;
  const now = new Date().toISOString();

  const result = await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
      UpdateExpression: "SET apiKeys = :ak, updatedAt = :ua",
      ExpressionAttributeValues: {
        ":ak": apiKeys || [],
        ":ua": now,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};

/**
 * ✅ List all prompt sets for a website
 */
exports.listPromptSets = async (websiteId) => {
  const result = await dynamo.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
      ExpressionAttributeValues: { 
        ":pk": `website#${websiteId}`,
        ":sk": "prompt#"
      },
    })
  );
  return result.Items || [];
};

/**
 * ✅ Update prompt name
 */
exports.updatePromptName = async (websiteId, oldPromptName, newPromptName) => {
  websiteId = websiteId.trim();
  oldPromptName = oldPromptName.trim();
  newPromptName = newPromptName.trim();

  const pk = `website#${websiteId}`;
  const oldSk = `prompt#${oldPromptName}`;
  const now = new Date().toISOString();

  const { Item } = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: oldSk },
    })
  );

  if (!Item) {
    throw new Error(`Prompt "${oldPromptName}" not found for website ${websiteId}`);
  }

  const newSk = `prompt#${newPromptName}`;
  const existing = await dynamo.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk: newSk },
    })
  );

  if (existing.Item) {
    throw new Error(`Prompt "${newPromptName}" already exists for website ${websiteId}`);
  }

  const newItem = {
    ...Item,
    sk: newSk,
    promptName: newPromptName,
    updatedAt: now,
  };

  await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: newItem }));
  await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk, sk: oldSk } }));

  return newItem;
};

/**
 * ✅ Update prompt details
 */
exports.updatePromptSet = async (websiteId, promptName, updateData) => {
  websiteId = websiteId.trim();
  promptName = promptName.trim();

  const pk = `website#${websiteId}`;
  const sk = `prompt#${promptName}`;
  const now = new Date().toISOString();

  let updateExpression = "set updatedAt = :ua";
  const expressionAttributeValues = {
    ":ua": now,
  };

  if (updateData.promptList !== undefined) {
    updateExpression += ", promptList = :pl";
    expressionAttributeValues[":pl"] = updateData.promptList;
  }
  
  if (updateData.prompts !== undefined) {
    updateExpression += ", prompts = :p";
    expressionAttributeValues[":p"] = updateData.prompts;
  }
  
  if (updateData.urls !== undefined) {
    updateExpression += ", urls = :u";
    expressionAttributeValues[":u"] = updateData.urls;
  }
  
  if (updateData.apiKeys !== undefined) {
    updateExpression += ", apiKeys = :ak";
    expressionAttributeValues[":ak"] = updateData.apiKeys;
  }

  const result = await dynamo.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { pk, sk },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};

/**
 * ✅ Delete a prompt set
 */
exports.deletePromptSet = async (websiteId, promptName) => {
  websiteId = websiteId.trim();
  promptName = promptName.trim();

  const pk = `website#${websiteId}`;
  const sk = `prompt#${promptName}`;

  await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { pk, sk } }));
  return { message: "Prompt deleted successfully" };
};