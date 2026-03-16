const assert = require('@agent/assert');
const { detectScam } = require('./services/scamDetector');

test("Critical refundable+pay trap forces High risk", async () => {
  const message = [
    "Congratulations! You are selected for Amazon Internship.",
    "A refundable security deposit is required.",
    "Please pay ₹999 via UPI today to confirm your seat. (Refundable after onboarding)"
  ].join("\n");

  const result = await detectScam({
    message,
    email: "", // simulate 'skipped' external checks
    website: "",
    companyName: "Amazon"
  });

  assert.ok(Number.isFinite(result.score), "score should be numeric");
  assert.ok(result.score >= 95, `expected score >= 95 but got ${result.score}`);
  assert.strictEqual(result.risk, 'High');
  assert.strictEqual(result.risk_band, 'SCAM');
});
