// routes/tokenDetailsRoutes.js

const express = require('express');
const router = express.Router();
const { getTotalTokensByUserId } = require('../models/websiteModel');


// ================= INTERNAL FUNCTION =================
async function getTokenDetailsInternal(userId) {
  try {
    if (!userId || userId.trim() === '') {
      return {
        success: false,
        error: 'userId is required',
        totalToken: 0
      };
    }

    const result = await getTotalTokensByUserId(userId);

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'No tokens found for this user',
        totalToken: 0
      };
    }

    return {
      success: true,
      totalToken: result.totalTokens
    };

  } catch (error) {
    console.error('Internal Token Details Error:', error.message);

    return {
      success: false,
      error: 'Unable to fetch token details',
      totalToken: 0
    };
  }
}



// ================= CLIENT API =================
router.post('/get-token-details', async (req, res) => {
  try {
    const { userId, totalToken } = req.body;

    // validation
    if (!userId || userId.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'userId is required'
      });
    }

    // DB token fetch
    const tokenResult = await getTokenDetailsInternal(userId);

    if (!tokenResult.success) {
      return res.status(404).json({
        success: false,
        message: tokenResult.error
      });
    }

    const payloadTotal = totalToken || 0;
    const userTotal = tokenResult.totalToken || 0;

    // percentage calculation
    const percentageNumber =
      payloadTotal > 0
        ? (userTotal / payloadTotal) * 100
        : 0;

    const percentage = percentageNumber.toFixed(1) + "%";

    // message logic
    let message = "Token details fetched successfully";

    if (percentageNumber >= 100) {
      message = "All token use";
    }

    return res.status(200).json({
      success: true,
      message: message,
      usertotalTokenPercentage: percentage
    });

  } catch (error) {
    console.error('Client Token Details API Error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to fetch token details'
    });
  }
});



// ================= INTERNAL API (optional) =================
router.get('/token-details/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await getTotalTokensByUserId(userId);

    if (!result.success) {
      return res.status(404).json({
        success: false,
        error: result.error || 'No tokens found for this user',
        totalToken: 0
      });
    }

    return res.status(200).json({
      success: true,
      totalToken: result.totalTokens
    });

  } catch (error) {
    console.error('Token Details API Error:', error.message);

    return res.status(500).json({
      success: false,
      error: 'Unable to fetch token details',
      totalToken: 0
    });
  }
});

module.exports = router;