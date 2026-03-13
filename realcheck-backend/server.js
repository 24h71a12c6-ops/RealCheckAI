require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const analyzeJobRoute = require('./routes/analyzeJob');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

// Routes
app.use('/api/analyze-job', analyzeJobRoute);

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
