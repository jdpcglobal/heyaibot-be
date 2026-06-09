const dynamo = require('../config/dynamoClient');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, GetCommand, DeleteCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'Websites';

// Helper function to process role data
const processRoleData = (roleData) => {
  if (roleData === undefined || roleData === null || roleData === '') {
    return [];
  }
  if (Array.isArray(roleData)) {
    return roleData.map(role => String(role).trim()).filter(role => role.length > 0);
  }
  if (typeof roleData === 'string') {
    if (roleData.includes(',')) {
      return roleData.split(',').map(role => role.trim()).filter(role => role.length > 0);
    } else {
      return roleData.trim() ? [roleData.trim()] : [];
    }
  }
  const roleStr = String(roleData).trim();
  return roleStr ? [roleStr] : [];
};

const ensureRoleStructure = (role) => {
  if (!role) return [];
  if (Array.isArray(role)) {
    const validRoles = role.map(r => String(r).trim()).filter(r => r.length > 0);
    return validRoles;
  }
  if (typeof role === 'string') {
    const trimmedRole = role.trim();
    return trimmedRole.length > 0 ? [trimmedRole] : [];
  }
  const roleStr = String(role).trim();
  return roleStr ? [roleStr] : [];
};

// Helper function to process tags data
const processTagsData = (tagsData) => {
  if (tagsData === undefined || tagsData === null || tagsData === '') {
    return [];
  }
  if (Array.isArray(tagsData)) {
    return tagsData.map(tag => String(tag).trim()).filter(tag => tag.length > 0);
  }
  if (typeof tagsData === 'string') {
    if (tagsData.includes(',')) {
      return tagsData.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
    } else {
      return tagsData.trim() ? [tagsData.trim()] : [];
    }
  }
  const tagsStr = String(tagsData).trim();
  return tagsStr ? [tagsStr] : [];
};

const ensureTagsStructure = (tags) => {
  if (!tags) return [];
  if (Array.isArray(tags)) {
    return tags.map(tag => String(tag).trim()).filter(tag => tag.length > 0);
  }
  if (typeof tags === 'string') {
    const trimmedTag = tags.trim();
    return trimmedTag.length > 0 ? [trimmedTag] : [];
  }
  const tagsStr = String(tags).trim();
  return tagsStr ? [tagsStr] : [];
};

// Updated processAifutureData to handle service objects with description and tags
const processAifutureData = (aifutureData) => {
  let processedAifuture = [];
  if (aifutureData === undefined || aifutureData === null) return processedAifuture;

  if (Array.isArray(aifutureData)) {
    processedAifuture = aifutureData.map(item => {
      if (typeof item === 'object' && item !== null) {
        const title = item.title || 'product';
        let value = [];
        
        if (Array.isArray(item.value)) {
          value = item.value.map(v => {
            if (typeof v === 'object' && v !== null) {
              return {
                name: v.name || '',
                price: v.price || '',
                description: v.description || '',
                tags: Array.isArray(v.tags) ? v.tags.map(t => String(t).trim()) : (v.tags ? [String(v.tags).trim()] : [])
              };
            } else if (typeof v === 'string') {
              const match = v.match(/^(.*?)\s*-\s*(.*)$/);
              if (match) {
                return {
                  name: match[1].trim(),
                  price: match[2].trim(),
                  description: '',
                  tags: []
                };
              }
              return {
                name: v,
                price: '',
                description: '',
                tags: []
              };
            }
            return {
              name: String(v),
              price: '',
              description: '',
              tags: []
            };
          });
        } else if (typeof item.value === 'string') {
          const items = item.value.split(',').map(v => v.trim());
          value = items.map(v => {
            const match = v.match(/^(.*?)\s*-\s*(.*)$/);
            if (match) {
              return {
                name: match[1].trim(),
                price: match[2].trim(),
                description: '',
                tags: []
              };
            }
            return {
              name: v,
              price: '',
              description: '',
              tags: []
            };
          });
        }
        return { title, value };
      }
      return { title: 'product', value: [] };
    }).filter(item => item.value.length > 0);
  } else if (typeof aifutureData === 'object' && aifutureData !== null) {
    if ('title' in aifutureData || 'value' in aifutureData) {
      const title = aifutureData.title || 'product';
      let value = [];
      if (Array.isArray(aifutureData.value)) {
        value = aifutureData.value.map(v => {
          if (typeof v === 'object' && v !== null) {
            return {
              name: v.name || '',
              price: v.price || '',
              description: v.description || '',
              tags: Array.isArray(v.tags) ? v.tags.map(t => String(t).trim()) : (v.tags ? [String(v.tags).trim()] : [])
            };
          }
          const match = String(v).match(/^(.*?)\s*-\s*(.*)$/);
          if (match) {
            return {
              name: match[1].trim(),
              price: match[2].trim(),
              description: '',
              tags: []
            };
          }
          return {
            name: String(v),
            price: '',
            description: '',
            tags: []
          };
        });
      }
      processedAifuture = [{ title, value }];
    }
  } else if (typeof aifutureData === 'string') {
    if (aifutureData.includes(';')) {
      processedAifuture = aifutureData.split(';').map(part => part.trim()).filter(part => part).map(part => {
        if (part.includes(':')) {
          const [titlePart, ...valueParts] = part.split(':');
          const title = titlePart.trim();
          const valueStr = valueParts.join(':').trim();
          const items = valueStr.includes(',') ? valueStr.split(',').map(v => v.trim()) : [valueStr];
          const value = items.map(v => {
            const match = v.match(/^(.*?)\s*-\s*(.*)$/);
            if (match) {
              return {
                name: match[1].trim(),
                price: match[2].trim(),
                description: '',
                tags: []
              };
            }
            return {
              name: v,
              price: '',
              description: '',
              tags: []
            };
          });
          return { title, value };
        } else {
          const items = part.includes(',') ? part.split(',').map(v => v.trim()) : [part];
          const value = items.map(v => {
            const match = v.match(/^(.*?)\s*-\s*(.*)$/);
            if (match) {
              return {
                name: match[1].trim(),
                price: match[2].trim(),
                description: '',
                tags: []
              };
            }
            return {
              name: v,
              price: '',
              description: '',
              tags: []
            };
          });
          return { title: 'product', value };
        }
      }).filter(item => item.value.length > 0);
    } else {
      const items = aifutureData.split(',').map(item => item.trim());
      const value = items.map(v => {
        const match = v.match(/^(.*?)\s*-\s*(.*)$/);
        if (match) {
          return {
            name: match[1].trim(),
            price: match[2].trim(),
            description: '',
            tags: []
          };
        }
        return {
          name: v,
          price: '',
          description: '',
          tags: []
        };
      });
      processedAifuture = [{ title: 'product', value }];
    }
  }
  return processedAifuture;
};

