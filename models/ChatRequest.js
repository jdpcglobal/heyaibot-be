// models/ChatRequest.js
const dynamo = require('../config/dynamoClient');

const TABLE_NAME = "ChatRequest";
const { 
  PutCommand, 
  GetCommand, 
  QueryCommand, 
  UpdateCommand, 
  DeleteCommand,
  ScanCommand
} = require('@aws-sdk/lib-dynamodb');

class ChatRequest {
  // Create new chat request
  static async create(chatData) {
    const {
      websiteId,
      collectedData,
      backendApiKey,
      status = 'pending',
      createdAt = new Date().toISOString(),
      updatedAt = new Date().toISOString()
    } = chatData;

    // Generate unique ID
    const id = `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const item = {
      id,
      type: 'chat-request',
      websiteId,
      collectedData: this.formatCollectedData(collectedData),
      backendApiKey,
      status,
      createdAt,
      updatedAt
    };

    const params = {
      TableName: TABLE_NAME,
      Item: item
    };

    try {
      await dynamo.send(new PutCommand(params));
      console.log('✅ Chat request saved to DynamoDB:', id);
      
      // Return only required fields
      return {
        id: item.id,
        type: item.type,
        status: item.status,
        createdAt: item.createdAt,
        collectedData: item.collectedData
      };
    } catch (error) {
      console.error('❌ DynamoDB Put Error:', error);
      throw new Error(`Error creating chat request: ${error.message}`);
    }
  }

  // Format collected data for better storage
  static formatCollectedData(collectedData) {
    if (typeof collectedData === 'string') {
      try {
        collectedData = JSON.parse(collectedData);
      } catch {
        return { customData: collectedData };
      }
    }

    if (typeof collectedData !== 'object' || collectedData === null) {
      return { customData: collectedData };
    }

    return collectedData;
  }

  // Get chat requests by website ID - NO LIMIT
  static async getByWebsiteId(websiteId) {
    try {
      const params = {
        TableName: TABLE_NAME,
        IndexName: 'websiteId-index',
        KeyConditionExpression: 'websiteId = :websiteId',
        ExpressionAttributeValues: {
          ':websiteId': websiteId
        },
        ScanIndexForward: false // newest first
      };

      const result = await dynamo.send(new QueryCommand(params));
      
      // Map to return only required fields
      const items = (result.Items || []).map(item => ({
        id: item.id,
        type: item.type,
        status: item.status,
        createdAt: item.createdAt,
        collectedData: item.collectedData
      }));
      
      console.log(`✅ Found ${items.length} records for websiteId: ${websiteId}`);
      return items;
    } catch (error) {
      console.error('❌ GSI Query failed, falling back to scan:', error.message);
      return await this.getAll();
    }
  }

  // Get chat requests by backendApiKey - NO LIMIT
  static async getByBackendApiKey(backendApiKey) {
    try {
      // Try using GSI first
      try {
        const params = {
          TableName: TABLE_NAME,
          IndexName: 'backendApiKey-index',
          KeyConditionExpression: 'backendApiKey = :backendApiKey',
          ExpressionAttributeValues: {
            ':backendApiKey': backendApiKey
          },
          ScanIndexForward: false // newest first
        };

        const result = await dynamo.send(new QueryCommand(params));
        
        // Map to return only required fields
        const items = (result.Items || []).map(item => ({
          id: item.id,
          type: item.type,
          status: item.status,
          createdAt: item.createdAt,
          collectedData: item.collectedData
        }));
        
        console.log(`✅ Found ${items.length} records for backendApiKey via GSI`);
        return items;
        
      } catch (gsiError) {
        console.error('❌ BackendApiKey GSI Query failed, falling back to scan:', gsiError.message);
        
        // Fallback to scan - NO LIMIT
        const scanParams = {
          TableName: TABLE_NAME,
          FilterExpression: 'backendApiKey = :backendApiKey',
          ExpressionAttributeValues: {
            ':backendApiKey': backendApiKey
          }
        };

        const scanResult = await dynamo.send(new ScanCommand(scanParams));
        
        // Map to return only required fields
        const items = (scanResult.Items || []).map(item => ({
          id: item.id,
          type: item.type,
          status: item.status,
          createdAt: item.createdAt,
          collectedData: item.collectedData
        }));
        
        console.log(`✅ Found ${items.length} records via scan`);
        return items;
      }
    } catch (error) {
      console.error('❌ Error fetching by backendApiKey:', error);
      throw new Error(`Error fetching chat requests by backendApiKey: ${error.message}`);
    }
  }

  // Get chat request by ID with only required fields
  static async getById(id) {
    const params = {
      TableName: TABLE_NAME,
      Key: { id }
    };

    try {
      const result = await dynamo.send(new GetCommand(params));
      if (!result.Item) return null;
      
      // Return only required fields
      return {
        id: result.Item.id,
        type: result.Item.type,
        status: result.Item.status,
        createdAt: result.Item.createdAt,
        collectedData: result.Item.collectedData
      };
    } catch (error) {
      console.error('❌ DynamoDB Get Error:', error);
      throw new Error(`Error fetching chat request: ${error.message}`);
    }
  }

  // Update chat request status
  static async updateStatus(id, status) {
    const validStatuses = ['pending', 'confirmed', 'cancelled', 'completed'];
    
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    const params = {
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: {
        '#status': 'status'
      },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };

    try {
      const result = await dynamo.send(new UpdateCommand(params));
      
      // Return only required fields
      return {
        id: result.Attributes.id,
        type: result.Attributes.type,
        status: result.Attributes.status,
        createdAt: result.Attributes.createdAt,
        collectedData: result.Attributes.collectedData
      };
    } catch (error) {
      console.error('❌ DynamoDB Update Error:', error);
      throw new Error(`Error updating chat request: ${error.message}`);
    }
  }

  // Get all chat requests - NO LIMIT
  static async getAll(status = null, backendApiKey = null) {
    try {
      let params = {
        TableName: TABLE_NAME
      };

      // Add filters if provided
      let filterExpressions = [];
      let expressionAttributeValues = {};
      let expressionAttributeNames = {};

      if (status) {
        filterExpressions.push('#status = :status');
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = status;
      }

      if (backendApiKey) {
        filterExpressions.push('backendApiKey = :backendApiKey');
        expressionAttributeValues[':backendApiKey'] = backendApiKey;
      }

      if (filterExpressions.length > 0) {
        params.FilterExpression = filterExpressions.join(' AND ');
        params.ExpressionAttributeValues = expressionAttributeValues;
        if (Object.keys(expressionAttributeNames).length > 0) {
          params.ExpressionAttributeNames = expressionAttributeNames;
        }
      }

      const result = await dynamo.send(new ScanCommand(params));
      
      // Map to return only required fields
      const items = (result.Items || []).map(item => ({
        id: item.id,
        type: item.type,
        status: item.status,
        createdAt: item.createdAt,
        collectedData: item.collectedData
      }));
      
      console.log(`✅ Found ${items.length} total records`);
      return items;
    } catch (error) {
      console.error('❌ Scan failed:', error);
      throw new Error(`Error fetching all chat requests: ${error.message}`);
    }
  }

  // Get chat requests by status - NO LIMIT
  static async getByStatus(status) {
    try {
      const allRequests = await this.getAll();
      const filtered = allRequests.filter(req => req.status === status);
      console.log(`✅ Found ${filtered.length} records with status: ${status}`);
      return filtered;
    } catch (error) {
      console.error('❌ Status query failed:', error);
      throw new Error(`Error fetching chat requests by status: ${error.message}`);
    }
  }

  // Delete chat request
  static async delete(id) {
    const params = {
      TableName: TABLE_NAME,
      Key: { id }
    };

    try {
      await dynamo.send(new DeleteCommand(params));
      console.log('✅ Chat request deleted:', id);
      return { message: 'Chat request deleted successfully' };
    } catch (error) {
      console.error('❌ DynamoDB Delete Error:', error);
      throw new Error(`Error deleting chat request: ${error.message}`);
    }
  }

  // Get count by backendApiKey
  static async getCountByBackendApiKey(backendApiKey) {
    try {
      // Try using GSI first
      try {
        const params = {
          TableName: TABLE_NAME,
          IndexName: 'backendApiKey-index',
          KeyConditionExpression: 'backendApiKey = :backendApiKey',
          ExpressionAttributeValues: {
            ':backendApiKey': backendApiKey
          },
          Select: 'COUNT'
        };

        const result = await dynamo.send(new QueryCommand(params));
        console.log(`✅ Count for ${backendApiKey}: ${result.Count || 0}`);
        return result.Count || 0;
      } catch (gsiError) {
        // Fallback to scan
        const scanParams = {
          TableName: TABLE_NAME,
          FilterExpression: 'backendApiKey = :backendApiKey',
          ExpressionAttributeValues: {
            ':backendApiKey': backendApiKey
          },
          Select: 'COUNT'
        };

        const scanResult = await dynamo.send(new ScanCommand(scanParams));
        console.log(`✅ Count via scan: ${scanResult.Count || 0}`);
        return scanResult.Count || 0;
      }
    } catch (error) {
      console.error('❌ Error counting by backendApiKey:', error);
      throw new Error(`Error counting chat requests: ${error.message}`);
    }
  }

  // Test connection and table
  static async testConnection() {
    try {
      const result = await dynamo.send(new ScanCommand({
        TableName: TABLE_NAME,
        Limit: 1
      }));
      return { connected: true, items: result.Items || [] };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

module.exports = ChatRequest;