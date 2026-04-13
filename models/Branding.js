const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({
  region: process.env.REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
  }
});

const dynamoDB = DynamoDBDocumentClient.from(client);
const TABLE_NAME = 'branding-settings';

class Branding {
  constructor(data = {}) {
    this.apiKey = data.apiKey;
    this.headerColor = data.headerColor || '#ff6347';
    // ✅ NEW FIELDS
    this.poweredByText = data.poweredByText || 'JDPC Global';
    this.poweredByUrl = data.poweredByUrl || 'https://jdpcglobal.com';
    this.createdAt = data.createdAt || new Date().toISOString();
    this.updatedAt = data.updatedAt || new Date().toISOString();
  }

  async save() {
    const params = {
      TableName: TABLE_NAME,
      Item: {
        apiKey: this.apiKey,
        headerColor: this.headerColor,
        // ✅ NEW FIELDS
        poweredByText: this.poweredByText,
        poweredByUrl: this.poweredByUrl,
        createdAt: this.createdAt,
        updatedAt: new Date().toISOString()
      }
    };
    try {
      await dynamoDB.send(new PutCommand(params));
      return params.Item;
    } catch (error) {
      throw new Error(`Error saving branding: ${error.message}`);
    }
  }

  static async findByApiKey(apiKey) {
    const params = {
      TableName: TABLE_NAME,
      Key: { apiKey }
    };
    try {
      const result = await dynamoDB.send(new GetCommand(params));
      return result.Item;
    } catch (error) {
      throw new Error(`Error finding branding: ${error.message}`);
    }
  }

  static async updateHeaderColor(apiKey, headerColor) {
    const params = {
      TableName: TABLE_NAME,
      Key: { apiKey },
      UpdateExpression: 'SET headerColor = :headerColor, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':headerColor': headerColor,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    try {
      const result = await dynamoDB.send(new UpdateCommand(params));
      return result.Attributes;
    } catch (error) {
      throw new Error(`Error updating header color: ${error.message}`);
    }
  }

  // ✅ NEW: Update powered by settings
  static async updatePoweredBy(apiKey, poweredByText, poweredByUrl) {
    const params = {
      TableName: TABLE_NAME,
      Key: { apiKey },
      UpdateExpression: 'SET poweredByText = :poweredByText, poweredByUrl = :poweredByUrl, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':poweredByText': poweredByText,
        ':poweredByUrl': poweredByUrl,
        ':updatedAt': new Date().toISOString()
      },
      ReturnValues: 'ALL_NEW'
    };
    try {
      const result = await dynamoDB.send(new UpdateCommand(params));
      return result.Attributes;
    } catch (error) {
      throw new Error(`Error updating powered by: ${error.message}`);
    }
  }

  static async deleteByApiKey(apiKey) {
    const params = {
      TableName: TABLE_NAME,
      Key: { apiKey }
    };
    try {
      await dynamoDB.send(new DeleteCommand(params));
      return true;
    } catch (error) {
      throw new Error(`Error deleting branding: ${error.message}`);
    }
  }
}

module.exports = Branding;