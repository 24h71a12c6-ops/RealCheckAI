require("dotenv").config();
const axios = require("axios");

// (OpenAI removed — using pattern-based AI simulation instead)

// ─── Detection Data ───────────────────────────────────────────────────────────

const paymentKeywords = [
  "registration fee", "training fee", "security deposit", "processing fee",
  "guaranteed job", "limited seats", "instant joining", "pay to confirm",
  "application fee", "exam fee", "assessment fee", "refundable deposit",
  "internship fee", "bond amount", "background verification fee",
  "pay before interview", "seat booking fee", "document verification fee",
  "placement guarantee"
];

const suspiciousChannels = [
  "whatsapp", "telegram", "dm for job", "direct message", "signal"
];

const freeEmailDomains = [
  "gmail.com", "yahoo.com", "outlook.com",
  "hotmail.com", "rediffmail.com", "ymail.com", "live.com"
];

const paymentPatterns = [
  /\bpay\b[\s\S]{0,25}\b(confirm|registration|fee|deposit|processing|assessment|application)\b/i,
  /\b(registration|application|assessment|processing|training|internship|exam|seat)\s*fee\b/i,
  /\b(pay|payment|send|transfer|deposit)\b[\s\S]{0,35}(₹|\$|rs\.?|inr)\s*\d[\d,]*/i,
  /(₹|\$|rs\.?|inr)\s*\d[\d,]*[\s\S]{0,35}\b(registration|application|processing|training|internship|exam|assessment|verification|booking|security)\s*(fee|charge|deposit)\b/i,
  /\$\s*\d+[\d,]*\s*(fee|deposit|charge|payment)/i
];

const compensationSafePatterns = [
  /\bstipend\b/i,
  /\bsalary\b/i,
  /\bctc\b/i,
  /\bper\s*(month|year|annum)\b/i,
  /\/\s*(month|year)\b/i,
  /\blpa\b/i
];

const strongFraudPaymentTerms = /\b(registration fee|training fee|security deposit|processing fee|pay to confirm|application fee|exam fee|assessment fee|refundable deposit|internship fee|bond amount|background verification fee|pay before interview|seat booking fee|document verification fee|placement guarantee)\b/i;

const urgencyPatterns = [
  /urgent(ly)?\s+(hiring|joining|response)/i,
  /(apply|pay)\s*(now|today|immediately)/i,
  /last\s*(date|chance|few\s*hours)/i,
  /(limited|few)\s*seats/i,
  /offer\s*(expires|ends|valid)\s*(in|today|tomorrow)/i,
  /respond\s*(within|before)\s*\d+/i
];

// Sophisticated scam patterns (not crude keywords)
const sophisticatedScamPatterns = [
  /bank\s*(details|account|information|account\s*number)/i,
  /government\s*id|aadhar|passport|driving\s*license/i,
  /personal\s*information|ssn|social\s*security/i,
  /check\s*(deposit|banking|payment)/i,
  /wire\s*transfer|bank\s*transfer|deposit.*check/i,
  /certified\s*vendor|purchase\s*from\s*vendor/i,
  /macbook|laptop|high-end.*equipment/i,
  /home\s*office\s*setup|equipment\s*provision/i,
  /bi-weekly|monthly\s*stipend|salary\s*paid/i,
  /scanned\s*copy.*id|government.*proof/i
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function extractDomain(url) {
  if (!url) return "";
  const raw = String(url).trim();
  try {
    const full = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(full).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0].split("?")[0];
  }
}

function buildUrl(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

// Pull company slug from recruiter email domain (skips free providers)
function companySlugFromEmail(email) {
  const domain = normalizeText(email).split("@")[1] || "";
  if (!domain || freeEmailDomains.includes(domain)) return null;
  return domain.split(".")[0]; // "techcorp.com" → "techcorp"
}

// ─── External Checks ──────────────────────────────────────────────────────────

async function getDomainCreationDate(domain) {
  if (!domain || !process.env.WHOIS_API_KEY) return null;
  try {
    const url = `https://www.whoisxmlapi.com/whoisserver/WhoisService?apiKey=${process.env.WHOIS_API_KEY}&domainName=${domain}&outputFormat=JSON`;
    const res = await axios.get(url, { timeout: 8000 });
    return res.data.WhoisRecord?.createdDate || null;
  } catch (err) {
    console.error("WHOIS error:", err.message);
    return null;
  }
}

function domainAgeInDays(createdDate) {
  if (!createdDate) return null;
  return (Date.now() - new Date(createdDate).getTime()) / 86400000;
}

async function checkWebsiteExists(url) {
  const target = buildUrl(url);
  if (!target) return null;
  try {
    const res = await axios.head(target, {
      timeout: 6000,
      maxRedirects: 5,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; RealCheckBot/1.0)" },
      validateStatus: () => true
    });
    return res.status < 400;
  } catch {
    return false; // unreachable / connection refused
  }
}

async function checkLinkedInCompany(slug) {
  if (!slug) return null;
  const safe = slug.toLowerCase().replace(/\s+/g, "-");
  try {
    const res = await axios.get(`https://www.linkedin.com/company/${safe}/`, {
      timeout: 6000,
      maxRedirects: 3,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9"
      },
      validateStatus: () => true
    });
    // 404 → real "not found"; 999 / 200 / redirect → page exists
    return res.status !== 404;
  } catch {
    return null; // network / timeout — skip this check
  }
}

