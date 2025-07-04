const dynamo = require('../dynamoClient');
const { v4: uuidv4 } = require('uuid');
const {
  PutCommand,
  GetCommand,
  DeleteCommand,
  UpdateCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'Websites';

// CREATE
const saveWebsite = async (data) => {
  const timestamp = new Date().toISOString();

  const item = {
    id: uuidv4(),
    websiteName: data.websiteName,
    websiteUrl: data.websiteUrl,
    systemPrompt: data.systemPrompt, // ✅ changed from description
    customPrompt: data.customPrompt || [], // ✅ changed from keywords
    status: data.status || 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    });
    await dynamo.send(command);
    return { success: true, message: 'Website saved', item };
  } catch (error) {
    return { success: false, error };
  }
};

// READ ALL
const getAllWebsites = async () => {
  try {
    const command = new ScanCommand({ TableName: TABLE_NAME });
    const result = await dynamo.send(command);
    return { success: true, items: result.Items };
  } catch (error) {
    return { success: false, error };
  }
};

// READ ONE
const getWebsiteById = async (id) => {
  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { id },
    });
    const result = await dynamo.send(command);
    return result.Item
      ? { success: true, item: result.Item }
      : { success: false, error: 'Website not found' };
  } catch (error) {
    return { success: false, error };
  }
};

// UPDATE
const updateWebsite = async (id, data) => {
  const timestamp = new Date().toISOString();

  const command = new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { id },
    UpdateExpression: `
      SET websiteName = :name,
          websiteUrl = :url,
          systemPrompt = :sys,
          customPrompt = :custom,
          #st = :status,
          updatedAt = :updatedAt
    `,
    ExpressionAttributeValues: {
      ':name': data.websiteName,
      ':url': data.websiteUrl,
      ':sys': data.systemPrompt,
      ':custom': data.customPrompt || [],
      ':status': data.status || 'active',
      ':updatedAt': timestamp,
    },
    ExpressionAttributeNames: {
      '#st': 'status', // Reserved keyword
    },
    ReturnValues: 'ALL_NEW',
  });

  try {
    const result = await dynamo.send(command);
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error };
  }
};

// DELETE
const deleteWebsite = async (id) => {
  try {
    const command = new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { id },
    });
    await dynamo.send(command);
    return { success: true, message: 'Website deleted' };
  } catch (error) {
    return { success: false, error };
  }
};

module.exports = {
  saveWebsite,
  getAllWebsites,
  getWebsiteById,
  updateWebsite,
  deleteWebsite,
};