const ensureAifutureStructure = (aifuture) => {
  if (!aifuture || !Array.isArray(aifuture)) return [];
  return aifuture.map(item => {
    if (typeof item === 'object' && item !== null) {
      return {
        title: item.title || 'product',
        value: Array.isArray(item.value) ? item.value.map(v => {
          if (typeof v === 'object' && v !== null) {
            return {
              name: v.name || '',
              price: v.price || '',
              description: v.description || '',
              tags: Array.isArray(v.tags) ? v.tags.map(t => String(t).trim()) : (v.tags ? [String(v.tags).trim()] : [])
            };
          }
          const match = String(v).match(/^(.*?)\s*-\s*(.*)$/);
          if (match) {
            return {
              name: match[1].trim(),
              price: match[2].trim(),
              description: '',
              tags: []
            };
          }
          return {
            name: String(v),
            price: '',
            description: '',
            tags: []
          };
        }) : []
      };
    }
    return { title: 'product', value: [] };
  }).filter(item => item.value.length > 0);
};

// ── CREATE ──
const saveWebsite = async (data) => {
  const timestamp = new Date().toISOString();
  const role = processRoleData(data.role);
  const aifuture = processAifutureData(data.aifuture);
  const userId = data.userId !== undefined ? String(data.userId).trim() : '';
  const tags = processTagsData(data.tags);

  const item = {
    id: data.id || uuidv4(),
    userId,
    websiteName: data.websiteName || '',
    websiteUrl: data.websiteUrl || '',
    description: data.description || '',
    tags: tags,
    systemPrompt: Array.isArray(data.systemPrompt) ? data.systemPrompt : [],
    customPrompt: Array.isArray(data.customPrompt) ? data.customPrompt : [],
    category: Array.isArray(data.category) ? data.category : ['General'],
    aifuture,
    role,
    apiKey: data.apiKey || uuidv4(),
    status: data.status || 'active',
    adminDeleted: false,
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

// ── READ ALL ──
const getAllWebsites = async (apiKey = null, showAdminDeleted = false) => {
  try {
    if (apiKey) {
      const result = await dynamo.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'apiKey = :apiKey',
        ExpressionAttributeValues: { ':apiKey': apiKey }
      }));
      const items = (result.Items || []).map(item => ({
        ...item,
        aifuture: ensureAifutureStructure(item.aifuture),
        role: ensureRoleStructure(item.role),
        tags: ensureTagsStructure(item.tags)
      }));
      return { success: true, items, message: items.length > 0 ? 'Websites found' : 'No websites found' };
    } else {
      const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
      let items = (result.Items || []).map(item => ({
        ...item,
        aifuture: ensureAifutureStructure(item.aifuture),
        role: ensureRoleStructure(item.role),
        tags: ensureTagsStructure(item.tags)
      }));
      if (!showAdminDeleted) {
        items = items.filter(item => item.adminDeleted !== true);
      }
      return { success: true, items, message: items.length > 0 ? 'All websites retrieved' : 'No websites found' };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── READ BY USER ID ──
const getWebsitesByUserId = async (userId, showAdminDeleted = false) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return { success: false, error: 'Valid userId is required' };
    }
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId.trim() }
    }));
    let items = (result.Items || []).map(item => ({
      ...item,
      aifuture: ensureAifutureStructure(item.aifuture),
      role: ensureRoleStructure(item.role),
      tags: ensureTagsStructure(item.tags)
    }));
    if (!showAdminDeleted) {
      items = items.filter(item => item.adminDeleted !== true);
    }
    return {
      success: true,
      items,
      count: items.length,
      message: items.length > 0 ? `${items.length} websites found` : 'No websites found'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── READ ONE BY ID ──
const getWebsiteById = async (id) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (result.Item) {
      const item = {
        ...result.Item,
        aifuture: ensureAifutureStructure(result.Item.aifuture),
        role: ensureRoleStructure(result.Item.role),
        tags: ensureTagsStructure(result.Item.tags)
      };
      return { success: true, item };
    }
    return { success: false, error: 'Website not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── READ ONE BY API KEY ──
const getWebsiteByApiKey = async (apiKey) => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'apiKey = :apiKey',
      ExpressionAttributeValues: { ':apiKey': apiKey }
    }));
    if (result.Items && result.Items.length > 0) {
      const item = {
        ...result.Items[0],
        aifuture: ensureAifutureStructure(result.Items[0].aifuture),
        role: ensureRoleStructure(result.Items[0].role),
        tags: ensureTagsStructure(result.Items[0].tags)
      };
      return { success: true, item };
    }
    return { success: false, error: 'No website found with this API key' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getWebsiteDataByApiKey = async (apiKey) => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'apiKey = :apiKey',
      ExpressionAttributeValues: { ':apiKey': apiKey }
    }));
    if (result.Items && result.Items.length > 0) {
      const item = {
        ...result.Items[0],
        aifuture: ensureAifutureStructure(result.Items[0].aifuture),
        role: ensureRoleStructure(result.Items[0].role),
        tags: ensureTagsStructure(result.Items[0].tags)
      };
      return { success: true, data: item, message: 'Website data retrieved successfully' };
    }
    return { success: false, error: 'No website found with this API key', data: null };
  } catch (error) {
    return { success: false, error: error.message, data: null };
  }
};

