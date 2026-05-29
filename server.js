// server.js

// ---------------------------
//  Import Dependencies
// ---------------------------
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();
const localChatRoutes = require("./routes/localChatRoutes");
// ---------------------------
//  Initialize App
// ---------------------------
const app = express();

// ---------------------------
//  Middleware
// ---------------------------
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ---------------------------
//  Serve Static Files
// ---------------------------
app.use(express.static(path.join(__dirname, "public")));

// ---------------------------
//  Root Route
// ---------------------------
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use('/api/local', localChatRoutes);
app.use('/', localChatRoutes);
// ---------------------------
//  Health Check Route
// ---------------------------



app.get("/health", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ---------------------------
//  API Documentation Route
// ---------------------------
app.get("/api/docs", (req, res) => {
  res.json({
    message: "API Documentation",
    endpoints: {
      websites: {
        "POST /pdf-upload": "Upload one PDF and save extracted text locally",
        "GET /knowledge": "Get the currently stored local PDF knowledge",
        "DELETE /knowledge": "Clear the locally stored PDF knowledge",
        "POST /chat": "Ask a question against the locally stored PDF knowledge",
        "POST /api/local/pdf-upload": "Upload one PDF and save extracted text locally",
        "GET /api/local/knowledge": "Get the currently stored local PDF knowledge",
        "DELETE /api/local/knowledge": "Clear the locally stored PDF knowledge",
        "POST /api/local/chat": "Ask a question against the locally stored PDF knowledge"
      }
    }
  });
});

// ---------------------------
//  404 Handler
// ---------------------------
app.use((req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.path,
    method: req.method
  });
});

// ---------------------------
//  Error Handling Middleware
// ---------------------------
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong!' : err.message 
  });
});

// ---------------------------
//  Start Server
// ---------------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`\n✅ Server running on port ${PORT}`);
  console.log(`✅ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`✅ API available at http://localhost:${PORT}`);
  console.log(`✅ Health check: http://localhost:${PORT}/health`);
  console.log(`✅ API Docs: http://localhost:${PORT}/api/docs\n`);
});
