const express = require('express');
const router = express.Router();
const axios = require('axios');

// Maps keyword patterns to filter-tab domain values
const ROLE_KEYWORDS = {
    'web developer':      ['web developer', 'frontend', 'front-end', 'fullstack', 'full-stack', 'react', 'vue', 'angular', 'ui developer'],
    'data analyst':       ['data analyst', 'business analyst', 'bi analyst', 'analytics', 'data analysis'],
    'ai/ml engineer':     ['machine learning', 'ml engineer', 'ai engineer', 'deep learning', 'data scientist', 'nlp', 'computer vision'],
    'backend developer':  ['backend', 'back-end', 'node.js', 'python developer', 'java developer', 'api developer', 'devops', 'cloud engineer', 'golang'],
    'internship':         ['intern', 'internship', 'apprentice', 'junior'],
};

function classifyRole(position = '', tags = []) {
    const text = (position + ' ' + tags.join(' ')).toLowerCase();
    for (const [role, keywords] of Object.entries(ROLE_KEYWORDS)) {
        if (keywords.some(kw => text.includes(kw))) return role;
    }
    return 'other';
}

// Lightweight pattern scoring (no async network calls — RemoteOK is already curated)
function quickRiskScore(job) {
    const text = [job.position, job.company, job.description || ''].join(' ').toLowerCase();
    let score = 5; // base — RemoteOK pre-vets listings
    if (/fee|deposit|pay to apply|registration charge/i.test(text))     score += 70;
    if (/guaranteed\s*(income|salary|job)|earn \$\d{4,}|make money fast/i.test(text)) score += 45;
    if (/urgent(ly)?\s*(hiring|joining)|apply now.*immediately/i.test(text)) score += 20;
    if (/no experience needed.*earn/i.test(text))                        score += 25;
    return Math.min(score, 100);
}

// Only allow http/https URLs to prevent injection via apply_url
function sanitizeUrl(url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
    } catch (_) { /* fall through */ }
    return '#';
}

router.get('/', async (req, res) => {
    try {
        const response = await axios.get('https://remoteok.com/api', {
            headers: { 'User-Agent': 'RealCheckAI/1.0 (job-verification-tool)' },
            timeout: 10000,
        });

        // RemoteOK: first array element is legal/metadata, so skip it first.
        const rawJobs = Array.isArray(response.data)
            ? response.data.slice(1).filter(j => j && j.id && j.position)
            : [];

        const jobs = rawJobs.slice(0, 60).map(job => {
            const riskScore = quickRiskScore(job);
            const status = riskScore >= 60 ? 'Suspicious' : riskScore >= 30 ? 'Review' : 'Verified';
            return {
                position:  String(job.position  || 'Unknown Role').trim(),
                company:   String(job.company   || 'Unknown Company').trim(),
                location:  String(job.location  || 'Remote').trim(),
                description: String(job.description || '').trim(),
                apply_url: sanitizeUrl(job.url || job.apply_url || '#'),
                salary:    job.salary ? String(job.salary).trim() : null,
                tags:      Array.isArray(job.tags) ? job.tags.slice(0, 4).map(String) : [],
                riskScore,
                status,
                role:      classifyRole(job.position, job.tags || []),
                sourceRole: Array.isArray(job.tags) && job.tags[0] ? String(job.tags[0]).trim() : 'General'
            };
        });

        return res.json(jobs);
    } catch (err) {
        console.error('RemoteOK fetch error:', err.message);
        return res.status(502).json({ error: 'Could not fetch remote jobs right now. Try again shortly.' });
    }
});

module.exports = router;