// ── SOFT DELETE BY ADMIN ──
const softDeleteWebsiteByAdmin = async (id, userId) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };

    if (userId && existingResult.Item.userId !== userId.trim()) {
      return { success: false, error: 'Not authorized to delete this website' };
    }

    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET adminDeleted = :adminDeleted, adminDeletedAt = :adminDeletedAt, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':adminDeleted': true,
        ':adminDeletedAt': timestamp,
        ':updatedAt': timestamp,
      },
      ReturnValues: 'ALL_NEW',
    }));

    return {
      success: true,
      item: result.Attributes,
      message: 'Website hidden from admin panel (soft deleted)'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── RESTORE SOFT DELETED ──
const restoreSoftDeletedWebsite = async (id) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };

    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET adminDeleted = :adminDeleted, updatedAt = :updatedAt REMOVE adminDeletedAt',
      ExpressionAttributeValues: {
        ':adminDeleted': false,
        ':updatedAt': timestamp,
      },
      ReturnValues: 'ALL_NEW',
    }));

    return {
      success: true,
      item: result.Attributes,
      message: 'Website restored successfully'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── UPDATE FULL ──
const updateWebsite = async (id, data) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existingItem = existingResult.Item;

    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = { ':updatedAt': timestamp };
    const expressionAttributeNames = {};

    const addUpdateField = (fieldName, fieldValue, fieldAlias = null) => {
      const alias = fieldAlias || fieldName;
      const valueKey = `:${alias}`;
      const nameKey = `#${alias}`;
      updateExpression = updateExpression.replace('updatedAt = :updatedAt', `${nameKey} = ${valueKey}, updatedAt = :updatedAt`);
      expressionAttributeValues[valueKey] = fieldValue;
      expressionAttributeNames[nameKey] = fieldName;
    };

    if (data.websiteName !== undefined) addUpdateField('websiteName', data.websiteName || '', 'name');
    if (data.websiteUrl !== undefined) addUpdateField('websiteUrl', data.websiteUrl || '', 'url');
    if (data.description !== undefined) addUpdateField('description', data.description || '', 'desc');
    if (data.tags !== undefined) addUpdateField('tags', processTagsData(data.tags), 'tags');
    if (data.systemPrompt !== undefined) addUpdateField('systemPrompt', Array.isArray(data.systemPrompt) ? data.systemPrompt : [], 'sys');
    if (data.customPrompt !== undefined) addUpdateField('customPrompt', Array.isArray(data.customPrompt) ? data.customPrompt : [], 'custom');
    if (data.category !== undefined) addUpdateField('category', Array.isArray(data.category) ? data.category : ['General'], 'cat');
    if (data.status !== undefined) addUpdateField('status', data.status || 'active', 'st');
    if (data.apiKey !== undefined) addUpdateField('apiKey', data.apiKey || existingItem.apiKey, 'api');
    if (data.role !== undefined) addUpdateField('role', processRoleData(data.role), 'role');
    if (data.aifuture !== undefined) addUpdateField('aifuture', processAifutureData(data.aifuture), 'ai');

    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ReturnValues: 'ALL_NEW',
    }));

    const attributes = {
      ...result.Attributes,
      aifuture: ensureAifutureStructure(result.Attributes?.aifuture),
      role: ensureRoleStructure(result.Attributes?.role),
      tags: ensureTagsStructure(result.Attributes?.tags)
    };
    return { success: true, item: attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── AIFUTURE SERVICE OPERATIONS ──
const addServiceDescription = async (id, title, serviceName, description) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    
    let aifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const categoryIndex = aifuture.findIndex(item => item.title === title);
    
    if (categoryIndex === -1) {
      return { success: false, error: `Title '${title}' not found` };
    }
    
    const serviceIndex = aifuture[categoryIndex].value.findIndex(
      service => service.name === serviceName
    );
    
    if (serviceIndex === -1) {
      return { success: false, error: `Service '${serviceName}' not found` };
    }
    
    aifuture[categoryIndex].value[serviceIndex].description = description;
    
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': aifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const addServiceTags = async (id, title, serviceName, tags) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    
    let aifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const categoryIndex = aifuture.findIndex(item => item.title === title);
    
    if (categoryIndex === -1) {
      return { success: false, error: `Title '${title}' not found` };
    }
    
    const serviceIndex = aifuture[categoryIndex].value.findIndex(
      service => service.name === serviceName
    );
    
    if (serviceIndex === -1) {
      return { success: false, error: `Service '${serviceName}' not found` };
    }
    
    const tagsToAdd = Array.isArray(tags) ? tags.map(t => String(t).trim()) : [String(tags).trim()];
    const existingTags = aifuture[categoryIndex].value[serviceIndex].tags || [];
    const mergedTags = [...new Set([...existingTags, ...tagsToAdd])];
    aifuture[categoryIndex].value[serviceIndex].tags = mergedTags;
    
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': aifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const removeServiceTag = async (id, title, serviceName, tag) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    
    let aifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const categoryIndex = aifuture.findIndex(item => item.title === title);
    
    if (categoryIndex === -1) {
      return { success: false, error: `Title '${title}' not found` };
    }
    
    const serviceIndex = aifuture[categoryIndex].value.findIndex(
      service => service.name === serviceName
    );
    
    if (serviceIndex === -1) {
      return { success: false, error: `Service '${serviceName}' not found` };
    }
    
    const tagToRemove = String(tag).trim();
    aifuture[categoryIndex].value[serviceIndex].tags = aifuture[categoryIndex].value[serviceIndex].tags.filter(t => t !== tagToRemove);
    
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': aifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getServiceDetails = async (id, title, serviceName) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!result.Item) return { success: false, error: 'Website not found' };
    
    const aifuture = ensureAifutureStructure(result.Item.aifuture);
    const category = aifuture.find(item => item.title === title);
    
    if (!category) {
      return { success: false, error: `Title '${title}' not found` };
    }
    
    const service = category.value.find(s => s.name === serviceName);
    
    if (!service) {
      return { success: false, error: `Service '${serviceName}' not found` };
    }
    
    return { success: true, service };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateServiceItem = async (id, title, serviceName, updateData) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    
    let aifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const categoryIndex = aifuture.findIndex(item => item.title === title);
    
    if (categoryIndex === -1) {
      return { success: false, error: `Title '${title}' not found` };
    }
    
    const serviceIndex = aifuture[categoryIndex].value.findIndex(
      service => service.name === serviceName
    );
    
    if (serviceIndex === -1) {
      return { success: false, error: `Service '${serviceName}' not found` };
    }
    
    if (updateData.name !== undefined) aifuture[categoryIndex].value[serviceIndex].name = updateData.name;
    if (updateData.price !== undefined) aifuture[categoryIndex].value[serviceIndex].price = updateData.price;
    if (updateData.description !== undefined) aifuture[categoryIndex].value[serviceIndex].description = updateData.description;
    if (updateData.tags !== undefined) {
      aifuture[categoryIndex].value[serviceIndex].tags = Array.isArray(updateData.tags) 
        ? updateData.tags.map(t => String(t).trim())
        : [String(updateData.tags).trim()];
    }
    
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': aifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteServiceItem = async (id, title, serviceName) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    
    let aifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const categoryIndex = aifuture.findIndex(item => item.title === title);
    
    if (categoryIndex === -1) {
      return { success: false, error: `Title '${title}' not found` };
    }
    
    const serviceIndex = aifuture[categoryIndex].value.findIndex(
      service => service.name === serviceName
    );
    
    if (serviceIndex === -1) {
      return { success: false, error: `Service '${serviceName}' not found` };
    }
    
    aifuture[categoryIndex].value.splice(serviceIndex, 1);
    
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': aifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getServicesByTag = async (id, tag) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!result.Item) return { success: false, error: 'Website not found' };
    
    const aifuture = ensureAifutureStructure(result.Item.aifuture);
    const tagToFind = String(tag).trim();
    const matchingServices = [];
    
    aifuture.forEach(category => {
      category.value.forEach(service => {
        if (service.tags && service.tags.includes(tagToFind)) {
          matchingServices.push({
            category: category.title,
            ...service
          });
        }
      });
    });
    
    return { success: true, services: matchingServices, count: matchingServices.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── ROLE OPERATIONS ──
const addRoleToWebsite = async (id, roleToAdd) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existingRole = ensureRoleStructure(existingResult.Item.role);
    const rolesToAdd = processRoleData(roleToAdd);
    const mergedRoles = [...new Set([...existingRole, ...rolesToAdd])];
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET role = :role, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':role': mergedRoles, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, role: ensureRoleStructure(result.Attributes?.role) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const removeRoleFromWebsite = async (id, roleToRemove) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existingRole = ensureRoleStructure(existingResult.Item.role);
    const rolesToRemove = processRoleData(roleToRemove);
    const filteredRoles = existingRole.filter(role => !rolesToRemove.includes(role));
    const finalRoles = filteredRoles.length > 0 ? filteredRoles : ['user'];
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET role = :role, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':role': finalRoles, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, role: ensureRoleStructure(result.Attributes?.role) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const websiteHasRole = async (id, roleToCheck) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!result.Item) return { success: false, error: 'Website not found' };
    const roles = ensureRoleStructure(result.Item.role);
    const roleStr = String(roleToCheck).trim();
    const hasRole = roles.includes(roleStr);
    return { success: true, hasRole, roles, message: hasRole ? `Website has role '${roleStr}'` : `Website does not have role '${roleStr}'` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getWebsitesByRole = async (roleToFind) => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
    if (!result.Items || result.Items.length === 0) return { success: true, items: [], message: 'No websites found' };
    const targetRoles = processRoleData(roleToFind);
    const filteredItems = result.Items.filter(item => {
      const websiteRoles = ensureRoleStructure(item.role);
      return targetRoles.some(targetRole => websiteRoles.includes(targetRole));
    });
    const items = filteredItems.map(item => ({
      ...item,
      aifuture: ensureAifutureStructure(item.aifuture),
      role: ensureRoleStructure(item.role),
      tags: ensureTagsStructure(item.tags)
    }));
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getWebsitesByAllRoles = async (requiredRoles) => {
  try {
    if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) return { success: false, error: 'requiredRoles must be non-empty array' };
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
    if (!result.Items || result.Items.length === 0) return { success: true, items: [], message: 'No websites found' };
    const targetRoles = requiredRoles.map(role => String(role).trim()).filter(role => role.length > 0);
    const filteredItems = result.Items.filter(item => {
      const websiteRoles = ensureRoleStructure(item.role);
      return targetRoles.every(targetRole => websiteRoles.includes(targetRole));
    });
    const items = filteredItems.map(item => ({
      ...item,
      aifuture: ensureAifutureStructure(item.aifuture),
      role: ensureRoleStructure(item.role),
      tags: ensureTagsStructure(item.tags)
    }));
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getAllUniqueRoles = async () => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
    if (!result.Items || result.Items.length === 0) return { success: true, roles: ['user'] };
    const allRoles = new Set();
    result.Items.forEach(item => {
      const roles = ensureRoleStructure(item.role);
      roles.forEach(role => allRoles.add(role));
    });
    return { success: true, roles: Array.from(allRoles).sort() };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── TAGS OPERATIONS (Website level) ──
const addTagToWebsite = async (id, tagToAdd) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existingTags = ensureTagsStructure(existingResult.Item.tags);
    const tagsToAdd = processTagsData(tagToAdd);
    const mergedTags = [...new Set([...existingTags, ...tagsToAdd])];
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET tags = :tags, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':tags': mergedTags, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, tags: ensureTagsStructure(result.Attributes?.tags) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const removeTagFromWebsite = async (id, tagToRemove) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existingTags = ensureTagsStructure(existingResult.Item.tags);
    const tagsToRemove = processTagsData(tagToRemove);
    const filteredTags = existingTags.filter(tag => !tagsToRemove.includes(tag));
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET tags = :tags, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':tags': filteredTags, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, tags: ensureTagsStructure(result.Attributes?.tags) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getWebsitesByTag = async (tagToFind) => {
  try {
    const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
    if (!result.Items || result.Items.length === 0) return { success: true, items: [], message: 'No websites found' };
    const targetTags = processTagsData(tagToFind);
    const filteredItems = result.Items.filter(item => {
      const websiteTags = ensureTagsStructure(item.tags);
      return targetTags.some(targetTag => websiteTags.includes(targetTag));
    });
    const items = filteredItems.map(item => ({
      ...item,
      aifuture: ensureAifutureStructure(item.aifuture),
      role: ensureRoleStructure(item.role),
      tags: ensureTagsStructure(item.tags)
    }));
    return { success: true, items };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── AIFUTURE OPERATIONS ──
const updateWebsiteAifuture = async (id, aifutureData) => {
  const timestamp = new Date().toISOString();
  const processedAifuture = processAifutureData(aifutureData);
  try {
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': processedAifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, aifuture: ensureAifutureStructure(result.Attributes?.aifuture), role: ensureRoleStructure(result.Attributes?.role) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const addToAifuture = async (id, newItem) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const processedNewItems = processAifutureData([newItem]);
    if (processedNewItems.length === 0) return { success: false, error: 'Invalid aifuture item' };
    const newAifutureItem = processedNewItems[0];
    const existingIndex = existingAifuture.findIndex(item => item.title === newAifutureItem.title);
    if (existingIndex !== -1) {
      const mergedValues = [...existingAifuture[existingIndex].value, ...newAifutureItem.value];
      existingAifuture[existingIndex].value = mergedValues;
    } else {
      existingAifuture.push(newAifutureItem);
    }
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': existingAifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateAifutureItemByTitle = async (id, title, newValue) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    let existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    let valueArray = [];
    if (Array.isArray(newValue)) valueArray = newValue;
    else if (typeof newValue === 'string') valueArray = newValue.split(',').map(v => v.trim()).filter(v => v);
    else if (newValue !== undefined && newValue !== null) valueArray = [String(newValue)];
    
    valueArray = valueArray.map(v => {
      if (typeof v === 'object' && v !== null) return v;
      const match = String(v).match(/^(.*?)\s*-\s*(.*)$/);
      if (match) {
        return {
          name: match[1].trim(),
          price: match[2].trim(),
          description: '',
          tags: []
        };
      }
      return {
        name: String(v),
        price: '',
        description: '',
        tags: []
      };
    });
    
    const itemIndex = existingAifuture.findIndex(item => item.title === title);
    if (itemIndex !== -1) {
      existingAifuture[itemIndex].value = valueArray;
    } else {
      existingAifuture.push({ title, value: valueArray });
    }
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': existingAifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteAifutureItemByTitle = async (id, title) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    let existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const filteredAifuture = existingAifuture.filter(item => item.title !== title);
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': filteredAifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteValueFromAifutureItem = async (id, title, valueToDelete) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    let existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    const itemIndex = existingAifuture.findIndex(item => item.title === title);
    if (itemIndex !== -1) {
      existingAifuture[itemIndex].value = existingAifuture[itemIndex].value.filter(val => val.name !== valueToDelete);
      if (existingAifuture[itemIndex].value.length === 0) existingAifuture.splice(itemIndex, 1);
    } else {
      return { success: false, error: `Item with title '${title}' not found` };
    }
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': existingAifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const clearAifuture = async (id) => {
  const timestamp = new Date().toISOString();
  try {
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': [], ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: result.Attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getAifutureItemByTitle = async (id, title) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!result.Item) return { success: false, error: 'Website not found' };
    const aifuture = ensureAifutureStructure(result.Item.aifuture);
    const item = aifuture.find(item => item.title === title);
    return item ? { success: true, item } : { success: false, error: `Item with title '${title}' not found` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getAllAifutureTitles = async (id) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!result.Item) return { success: false, error: 'Website not found' };
    const aifuture = ensureAifutureStructure(result.Item.aifuture);
    return { success: true, titles: aifuture.map(item => item.title) };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateWebsiteCustomData = async (id, data) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = { ':updatedAt': timestamp };
    const addUpdateField = (fieldName, fieldValue, valueKey) => {
      updateExpression = updateExpression.replace('updatedAt = :updatedAt', `${fieldName} = :${valueKey}, updatedAt = :updatedAt`);
      expressionAttributeValues[`:${valueKey}`] = fieldValue;
    };
    if (data.customPrompt !== undefined) addUpdateField('customPrompt', Array.isArray(data.customPrompt) ? data.customPrompt : [], 'customPrompt');
    if (data.urls !== undefined) addUpdateField('urls', Array.isArray(data.urls) ? data.urls : [], 'urls');
    if (data.library !== undefined) addUpdateField('library', Array.isArray(data.library) ? data.library : [], 'library');
    if (data.aifuture !== undefined) addUpdateField('aifuture', processAifutureData(data.aifuture), 'aifuture');
    if (data.role !== undefined) addUpdateField('role', processRoleData(data.role), 'role');
    if (data.description !== undefined) addUpdateField('description', data.description || '', 'desc');
    if (data.tags !== undefined) addUpdateField('tags', processTagsData(data.tags), 'tags');
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, aifuture: ensureAifutureStructure(result.Attributes?.aifuture), role: ensureRoleStructure(result.Attributes?.role), tags: ensureTagsStructure(result.Attributes?.tags) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateWebsiteStatus = async (id, status) => {
  const timestamp = new Date().toISOString();
  try {
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #st = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':status': status, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, role: ensureRoleStructure(result.Attributes?.role) } };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateWebsiteStatusRoleAware = async (id, status, changedBy) => {
  const timestamp = new Date().toISOString();
  try {
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existing = existingResult.Item;
    if (changedBy === 'admin' && status === 'active' && existing.superAdminLocked === true) {
      return { success: false, locked: true, error: 'This website has been deactivated by SuperAdmin. Only SuperAdmin can reactivate it.', currentStatus: existing.status };
    }
    const shouldLock = changedBy === 'superadmin' && status === 'inactive';
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #st = :status, updatedAt = :updatedAt, superAdminLocked = :locked',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':status': status, ':updatedAt': timestamp, ':locked': shouldLock },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, role: ensureRoleStructure(result.Attributes?.role) }, superAdminLocked: shouldLock, message: `Status updated to '${status}' by ${changedBy}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── PERMANENT DELETE ──
const deleteWebsite = async (id) => {
  try {
    await dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id } }));
    return { success: true, message: 'Website permanently deleted' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ── USER-SPECIFIC OPERATIONS ──
const getWebsiteByIdAndUserId = async (id, userId) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!result.Item) return { success: false, error: 'Website not found' };
    if ((result.Item.userId || '') !== userId.trim()) return { success: false, error: 'Not authorized' };
    const item = { ...result.Item, aifuture: ensureAifutureStructure(result.Item.aifuture), role: ensureRoleStructure(result.Item.role), tags: ensureTagsStructure(result.Item.tags) };
    return { success: true, item, message: 'Website retrieved successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateWebsiteByUserId = async (id, data, userId) => {
  const timestamp = new Date().toISOString();
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    if ((existingResult.Item.userId || '') !== userId.trim()) return { success: false, error: 'Not authorized' };
    const existingItem = existingResult.Item;
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = { ':updatedAt': timestamp };
    const expressionAttributeNames = {};
    const addUpdateField = (fieldName, fieldValue, fieldAlias = null) => {
      const alias = fieldAlias || fieldName;
      const valueKey = `:${alias}`;
      const nameKey = `#${alias}`;
      updateExpression = updateExpression.replace('updatedAt = :updatedAt', `${nameKey} = ${valueKey}, updatedAt = :updatedAt`);
      expressionAttributeValues[valueKey] = fieldValue;
      expressionAttributeNames[nameKey] = fieldName;
    };
    if (data.websiteName !== undefined) addUpdateField('websiteName', data.websiteName || '', 'name');
    if (data.websiteUrl !== undefined) addUpdateField('websiteUrl', data.websiteUrl || '', 'url');
    if (data.description !== undefined) addUpdateField('description', data.description || '', 'desc');
    if (data.tags !== undefined) addUpdateField('tags', processTagsData(data.tags), 'tags');
    if (data.systemPrompt !== undefined) addUpdateField('systemPrompt', Array.isArray(data.systemPrompt) ? data.systemPrompt : [], 'sys');
    if (data.customPrompt !== undefined) addUpdateField('customPrompt', Array.isArray(data.customPrompt) ? data.customPrompt : [], 'custom');
    if (data.category !== undefined) addUpdateField('category', Array.isArray(data.category) ? data.category : ['General'], 'cat');
    if (data.status !== undefined) addUpdateField('status', data.status || 'active', 'st');
    if (data.apiKey !== undefined) addUpdateField('apiKey', data.apiKey || existingItem.apiKey, 'api');
    if (data.role !== undefined) addUpdateField('role', processRoleData(data.role), 'role');
    if (data.aifuture !== undefined) addUpdateField('aifuture', processAifutureData(data.aifuture), 'ai');
    if (data.userId !== undefined) addUpdateField('userId', String(data.userId).trim(), 'uid');
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, aifuture: ensureAifutureStructure(result.Attributes?.aifuture), role: ensureRoleStructure(result.Attributes?.role), tags: ensureTagsStructure(result.Attributes?.tags) }, message: 'Website updated successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const deleteWebsiteByUserId = async (id, userId) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    if ((existingResult.Item.userId || '') !== userId.trim()) return { success: false, error: 'Not authorized' };
    return await softDeleteWebsiteByAdmin(id, userId);
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getAllWebsitesByUserId = async (userId, showAdminDeleted = false) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId.trim() }
    }));
    let items = (result.Items || []).map(item => ({
      ...item,
      aifuture: ensureAifutureStructure(item.aifuture),
      role: ensureRoleStructure(item.role),
      tags: ensureTagsStructure(item.tags)
    }));
    if (!showAdminDeleted) {
      items = items.filter(item => item.adminDeleted !== true);
    }
    return { success: true, items, count: items.length, userId, message: `${items.length} websites found` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const addRoleToWebsiteByUserId = async (id, roleToAdd, userId) => {
  const timestamp = new Date().toISOString();
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    if ((existingResult.Item.userId || '') !== userId.trim()) return { success: false, error: 'Not authorized' };
    const existingRole = ensureRoleStructure(existingResult.Item.role);
    const rolesToAdd = processRoleData(roleToAdd);
    const mergedRoles = [...new Set([...existingRole, ...rolesToAdd])];
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET role = :role, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':role': mergedRoles, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, role: ensureRoleStructure(result.Attributes?.role) }, message: 'Role added successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const removeRoleFromWebsiteByUserId = async (id, roleToRemove, userId) => {
  const timestamp = new Date().toISOString();
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    if ((existingResult.Item.userId || '') !== userId.trim()) return { success: false, error: 'Not authorized' };
    const existingRole = ensureRoleStructure(existingResult.Item.role);
    const rolesToRemove = processRoleData(roleToRemove);
    const filteredRoles = existingRole.filter(role => !rolesToRemove.includes(role));
    const finalRoles = filteredRoles.length > 0 ? filteredRoles : ['user'];
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET role = :role, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':role': finalRoles, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, role: ensureRoleStructure(result.Attributes?.role) }, message: 'Role removed successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateWebsiteAifutureByUserId = async (id, aifutureData, userId) => {
  const timestamp = new Date().toISOString();
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    if ((existingResult.Item.userId || '') !== userId.trim()) return { success: false, error: 'Not authorized' };
    const processedAifuture = processAifutureData(aifutureData);
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':aifuture': processedAifuture, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, aifuture: ensureAifutureStructure(result.Attributes?.aifuture), role: ensureRoleStructure(result.Attributes?.role) }, message: 'Aifuture updated successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const updateWebsiteStatusByUserId = async (id, status, userId) => {
  const timestamp = new Date().toISOString();
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    if ((existingResult.Item.userId || '') !== userId.trim()) return { success: false, error: 'Not authorized' };
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET #st = :status, updatedAt = :updatedAt',
      ExpressionAttributeNames: { '#st': 'status' },
      ExpressionAttributeValues: { ':status': status, ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: { ...result.Attributes, role: ensureRoleStructure(result.Attributes?.role) }, message: 'Status updated successfully' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getWebsitesByRoleAndUserId = async (roleToFind, userId) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId.trim() }
    }));
    if (!result.Items || result.Items.length === 0) return { success: true, items: [], message: `No websites found for user: ${userId}` };
    const targetRoles = processRoleData(roleToFind);
    const filteredItems = result.Items.filter(item => {
      const websiteRoles = ensureRoleStructure(item.role);
      return targetRoles.some(targetRole => websiteRoles.includes(targetRole));
    });
    const items = filteredItems.map(item => ({ ...item, aifuture: ensureAifutureStructure(item.aifuture), role: ensureRoleStructure(item.role), tags: ensureTagsStructure(item.tags) }));
    return { success: true, items, count: items.length, userId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const bulkDeleteWebsitesByUserId = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId.trim() }
    }));
    if (!result.Items || result.Items.length === 0) return { success: true, deletedCount: 0, message: `No websites found for user: ${userId}` };
    const deletePromises = result.Items.map(item => dynamo.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id: item.id } })));
    await Promise.all(deletePromises);
    return { success: true, deletedCount: result.Items.length, userId, message: `Successfully deleted ${result.Items.length} websites` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const countWebsitesByUserId = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId AND (adminDeleted = :false OR attribute_not_exists(adminDeleted))',
      Select: 'COUNT',
      ExpressionAttributeValues: { ':userId': userId.trim(), ':false': false }
    }));
    return { success: true, count: result.Count || 0, userId };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getWebsitesWithoutUserId = async () => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :empty OR attribute_not_exists(userId)',
      ExpressionAttributeValues: { ':empty': '' }
    }));
    const items = (result.Items || []).map(item => ({ ...item, aifuture: ensureAifutureStructure(item.aifuture), role: ensureRoleStructure(item.role), tags: ensureTagsStructure(item.tags) }));
    return { success: true, items, count: items.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const assignUserToWebsite = async (id, userId) => {
  const timestamp = new Date().toISOString();
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const existingResult = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    if (!existingResult.Item) return { success: false, error: 'Website not found' };
    const existingUserId = existingResult.Item.userId || '';
    if (existingUserId && existingUserId.trim() !== '') return { success: false, error: `Website already assigned to user: ${existingUserId}` };
    const result = await dynamo.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { id },
      UpdateExpression: 'SET userId = :userId, updatedAt = :updatedAt',
      ExpressionAttributeValues: { ':userId': userId.trim(), ':updatedAt': timestamp },
      ReturnValues: 'ALL_NEW',
    }));
    return { success: true, item: result.Attributes, message: `Website assigned to user: ${userId}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

const getApiKeyAndWebsiteNameByUserId = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') return { success: false, error: 'Valid userId is required' };
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId.trim() }
    }));
    if (!result.Items || result.Items.length === 0) return { success: false, error: `No websites found for user: ${userId}`, data: [], totalTokens: 0 };
    const data = await Promise.all(result.Items.map(async (item) => {
      const apiKey = item.apiKey || '';
      let totalTokens = 0;
      if (apiKey) {
        try {
          const ChatModel = require('./Chat');
          const chats = await ChatModel.getByApiKey(apiKey);
          totalTokens = chats.reduce((sum, chat) => sum + (chat.tokens?.total || 0), 0);
        } catch (error) {
          console.error(`Error fetching chats for API key ${apiKey}:`, error.message);
        }
      }
      return { apiKey, websiteName: item.websiteName || '', token: totalTokens };
    }));
    const grandTotalTokens = data.reduce((sum, item) => sum + item.token, 0);
    return { success: true, userId: userId.trim(), credentials: data, count: data.length, totalTokens: grandTotalTokens };
  } catch (error) {
    return { success: false, error: error.message, totalTokens: 0 };
  }
};

const getTotalTokensByUserId = async (userId) => {
  try {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return { success: false, error: 'Valid userId is required', totalTokens: 0 };
    }

    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'userId = :userId',
      ExpressionAttributeValues: { ':userId': userId.trim() }
    }));

    if (!result.Items || result.Items.length === 0) {
      return { success: false, error: `No websites found for user: ${userId}`, totalTokens: 0 };
    }

    let totalTokens = 0;
    for (const item of result.Items) {
      const apiKey = item.apiKey || '';
      if (apiKey) {
        try {
          const ChatModel = require('./Chat');
          const chats = await ChatModel.getByApiKey(apiKey);
          totalTokens += chats.reduce((sum, chat) => sum + (chat.tokens?.total || 0), 0);
        } catch (error) {
          console.error(`Error fetching chats for API key ${apiKey}:`, error.message);
        }
      }
    }

    return { 
      success: true, 
      totalTokens: totalTokens,
      userId: userId.trim(),
      websitesCount: result.Items.length
    };
  } catch (error) {
    return { success: false, error: error.message, totalTokens: 0 };
  }
};

module.exports = {
  getTotalTokensByUserId,
  saveWebsite,
  getAllWebsites,
  getWebsiteById,
  getWebsiteByApiKey,
  getWebsiteDataByApiKey,
  updateWebsite,
  updateWebsiteCustomData,
  addRoleToWebsite,
  removeRoleFromWebsite,
  websiteHasRole,
  getWebsitesByRole,
  getWebsitesByAllRoles,
  getAllUniqueRoles,
  updateWebsiteAifuture,
  addToAifuture,
  updateAifutureItemByTitle,
  deleteAifutureItemByTitle,
  deleteValueFromAifutureItem,
  clearAifuture,
  getAifutureItemByTitle,
  getAllAifutureTitles,
  updateWebsiteStatus,
  updateWebsiteStatusRoleAware,
  deleteWebsite,
  softDeleteWebsiteByAdmin,
  restoreSoftDeletedWebsite,
  getWebsiteByIdAndUserId,
  updateWebsiteByUserId,
  deleteWebsiteByUserId,
  getAllWebsitesByUserId,
  getWebsitesByUserId,
  addRoleToWebsiteByUserId,
  removeRoleFromWebsiteByUserId,
  updateWebsiteAifutureByUserId,
  updateWebsiteStatusByUserId,
  getWebsitesByRoleAndUserId,
  bulkDeleteWebsitesByUserId,
  countWebsitesByUserId,
  getWebsitesWithoutUserId,
  assignUserToWebsite,
  getApiKeyAndWebsiteNameByUserId,
  // New service operations
  addServiceDescription,
  addServiceTags,
  removeServiceTag,
  getServiceDetails,
  updateServiceItem,
  deleteServiceItem,
  getServicesByTag,
  // Website level tag operations
  addTagToWebsite,
  removeTagFromWebsite,
  getWebsitesByTag,
};