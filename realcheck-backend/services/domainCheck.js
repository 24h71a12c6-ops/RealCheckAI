const whois = require("whois-json");

function extractDomain(input) {
  if (!input) return "";

  const raw = String(input).trim();
  if (!raw) return "";

  // If it's already a bare domain, URL parsing may still work, but we normalize first.
  try {
    const full = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const hostname = new URL(full).hostname || "";
    return hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return raw
      .replace(/(^\w+:|^)\/\//, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .split("?")[0]
      .split("#")[0]
      .split(":")[0]
      .trim()
      .toLowerCase();
  }
}

function pickFirstString(value) {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = pickFirstString(v);
      if (s) return s;
    }
    return null;
  }
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

function findCreationDateCandidate(obj) {
  const directPaths = [
    // Common whois-json normalized fields
    ["creationDate"],
    ["created"],
    ["creation"],
    ["createdDate"],
    ["registered"],
    ["registrationDate"],
    // Some registries nest data
    ["registryData", "creationDate"],
    ["registryData", "createdDate"],
    ["registryData", "created"],
    ["domain", "creationDate"],
    ["domain", "created"],
    ["domain", "createdDate"]
  ];

  for (const path of directPaths) {
    let cur = obj;
    for (const key of path) {
      if (!cur || typeof cur !== "object") {
        cur = null;
        break;
      }
      cur = cur[key];
    }

    const s = pickFirstString(cur);
    if (s) return s;
  }

  // Fallback: heuristic scan a few levels deep.
  const seen = new Set();
  const queue = [{ value: obj, depth: 0 }];

  while (queue.length) {
    const { value, depth } = queue.shift();
    if (!value || depth > 3) continue;

    if (typeof value === "object") {
      if (seen.has(value)) continue;
      seen.add(value);

      if (Array.isArray(value)) {
        for (const item of value) queue.push({ value: item, depth: depth + 1 });
        continue;
      }

      for (const [k, v] of Object.entries(value)) {
        const key = String(k).toLowerCase();

        // Prioritize keys that strongly hint at a domain creation date.
        const looksLikeCreationKey =
          (key.includes("creation") && key.includes("date")) ||
          key === "creationdate" ||
          key === "created" ||
          key === "createddate" ||
          key === "registrationdate" ||
          (key.includes("registered") && key.includes("date"));

        if (looksLikeCreationKey) {
          const s = pickFirstString(v);
          if (s) return s;
        }

        if (typeof v === "object" && v !== null) {
          queue.push({ value: v, depth: depth + 1 });
        }
      }
    }
  }

  return null;
}

function parseDateSafe(value) {
  const s = String(value || "").trim();
  if (!s) return null;

  // Some WHOIS responses contain multiple dates in one field; grab the first plausible token.
  const token = s
    .split(/\s*[;,|]\s*/)[0]
    .replace(/^"|"$/g, "")
    .trim();

  const d = new Date(token);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function verifyDomain(input) {
  const domain = extractDomain(input);

  if (!domain) {
    return {
      domain: "",
      status: "Error",
      message: "No domain/URL provided"
    };
  }

  try {
    const result = await whois(domain);

    const creationDateRaw = findCreationDateCandidate(result);
    if (!creationDateRaw) {
      return {
        domain,
        status: "Unknown",
        message: "Domain creation date not found"
      };
    }

    const created = parseDateSafe(creationDateRaw);
    if (!created) {
      return {
        domain,
        status: "Unknown",
        message: `Unparseable domain creation date: ${String(creationDateRaw).slice(0, 120)}`
      };
    }

    const today = new Date();
    const ageDays = (today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

    let risk = "Low";
    if (ageDays < 90) {
      risk = "High Risk (Very New Domain)";
    } else if (ageDays < 365) {
      risk = "Medium Risk";
    }

    return {
      domain,
      createdOn: created.toISOString().slice(0, 10),
      ageDays: Math.max(0, Math.floor(ageDays)),
      risk
    };
  } catch (error) {
    return {
      domain,
      status: "Error",
      message: error?.message || String(error)
    };
  }
}

module.exports = {
  extractDomain,
  verifyDomain
};

// Local quick-run: node services/domainCheck.js "https://company.com/careers"
if (require.main === module) {
  const input = process.argv[2] || "google.com";
  verifyDomain(input).then(console.log);
}
