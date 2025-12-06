// server.js

// ---------------------------
//  Import Dependencies
// ---------------------------
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
require("dotenv").config();

// ---------------------------
//  Import Routes
// ---------------------------
const childPromptRoutes = require("./routes/promptsRoutes");
const websiteRoutes = require("./routes/websiteRoutes");
const chatRoutes = require("./routes/chatRoutes");
const codeConfigRoutes = require("./routes/codeConfigRoutes");
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

// ---------------------------
//  API Routes
// ---------------------------
app.use("/api/childprompt", childPromptRoutes);
app.use("/api/websites", websiteRoutes);
app.use("/api", chatRoutes);

app.use("/code-config", codeConfigRoutes);
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
        "GET /api/websites": "Get all websites or specific website by API key",
        "GET /api/websites/:id": "Get website by ID",
        "GET /api/websites/by-api-key/key": "Get website by API key",
        "POST /api/websites": "Create new website",
        "PUT /api/websites/:id": "Update website by ID",
        "PATCH /api/websites/:id/custom-data": "Update custom data by ID",
        "PATCH /api/websites/:id/status": "Update status by ID",
        "DELETE /api/websites/:id": "Delete website by ID",
        "POST /api/websites/sync": "Sync websites from external API"
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