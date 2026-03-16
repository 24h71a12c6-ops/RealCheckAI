# RealCheckAI — Offline BERT Service (bert-services)

This folder contains a **fully offline** inference microservice for a fine-tuned BERT (or DistilBERT) scam classifier.

## 1) Put your fine-tuned model on disk

Create a folder (default: `bert-services/scam-bert/`) that contains Hugging Face `save_pretrained()` artifacts, typically:

- `config.json`
- `model.safetensors` **or** `pytorch_model.bin`
- `tokenizer.json` / `tokenizer_config.json`
- `vocab.txt` (depending on tokenizer)

> Note: model weights are large, so keep them out of git.

## 2) Install + run

Windows (PowerShell):

- Create venv
- Install requirements
- Run server

Example commands (run from `bert-services/`):

- `python -m venv venv`
- `venv\Scripts\Activate.ps1`
- `pip install -r requirements.txt`
- `uvicorn main:app --reload --port 8000`

## 3) Test

- Health: `http://localhost:8000/health`
- Predict:

POST `http://localhost:8000/predict`

Body:

```json
{ "text": "We offer $5000 internship with no interview. Pay registration fee." }
```

Response:

```json
{
  "label": "scam",
  "scam_probability": 0.93,
  "legit_probability": 0.07,
  "score": [[0.07, 0.93]],
  "model_path": "./scam-bert"
}
```

## 4) (Optional) Fine-tune your own model

1. Create `dataset.csv` (same format as `dataset.sample.csv`: `id,text,label`)
2. (Recommended) Split into train/val/test:

- `python split_dataset.py --in dataset.csv --out_dir . --seed 42 --dedupe`

This produces:
- `dataset.train.csv`
- `dataset.val.csv`
- `dataset.test.csv`

3. Run training:

- Using splits:
  - `python train.py --train_file dataset.train.csv --val_file dataset.val.csv --model distilbert-base-uncased --out scam-bert`

- Or single file (auto-split inside training):
  - `python train.py --data dataset.csv --model distilbert-base-uncased --out scam-bert`

After training finishes, `scam-bert/` will contain the files needed by `main.py`.

## Configuration (optional)

Environment variables:

- `BERT_MODEL_PATH` (default `./scam-bert`)
- `BERT_MAX_LENGTH` (default `256`)
