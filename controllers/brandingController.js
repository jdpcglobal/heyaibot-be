const Branding = require('../models/Branding');

class BrandingController {

  async saveBranding(req, res) {
    try {
      const { apiKey, headerColor, poweredByText, poweredByUrl } = req.body;

      if (!apiKey) {
        return res.status(400).json({ success: false, message: 'API key is required' });
      }
      if (!headerColor) {
        return res.status(400).json({ success: false, message: 'Header color is required' });
      }

      let existingBranding = await Branding.findByApiKey(apiKey);
      let savedBranding;

      if (existingBranding) {
        // ✅ Update all fields including poweredBy
        const params = {
          TableName: 'branding-settings',
          Key: { apiKey },
          UpdateExpression: 'SET headerColor = :headerColor, poweredByText = :poweredByText, poweredByUrl = :poweredByUrl, updatedAt = :updatedAt',
          ExpressionAttributeValues: {
            ':headerColor': headerColor,
            ':poweredByText': poweredByText || existingBranding.poweredByText || 'JDPC Global',
            ':poweredByUrl': poweredByUrl || existingBranding.poweredByUrl || 'https://jdpcglobal.com',
            ':updatedAt': new Date().toISOString()
          },
          ReturnValues: 'ALL_NEW'
        };
        const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
        const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
        const client = new DynamoDBClient({ region: process.env.REGION || 'us-east-1', credentials: { accessKeyId: process.env.ACCESS_KEY_ID, secretAccessKey: process.env.SECRET_ACCESS_KEY } });
        const dynamoDB = DynamoDBDocumentClient.from(client);
        const result = await dynamoDB.send(new UpdateCommand(params));
        savedBranding = result.Attributes;
      } else {
        const newBranding = new Branding({
          apiKey,
          headerColor,
          // ✅ Save poweredBy fields
          poweredByText: poweredByText || 'JDPC Global',
          poweredByUrl: poweredByUrl || 'https://jdpcglobal.com',
          createdAt: new Date().toISOString()
        });
        savedBranding = await newBranding.save();
      }

      return res.status(200).json({
        success: true,
        message: existingBranding ? 'Branding updated successfully' : 'Branding created successfully',
        data: {
          apiKey: savedBranding.apiKey,
          headerColor: savedBranding.headerColor,
          poweredByText: savedBranding.poweredByText,  // ✅
          poweredByUrl: savedBranding.poweredByUrl,    // ✅
          createdAt: savedBranding.createdAt,
          updatedAt: savedBranding.updatedAt
        }
      });

    } catch (error) {
      console.error('Save branding error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }

  async getBranding(req, res) {
    try {
      const { apiKey } = req.params;
      if (!apiKey) {
        return res.status(400).json({ success: false, message: 'API key is required' });
      }

      const branding = await Branding.findByApiKey(apiKey);
      if (!branding) {
        return res.status(404).json({ success: false, message: 'Branding not found for this API key' });
      }

      return res.status(200).json({
        success: true,
        data: {
          apiKey: branding.apiKey,
          headerColor: branding.headerColor,
          poweredByText: branding.poweredByText || 'JDPC Global',  // ✅
          poweredByUrl: branding.poweredByUrl || 'https://jdpcglobal.com',  // ✅
          createdAt: branding.createdAt,
          updatedAt: branding.updatedAt
        }
      });

    } catch (error) {
      console.error('Get branding error:', error);
      return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }

  async updateHeaderColor(req, res) {
    try {
      const { apiKey } = req.params;
      const { headerColor } = req.body;
      if (!apiKey) return res.status(400).json({ success: false, message: 'API key is required' });
      if (!headerColor) return res.status(400).json({ success: false, message: 'Header color is required' });
      const existingBranding = await Branding.findByApiKey(apiKey);
      if (!existingBranding) return res.status(404).json({ success: false, message: 'Branding not found' });
      const updatedBranding = await Branding.updateHeaderColor(apiKey, headerColor);
      return res.status(200).json({
        success: true,
        message: 'Header color updated successfully',
        data: {
          apiKey: updatedBranding.apiKey,
          headerColor: updatedBranding.headerColor,
          poweredByText: updatedBranding.poweredByText || 'JDPC Global',
          poweredByUrl: updatedBranding.poweredByUrl || 'https://jdpcglobal.com',
          createdAt: updatedBranding.createdAt,
          updatedAt: updatedBranding.updatedAt
        }
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }

  async deleteBranding(req, res) {
    try {
      const { apiKey } = req.params;
      if (!apiKey) return res.status(400).json({ success: false, message: 'API key is required' });
      const existingBranding = await Branding.findByApiKey(apiKey);
      if (!existingBranding) return res.status(404).json({ success: false, message: 'Branding not found' });
      await Branding.deleteByApiKey(apiKey);
      return res.status(200).json({ success: true, message: 'Branding deleted successfully' });
    } catch (error) {
      return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }
}

module.exports = new BrandingController();