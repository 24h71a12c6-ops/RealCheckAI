require("dotenv").config();
const axios = require("axios");
const { verifyDomain } = require("./domainCheck");
const { callBertPredict } = require("./bertClient");

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
  /immediate\s*joining|join\s*immediately/i,
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

const suspiciousDomainTlds = [
  ".xyz", ".top", ".click", ".work", ".live", ".loan", ".gq", ".ml", ".cf", ".tk"
];

const suspiciousDomainWords = [
  "jobs", "career", "careers", "portal", "hiring", "apply", "offer", "hr"
];

const displayNameBrandHints = [
  "tcs", "infosys", "wipro", "accenture", "google", "microsoft", "amazon", "deloitte", "cognizant", "ibm"
];

const additionalPaymentTrapPatterns = [
  /refundable\s*(security\s*)?deposit/i,
  /documentation\s*fee/i,
  /laptop\s*insurance/i,
  /training\s*(module|kit|program)\s*(fee|charge|payment)/i,
  /upfront\s*payment/i,
  /pay\s*before\s*(joining|training|internship|onboarding)/i
];

const hardPaymentOverrideTerms = [
  "upi",
  "phonepe",
  "google pay",
  "gpay",
  "paytm",
  "registration fee",
  "training fee"
];

const fastSelectionPatterns = [
  /selected\s*within\s*\d+\s*(minutes?|hours?)/i,
  /offer\s*letter\s*in\s*\d+\s*(minutes?|hours?)/i,
  /direct\s*selection/i,
  /instant\s*offer/i
];

const genericSalutations = [
  /dear\s+candidate/i,
  /dear\s+applicant/i,
  /dear\s+selected\s+candidate/i,
  /to\s+whom\s+it\s+may\s+concern/i
];

