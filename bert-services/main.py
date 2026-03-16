from __future__ import annotations

import os
from typing import List

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

app = FastAPI(title="RealCheck BERT Scam Detector", version="1.0.0")


class PredictRequest(BaseModel):
    text: str


class PredictResponse(BaseModel):
    label: str
    scam_probability: float
    legit_probability: float
    # Simple compatibility field (like probs.tolist() in many examples)
    # Returned for a single input as [[legit_prob, scam_prob]]
    score: List[List[float]]
    model_path: str


MODEL_PATH = os.getenv("BERT_MODEL_PATH", "./scam-bert")
MAX_LENGTH = int(os.getenv("BERT_MAX_LENGTH", "256"))

# Load model locally (offline)
# Expect a folder containing config.json, tokenizer files, and model weights.
_tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
_model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
_model.eval()


def _softmax_probs(logits: torch.Tensor) -> torch.Tensor:
    return torch.softmax(logits, dim=-1)


@app.get("/health")
def health():
    return {"ok": True, "model_path": MODEL_PATH, "max_length": MAX_LENGTH}


@app.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest):
    text = (body.text or "").strip()
    if not text:
        # Keep response stable; caller can validate too.
        return PredictResponse(
            label="unknown",
            scam_probability=0.0,
            legit_probability=0.0,
            score=[[0.0, 0.0]],
            model_path=MODEL_PATH,
        )

    inputs = _tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=MAX_LENGTH,
    )

    with torch.no_grad():
        out = _model(**inputs)
        logits = out.logits
        probs = _softmax_probs(logits)[0]

    # Assumption: label 0 = legit, label 1 = scam (common for binary fine-tuning)
    # If the model has >2 labels, we still pick argmax for label, but scam/legit
    # probabilities fall back safely.
    legit_prob = float(probs[0].item()) if probs.numel() > 0 else 0.0
    scam_prob = float(probs[1].item()) if probs.numel() > 1 else 0.0

    predicted = int(torch.argmax(probs).item()) if probs.numel() else 0
    label = "scam" if predicted == 1 else "legit"

    return PredictResponse(
        label=label,
        scam_probability=scam_prob,
        legit_probability=legit_prob,
        score=[[legit_prob, scam_prob]],
        model_path=MODEL_PATH,
    )