// Simulated AI detection for demo (pattern-based, no API required)
function fakeAIDetection(text) {
  const msg = String(text || "").toLowerCase();
  const aiPatterns = [
    "guaranteed placement",
    "guaranteed job",
    "pay .* to confirm",
    "congratulations! you are selected",
    "immediate joining",
    "limited seats",
    "urgent response required",
    "contact immediately",
    "secure your seat",
    "on behalf of",
    "dear candidate",
    "dear selected",
    "recruiter from",
    "automated response",
    "following a review of your profile",
    "impressed by your technical background",
    "alignment with our core values",
    "home office setup",
    "certified vendor only",
    "please reply to this email",
    "scanned copy of your"
  ];
  
  return aiPatterns.some((pattern) => new RegExp(pattern, "i").test(msg));
}

// ─── Main Detection Function ──────────────────────────────────────────────────

async function detectScam({ message, email, website }) {
  const normMsg  = normalizeText(message);
  const normEmail = normalizeText(email);
  const normSite  = String(website || "").trim();

  let riskScore = 0;
  const reasons = [];

  // 1. Payment keyword + regex pattern (+40)
  const matchedKw = paymentKeywords.filter((k) => normMsg.includes(k));
  const hasPayPat  = paymentPatterns.some((p) => p.test(message || ""));
  const hasAmountMention = /(₹|\$|rs\.?|inr)\s*\d[\d,]*/i.test(normMsg);
  const hasCompensationContext = compensationSafePatterns.some((p) => p.test(normMsg));
  const hasActionablePayDemand = /\b(pay|payment|send|transfer|deposit)\b[\s\S]{0,30}\b(confirm|registration|fee|deposit|processing|assessment|application|verification|booking)\b/i.test(normMsg);
  const hasStrongFraudTerms = strongFraudPaymentTerms.test(normMsg) || matchedKw.length > 0;

  // Avoid false positives for normal stipend/salary mentions.
  const compensationOnlyAmount =
    hasAmountMention &&
    hasCompensationContext &&
    !hasActionablePayDemand &&
    !hasStrongFraudTerms;

  if ((matchedKw.length > 0 || hasPayPat) && !compensationOnlyAmount) {
    riskScore += 40;
    reasons.push(
      matchedKw.length > 0
        ? `Payment/fraud terms: "${matchedKw.slice(0, 3).join('", "')}"`
        : "Payment demand pattern detected"
    );
  }

  // 2. Suspicious recruitment channels (+30)
  const matchedCh = suspiciousChannels.filter((c) => normMsg.includes(c));
  if (matchedCh.length > 0) {
    riskScore += 30;
    reasons.push(`Recruitment via suspicious channel: ${matchedCh.slice(0, 2).join(", ")}`);
  }

  // 3. Urgency / high-pressure language (+20)
  if (urgencyPatterns.some((p) => p.test(normMsg))) {
    riskScore += 20;
    reasons.push("High-pressure urgency language detected");
  }

  // 3b. Sophisticated scam patterns (personal info, check scams, equipment) (+30)
  const matchedScamPatterns = sophisticatedScamPatterns.filter((p) => p.test(message || ""));
  if (matchedScamPatterns.length > 0) {
    riskScore += 30;
    const detected = matchedScamPatterns.length === 1 ? "personal info request" : "multiple fraud signals";
    reasons.push(`Sophisticated scam pattern detected: ${detected}`);
  }

  // 4. Free / personal email domain (+25)
  const emailDomain = normEmail.includes("@") ? normEmail.split("@")[1] : "";
  if (emailDomain && freeEmailDomains.includes(emailDomain)) {
    riskScore += 25;
    reasons.push(`Recruiter using free email service: ${emailDomain}`);
  }

  // 5–7: Run external I/O checks concurrently to keep latency low
  const domain = normSite ? extractDomain(normSite) : null;
  const slug   = companySlugFromEmail(email);

  const [websiteExists, domainCreated, linkedInFound] = await Promise.all([
    normSite ? checkWebsiteExists(normSite)            : Promise.resolve(null),
    domain   ? getDomainCreationDate(domain)            : Promise.resolve(null),
    slug     ? checkLinkedInCompany(slug)               : Promise.resolve(null)
  ]);

  // 5. Website existence (+35)
  if (normSite) {
    if (websiteExists === false) {
      riskScore += 35;
      reasons.push("Company website is unreachable or does not exist");
    }
    // website exists — still check domain age below
  }

  // 6. Domain age via WHOIS (+40)
  if (domain) {
    const ageDays = domainAgeInDays(domainCreated);
    if (ageDays !== null && ageDays < 30) {
      riskScore += 40;
      reasons.push(`Domain is very new — only ${Math.round(ageDays)} day(s) old`);
    } else if (ageDays === null) {
      reasons.push("Domain age could not be verified (WHOIS unavailable)");
    }
  }

  // 7. AI-generated message detection (simulated, pattern-based) (+20)
  const aiDetected = fakeAIDetection(message);
  if (aiDetected) {
    riskScore += 20;
    reasons.push("Message matches common AI/template patterns");
  }

  // 8. LinkedIn company verification (+35)
  if (slug !== null) {
    if (linkedInFound === false) {
      riskScore += 35;
      reasons.push(`No LinkedIn company page found for "${slug}"`);
    } else if (linkedInFound === null) {
      reasons.push("LinkedIn verification skipped (network timeout)");
    }
  }

  riskScore = Math.min(riskScore, 100);
  const risk = riskScore > 70 ? "High" : riskScore > 30 ? "Medium" : "Low";

  return { risk, score: riskScore, reasons };
}

module.exports = { detectScam };
