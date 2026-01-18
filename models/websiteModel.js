const dynamo = require('../config/dynamoClient');
const { v4: uuidv4 } = require('uuid');
const { PutCommand, GetCommand, DeleteCommand, UpdateCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = 'Websites';

// Helper function to process role data
const processRoleData = (roleData) => {
  if (roleData === undefined || roleData === null || roleData === '') {
    return []; // Empty array instead of default role
  }
  
  // If role is provided as an array
  if (Array.isArray(roleData)) {
    return roleData
      .map(role => String(role).trim())
      .filter(role => role.length > 0);
  }
  
  // If role is provided as a string
  if (typeof roleData === 'string') {
    // Check if string contains commas
    if (roleData.includes(',')) {
      return roleData.split(',')
        .map(role => role.trim())
        .filter(role => role.length > 0);
    } else {
      return roleData.trim() ? [roleData.trim()] : [];
    }
  }
  
  // If role is a single value (number, boolean, etc.)
  const roleStr = String(roleData).trim();
  return roleStr ? [roleStr] : [];
};

// Helper function to ensure role has proper structure
const ensureRoleStructure = (role) => {
  if (!role) {
    return []; // Empty array
  }
  
  if (Array.isArray(role)) {
    const validRoles = role
      .map(r => String(r).trim())
      .filter(r => r.length > 0);
    
    return validRoles; // Return empty array if no valid roles
  }
  
  // If role is a string
  if (typeof role === 'string') {
    const trimmedRole = role.trim();
    return trimmedRole.length > 0 ? [trimmedRole] : [];
  }
  
  // For other types
  const roleStr = String(role).trim();
  return roleStr ? [roleStr] : [];
};

// Helper function to process aifuture data
const processAifutureData = (aifutureData) => {
  let processedAifuture = [];
  
  if (aifutureData === undefined || aifutureData === null) {
    return processedAifuture;
  }
  
  // If aifuture is provided as an array
  if (Array.isArray(aifutureData)) {
    processedAifuture = aifutureData.map(item => {
      // If item is already an object with title and value
      if (typeof item === 'object' && item !== null) {
        const title = item.title || 'product';
        let value = [];
        
        // Handle different value formats
        if (Array.isArray(item.value)) {
          value = item.value;
        } else if (typeof item.value === 'string') {
          // Split comma-separated strings
          value = item.value.split(',').map(v => v.trim()).filter(v => v);
        } else if (item.value !== undefined && item.value !== null) {
          value = [String(item.value)];
        }
        
        return { title, value };
      }
      // If item is an array, treat it as value with default title
      else if (Array.isArray(item)) {
        return {
          title: 'product',
          value: item
        };
      }
      // If item is a string, treat it as single value
      else if (typeof item === 'string') {
        // Check if string contains colon for title:value format
        if (item.includes(':')) {
          const [titlePart, ...valueParts] = item.split(':');
          const title = titlePart.trim();
          const valueStr = valueParts.join(':').trim();
          
          // Parse value as array if it contains commas
          const value = valueStr.includes(',') 
            ? valueStr.split(',').map(v => v.trim()).filter(v => v)
            : [valueStr];
            
          return { title, value };
        } else {
          // Treat entire string as value with default title
          return {
            title: 'product',
            value: [item]
          };
        }
      }
      // Default case
      return {
        title: 'product',
        value: []
      };
    }).filter(item => item.value.length > 0); // Remove empty items
  }
  // If aifuture is provided as a single object
  else if (typeof aifutureData === 'object' && aifutureData !== null) {
    // Check if it's an object with title and value
    if ('title' in aifutureData || 'value' in aifutureData) {
      const title = aifutureData.title || 'product';
      let value = [];
      
      if (Array.isArray(aifutureData.value)) {
        value = aifutureData.value;
      } else if (typeof aifutureData.value === 'string') {
        value = aifutureData.value.split(',').map(v => v.trim()).filter(v => v);
      } else if (aifutureData.value !== undefined && aifutureData.value !== null) {
        value = [String(aifutureData.value)];
      }
      
      processedAifuture = [{ title, value }];
    }
  }
  // If aifuture is provided as a string
  else if (typeof aifutureData === 'string') {
    // Multiple items separated by semicolon
    if (aifutureData.includes(';')) {
      processedAifuture = aifutureData.split(';')
        .map(part => part.trim())
        .filter(part => part)
        .map(part => {
          if (part.includes(':')) {
            const [titlePart, ...valueParts] = part.split(':');
            const title = titlePart.trim();
            const valueStr = valueParts.join(':').trim();
            const value = valueStr.includes(',') 
              ? valueStr.split(',').map(v => v.trim()).filter(v => v)
              : [valueStr];
            return { title, value };
          } else {
            return {
              title: 'product',
              value: part.includes(',') 
                ? part.split(',').map(v => v.trim()).filter(v => v)
                : [part]
            };
          }
        })
        .filter(item => item.value.length > 0);
    } else {
      // Single item
      processedAifuture = [{
        title: 'product',
        value: aifutureData.split(',').map(item => item.trim()).filter(item => item)
      }];
    }
  }
  
  return processedAifuture;
};

// Helper function to ensure aifuture has proper structure
const ensureAifutureStructure = (aifuture) => {
  if (!aifuture || !Array.isArray(aifuture)) {
    return [];
  }
  
  return aifuture.map(item => {
    if (typeof item === 'object' && item !== null) {
      return {
        title: item.title || 'product',
        value: Array.isArray(item.value) ? item.value : 
              (item.value !== undefined && item.value !== null ? [String(item.value)] : [])
      };
    } else {
      return {
        title: 'product',
        value: []
      };
    }
  }).filter(item => item.value.length > 0);
};

// CREATE
const saveWebsite = async (data) => {
  const timestamp = new Date().toISOString();
  
  // Process role field
  const role = processRoleData(data.role);
  
  // Process aifuture field
  const aifuture = processAifutureData(data.aifuture);
  
  const item = {
    id: data.id || uuidv4(),
    websiteName: data.websiteName || '',
    websiteUrl: data.websiteUrl || '',
    systemPrompt: Array.isArray(data.systemPrompt) ? data.systemPrompt : [],
    customPrompt: Array.isArray(data.customPrompt) ? data.customPrompt : [],
    category: Array.isArray(data.category) ? data.category : ['General'],
    aifuture: aifuture,
    role: role, // Role as array
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
      const result = await dynamo.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: 'apiKey = :apiKey',
        ExpressionAttributeValues: {
          ':apiKey': apiKey
        }
      }));
      
      // Ensure proper structure
      const items = (result.Items || []).map(item => ({
        ...item,
        aifuture: ensureAifutureStructure(item.aifuture),
        role: ensureRoleStructure(item.role) // Ensure role is array
      }));
      
      return { 
        success: true, 
        items: items,
        message: items.length > 0 ? 'Websites found' : 'No websites found with this API key'
      };
    } else {
      const result = await dynamo.send(new ScanCommand({ TableName: TABLE_NAME }));
      
      // Ensure proper structure
      const items = (result.Items || []).map(item => ({
        ...item,
        aifuture: ensureAifutureStructure(item.aifuture),
        role: ensureRoleStructure(item.role) // Ensure role is array
      }));
      
      return { 
        success: true, 
        items: items,
        message: items.length > 0 ? 'All websites retrieved' : 'No websites found'
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
    
    if (result.Item) {
      const item = {
        ...result.Item,
        aifuture: ensureAifutureStructure(result.Item.aifuture),
        role: ensureRoleStructure(result.Item.role) // Ensure role is array
      };
      
      return { success: true, item: item };
    }
    
    return { success: false, error: 'Website not found' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// READ ONE BY API KEY
const getWebsiteByApiKey = async (apiKey) => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'apiKey = :apiKey',
      ExpressionAttributeValues: {
        ':apiKey': apiKey
      }
    }));
    
    if (result.Items && result.Items.length > 0) {
      const item = {
        ...result.Items[0],
        aifuture: ensureAifutureStructure(result.Items[0].aifuture),
        role: ensureRoleStructure(result.Items[0].role) // Ensure role is array
      };
      
      return { success: true, item: item };
    }
    
    return { success: false, error: 'No website found with this API key' };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// GET WEBSITE BY API KEY ONLY
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
      const item = {
        ...result.Items[0],
        aifuture: ensureAifutureStructure(result.Items[0].aifuture),
        role: ensureRoleStructure(result.Items[0].role) // Ensure role is array
      };
      
      return { 
        success: true, 
        data: item,
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
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const existingItem = existingResult.Item;
    
    // Build update expression and values
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = { ':updatedAt': timestamp };
    const expressionAttributeNames = {};
    
    // Helper to add field to update
    const addUpdateField = (fieldName, fieldValue, fieldAlias = null) => {
      const alias = fieldAlias || fieldName;
      const valueKey = `:${alias}`;
      const nameKey = `#${alias}`;
      
      updateExpression = updateExpression.replace('updatedAt = :updatedAt', `${nameKey} = ${valueKey}, updatedAt = :updatedAt`);
      expressionAttributeValues[valueKey] = fieldValue;
      expressionAttributeNames[nameKey] = fieldName;
    };
    
    // Update fields if provided in data
    if (data.websiteName !== undefined) {
      addUpdateField('websiteName', data.websiteName || '', 'name');
    }
    
    if (data.websiteUrl !== undefined) {
      addUpdateField('websiteUrl', data.websiteUrl || '', 'url');
    }
    
    if (data.systemPrompt !== undefined) {
      addUpdateField('systemPrompt', Array.isArray(data.systemPrompt) ? data.systemPrompt : [], 'sys');
    }
    
    if (data.customPrompt !== undefined) {
      addUpdateField('customPrompt', Array.isArray(data.customPrompt) ? data.customPrompt : [], 'custom');
    }
    
    if (data.category !== undefined) {
      addUpdateField('category', Array.isArray(data.category) ? data.category : ['General'], 'cat');
    }
 
    
    if (data.status !== undefined) {
      addUpdateField('status', data.status || 'active', 'st');
    }
    
    if (data.apiKey !== undefined) {
      addUpdateField('apiKey', data.apiKey || existingItem.apiKey, 'api');
    }
    
    // Handle role update
    if (data.role !== undefined) {
      const processedRole = processRoleData(data.role);
      addUpdateField('role', processedRole, 'role');
    }
    
    // Handle aifuture update
    if (data.aifuture !== undefined) {
      const processedAifuture = processAifutureData(data.aifuture);
      addUpdateField('aifuture', processedAifuture, 'ai');
    }
    
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
        ReturnValues: 'ALL_NEW',
      })
    );
    
    // Ensure proper structure
    const attributes = {
      ...result.Attributes,
      aifuture: ensureAifutureStructure(result.Attributes?.aifuture),
      role: ensureRoleStructure(result.Attributes?.role) // Ensure role is array
    };
    
    return { success: true, item: attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ADD ROLE TO WEBSITE
const addRoleToWebsite = async (id, roleToAdd) => {
  const timestamp = new Date().toISOString();
  
  try {
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const existingRole = ensureRoleStructure(existingResult.Item.role);
    
    // Process role to add
    const rolesToAdd = processRoleData(roleToAdd);
    
    // Merge roles, remove duplicates
    const mergedRoles = [...new Set([...existingRole, ...rolesToAdd])];
    
    // Update in database
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET role = :role, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':role': mergedRoles,
          ':updatedAt': timestamp,
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    
    // Ensure role has proper structure
    const attributes = {
      ...result.Attributes,
      role: ensureRoleStructure(result.Attributes?.role)
    };
    
    return { success: true, item: attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// REMOVE ROLE FROM WEBSITE
const removeRoleFromWebsite = async (id, roleToRemove) => {
  const timestamp = new Date().toISOString();
  
  try {
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const existingRole = ensureRoleStructure(existingResult.Item.role);
    
    // Process role to remove
    const rolesToRemove = processRoleData(roleToRemove);
    
    // Filter out roles to remove
    const filteredRoles = existingRole.filter(role => !rolesToRemove.includes(role));
    
    // If no roles left, add default 'user' role
    const finalRoles = filteredRoles.length > 0 ? filteredRoles : ['user'];
    
    // Update in database
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET role = :role, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':role': finalRoles,
          ':updatedAt': timestamp,
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    
    // Ensure role has proper structure
    const attributes = {
      ...result.Attributes,
      role: ensureRoleStructure(result.Attributes?.role)
    };
    
    return { success: true, item: attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// CHECK IF WEBSITE HAS ROLE
const websiteHasRole = async (id, roleToCheck) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    
    if (!result.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const roles = ensureRoleStructure(result.Item.role);
    const roleStr = String(roleToCheck).trim();
    
    const hasRole = roles.includes(roleStr);
    
    return { 
      success: true, 
      hasRole: hasRole,
      roles: roles,
      message: hasRole ? `Website has role '${roleStr}'` : `Website does not have role '${roleStr}'`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// GET WEBSITES BY ROLE
const getWebsitesByRole = async (roleToFind) => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));
    
    if (!result.Items || result.Items.length === 0) {
      return { 
        success: true, 
        items: [],
        message: 'No websites found'
      };
    }
    
    // Process role to find
    const targetRoles = processRoleData(roleToFind);
    
    // Filter websites that have any of the target roles
    const filteredItems = result.Items.filter(item => {
      const websiteRoles = ensureRoleStructure(item.role);
      return targetRoles.some(targetRole => websiteRoles.includes(targetRole));
    });
    
    // Ensure proper structure
    const items = filteredItems.map(item => ({
      ...item,
      aifuture: ensureAifutureStructure(item.aifuture),
      role: ensureRoleStructure(item.role)
    }));
    
    return { 
      success: true, 
      items: items,
      message: items.length > 0 
        ? `Found ${items.length} websites with role(s): ${targetRoles.join(', ')}` 
        : `No websites found with role(s): ${targetRoles.join(', ')}`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// GET WEBSITES BY MULTIPLE ROLES (AND condition)
const getWebsitesByAllRoles = async (requiredRoles) => {
  try {
    if (!Array.isArray(requiredRoles) || requiredRoles.length === 0) {
      return { success: false, error: 'requiredRoles must be a non-empty array' };
    }
    
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));
    
    if (!result.Items || result.Items.length === 0) {
      return { 
        success: true, 
        items: [],
        message: 'No websites found'
      };
    }
    
    // Process required roles
    const targetRoles = requiredRoles.map(role => String(role).trim()).filter(role => role.length > 0);
    
    // Filter websites that have ALL required roles
    const filteredItems = result.Items.filter(item => {
      const websiteRoles = ensureRoleStructure(item.role);
      return targetRoles.every(targetRole => websiteRoles.includes(targetRole));
    });
    
    // Ensure proper structure
    const items = filteredItems.map(item => ({
      ...item,
      aifuture: ensureAifutureStructure(item.aifuture),
      role: ensureRoleStructure(item.role)
    }));
    
    return { 
      success: true, 
      items: items,
      message: items.length > 0 
        ? `Found ${items.length} websites with all roles: ${targetRoles.join(', ')}` 
        : `No websites found with all roles: ${targetRoles.join(', ')}`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// GET ALL UNIQUE ROLES
const getAllUniqueRoles = async () => {
  try {
    const result = await dynamo.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));
    
    if (!result.Items || result.Items.length === 0) {
      return { 
        success: true, 
        roles: ['user'], // Default role
        message: 'No websites found, returning default role'
      };
    }
    
    // Collect all unique roles
    const allRoles = new Set();
    
    result.Items.forEach(item => {
      const roles = ensureRoleStructure(item.role);
      roles.forEach(role => allRoles.add(role));
    });
    
    const uniqueRoles = Array.from(allRoles).sort();
    
    return { 
      success: true, 
      roles: uniqueRoles,
      message: `Found ${uniqueRoles.length} unique roles`
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// UPDATE AIFUTURE ONLY BY ID
const updateWebsiteAifuture = async (id, aifutureData) => {
  const timestamp = new Date().toISOString();
  
  // Process aifuture data
  const processedAifuture = processAifutureData(aifutureData);
  
  try {
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':aifuture': processedAifuture,
          ':updatedAt': timestamp,
        },
        ReturnValues: 'ALL_NEW',
      })
    );
    
    // Ensure proper structure
    const attributes = {
      ...result.Attributes,
      aifuture: ensureAifutureStructure(result.Attributes?.aifuture),
      role: ensureRoleStructure(result.Attributes?.role) // Ensure role is array
    };
    
    return { success: true, item: attributes };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// ADD SINGLE ITEM TO AIFUTURE ARRAY
const addToAifuture = async (id, newItem) => {
  const timestamp = new Date().toISOString();
  
  try {
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    
    // Process new item
    const processedNewItems = processAifutureData([newItem]);
    
    if (processedNewItems.length === 0) {
      return { success: false, error: 'Invalid aifuture item' };
    }
    
    const newAifutureItem = processedNewItems[0];
    
    // Check if item with same title already exists
    const existingIndex = existingAifuture.findIndex(item => item.title === newAifutureItem.title);
    
    if (existingIndex !== -1) {
      // Merge values if title exists
      const existingValues = existingAifuture[existingIndex].value;
      const newValues = newAifutureItem.value;
      const mergedValues = [...new Set([...existingValues, ...newValues])]; // Remove duplicates
      
      existingAifuture[existingIndex].value = mergedValues;
    } else {
      // Add new item
      existingAifuture.push(newAifutureItem);
    }
    
    // Update in database
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':aifuture': existingAifuture,
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

// UPDATE SPECIFIC AIFUTURE ITEM BY TITLE
const updateAifutureItemByTitle = async (id, title, newValue) => {
  const timestamp = new Date().toISOString();
  
  try {
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    let existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    
    // Process new value
    let valueArray = [];
    if (Array.isArray(newValue)) {
      valueArray = newValue;
    } else if (typeof newValue === 'string') {
      valueArray = newValue.split(',').map(v => v.trim()).filter(v => v);
    } else if (newValue !== undefined && newValue !== null) {
      valueArray = [String(newValue)];
    }
    
    // Find item by title
    const itemIndex = existingAifuture.findIndex(item => item.title === title);
    
    if (itemIndex !== -1) {
      // Update existing item
      existingAifuture[itemIndex].value = valueArray;
    } else {
      // Add new item
      existingAifuture.push({
        title: title,
        value: valueArray
      });
    }
    
    // Update in database
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':aifuture': existingAifuture,
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

// DELETE SPECIFIC AIFUTURE ITEM BY TITLE
const deleteAifutureItemByTitle = async (id, title) => {
  const timestamp = new Date().toISOString();
  
  try {
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    let existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    
    // Filter out item with specified title
    const filteredAifuture = existingAifuture.filter(item => item.title !== title);
    
    // Update in database
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':aifuture': filteredAifuture,
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

// DELETE VALUE FROM SPECIFIC AIFUTURE ITEM
const deleteValueFromAifutureItem = async (id, title, valueToDelete) => {
  const timestamp = new Date().toISOString();
  
  try {
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    let existingAifuture = ensureAifutureStructure(existingResult.Item.aifuture);
    
    // Find item by title
    const itemIndex = existingAifuture.findIndex(item => item.title === title);
    
    if (itemIndex !== -1) {
      // Filter out the value to delete
      existingAifuture[itemIndex].value = existingAifuture[itemIndex].value.filter(
        val => val !== valueToDelete
      );
      
      // If no values left, remove the entire item
      if (existingAifuture[itemIndex].value.length === 0) {
        existingAifuture.splice(itemIndex, 1);
      }
    } else {
      return { success: false, error: `Item with title '${title}' not found` };
    }
    
    // Update in database
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':aifuture': existingAifuture,
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

// CLEAR ALL AIFUTURE DATA
const clearAifuture = async (id) => {
  const timestamp = new Date().toISOString();
  
  try {
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET aifuture = :aifuture, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':aifuture': [],
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

// GET AIFUTURE ITEM BY TITLE
const getAifutureItemByTitle = async (id, title) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    
    if (!result.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const aifuture = ensureAifutureStructure(result.Item.aifuture);
    const item = aifuture.find(item => item.title === title);
    
    if (item) {
      return { success: true, item: item };
    } else {
      return { success: false, error: `Item with title '${title}' not found` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// GET ALL AIFUTURE TITLES
const getAllAifutureTitles = async (id) => {
  try {
    const result = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { id } }));
    
    if (!result.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const aifuture = ensureAifutureStructure(result.Item.aifuture);
    const titles = aifuture.map(item => item.title);
    
    return { success: true, titles: titles };
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// UPDATE CUSTOM DATA ONLY BY ID
const updateWebsiteCustomData = async (id, data) => {
  const timestamp = new Date().toISOString();
  
  try {
    // First get existing website
    const existingResult = await dynamo.send(new GetCommand({ 
      TableName: TABLE_NAME, 
      Key: { id } 
    }));
    
    if (!existingResult.Item) {
      return { success: false, error: 'Website not found' };
    }
    
    const existingItem = existingResult.Item;
    
    // Build update expression
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = { ':updatedAt': timestamp };
    
    // Helper to add field to update
    const addUpdateField = (fieldName, fieldValue, valueKey) => {
      updateExpression = updateExpression.replace('updatedAt = :updatedAt', `${fieldName} = :${valueKey}, updatedAt = :updatedAt`);
      expressionAttributeValues[`:${valueKey}`] = fieldValue;
    };
    
    // Update fields if provided
    if (data.customPrompt !== undefined) {
      addUpdateField('customPrompt', Array.isArray(data.customPrompt) ? data.customPrompt : [], 'customPrompt');
    }
    
    if (data.urls !== undefined) {
      addUpdateField('urls', Array.isArray(data.urls) ? data.urls : [], 'urls');
    }
    
    if (data.library !== undefined) {
      addUpdateField('library', Array.isArray(data.library) ? data.library : [], 'library');
    }
    
    if (data.aifuture !== undefined) {
      const processedAifuture = processAifutureData(data.aifuture);
      addUpdateField('aifuture', processedAifuture, 'aifuture');
    }
    
    if (data.role !== undefined) {
      const processedRole = processRoleData(data.role);
      addUpdateField('role', processedRole, 'role');
    }
    
    const result = await dynamo.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
    );
    
    // Ensure proper structure
    const attributes = {
      ...result.Attributes,
      aifuture: ensureAifutureStructure(result.Attributes?.aifuture),
      role: ensureRoleStructure(result.Attributes?.role)
    };
    
    return { success: true, item: attributes };
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
    
    // Ensure role has proper structure
    const attributes = {
      ...result.Attributes,
      role: ensureRoleStructure(result.Attributes?.role)
    };
    
    return { success: true, item: attributes };
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
  deleteWebsite,
};