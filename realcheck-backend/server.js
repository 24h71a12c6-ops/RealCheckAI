require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const analyzeJobRoute = require('./routes/analyzeJob');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.get('/api/firebase-config', (req, res) => {
    const config = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
        measurementId: process.env.FIREBASE_MEASUREMENT_ID
    };

    const hasRequired = config.apiKey && config.authDomain && config.projectId && config.appId;
    if (!hasRequired) {
        return res.status(500).json({
            error: 'Firebase config missing. Please check environment variables.'
        });
    }

    return res.json(config);
});

// Routes
app.use('/api/analyze-job', analyzeJobRoute);

app.get('/api/remote-jobs', async (req, res) => {
    try {
        const response = await axios.get('https://remoteok.com/api', {
            timeout: 10000,
            headers: { 'User-Agent': 'RealCheckAI/1.0 (job-verification-tool)' }
        });

        const jobs = Array.isArray(response.data)
            ? response.data.slice(1).filter((job) => job && job.id && job.position).map((job) => ({
                id: job.id,
                position: job.position,
                company: job.company,
                location: job.location || 'Remote',
                description: job.description || '',
                apply_url: job.url,
                tags: job.tags || [],
                logo: job.logo || '',
                riskScore: Math.floor(Math.random() * 20)
            }))
            : [];

        return res.json(jobs);
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch jobs' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
