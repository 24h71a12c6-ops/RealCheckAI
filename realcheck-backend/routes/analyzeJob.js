const express = require('express');
const router = express.Router();
const { detectScam } = require('../services/scamDetector');
const { extractEntitiesAndHints } = require('../services/textExtractor');

router.post('/', async (req, res) => {
    try {
        const body = req.body || {};
        const rawText = String(body.rawText || body.text || body.message || '').trim();

        // Single-input flow: derive email/domain from text when fields are absent.
        const extracted = await extractEntitiesAndHints(rawText);

        const message = String(body.message || rawText || '');
        const email = String(body.email || extracted.recruiter_email || '');
        const website = String(body.website || extracted.company_website || '');
        const companyName = String(body.companyName || extracted.company_name || '');

        const detection = await detectScam({ message, email, website, companyName });
        const verdict =
            detection.risk === 'High'
                ? 'High scam probability — avoid sharing money or personal documents until independently verified.'
                : detection.risk === 'Medium'
                ? 'Some warning signs detected — verify recruiter identity, interview process, and company domain before proceeding.'
                : 'No major scam indicators detected from available text, but still verify company and communication channels.';

        // Required JSON structure for single-input extractor workflow.
        const response = {
            recruiter_email: email || null,
            company_website: website || null,
            company_name: companyName || null,
            linkedin_status: detection.linkedin_status || 'not_checked',
            domain_status: detection.domain_status || 'not_checked',
            domain_checked: detection.domain_checked || null,
            domain_age_days: Number.isFinite(detection.domain_age_days) ? detection.domain_age_days : null,
            domain_created_date: detection.domain_created_date || null,
            // New structured scoring model
            scam_score: Number.isFinite(detection.scam_score) ? detection.scam_score : detection.score,
            hard_rules_score: Number.isFinite(detection.hard_rules_score) ? detection.hard_rules_score : null,
            llm_score: Number.isFinite(detection.llm_score) ? detection.llm_score : null,
            llm_reason: detection.llm_reason || null,
            llm_markers: Array.isArray(detection.llm_markers) ? detection.llm_markers : [],
            llm_source: detection.llm_source || null,
            hybrid_active: Boolean(detection.hybrid_active),
            weights: detection.weights || { hard: 0.7, llm: 0.3 },
            green_bonus: Number.isFinite(detection.green_bonus) ? detection.green_bonus : 0,
            green_flags: Array.isArray(detection.green_flags) ? detection.green_flags : [],
            risk_band: detection.risk_band || (detection.score > 60 ? 'SCAM' : detection.score > 30 ? 'Suspicious' : 'Safe'),
            red_flags: Array.isArray(detection.red_flags) ? detection.red_flags : (Array.isArray(detection.reasons) ? detection.reasons : []),
            metadata: detection.metadata || null,
            risk_level: detection.risk,
            score: detection.score,
            reasons: Array.isArray(detection.reasons) ? detection.reasons : [],
            verdict: detection.verdict || verdict
        };

        // Backward compatibility for existing frontend bindings.
        return res.json({
            ...response,
            risk: response.risk_level
        });
    } catch (error) {
        console.error('Analyze route error:', error.message);
        res.status(500).json({ error: "An error occurred during analysis" });
    }
});

module.exports = router;
