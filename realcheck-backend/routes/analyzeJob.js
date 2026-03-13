const express = require('express');
const router = express.Router();
const { detectScam } = require('../services/scamDetector');

router.post('/', async (req, res) => {
    try {
        const result = await detectScam(req.body || {});
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: "An error occurred during analysis" });
    }
});

module.exports = router;
