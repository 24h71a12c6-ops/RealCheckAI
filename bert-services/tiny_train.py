# tiny_train.py
from transformers import BertTokenizer, BertForSequenceClassification, Trainer, TrainingArguments
import torch
from torch.utils.data import Dataset
import pandas as pd

# ----- Dataset class -----
class TextDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len=64):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.texts[idx],
            padding="max_length",
            truncation=True,
            max_length=self.max_len,
            return_tensors="pt"
        )
        return {
            "input_ids": encoding["input_ids"].squeeze(),
            "attention_mask": encoding["attention_mask"].squeeze(),
            "labels": torch.tensor(self.labels[idx], dtype=torch.long)
        }

# ----- Load CSVs -----
train_df = pd.read_csv("dataset.train.csv")
val_df   = pd.read_csv("dataset.val.csv")
test_df  = pd.read_csv("dataset.test.csv")

tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")

train_dataset = TextDataset(train_df["text"].tolist(), train_df["label"].tolist(), tokenizer)
val_dataset   = TextDataset(val_df["text"].tolist(), val_df["label"].tolist(), tokenizer)
test_dataset  = TextDataset(test_df["text"].tolist(), test_df["label"].tolist(), tokenizer)

# ----- Load model -----
model = BertForSequenceClassification.from_pretrained("bert-base-uncased", num_labels=2)

# ----- Training args -----
training_args = TrainingArguments(
    output_dir="./tiny_bert_model",
    num_train_epochs=2,  # tiny demo
    per_device_train_batch_size=1,
    per_device_eval_batch_size=1,
    eval_strategy="epoch",
    logging_dir="./logs",
    logging_steps=1,
    save_strategy="no"
)

from sklearn.metrics import accuracy_score

def compute_metrics(eval_pred):
    logits, labels = eval_pred
    preds = logits.argmax(axis=-1)
    return {"accuracy": accuracy_score(labels, preds)}

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    compute_metrics=compute_metrics
)

# ----- Train -----
trainer.train()

# ----- Evaluate -----
results = trainer.evaluate(eval_dataset=test_dataset)
print("Test results:", results)

# ----- Demo predictions -----
texts = ["Your internship offer is confirmed!", "This seems like a scam message."]
inputs = tokenizer(texts, padding=True, truncation=True, return_tensors="pt")
outputs = model(**inputs)
preds = torch.argmax(outputs.logits, dim=1)
print("Predictions:", preds.tolist())