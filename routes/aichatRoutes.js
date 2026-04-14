const express = require('express');
const router = express.Router();
const axios = require('axios');
require('dotenv').config();

router.post('/chat', async (req, res) => {

try {

    const { question } = req.body;

    const response = await axios.post(
        `${process.env.GEMINI_API_URL}?key=${process.env.GEMINI_API_KEY}`,
        {
            contents: [
                {
                    parts: [
                        { text: question }
                    ]
                }
            ]
        },
        {
            headers:{
                "Content-Type":"application/json"
            }
        }
    );

    const reply =
        response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    res.json({
        success:true,
        reply
    });

} catch(err){

    console.error("Gemini error:", err.response?.data || err.message);

    res.status(500).json({
        success:false,
        message:"Gemini error",
        error: err.response?.data || err.message
    });
}

});

module.exports = router;