const sensitivePreHiringPatterns = [
  /aadhar|aadhaar|pan\s*card|passport|driving\s*license/i,
  /bank\s*otp|otp\s*for\s*verification/i,
  /bank\s*balance|account\s*balance/i,
  /parents'?\s*occupation|father'?s\s*occupation|mother'?s\s*occupation/i
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function uniqueNonEmpty(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildEvidenceSnippets(text, terms, maxSnippets = 2) {
  const raw = String(text || "");
  const cleanTerms = uniqueNonEmpty(terms)
    .map((t) => String(t || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  if (!raw || cleanTerms.length === 0) return [];

  const snippets = [];
  for (const term of cleanTerms) {
    const re = new RegExp(escapeRegExp(term), "i");
    const match = re.exec(raw);
    if (!match || typeof match.index !== "number") continue;

    const start = Math.max(0, match.index - 60);
    const end = Math.min(raw.length, match.index + term.length + 80);
    const slice = raw.slice(start, end).trim();

    if (slice && !snippets.includes(slice)) {
      snippets.push(slice);
      if (snippets.length >= maxSnippets) break;
    }
  }

  return snippets;
}

function buildReasoningRiskCards({
  message,
  email,
  domainStatus,
  domainAgeDays,
  domainChecked
}) {
  const msg = String(message || "");
  const norm = normalizeText(msg);
  const cards = [];

  // 1) Financial fraud
  const financialMatches = [];
  const matchedKw = paymentKeywords.filter((k) => norm.includes(k)).slice(0, 6);
  if (matchedKw.length) financialMatches.push(...matchedKw);
  if (/(upi|phonepe|google\s*pay|gpay|paytm)/i.test(msg)) financialMatches.push("UPI/Wallet");
  if (/(₹|\$|rs\.?|inr)\s*\d[\d,]*/i.test(msg)) financialMatches.push("amount");

  const financialHit =
    strongFraudPaymentTerms.test(norm) ||
    paymentPatterns.some((p) => p.test(msg)) ||
    additionalPaymentTrapPatterns.some((p) => p.test(msg));

  if (financialHit) {
    const terms = uniqueNonEmpty(financialMatches);
    cards.push({
      id: "financial_fraud",
      level: "critical",
      title: "Financial Fraud",
      icon: "💰",
      message: "Money requests (fee/deposit/UPI) are a major scam indicator. Genuine companies do not ask candidates to pay to get hired.",
      matched_terms: terms,
      evidence: buildEvidenceSnippets(msg, terms)
    });
  }

  // 2) High-pressure tactics
  const urgencyHit =
    urgencyPatterns.some((p) => p.test(norm)) ||
    /\b\d+\s*(hours?|hrs?)\s*(left)?\b/i.test(msg) ||
    /\bwithin\s*\d+\s*(hours?|hrs?)\b/i.test(msg);
  if (urgencyHit) {
    const terms = uniqueNonEmpty([
      ...(norm.includes("urgent") ? ["urgent"] : []),
      ...(norm.includes("immediate") ? ["immediate"] : []),
      ...(norm.includes("last") ? ["last"] : []),
      ...(norm.includes("within") ? ["within"] : [])
    ]);

    cards.push({
      id: "urgency_pressure",
      level: "high",
      title: "High‑Pressure Tactics",
      icon: "⏳",
      message: "Fake deadlines and urgency are used to stop you from verifying details. Slow down and verify independently.",
      matched_terms: terms,
      evidence: buildEvidenceSnippets(msg, terms)
    });
  }

  // 3) Unofficial communication channel
  const channelMatches = suspiciousChannels.filter((c) => norm.includes(c)).slice(0, 6);
  const emailRaw = String(email || "").toLowerCase();
  const emailDomain = emailRaw.includes("@") ? (emailRaw.split("@")[1] || "") : "";
  if (emailDomain && freeEmailDomains.includes(emailDomain)) channelMatches.push(emailDomain);

  if (channelMatches.length) {
    const terms = uniqueNonEmpty(channelMatches);
    cards.push({
      id: "unofficial_channel",
      level: "high",
      title: "Unofficial Channel",
      icon: "📱",
      message: "Professional hiring typically happens via corporate email domains and official portals — not personal email or chat apps.",
      matched_terms: terms,
      evidence: buildEvidenceSnippets(msg, terms)
    });
  }

  // 4) Unrealistic hiring flow
  const hiringHit =
    fastSelectionPatterns.some((p) => p.test(msg)) ||
    /no\s*interview|without\s*interview|interview\s*not\s*required/i.test(msg) ||
    /direct\s*selection|selected\s*(for|within)|you\s*are\s*hired/i.test(msg);

  if (hiringHit) {
    const terms = uniqueNonEmpty([
      ...(norm.includes("direct selection") ? ["direct selection"] : []),
      ...(norm.includes("no interview") ? ["no interview"] : []),
      ...(norm.includes("without interview") ? ["without interview"] : []),
      ...(norm.includes("offer letter") ? ["offer letter"] : [])
    ]);

    cards.push({
      id: "unrealistic_hiring",
      level: "medium",
      title: "Unrealistic Hiring",
      icon: "🎓",
      message: "Being selected without a proper interview process is a red flag. Verify the company, role, and interview steps.",
      matched_terms: terms,
      evidence: buildEvidenceSnippets(msg, terms)
    });
  }

  // Bonus: Domain intelligence (when available/meaningful)
  const domainNorm = String(domainStatus || "").toLowerCase();
  if (domainChecked && (domainNorm === "new" || domainNorm === "young" || domainNorm === "unknown" || domainNorm === "error")) {
    const level = domainNorm === "new" ? "high" : domainNorm === "young" ? "medium" : "medium";
    const ageText = Number.isFinite(domainAgeDays) ? `${domainAgeDays} day(s)` : domainNorm;
    cards.push({
      id: "domain_intel",
      level,
      title: "Domain Intelligence",
      icon: "🌐",
      message: `Domain checked: ${domainChecked}. Age result: ${ageText}. Newly created or unverifiable domains can be risky for hiring offers.`,
      matched_terms: uniqueNonEmpty([String(domainChecked)]),
      evidence: []
    });
  }

  return cards;
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

function getRootDomain(domain) {
  const d = String(domain || "").toLowerCase();
  if (!d) return "";
  const parts = d.split(".").filter(Boolean);
  if (parts.length < 2) return d;
  return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
}

function extractEmailDomain(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  if (raw.includes("@")) {
    return raw.split("@")[1] || "";
  }

  return raw
    .replace(/^careers?\.?/i, "")
    .replace(/^hr\.?/i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
}

function verifyIdentity(emailDomain, linkedInProfileUrl, companyWebsite) {
  let identityScore = 0;
  let isVerified = false;

  const officialDomainRaw = extractDomain(companyWebsite);
  const userEmailDomainRaw = extractEmailDomain(emailDomain);
  const officialDomain = getRootDomain(officialDomainRaw);
  const userEmailDomain = getRootDomain(userEmailDomainRaw);

  if (!officialDomain || !userEmailDomain) {
    return {
      identityScore,
      isVerified,
      officialDomain,
      userEmailDomain,
      linkedInProfileUrl: linkedInProfileUrl || null
    };
  }

  if (userEmailDomain === officialDomain) {
    identityScore += 40;
    isVerified = true;
  } else {
    identityScore -= 50;
    isVerified = false;
  }

  return {
    identityScore,
    isVerified,
    officialDomain,
    userEmailDomain,
    linkedInProfileUrl: linkedInProfileUrl || null
  };
}

function extractMetadataFromText(text) {
  const raw = String(text || "");

  const emails = Array.from(
    new Set((raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []).map((e) => e.toLowerCase()))
  );

  const urls = Array.from(
    new Set(raw.match(/(?:https?:\/\/|www\.)[^\s)]+/gi) || [])
  );
  const cleanUrls = urls.map((u) => String(u).replace(/[.,;:!?]+$/g, ""));

  const phones = Array.from(
    new Set(
      (raw.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,5}/g) || [])
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter((p) => p.replace(/\D/g, "").length >= 10)
    )
  );

  const inrAmounts = Array.from(
    new Set(
      (raw.match(/(?:₹|INR|Rs\.?)[\s]*\d[\d,]*/gi) || [])
        .map((a) => a.replace(/\s+/g, " ").trim())
    )
  );

  return {
    emails,
    urls: cleanUrls,
    phones,
    inr_amount_mentions: inrAmounts,
    has_contact_number: phones.length > 0,
    has_public_email: emails.some((e) => {
      const d = e.split("@")[1] || "";
      return freeEmailDomains.includes(d);
    })
  };
}

function looksLikeSuspiciousDomain(domain) {
  const d = String(domain || "").toLowerCase();
  if (!d) return false;

  const hasSuspiciousTld = suspiciousDomainTlds.some((tld) => d.endsWith(tld));
  if (hasSuspiciousTld) return true;

  const labels = d.split(".");
  const left = labels.slice(0, -1).join(".");
  const hyphenCount = (left.match(/-/g) || []).length;
  const hasManyHyphens = hyphenCount >= 2;
  const hasSuspiciousWordCombo = suspiciousDomainWords.filter((w) => left.includes(w)).length >= 2;

  return hasManyHyphens || hasSuspiciousWordCombo;
}

function extractMonthlyCompensationInInr(text) {
  const msg = String(text || "").toLowerCase();
  if (!msg) return null;

  // "1 lakh per month" / "2 lpa"
  const lakhPerMonth = msg.match(/(\d+(?:\.\d+)?)\s*lakh\s*(per\s*month|\/\s*month|monthly)/i);
  if (lakhPerMonth) {
    return Number(lakhPerMonth[1]) * 100000;
  }

  // "12 lpa" => monthly approximation
  const lpaMatch = msg.match(/(\d+(?:\.\d+)?)\s*lpa/i);
  if (lpaMatch) {
    return (Number(lpaMatch[1]) * 100000) / 12;
  }

  // "₹50000 per month" / "inr 60000 monthly"
  const inrPerMonth = msg.match(/(?:₹|inr|rs\.?)[\s]*([\d,]+)\s*(per\s*month|\/\s*month|monthly)/i);
  if (inrPerMonth) {
    return Number(String(inrPerMonth[1]).replace(/,/g, ""));
  }

  return null;
}

function parseJsonObjectSafe(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function splitSentences(text) {
  return String(text || "")
    .split(/[.!?\n\r]+/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function callGeminiAnalysis(userInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ai_score: null,
      reason: "Gemini key unavailable.",
      markers: [],
      source: "fallback"
    };
  }

  const systemInstruction = `
You are a Forensic Recruitment Analyst. Analyze the job offer text for Psychological Manipulation and Logic Inconsistencies.

Instructions:
1) Look for False Urgency (for example 24-hour deadlines, last chance language, immediate payment pressure).
2) Flag Pay-to-Play models (training fees, documentation charges, registration deposits, wallet transfers).
3) Identify Too-Good-To-Be-True compensation vs No-Interview shortcuts.
4) CRITICAL: If the text mentions a famous company but asks for payment via UPI/PhonePe/Google Pay, set RiskScore to 100 immediately.

Output ONLY valid JSON with this exact structure:
{"RiskScore": <0-100>, "RedFlags": ["..."], "Reasoning": "<one concise forensic summary>"}
`;

  const preferredModel = process.env.GEMINI_MODEL;
  const modelCandidates = Array.from(
    new Set([preferredModel, "gemini-2.0-flash", "gemini-1.5-flash"].filter(Boolean))
  );

  let lastError = null;
  for (const model of modelCandidates) {
    try {
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                RiskScore: { type: "NUMBER" },
                Reasoning: { type: "STRING" },
                RedFlags: {
                  type: "ARRAY",
                  items: { type: "STRING" }
                }
              },
              required: ["RiskScore", "Reasoning", "RedFlags"]
            }
          },
          contents: [
            {
              parts: [
                {
                  text: `${systemInstruction}\n\nJob text:\n${String(userInput || "").slice(0, 10000)}`
                }
              ]
            }
          ]
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 20000
        }
      );

      const raw = response?.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const parsed = parseJsonObjectSafe(raw) || {};

      const score = Number(parsed.RiskScore ?? parsed.ai_score);
      const aiScore = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null;

      return {
        ai_score: aiScore,
        reason: String(parsed.Reasoning || parsed.reason || "Contextual manipulation assessment complete."),
        markers: Array.isArray(parsed.RedFlags)
          ? parsed.RedFlags.map((m) => String(m))
          : (Array.isArray(parsed.markers) ? parsed.markers.map((m) => String(m)) : []),
        source: `gemini:${model}`
      };
    } catch (error) {
      lastError = error;
      const blockReason = error?.response?.data || null;
      console.error("Gemini error", {
        model,
        status: error?.response?.status,
        data: blockReason
      });
    }
  }

  {
    return {
      ai_score: null,
      reason: `Gemini unavailable (${lastError ? lastError.message : "unknown error"}); fallback to hard-rules score.`,
      markers: [],
      source: "fallback"
    };
  }
}

