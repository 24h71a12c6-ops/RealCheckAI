const OpenAI = require("openai");

const SYSTEM_PROMPT = `You are an expert AI Scam Detector for "RealCheck AI". Your task is to analyze raw text from a job offer, internship posting, or recruiter message.

Step 1: Entity Extraction
Extract the following even if they are buried in the text:
- Recruiter Email (if any)
- Company Website/Domain (if any)
- Job Title and Company Name

Step 2: Risk Analysis
Evaluate the content for Scam Red Flags (e.g., asking for money, suspicious domains, high pay for zero skill, telegram-only communication).

Step 3: Output Format
Return ONLY a JSON object with this structure:
{
"recruiter_email": "extracted email or null",
"company_website": "extracted domain or null",
"company_name": "extracted company name or null",
"risk_level": "Low | Medium | High",
"score": 0,
"reasons": ["Reason 1", "Reason 2"],
"verdict": "A brief 1-sentence summary for the user"
}`;

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function extractEmailFromText(text) {
  const m = String(text || "").match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

function extractDomainFromText(text) {
  const raw = String(text || "");

  // Prefer explicit URLs/domains next to known labels.
  const labeled = raw.match(/(?:website|domain|company\s*website)\s*[:\-]\s*([^\s,;]+)/i);
  if (labeled && labeled[1]) {
    return cleanDomain(labeled[1]);
  }

  const urlMatch = raw.match(/https?:\/\/[^\s)]+/i);
  if (urlMatch) {
    return cleanDomain(urlMatch[0]);
  }

  const freeDomains = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"];
  const bareDomainRegex = /\b([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)\b/g;
  const matches = raw.matchAll(bareDomainRegex);
  for (const m of matches) {
    const candidate = String(m[1] || "").toLowerCase();
    if (!candidate.includes(".") || freeDomains.includes(candidate)) continue;

    const idx = Number(m.index || 0);
    const emailCtxStart = Math.max(0, idx - 80);
    const leftCtx = raw.slice(emailCtxStart, idx);
    const nextChar = raw[idx + candidate.length] || "";

    // Skip domains that appear as part of an email address token.
    if (/[a-zA-Z0-9._%+-]+@$/i.test(leftCtx) || nextChar === "@") continue;

    return candidate;
  }

  return null;
}

function cleanDomain(value) {
  const str = String(value || "").trim().replace(/[.,;:!?]+$/g, "");
  if (!str) return null;

  try {
    const normalized = /^https?:\/\//i.test(str) ? str : `https://${str}`;
    return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return str.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
  }
}

function extractCompanyNameFromText(text) {
  const raw = String(text || "");

  const labeled = raw.match(/company\s*[:\-]\s*([^\n\r.,;]+)/i);
  if (labeled && labeled[1]) return labeled[1].trim();

  const atPattern = raw.match(/(?:role|position|internship|job)\s*[:\-]?.{0,60}\bat\s+([A-Z][A-Za-z0-9&.,\- ]{2,60})/i);
  if (atPattern && atPattern[1]) return atPattern[1].trim();

  return null;
}

async function extractWithLLM(rawText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.startsWith("sk-") || /PORT\s*$/i.test(apiKey)) return null;

  const client = new OpenAI({ apiKey });
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  try {
    const response = await client.chat.completions.create({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `User Input to Analyze:\n${rawText}`
        }
      ]
    });

    const content = response?.choices?.[0]?.message?.content;
    return parseJsonSafe(content);
  } catch (error) {
    // LLM is optional. Caller can continue using fallback extraction.
    console.warn("LLM extraction fallback:", error.message);
    return null;
  }
}

function normalizeLLMOutput(obj) {
  if (!obj || typeof obj !== "object") return null;

  const riskRaw = String(obj.risk_level || "").trim().toLowerCase();
  const risk = riskRaw === "high" ? "High" : riskRaw === "medium" ? "Medium" : riskRaw === "low" ? "Low" : null;

  const scoreNumber = Number(obj.score);
  const safeScore = Number.isFinite(scoreNumber) ? Math.max(0, Math.min(100, Math.round(scoreNumber))) : null;

  return {
    recruiter_email: obj.recruiter_email ? String(obj.recruiter_email).trim().toLowerCase() : null,
    company_website: obj.company_website ? cleanDomain(obj.company_website) : null,
    company_name: obj.company_name ? String(obj.company_name).trim() : null,
    risk_level: risk,
    score: safeScore,
    reasons: Array.isArray(obj.reasons) ? obj.reasons.map((r) => String(r)) : [],
    verdict: obj.verdict ? String(obj.verdict).trim() : null
  };
}

async function extractEntitiesAndHints(rawText) {
  const text = String(rawText || "").trim();
  if (!text) {
    return {
      recruiter_email: null,
      company_website: null,
      company_name: null,
      llm_hint: null
    };
  }

  const llmResult = normalizeLLMOutput(await extractWithLLM(text));

  return {
    recruiter_email: llmResult?.recruiter_email || extractEmailFromText(text),
    company_website: llmResult?.company_website || extractDomainFromText(text),
    company_name: llmResult?.company_name || extractCompanyNameFromText(text),
    llm_hint: llmResult
  };
}

module.exports = {
  SYSTEM_PROMPT,
  extractEntitiesAndHints
};
