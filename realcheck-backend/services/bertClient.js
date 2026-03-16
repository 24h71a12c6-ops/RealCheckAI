const axios = require("axios");

function clamp01(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return null;
  return Math.max(0, Math.min(1, x));
}

async function callBertPredict(text) {
  const enabled = String(process.env.BERT_ENABLED || "").toLowerCase() === "true";
  const configuredUrl = String(process.env.BERT_SERVICE_URL || "").trim();

  // Opt-in: avoid accidental latency when the service is not in use.
  if (!enabled && !configuredUrl) {
    return {
      ok: false,
      source: "bert:disabled",
      reason: "BERT not enabled (set BERT_ENABLED=true and/or BERT_SERVICE_URL)",
      label: null,
      scam_probability: null,
      legit_probability: null,
      score_0_100: null
    };
  }

  const baseUrl = configuredUrl || "http://localhost:8000";
  const url = `${String(baseUrl).replace(/\/$/, "")}/predict`;

  const payload = { text: String(text || "").slice(0, 20000) };
  if (!payload.text.trim()) {
    return {
      ok: false,
      source: "bert:skipped",
      reason: "Empty text",
      label: null,
      scam_probability: null,
      legit_probability: null,
      score_0_100: null
    };
  }

  try {
    const res = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: Number(process.env.BERT_TIMEOUT_MS || 1500)
    });

    const data = res?.data || {};
    const scamP = clamp01(data.scam_probability);
    const legitP = clamp01(data.legit_probability);
    const score = scamP !== null ? Math.round(scamP * 100) : null;

    return {
      ok: true,
      source: "bert:local",
      label: data.label || null,
      scam_probability: scamP,
      legit_probability: legitP,
      score_0_100: score
    };
  } catch (error) {
    return {
      ok: false,
      source: "bert:unavailable",
      reason: error?.message || String(error),
      label: null,
      scam_probability: null,
      legit_probability: null,
      score_0_100: null
    };
  }
}

module.exports = { callBertPredict };
