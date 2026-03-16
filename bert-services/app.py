from __future__ import annotations

import os
import re
from typing import List, Tuple

import torch
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from transformers import BertForSequenceClassification, BertTokenizer

app = FastAPI(title="RealCheckAI Scam Detector (BERT + Rules)", version="2.0.0")

# Allow browser apps (frontend / localhost dev) to call this service directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE:
# - This file is a fast, demo-friendly server (can download a tiny model from HF).
# - For the *fully offline* service, prefer `main.py` + a local fine-tuned model.
MODEL_PATH = os.getenv("BERT_MODEL_PATH", "prajjwal1/bert-tiny")
MAX_LENGTH = int(os.getenv("BERT_MAX_LENGTH", "256"))

print("Loading RealCheckAI Brain... please wait.")
tokenizer = BertTokenizer.from_pretrained(MODEL_PATH)
model = BertForSequenceClassification.from_pretrained(MODEL_PATH)
model.eval()
print("Model Loaded Successfully! Server starting...")


class Message(BaseModel):
    text: str


def _softmax_probs(logits: torch.Tensor) -> torch.Tensor:
    return torch.softmax(logits, dim=-1)


def _extract_emails(text: str) -> List[str]:
    raw = text or ""
    return list({e.lower() for e in re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", raw)})


def _extract_monthly_salary_in_inr(text: str) -> Tuple[float | None, str | None]:
    """Best-effort salary parser for common India patterns.

    Returns (monthly_inr, source_label) where source_label explains the match.
    """
    msg = str(text or "")
    low = msg.lower()

    # 1) "1 lakh per month" / "2.5 lakhs monthly"
    m = re.search(r"(\d+(?:\.\d+)?)\s*(lakh|lac|lakhs|lacs)\s*(?:per\s*month|/\s*month|monthly)", low)
    if m:
        return float(m.group(1)) * 100000.0, "lakh/month"

    # 2) "12 LPA" (annual) -> monthly approximation
    m = re.search(r"(\d+(?:\.\d+)?)\s*lpa\b", low)
    if m:
        return (float(m.group(1)) * 100000.0) / 12.0, "lpa"

    # 3) "₹50000 per month" / "INR 60000 monthly"
    m = re.search(r"(?:₹|inr|rs\.?)\s*([\d,]+)\s*(?:per\s*month|/\s*month|monthly)", low, flags=re.IGNORECASE)
    if m:
        return float(m.group(1).replace(",", "")), "inr/month"

    # 4) "1,00,000" + month word near it
    m = re.search(r"([\d]{1,3}(?:,\d{2,3})+)\s*(?:per\s*month|/\s*month|monthly)", low)
    if m:
        return float(m.group(1).replace(",", "")), "number/month"

    return None, None


def _split_sentences(text: str) -> List[str]:
    return [s.strip() for s in re.split(r"[.!?\n\r]+", str(text or "")) if s.strip()]


def deep_scan(text: str) -> Tuple[List[str], int]:
    """Aggressive rule scan: returns (findings, risk_score_0_100).

    Goal: for demo safety, obvious pay-to-play scams (refund/deposit/payment traps)
    must *always* land in HIGH RISK even if the tiny BERT model is under-confident.
    """

    text_l = (text or "").lower()
    findings: List[str] = []
    risk_score = 0

    # High-priority red flags (direct weight add)
    # (This intentionally biases towards safety in demos.)
    critical_traps = {
        "refundable": 45,
        "security deposit": 50,
        "registration fee": 50,
        "whatsapp": 25,
    }

    # Keyword weights
    for word, weight in critical_traps.items():
        if word in text_l:
            findings.append(f"🚩 {word.upper()} detected")
            risk_score += weight

    # Token-style weights (regex to avoid accidental matches)
    if re.search(r"\bpay\b", text_l):
        findings.append("🚩 PAY detected")
        risk_score += 30

    if re.search(r"(?:₹\s*)?\b999\b", text_l):
        findings.append("🚩 999 detected")
        risk_score += 40

    # Critical override: refundable + payment ask close together (often split across lines)
    refundable_pay_near = bool(
        re.search(r"\brefundable\b[\s\S]{0,120}\b(pay|payment|deposit|upi|phonepe|gpay|paytm|transfer|send)\b", text_l)
        or re.search(r"\b(pay|payment|deposit|upi|phonepe|gpay|paytm|transfer|send)\b[\s\S]{0,120}\brefundable\b", text_l)
    )
    if refundable_pay_near:
        findings.append(
            "🚩 CRITICAL PAYMENT TRAP detected (refundable + pay/deposit/UPI appears together)"
        )
        risk_score = max(risk_score, 95)

    # --- Keep the richer explanations for the report (nice UI) ---
    # 1) Advanced Financial Traps
    financial_traps = {
        "refundable": "Legitimate employers do not ask candidates to pay money, even if they call it 'refundable'.",
        "laptop fee": "Company assets are provided by the employer; upfront 'laptop fees' are a common scam pattern.",
        "training cost": "If you must pay to be trained for the job, treat it as high risk.",
        "security deposit": "Upfront security deposits are a top indicator of recruitment fraud.",
        "registration fee": "Pay-to-apply is a classic scam signal.",
        "processing fee": "Fees for 'processing' or 'verification' are commonly used to extract money.",
        "background verification fee": "Background checks are handled by the employer, not paid by candidates.",
    }

    # 2) Recruitment Process Red Flags
    process_traps = {
        "direct selection": "Legitimate hiring usually includes at least one structured HR/technical step.",
        "spot offer": "Immediate hiring without verification is suspicious.",
        "telegram": "Telegram is frequently used for task scams and fake internships.",
        "whatsapp": "Recruitment over WhatsApp-only communication is a common fraud channel.",
    }

    # 3) Urgency Tactics (new layer)
    urgency_patterns = {
        r"apply\s*within\s*\d+\s*(minute|minutes|hour|hours)": "Urgency pressure reduces your ability to verify details.",
        r"last\s*(few\s*)?(seats|slots)": "Artificial scarcity is used to push quick decisions.",
        r"offer\s*(expires|ends)": "Deadlines can be manufactured to rush payments or document sharing.",
        r"respond\s*within\s*\d+": "High-pressure response windows are a scam tactic.",
        r"immediate\s*joining": "Instant joining without proper onboarding/interview is suspicious.",
    }

    # 4) Domain Spoofing / Contact Spoofing (new layer)
    free_email_domains = {
        "gmail.com",
        "outlook.com",
        "hotmail.com",
        "yahoo.com",
        "live.com",
        "rediffmail.com",
        "ymail.com",
        "aol.com",
        "proton.me",
        "protonmail.com",
    }

    # 5) Salary anomalies (new layer)
    low_complexity_roles = [
        "data entry",
        "form filling",
        "typing",
        "copy paste",
        "captcha",
        "sms sending",
        "back office",
        "virtual assistant",
    ]

    # 6) New scam pretexts: cyber-security & tax compliance
    compliance_bait_patterns = {
        r"cyber\s*-?security": "Scammers may use 'cyber-security' as a professional-sounding pretext for fees or document collection.",
        r"tax\s*compliance": "Scammers may claim 'tax compliance' to justify payments or sensitive document requests.",
        r"gst\s*(registration|compliance)": "Tax/GST compliance steps should not require candidate payments to a recruiter.",
    }

    # Combine simple keyword checks (report-only)
    for word, reason in {**financial_traps, **process_traps}.items():
        if word in text_l:
            findings.append(f"🚩 {word.upper()}: {reason}")

    # Regex-based urgency checks
    for pattern, reason in urgency_patterns.items():
        if re.search(pattern, text_l, flags=re.IGNORECASE):
            findings.append(f"🚩 URGENCY: {reason}")
            risk_score += 15
            break

    # Domain spoofing checks
    emails = _extract_emails(text)
    for e in emails:
        domain = (e.split("@", 1)[1] if "@" in e else "").lower()
        if domain in free_email_domains:
            findings.append(
                f"🚩 DOMAIN SPOOFING: Recruiter is using a free email provider ({domain}). Prefer official domains like @company.com."
            )
            risk_score += 25
            break

    # Salary anomaly check
    monthly_inr, src = _extract_monthly_salary_in_inr(text)
    if monthly_inr is not None:
        role_hit = any(k in text_l for k in low_complexity_roles)
        if role_hit and monthly_inr >= 100000:
            findings.append(
                "🚩 SALARY ANOMALY: Unusually high pay for a low-complexity role (e.g., data entry/typing). Verify the employer independently."
            )
            risk_score += 20

    # Compliance bait + payment context
    payment_context = bool(re.search(r"(fee|deposit|pay|payment|upi|phonepe|gpay|paytm)", text_l))
    for pattern, reason in compliance_bait_patterns.items():
        if re.search(pattern, text_l, flags=re.IGNORECASE) and payment_context:
            findings.append(f"🚩 COMPLIANCE PRETEXT: {reason}")
            risk_score += 10
            break

    return findings, int(max(0, min(100, risk_score)))


@app.get("/")
async def root():
    return {"message": "RealCheckAI API is Live! Go to /docs to test.", "model_path": MODEL_PATH}


@app.get("/health")
async def health():
    return {"ok": True, "model_path": MODEL_PATH, "max_length": MAX_LENGTH}


@app.post("/predict")
async def predict(message: Message):
    text = str(message.text or "").strip()
    if not text:
        return {
            "text": "",
            "label": "UNKNOWN",
            "scam_probability": 0.0,
            "legit_probability": 0.0,
            "score": [[0.0, 0.0]],
            "confidence": [[0.0, 0.0]],
            "model_path": MODEL_PATH,
            "risk_report": ["No immediate red flags found."],
            "safety_score": 0,
        }

    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=MAX_LENGTH,
    )

    with torch.no_grad():
        outputs = model(**inputs)
        logits = outputs.logits
        probs = _softmax_probs(logits)[0]

    # Assumption: label 0 = legit, label 1 = scam.
    legit_prob = float(probs[0].item()) if probs.numel() > 0 else 0.0
    scam_prob = float(probs[1].item()) if probs.numel() > 1 else 0.0
    predicted = int(torch.argmax(probs).item()) if probs.numel() else 0

    # Expert rule analysis (your new layers)
    red_flags, rule_score = deep_scan(text)

    # AI boost: only add points when model confidence is high.
    ai_score = 40 if scam_prob >= 0.80 else 0
    total_risk = int(max(0, min(100, rule_score + ai_score)))

    risk_level = "High" if total_risk >= 70 else "Medium" if total_risk >= 40 else "Low"
    risk_label = "HIGH RISK" if total_risk >= 70 else "MEDIUM RISK" if total_risk >= 40 else "SAFE"

    is_scam = total_risk >= 70

    # Keep compatibility with the Node client expectations (label used as informational only).
    label = "SCAM" if total_risk >= 70 else "REAL"

    return {
        "text": text,
        "label": label,
        "scam_probability": scam_prob,
        "legit_probability": legit_prob,
        # Compatibility fields
        "score": [[legit_prob, scam_prob]],
        "confidence": [[legit_prob, scam_prob]],
        "model_path": MODEL_PATH,
        # New rich output
        "risk_level": risk_level,
        "risk_label": risk_label,
        "risk_report": red_flags if red_flags else ["No immediate red flags found."],
        "analysis": red_flags if red_flags else ["No immediate red flags found."],
        "risk_score": total_risk,
        "rule_score": rule_score,
        "ai_score": ai_score,
        "safety_score": 0 if is_scam else 100,
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)