async function getHybridScore(userInput, hardRulesResult) {
  const llmAnalysis = await callGeminiAnalysis(userInput);
  const bertAnalysis = await callBertPredict(userInput);

  const HARD_WEIGHT = 0.7;
  const LLM_WEIGHT = 0.3;

  // If BERT is available, borrow a small fraction of the blend.
  // Keep weights stable when BERT is unavailable.
  const BERT_WEIGHT = bertAnalysis.ok && Number.isFinite(bertAnalysis.score_0_100) ? 0.2 : 0;
  const HARD_WEIGHT_ADJ = BERT_WEIGHT ? 0.6 : HARD_WEIGHT;
  const LLM_WEIGHT_ADJ = BERT_WEIGHT ? 0.2 : LLM_WEIGHT;

  const hardScore = Number(hardRulesResult.scam_score || 0);
  const hasLiveLlm = Number.isFinite(llmAnalysis.ai_score);
  const hasLiveBert = bertAnalysis.ok && Number.isFinite(bertAnalysis.score_0_100);

  // If LLM fails, do NOT pretend this is hybrid: trust hard rules 100%.
  if (!hasLiveLlm && !hasLiveBert) {
    return {
      final_score: Math.max(0, Math.min(100, Math.round(hardScore))),
      llm: llmAnalysis,
      bert: bertAnalysis,
      weights: { hard: 1, llm: 0, bert: 0 },
      hybrid_active: false
    };
  }

  const blended =
    (hardScore * HARD_WEIGHT_ADJ) +
    (Number.isFinite(llmAnalysis.ai_score) ? (Number(llmAnalysis.ai_score) * LLM_WEIGHT_ADJ) : 0) +
    (hasLiveBert ? (Number(bertAnalysis.score_0_100) * BERT_WEIGHT) : 0);

  let hybridScore = Math.round(blended);

  // Critical override: strong hard-rule certainty should stay high.
  if (hardRulesResult.scam_score >= 95 && hybridScore < 95) {
    hybridScore = 95;
  } else if (hardRulesResult.scam_score > 80 && hybridScore < 70) {
    hybridScore = Math.max(hybridScore, 85);
  }

  return {
    final_score: Math.max(0, Math.min(100, hybridScore)),
    llm: llmAnalysis,
    bert: bertAnalysis,
    weights: { hard: HARD_WEIGHT_ADJ, llm: LLM_WEIGHT_ADJ, bert: BERT_WEIGHT },
    hybrid_active: true
  };
}

