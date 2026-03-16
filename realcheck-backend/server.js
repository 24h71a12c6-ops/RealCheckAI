require('dotenv').config();

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const analyzeJobRoute = require('./routes/analyzeJob');
const domainRoutes = require('./routes/domain');
const { callGeminiAnalysis } = require('./services/scamDetector');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

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

app.post('/api/gemini-analyze', async (req, res) => {
    const text = req.body?.text || req.body?.extractedText;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            error: 'Gemini API key missing. Set GEMINI_API_KEY in your .env file.'
        });
    }

    if (!String(text || '').trim()) {
        return res.status(400).json({ error: 'Text is required for analysis.' });
    }

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
                contents: [{
                    parts: [{
                        text: `Analyze this internship/job offer for scams or low-quality mass-recruitment templates (e.g. CodSoft-style letters).\nText: "${text}"\nProvide a Risk Score (0-100) and a clear 2-3 sentence verdict. Be direct, concise, and helpful.`
                    }]
                }]
            },
            {
                headers: { 'Content-Type': 'application/json' },
                timeout: 20000
            }
        );

        const aiText = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!aiText) {
            return res.status(502).json({ error: 'Gemini returned an empty response.' });
        }

        return res.json({ verdict: aiText });
    } catch (error) {
        const status = error.response?.status || 500;
        const message = error.response?.data?.error?.message || error.message || 'Gemini request failed.';
        return res.status(status).json({ error: message });
    }
});

app.get('/api/health/llm', async (req, res) => {
    const dummyScamText = [
        'Dear Candidate,',
        'You are directly selected for the role.',
        'Offer expires in 4 hours.',
        'Interview will happen on WhatsApp only.',
        'Pay processing fee Rs. 1500 before onboarding.'
    ].join(' ');

    try {
        const result = await callGeminiAnalysis(dummyScamText);
        const numericScore = Number(result?.ai_score);
        const schemaOk = Number.isFinite(numericScore);

        if (!schemaOk) {
            return res.status(503).json({
                ok: false,
                provider: 'gemini',
                hybrid_ready: false,
                reason: result?.reason || 'Gemini did not return a numeric ai_score.',
                llm_source: result?.source || 'unknown',
                schema_ok: false,
                probe_result: result
            });
        }

        return res.json({
            ok: true,
            provider: 'gemini',
            hybrid_ready: true,
            schema_ok: true,
            llm_source: result.source,
            ai_score: numericScore,
            markers: Array.isArray(result.markers) ? result.markers : [],
            reason: result.reason || 'LLM health probe passed.'
        });
    } catch (error) {
        return res.status(503).json({
            ok: false,
            provider: 'gemini',
            hybrid_ready: false,
            schema_ok: false,
            error: error.message || 'LLM health probe failed.'
        });
    }
});

// Routes
app.use('/api', domainRoutes);
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
