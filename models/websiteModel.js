const dynamo = require('../config/dynamoClient');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, GetCommand, DeleteCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'Websites';

// CREATE
const saveWebsite = async (data) => {
  const timestamp = new Date().toISOString();
  const item = {
    id: data.id || uuidv4(),
    websiteName: data.websiteName || '',
    websiteUrl: data.websiteUrl || '',
    systemPrompt: Array.isArray(data.systemPrompt) ? data.systemPrompt : [],
    customPrompt: Array.isArray(data.customPrompt) ? data.customPrompt : [],
    category: Array.isArray(data.category) ? data.category : ['General'],
    urls: Array.isArray(data.urls) ? data.urls : [],
    library: Array.isArray(data.library) ? data.library : [],
    apiKey: data.apiKey || uuidv4(),
    status: data.status || 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    await dynamo.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    return { success: true, message: 'Website saved', item };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// READ ALL - With API Key Filtering
const getAllWebsites = async (apiKey = null) => {
  try {
    if (apiKey) {
      // Use Scan with FilterExpression as temporary solution
      const result = await dynamo.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'apiKey = :apiKey',
        ExpressionAttributeValues: {
          ':apiKey': apiKey
        }
      }));
      
      return { 
        success: true, 
        items: result.Items || [],
        message: result.Items && result.Items.length > 0 
          ? 'Website found' 
          : 'No website found with this API key'
      };
    } else {
      // If no API key, get all websites
      const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
      return { 
        success: true, 
        items: result.Items || [],
        message: result.Items && result.Items.length > 0 
          ? 'All websites retrieved' 
          : 'No websites found'
      };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// READ ONE BY ID
const getWebsiteById = async (id) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    return result.Item ? { success: true, item: result.Item } : { success: false, error: 'Website not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// READ ONE BY API KEY (using Scan as temporary solution)
const getWebsiteByApiKey = async (apiKey) => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'apiKey = :apiKey',
      ExpressionAttributeValues: {
        ':apiKey': apiKey
      }
    }));
    
    return result.Items && result.Items.length > 0 
      ? { success: true, item: result.Items[0] } 
      : { success: false, error: 'No website found with this API key' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// GET WEBSITE BY API KEY ONLY (returns single item)
const getWebsiteDataByApiKey = async (apiKey) => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'apiKey = :apiKey',
      ExpressionAttributeValues: {
        ':apiKey': apiKey
      }
    }));
    
    if (result.Items && result.Items.length > 0) {
      return { 
        success: true, 
        data: result.Items[0],
        message: 'Website data retrieved successfully'
      };
    } else {
      return { 
        success: false, 
        error: 'No website found with this API key',
        data: null
      };
    }
  } catch (error) {
    return { success: false, error: error.message, data: null };
  }
};

// UPDATE FULL WEBSITE BY ID
const updateWebsite = async (id, data) => {
  const timestamp = new Date().toISOString();
  try {
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: `
          SET websiteName = :name,
              websiteUrl = :url,
              systemPrompt = :sys,
              customPrompt = :custom,
              category = :cat,
              urls = :urls,
              library = :lib,
              #st = :status,
              updatedAt = :updatedAt
        `,
        ExpressionAttributeValues: {
          ':name': data.websiteName || '',
          ':url': data.websiteUrl || '',
          ':sys': Array.isArray(data.systemPrompt) ? data.systemPrompt : [],
          ':custom': Array.isArray(data.customPrompt) ? data.customPrompt : [],
          ':cat': Array.isArray(data.category) ? data.category : ['General'],
          ':urls': Array.isArray(data.urls) ? data.urls : [],
          ':lib': Array.isArray(data.library) ? data.library : [],
          ':status': data.status || 'active',
          ':updatedAt': timestamp,
        },
        ExpressionAttributeNames: { '#st': 'status' },
        ReturnValues: 'ALL_NEW',
      })
    );
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// UPDATE CUSTOM DATA ONLY BY ID
const updateWebsiteCustomData = async (id, data) => {
  const timestamp = new Date().toISOString();
  try {
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: `
          SET customPrompt = :customPrompt,
              urls = :urls,
              library = :library,
              updatedAt = :updatedAt
        `,
        ExpressionAttributeValues: {
          ':customPrompt': Array.isArray(data.customPrompt) ? data.customPrompt : [],
          ':urls': Array.isArray(data.urls) ? data.urls : [],
          ':library': Array.isArray(data.library) ? data.library : [],
          ':updatedAt': timestamp,
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// UPDATE STATUS ONLY BY ID
const updateWebsiteStatus = async (id, status) => {
  const timestamp = new Date().toISOString();
  try {
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET #st = :status, updatedAt = :updatedAt',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: { ':status': status, ':updatedAt': timestamp },
        ReturnValues: 'ALL_NEW',
      })
    );
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// DELETE BY ID
const deleteWebsite = async (id) => {
  try {
    await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id } }));
    return { success: true, message: 'Website deleted' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

module.exports = {
  saveWebsite,
  getAllWebsites,
  getWebsiteById,
  getWebsiteByApiKey,
  getWebsiteDataByApiKey,
  updateWebsite,
  updateWebsiteCustomData,
  updateWebsiteStatus,
  deleteWebsite,
};