// Pull company slug from recruiter email domain (skips free providers)
function companySlugFromEmail(email) {
  const domain = normalizeText(email).split("@")[1] || "";
  if (!domain || freeEmailDomains.includes(domain)) return null;
  return domain.split(".")[0]; // "techcorp.com" → "techcorp"
}

function companySlugFromWebsite(website) {
  const domain = extractDomain(website);
  if (!domain) return null;
  const root = domain.split(".")[0] || "";
  return root.toLowerCase() || null;
}

function companySlugFromName(companyName) {
  const name = String(companyName || "").trim().toLowerCase();
  if (!name) return null;
  return name
    .replace(/\b(private|pvt|limited|ltd|inc|llc|corp|corporation|solutions|technologies|technology)\b/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || null;
}

// ─── External Checks ──────────────────────────────────────────────────────────

async function getDomainCreationDate(domain) {
  if (!domain) return null;
  try {
    // whois-json based lookup (no API key required)
    const info = await verifyDomain(domain);
    if (info && info.createdOn) return info.createdOn;
    return null;
  } catch (err) {
    console.error("WHOIS error:", err.message);
    return null;
  }
}

function domainAgeInDays(createdDate) {
  if (!createdDate) return null;
  return (Date.now() - new Date(createdDate).getTime()) / 86400000;
}

// Domain-only scoring helper (simple, frontend-friendly)
// Usage: const { checkJobOffer } = require('./services/scamDetector');
async function checkJobOffer(url) {
  try {
    const domainResult = await verifyDomain(url);

    let domainScore = 100; // starting score
    const ageDays = Number.isFinite(domainResult?.ageDays) ? domainResult.ageDays : null;

    if (ageDays !== null) {
      if (ageDays < 90) domainScore -= 25;
      else if (ageDays < 365) domainScore -= 10;
    }

    return {
      domain: domainResult?.domain || null,
      domainRisk: domainResult?.risk || domainResult?.status || "Unknown",
      domainScore,
      // Backward compatibility for any existing callers
      score: domainScore
    };
  } catch (error) {
    return { error: error?.message || String(error) };
  }
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

function buildLinkedInSlugCandidates({ companyName, website, email }) {
  const fromName = companySlugFromName(companyName);
  const fromSite = companySlugFromWebsite(website);
  const fromEmail = companySlugFromEmail(email);

  const candidates = uniqueNonEmpty([
    fromName,
    fromSite,
    fromEmail,
    fromName ? fromName.replace(/-/g, "") : null,
    fromSite ? fromSite.replace(/-/g, "") : null,
    fromEmail ? fromEmail.replace(/-/g, "") : null
  ]);

  return candidates;
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

async function detectScam({ message, email, website, companyName }) {
  const metadata = extractMetadataFromText(message);

  const effectiveEmail = String(email || metadata.emails[0] || "").trim();
  const effectiveWebsite = String(website || metadata.urls[0] || "").trim();

  const normMsg  = normalizeText(message);
  const normEmail = normalizeText(effectiveEmail);
  const normSite  = effectiveWebsite;

  let riskScore = 0;
  const reasons = [];
  let linkedInStatus = "not_checked";
  let domainStatus = "not_checked";
  let domainAgeDays = null;
  let domainCreatedDate = null;
  let domainResult = null;
  const greenFlags = [];

  // 1. Payment keyword + regex pattern (+40)
  const matchedKw = paymentKeywords.filter((k) => normMsg.includes(k));
  const hasPayPat  = paymentPatterns.some((p) => p.test(message || ""));
  const hasAmountMention = /(₹|\$|rs\.?|inr)\s*\d[\d,]*/i.test(normMsg);
  const hasCompensationContext = compensationSafePatterns.some((p) => p.test(normMsg));
  const hasActionablePayDemand = /\b(pay|payment|send|transfer|deposit)\b[\s\S]{0,30}\b(confirm|registration|fee|deposit|processing|assessment|application|verification|booking)\b/i.test(normMsg);
  const hasStrongFraudTerms = strongFraudPaymentTerms.test(normMsg) || matchedKw.length > 0;
  const hasHardPaymentOverride = hardPaymentOverrideTerms.some((term) => normMsg.includes(term));
  const hasDigitalWalletRequest = /(upi|phonepe|google\s*pay|gpay|paytm)/i.test(normMsg);

  // CRITICAL: refundable + payment request in the same sentence is a classic deposit/refund trap.
  // We treat this as near-certain scam intent and prevent model blending from diluting the score.
  const msgSentences = splitSentences(normMsg);
  const refundablePayNear =
    /\brefundable\b[\s\S]{0,120}\b(pay|payment|deposit|upi|phonepe|gpay|paytm|transfer|send)\b/i.test(normMsg) ||
    /\b(pay|payment|deposit|upi|phonepe|gpay|paytm|transfer|send)\b[\s\S]{0,120}\brefundable\b/i.test(normMsg);

  const criticalRefundablePayCombo = refundablePayNear || msgSentences.some((s) =>
    s.includes("refundable") && /\b(pay|payment|deposit|upi|phonepe|gpay|paytm|transfer|send)\b/i.test(s)
  );

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

  // 1b. Explicit pay-to-play traps (+25)
  const hasPaymentTrap = additionalPaymentTrapPatterns.some((p) => p.test(message || ""));
  if (hasPaymentTrap) {
    riskScore += 25;
    reasons.push("Pay-to-play trap detected (deposit / documentation / training payment)");
  }

  if (hasHardPaymentOverride) {
    riskScore += 35;
    reasons.push("Critical payment-channel signal detected (UPI/PhonePe/Google Pay/fee request)");
  }

  if (criticalRefundablePayCombo) {
    riskScore += 60;
    reasons.push("CRITICAL: 'refundable' + payment request appears in the same sentence (deposit/refund trap)");
  }

  // 2. Suspicious recruitment channels (+30)
  const matchedCh = suspiciousChannels.filter((c) => normMsg.includes(c));
  if (matchedCh.length > 0) {
    riskScore += 30;
    reasons.push(`Recruitment via suspicious channel: ${matchedCh.slice(0, 2).join(", ")}`);
  }

  // 4b. Interviews only on chat apps (+20)
  const hasChatOnlyInterview = /(interview|selection|test)[\s\S]{0,50}(whatsapp|telegram|signal)/i.test(message || "");
  const hasProfessionalMeetingLink = /(zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex)/i.test(message || "");
  if (hasChatOnlyInterview && !hasProfessionalMeetingLink) {
    riskScore += 20;
    reasons.push("Interview flow appears chat-app only (no professional video-call invite found)");
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

  // 3c. Offer credibility red flags (no interview + immediate joining + bank/payroll request)
  const hasNoInterview = /no\s*interview|without\s*interview|interview\s*not\s*required/i.test(message || "");
  const hasImmediateJoining = /immediate\s*joining|join\s*immediately/i.test(message || "");
  const hasBankForPayroll = /(bank\s*(details|account|information|account\s*number)|account\s*number)[\s\S]{0,70}(stipend|salary|payroll|processing)/i.test(message || "");
  const hasRemoteHighPaySignal = /(remote|work\s*from\s*home)[\s\S]{0,80}(₹|inr)\s*\d[\d,]*/i.test(message || "") ||
                                 /(₹|inr)\s*\d[\d,]*[\s\S]{0,80}(remote|work\s*from\s*home)/i.test(message || "");

  const hasStrongCredibilityScamCombo =
    (hasNoInterview && hasImmediateJoining) ||
    (hasBankForPayroll && hasNoInterview) ||
    (hasBankForPayroll && hasImmediateJoining);

  if (hasStrongCredibilityScamCombo) {
    riskScore += 30;
    reasons.push("Offer credibility red flags: no interview / immediate joining / bank details request");
  } else if (hasNoInterview || hasImmediateJoining || hasBankForPayroll || hasRemoteHighPaySignal) {
    riskScore += 15;
    reasons.push("Unusual offer pattern detected (verify interview process and payroll details)");
  }

  // 5b. Too-fast selection velocity (+20)
  if (fastSelectionPatterns.some((p) => p.test(message || ""))) {
    riskScore += 20;
    reasons.push("Selection velocity is suspiciously fast (direct/instant offer language)");
  }

  // 4. Free / personal email domain (+25)
  const emailDomain = normEmail.includes("@") ? normEmail.split("@")[1] : "";
  if (emailDomain && freeEmailDomains.includes(emailDomain)) {
    riskScore += 25;
    reasons.push(`Recruiter using free email service: ${emailDomain}`);
  }

  // 2b. Display-name trickery: big brand/company name + public email provider (+20)
  const normalizedCompanyName = String(companyName || "").toLowerCase();
  const emailLocalPart = normEmail.includes("@") ? normEmail.split("@")[0] : "";
  const hasBrandLikeName = displayNameBrandHints.some((b) => normalizedCompanyName.includes(b) || normMsg.includes(`${b} hr`));
  const hasBrandNameMention = displayNameBrandHints.some((b) => normalizedCompanyName.includes(b) || normMsg.includes(b));
  const localPartLooksCorporate = normalizedCompanyName
    ? normalizedCompanyName.split(/\s+/).some((token) => token.length > 2 && emailLocalPart.includes(token))
    : false;

  if (emailDomain && freeEmailDomains.includes(emailDomain) && (hasBrandLikeName || localPartLooksCorporate)) {
    riskScore += 20;
    reasons.push("Display-name mismatch risk: corporate-looking recruiter identity on public email domain");
  }

  // Green signal: corporate email domain present
  if (emailDomain && !freeEmailDomains.includes(emailDomain)) {
    greenFlags.push({ points: 5, reason: `Corporate recruiter email domain detected (${emailDomain})` });
  }

  // 5–7: Run external I/O checks concurrently to keep latency low
  const corporateEmailDomain =
    emailDomain && !freeEmailDomains.includes(emailDomain) ? emailDomain : null;

  // Prefer website domain; if absent use corporate recruiter email domain.
  const domain = normSite ? extractDomain(normSite) : corporateEmailDomain;
  const linkedInCandidates = buildLinkedInSlugCandidates({
    companyName,
    website: normSite,
    email: effectiveEmail
  });

  const [websiteExists, domainIntel, linkedInChecks] = await Promise.all([
    normSite ? checkWebsiteExists(normSite)            : Promise.resolve(null),
    domain   ? verifyDomain(domain)                     : Promise.resolve(null),
    linkedInCandidates.length > 0
      ? Promise.all(linkedInCandidates.map((candidate) => checkLinkedInCompany(candidate)))
      : Promise.resolve([])
  ]);

  // 5. Website existence (+35)
  if (normSite) {
    if (websiteExists === false) {
      riskScore += 35;
      reasons.push("Company website is unreachable or does not exist");
    } else if (websiteExists === true) {
      greenFlags.push({ points: 5, reason: "Company website is reachable" });
    }
    // website exists — still check domain age below
  }

  // 6. Domain age via WHOIS (+40)
  if (domain) {
    domainResult = domainIntel || null;
    domainCreatedDate = domainResult?.createdOn || null;
    domainAgeDays = Number.isFinite(domainResult?.ageDays) ? domainResult.ageDays : null;

    const whoisStatus = String(domainResult?.status || "").toLowerCase();
    const whoisMessage = String(domainResult?.message || "").trim();

    if (domainAgeDays !== null && domainAgeDays < 90) {
      domainStatus = "new";
      riskScore += 40;
      reasons.push(`Domain is very new — only ${domainAgeDays} day(s) old`);
    } else if (domainAgeDays !== null && domainAgeDays < 365) {
      domainStatus = "young";
      riskScore += 15;
      reasons.push(`Domain is relatively new — ${domainAgeDays} day(s) old`);
    } else if (domainAgeDays === null) {
      if (whoisStatus === "error") {
        domainStatus = "error";
        riskScore += 30;
        reasons.push(
          `Domain intelligence error (WHOIS failed)${whoisMessage ? ": " + whoisMessage.slice(0, 160) : ""} — treating as risk by default`
        );
      } else {
        domainStatus = "unknown";
        riskScore += 30;
        reasons.push(
          `Domain intelligence unavailable (WHOIS unknown)${whoisMessage ? ": " + whoisMessage.slice(0, 160) : ""} — treating as risk by default`
        );
      }
    } else {
      domainStatus = "established";
      greenFlags.push({ points: 8, reason: "Established domain age" });
    }

    // 1c. Suspicious domain shape / extension (+20)
    if (looksLikeSuspiciousDomain(domain)) {
      riskScore += 20;
      reasons.push(`Domain pattern looks suspicious: ${domain}`);
    }

    // 1d. Website domain and recruiter email domain mismatch (+15)
    if (normSite && corporateEmailDomain) {
      const siteRoot = getRootDomain(extractDomain(normSite));
      const emailRoot = getRootDomain(corporateEmailDomain);
      if (siteRoot && emailRoot && siteRoot !== emailRoot) {
        riskScore += 15;
        reasons.push(`Recruiter email domain does not match website domain (${emailRoot} vs ${siteRoot})`);
      } else if (siteRoot && emailRoot && siteRoot === emailRoot) {
        greenFlags.push({ points: 6, reason: "Recruiter email domain matches company website" });
      }
    }
  } else {
    domainStatus = "skipped";
  }

  // 7. AI-generated message detection (simulated, pattern-based) (+20)
  const aiDetected = fakeAIDetection(message);
  if (aiDetected) {
    riskScore += 20;
    reasons.push("Message matches common AI/template patterns");
  }

  // 8. Document authenticity / template quality (+12)
  if (genericSalutations.some((p) => p.test(message || ""))) {
    riskScore += 12;
    reasons.push("Generic salutation detected (e.g., 'Dear Candidate')");
  }

  // 7. Salary-to-market disparity (+25)
  const monthlyInr = extractMonthlyCompensationInInr(message || "");
  const roleText = `${normalizedCompanyName} ${normMsg}`;
  const lowComplexityRole = /(data\s*entry|form\s*filling|captcha|typing|back\s*office|virtual\s*assistant)/i.test(roleText);
  const internshipRole = /intern(ship)?/i.test(roleText);

  if (monthlyInr !== null) {
    if (lowComplexityRole && monthlyInr >= 100000) {
      riskScore += 25;
      reasons.push("Salary-to-role mismatch: unusually high monthly pay for low-complexity role");
    } else if (internshipRole && monthlyInr >= 80000) {
      riskScore += 20;
      reasons.push("Internship stipend appears unusually high; verify offer authenticity");
    }
  }

  if (/free\s*international\s*trip|all\s*expense\s*paid\s*trip/i.test(message || "")) {
    riskScore += 15;
    reasons.push("Unrealistic perks detected (e.g., international trip promises)");
  }

  // 10. Sensitive personal data requests before interview (+35)
  const hasSensitivePreHiringRequest = sensitivePreHiringPatterns.some((p) => p.test(message || ""));
  if (hasSensitivePreHiringRequest && (hasNoInterview || hasImmediateJoining || !hasProfessionalMeetingLink)) {
    riskScore += 35;
    reasons.push("Sensitive personal/financial data requested before a formal interview process");
  }

  // Critical forensic override: famous brand + wallet/payment ask = immediate max risk
  const criticalBrandPaymentFraud = hasBrandNameMention && hasDigitalWalletRequest;
  if (criticalBrandPaymentFraud) {
    riskScore = 100;
    reasons.push("CRITICAL: Famous company claim combined with UPI/PhonePe/Google Pay payment request");
  }

  // 8. Strict identity cross-referencing (email domain vs official domain)
  const identity = verifyIdentity(
    corporateEmailDomain || emailDomain,
    linkedInCandidates[0] ? `https://www.linkedin.com/company/${linkedInCandidates[0]}/` : "",
    normSite || domain || ""
  );

  if (identity.identityScore < 0) {
    riskScore += Math.abs(identity.identityScore);
    reasons.push(`Brand-hijack risk: recruiter email domain does not match official domain (${identity.userEmailDomain || "unknown"} vs ${identity.officialDomain || "unknown"})`);
  } else if (identity.isVerified) {
    greenFlags.push({ points: 8, reason: "Strict identity cross-check passed (email domain matches official domain)" });
  }

  // 9. LinkedIn company verification (+35)
  if (linkedInCandidates.length > 0) {
    const hasLinkedInPage = linkedInChecks.some((v) => v === true);
    const allNotFound = linkedInChecks.length > 0 && linkedInChecks.every((v) => v === false);
    const hasUnknown = linkedInChecks.some((v) => v === null);

    if (hasLinkedInPage && identity.isVerified) {
      linkedInStatus = "verified";
      greenFlags.push({ points: 7, reason: "LinkedIn company footprint verified" });
    } else if (hasLinkedInPage && !identity.isVerified) {
      linkedInStatus = "brand_hijack";
      riskScore += 25;
      reasons.push("LinkedIn company found, but recruiter domain mismatch blocks verification");
    } else if (!hasLinkedInPage && allNotFound) {
      linkedInStatus = "not_found";
      riskScore += 35;
      reasons.push(`No LinkedIn company page found for "${linkedInCandidates[0]}"`);
      reasons.push("Manual check advised: verify recruiter profile on LinkedIn and check company reviews on Glassdoor");
    } else if (!hasLinkedInPage && hasUnknown) {
      linkedInStatus = "unknown";
      reasons.push("LinkedIn verification skipped (network timeout)");
    }
  } else {
    linkedInStatus = "skipped";
  }

  // Green signal: professional process clues and no payment demand
  if (hasProfessionalMeetingLink && !hasChatOnlyInterview) {
    greenFlags.push({ points: 6, reason: "Professional interview channel detected (Teams/Zoom/Meet/Webex)" });
  }
  if (!hasPaymentTrap && !hasPayPat && matchedKw.length === 0) {
    greenFlags.push({ points: 6, reason: "No upfront-payment signal detected" });
  }

  riskScore = Math.min(riskScore, 100);

  const greenBonusRaw = greenFlags.reduce((sum, g) => sum + Number(g.points || 0), 0);
  const hasCriticalPaymentSignal = hasPaymentTrap || hasPayPat || matchedKw.length > 0 || hasActionablePayDemand;
  const hasCriticalSensitiveDataSignal = hasSensitivePreHiringRequest && (hasNoInterview || hasImmediateJoining || !hasProfessionalMeetingLink);
  const hardOverrideActive = hasHardPaymentOverride || criticalBrandPaymentFraud || criticalRefundablePayCombo;

  // Allow stronger neutralization for truly clean offers, but be strict when money/sensitive-data red flags exist.
  const greenCap = hardOverrideActive ? 0 : (hasCriticalPaymentSignal || hasCriticalSensitiveDataSignal ? 20 : 50);
  const greenBonus = Math.min(greenCap, Math.max(0, greenBonusRaw));

  let hardRulesScore = Math.max(0, Math.min(100, Math.round(riskScore - greenBonus)));

  // Non-negotiable floor: payment-demand scams should remain high despite green signals.
  if (hasCriticalPaymentSignal) {
    hardRulesScore = Math.max(hardRulesScore, 60);
  }
  if (hasCriticalSensitiveDataSignal) {
    hardRulesScore = Math.max(hardRulesScore, 75);
  }
  if (hardOverrideActive) {
    hardRulesScore = Math.max(hardRulesScore, 95);
  }
  if (criticalBrandPaymentFraud) {
    hardRulesScore = 100;
  }

  const hybrid = await getHybridScore(message, { scam_score: hardRulesScore });
  const finalScore = hybrid.final_score;

  // New scoring bands requested by product direction.
  const riskBand = finalScore <= 30 ? "Safe" : finalScore <= 60 ? "Suspicious" : "SCAM";

  // Backward compatibility for existing frontend styling.
  const risk = finalScore > 70 ? "High" : finalScore > 30 ? "Medium" : "Low";

  const bandVerdict =
    riskBand === "SCAM"
      ? "High Risk"
      : riskBand === "Suspicious"
      ? "Suspicious"
      : "Safe";

  const risk_cards = buildReasoningRiskCards({
    message,
    email: effectiveEmail,
    domainStatus,
    domainAgeDays,
    domainChecked: domain || null
  });

  return {
    risk,
    risk_band: riskBand,
    verdict: bandVerdict,
    risk_cards,
    scam_score: finalScore,
    hard_rules_score: hardRulesScore,
    llm_score: hybrid.llm.ai_score,
    llm_reason: hybrid.llm.reason,
    llm_markers: Array.isArray(hybrid.llm.markers) ? hybrid.llm.markers : [],
    llm_source: hybrid.llm.source,
    bert_score: hybrid.bert?.score_0_100 ?? null,
    bert_label: hybrid.bert?.label ?? null,
    bert_source: hybrid.bert?.source ?? null,
    bert_reason: hybrid.bert?.ok ? null : (hybrid.bert?.reason || null),
    hybrid_active: Boolean(hybrid.hybrid_active),
    weights: hybrid.weights,
    green_bonus: greenBonus,
    green_flags: greenFlags,
    red_flags: reasons,
    score: finalScore,
    reasons,
    linkedin_status: linkedInStatus,
    identity_verified: Boolean(identity.isVerified),
    identity_score: identity.identityScore,
    domain_status: domainStatus,
    domain_age_days: domainAgeDays,
    domain_created_date: domainCreatedDate,
    domain_checked: domain || null,
    domain_result: domainResult,
    domainRisk: domainResult?.risk || domainResult?.status || null,
    domainScore: (() => {
      // Mirror checkJobOffer scoring so UI can show a simple domain score alongside overall scam score.
      let s = 100;
      const age = Number.isFinite(domainAgeDays) ? domainAgeDays : null;
      if (age !== null) {
        if (age < 90) s -= 25;
        else if (age < 365) s -= 10;
      }
      return s;
    })(),
    metadata
  };
}

module.exports = { detectScam, callGeminiAnalysis, checkJobOffer };
