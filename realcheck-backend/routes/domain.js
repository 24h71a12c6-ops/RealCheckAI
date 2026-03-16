const express = require("express");
const router = express.Router();
const { checkJobOffer } = require("../services/scamDetector");

// GET /api/domain-check?url=https://google.com
router.get("/domain-check", async (req, res) => {
  try {
    const url = req.query.url;

    if (!url) {
      return res.status(400).json({ error: "URL required" });
    }

    const result = await checkJobOffer(url);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
});

module.exports = router;
