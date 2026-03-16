"""Split a labeled dataset into train/val/test CSVs.

Input CSV must have at least:
- text
- label (0=legit, 1=scam)
Optional:
- id

Example:
  python split_dataset.py --in dataset.csv --out_dir . --seed 42 --dedupe

Outputs:
  dataset.train.csv
  dataset.val.csv
  dataset.test.csv
"""

from __future__ import annotations
import argparse
import os
import pandas as pd
from sklearn.model_selection import train_test_split


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="input_path", default="dataset.csv", help="Input CSV path")
    parser.add_argument("--out_dir", default=".", help="Output directory")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--test_size", type=float, default=0.1)
    parser.add_argument("--val_size", type=float, default=0.1)
    parser.add_argument("--dedupe", action="store_true", help="Drop duplicate texts")
    args = parser.parse_args()

    # Check input exists
    if not os.path.exists(args.input_path):
        raise SystemExit(f"Input dataset not found: {args.input_path}")

    # Load CSV
    df = pd.read_csv(args.input_path)

    if "text" not in df.columns or "label" not in df.columns:
        raise SystemExit(f"CSV must contain columns text,label. Found: {list(df.columns)}")

    # Clean text
    df["text"] = df["text"].astype(str).fillna("").str.strip()
    df = df[df["text"].str.len() > 0].copy()

    # Normalize labels
    df["label"] = pd.to_numeric(df["label"], errors="coerce").fillna(-1).astype(int)
    df = df[df["label"].isin([0, 1])].copy()

    if args.dedupe:
        df = df.drop_duplicates(subset=["text"]).copy()

    if df.empty:
        raise SystemExit("Dataset is empty after cleaning.")

    # For tiny datasets, skip stratify completely
    stratify_test = None
    stratify_val = None

    # Split off test set
    train_val, test = train_test_split(
        df,
        test_size=args.test_size,
        random_state=args.seed,
        stratify=stratify_test
    )

    # Compute relative val size
    rel_val = args.val_size / max(1e-9, (1.0 - args.test_size))

    # Split train vs val
    train, val = train_test_split(
        train_val,
        test_size=rel_val,
        random_state=args.seed,
        stratify=stratify_val
    )

    # Save CSVs
    os.makedirs(args.out_dir, exist_ok=True)
    train_path = os.path.join(args.out_dir, "dataset.train.csv")
    val_path = os.path.join(args.out_dir, "dataset.val.csv")
    test_path = os.path.join(args.out_dir, "dataset.test.csv")

    train.to_csv(train_path, index=False)
    val.to_csv(val_path, index=False)
    test.to_csv(test_path, index=False)

    # Print stats
    def stats(name: str, part: pd.DataFrame) -> str:
        counts = part["label"].value_counts().to_dict()
        return f"{name}: n={len(part)} labels={counts}"

    print("Wrote:")
    print(f"- {train_path}")
    print(f"- {val_path}")
    print(f"- {test_path}")
    print(stats("train", train))
    print(stats("val", val))
    print(stats("test", test))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())