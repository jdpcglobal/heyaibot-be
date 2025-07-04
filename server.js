require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const app = express();

// Middleware
app.use(bodyParser.json());
app.use(cors());

// Enhanced AWS configuration
AWS.config.update({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  maxRetries: 3,
  retryDelayOptions: { base: 300 }
});

const dynamodb = new AWS.DynamoDB.DocumentClient();
const TABLE_NAME = process.env.DYNAMODB_TABLE;

// Helper function for error responses
const errorResponse = (res, status, error, details) => {
  return res.status(status).json({
    error,
    details,
    timestamp: new Date().toISOString()
  });
};

// ✅ Add (Create) - Enhanced with validation
app.post('/api/websites', async (req, res) => {
  const { websiteName, websiteUrl, systemPrompt = [], customPrompt = [], status = 'active' } = req.body;

  // Validate required fields
  if (!websiteName || !websiteUrl) {
    return errorResponse(res, 400, 'Validation Error', 'websiteName and websiteUrl are required');
  }

  // Validate status
  if (!['active', 'inactive'].includes(status)) {
    return errorResponse(res, 400, 'Validation Error', 'Status must be either "active" or "inactive"');
  }

  const item = {
    id: uuidv4(),
    websiteName,
    websiteUrl,
    systemPrompt: Array.isArray(systemPrompt) ? systemPrompt : [],
    customPrompt: Array.isArray(customPrompt) ? customPrompt : [],
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await dynamodb.put({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(id)'
    }).promise();
    
    res.status(201).json({
      message: 'Website created successfully',
      item,
      links: {
        self: `/api/websites/${item.id}`,
        all: '/api/websites'
      }
    });
  } catch (err) {
    if (err.code === 'ConditionalCheckFailedException') {
      return errorResponse(res, 409, 'Conflict', 'Website with this ID already exists');
    }
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// ✅ Get All - With pagination support
app.get('/api/websites', async (req, res) => {
  const { limit = 10, lastEvaluatedKey } = req.query;

  try {
    const params = {
      TableName: TABLE_NAME,
      Limit: parseInt(limit),
      ...(lastEvaluatedKey && { ExclusiveStartKey: JSON.parse(lastEvaluatedKey) })
    };

    const data = await dynamodb.scan(params).promise();
    
    res.json({
      items: data.Items,
      count: data.Items.length,
      ...(data.LastEvaluatedKey && {
        pagination: {
          lastEvaluatedKey: JSON.stringify(data.LastEvaluatedKey),
          next: `/api/websites?limit=${limit}&lastEvaluatedKey=${JSON.stringify(data.LastEvaluatedKey)}`
        }
      })
    });
  } catch (err) {
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// ✅ Get Active Website Config - Enhanced with caching headers
app.get('/api/active-config', async (req, res) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: '#s = :status',
      ExpressionAttributeNames: {
        '#s': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active'
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    if (!result.Items || result.Items.length === 0) {
      return errorResponse(res, 404, 'Not Found', 'No active website configuration found');
    }

    // Sort by updatedAt to get the most recently updated active config
    const activeConfigs = result.Items.sort((a, b) => 
      new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    const activeConfig = activeConfigs[0];
    
    // Set cache headers (5 minutes)
    res.set('Cache-Control', 'public, max-age=300');
    
    res.json({
      systemPrompt: activeConfig.systemPrompt,
      customPrompt: activeConfig.customPrompt,
      websiteName: activeConfig.websiteName,
      websiteUrl: activeConfig.websiteUrl,
      configId: activeConfig.id,
      lastUpdated: activeConfig.updatedAt
    });
  } catch (err) {
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// ✅ Get Active Websites - New endpoint to get all active websites
app.get('/api/websites/active', async (req, res) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      FilterExpression: '#s = :status',
      ExpressionAttributeNames: {
        '#s': 'status'
      },
      ExpressionAttributeValues: {
        ':status': 'active'
      }
    };

    const result = await dynamodb.scan(params).promise();
    
    res.json({
      items: result.Items || [],
      count: result.Items ? result.Items.length : 0
    });
  } catch (err) {
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// ✅ Get by ID - Enhanced
app.get('/api/websites/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await dynamodb.get({
      TableName: TABLE_NAME,
      Key: { id },
    }).promise();

    if (!result.Item) {
      return errorResponse(res, 404, 'Not Found', 'Website not found');
    }
    
    res.json(result.Item);
  } catch (err) {
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// ✅ Update by ID - Enhanced with validation
app.put('/api/websites/:id', async (req, res) => {
  const { id } = req.params;
  const { websiteName, websiteUrl, systemPrompt, customPrompt, status } = req.body;

  // Validate required fields
  if (!websiteName || !websiteUrl) {
    return errorResponse(res, 400, 'Validation Error', 'websiteName and websiteUrl are required');
  }

  // Validate status
  if (status && !['active', 'inactive'].includes(status)) {
    return errorResponse(res, 400, 'Validation Error', 'Status must be either "active" or "inactive"');
  }

  try {
    const params = {
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: `
        SET websiteName = :n,
            websiteUrl = :u,
            systemPrompt = :sp,
            customPrompt = :cp,
            #s = :s,
            updatedAt = :ua
      `,
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      ExpressionAttributeValues: {
        ':n': websiteName,
        ':u': websiteUrl,
        ':sp': Array.isArray(systemPrompt) ? systemPrompt : [],
        ':cp': Array.isArray(customPrompt) ? customPrompt : [],
        ':s': status || 'active',
        ':ua': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    };

    const result = await dynamodb.update(params).promise();
    
    res.json({
      message: 'Website updated successfully',
      item: result.Attributes,
      links: {
        self: `/api/websites/${id}`,
        all: '/api/websites'
      }
    });
  } catch (err) {
    if (err.code === 'ConditionalCheckFailedException') {
      return errorResponse(res, 404, 'Not Found', 'Website not found');
    }
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// ✅ New Endpoint: Update Status Only
app.patch('/api/websites/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validate status
  if (!['active', 'inactive'].includes(status)) {
    return errorResponse(res, 400, 'Validation Error', 'Status must be either "active" or "inactive"');
  }

  try {
    const params = {
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #s = :s, updatedAt = :ua',
      ConditionExpression: 'attribute_exists(id)',
      ExpressionAttributeNames: {
        '#s': 'status',
      },
      ExpressionAttributeValues: {
        ':s': status,
        ':ua': new Date().toISOString(),
      },
      ReturnValues: 'ALL_NEW',
    };

    const result = await dynamodb.update(params).promise();
    
    res.json({
      message: 'Status updated successfully',
      item: result.Attributes,
      links: {
        self: `/api/websites/${id}`,
        all: '/api/websites'
      }
    });
  } catch (err) {
    if (err.code === 'ConditionalCheckFailedException') {
      return errorResponse(res, 404, 'Not Found', 'Website not found');
    }
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// ✅ Delete by ID - Enhanced
app.delete('/api/websites/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await dynamodb.delete({
      TableName: TABLE_NAME,
      Key: { id },
      ReturnValues: 'ALL_OLD'
    }).promise();

    if (!result.Attributes) {
      return errorResponse(res, 404, 'Not Found', 'Website not found');
    }
    
    res.json({
      message: 'Website deleted successfully',
      deletedItem: result.Attributes,
      links: {
        all: '/api/websites'
      }
    });
  } catch (err) {
    errorResponse(res, 500, 'Database Error', err.message);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Website API',
    version: '1.0.0'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  errorResponse(res, 500, 'Internal Server Error', 'An unexpected error occurred');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`DynamoDB Table: ${TABLE_NAME}`);
});