"""Fine-tune a pretrained BERT/DistilBERT for scam vs legit classification.

Dataset format (CSV):
- text,label (optional: id)
- label: 0 = legit, 1 = scam

Example:
    python train.py --data dataset.csv --model distilbert-base-uncased --out scam-bert

This script:
- Loads CSV with `datasets`
- Splits train/validation
- Fine-tunes with `transformers.Trainer`
- Saves model + tokenizer into --out (ready for main.py)
"""

from __future__ import annotations

import argparse
import os
from typing import Dict

import numpy as np
from datasets import load_dataset
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default="dataset.csv", help="Path to labeled CSV (text,label[,id])")
    parser.add_argument("--train_file", default="", help="Optional train split CSV (overrides --data split)")
    parser.add_argument("--val_file", default="", help="Optional validation split CSV (overrides --data split)")
    parser.add_argument("--model", default="distilbert-base-uncased", help="HF pretrained model name")
    parser.add_argument("--out", default="scam-bert", help="Output folder for save_pretrained")
    parser.add_argument("--epochs", type=int, default=2)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--max_length", type=int, default=256)
    parser.add_argument("--val_split", type=float, default=0.1)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    if not os.path.exists(args.data):
        raise SystemExit(
            f"Dataset not found: {args.data}\n"
            "Create a CSV with columns: text,label (label: 0=legit, 1=scam)."
        )

    # Load dataset (single file split OR pre-split)
    if args.train_file and args.val_file:
        if not os.path.exists(args.train_file):
            raise SystemExit(f"Train split not found: {args.train_file}")
        if not os.path.exists(args.val_file):
            raise SystemExit(f"Validation split not found: {args.val_file}")

        train_ds = load_dataset("csv", data_files={"train": args.train_file})["train"]
        val_ds = load_dataset("csv", data_files={"val": args.val_file})["val"]
    else:
        # Fall back: load one file and split
        raw = load_dataset("csv", data_files={"data": args.data})["data"]

        # Basic validation
        if "text" not in raw.column_names or "label" not in raw.column_names:
            raise SystemExit(
                f"CSV must contain columns 'text' and 'label'. Found: {raw.column_names}"
            )

        split = raw.train_test_split(
            test_size=args.val_split,
            seed=args.seed,
            stratify_by_column="label",
        )
        train_ds = split["train"]
        val_ds = split["test"]

    tokenizer = AutoTokenizer.from_pretrained(args.model)

    def tokenize(batch):
        return tokenizer(
            batch["text"],
            truncation=True,
            padding=False,
            max_length=args.max_length,
        )

    train_ds = train_ds.map(tokenize, batched=True)
    val_ds = val_ds.map(tokenize, batched=True)

    data_collator = DataCollatorWithPadding(tokenizer=tokenizer)

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model,
        num_labels=2,
    )

    def compute_metrics(eval_pred) -> Dict[str, float]:
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        return {
            "accuracy": float(accuracy_score(labels, preds)),
            "precision": float(precision_score(labels, preds, zero_division=0)),
            "recall": float(recall_score(labels, preds, zero_division=0)),
            "f1": float(f1_score(labels, preds, zero_division=0)),
        }

    training_args = TrainingArguments(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        weight_decay=0.01,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1",
        greater_is_better=True,
        logging_dir=os.path.join(args.out, "logs"),
        logging_steps=25,
        seed=args.seed,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        data_collator=data_collator,
        compute_metrics=compute_metrics,
    )

    trainer.train()

    # Save for offline inference
    trainer.save_model(args.out)
    tokenizer.save_pretrained(args.out)

    print(f"\nSaved fine-tuned model to: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
