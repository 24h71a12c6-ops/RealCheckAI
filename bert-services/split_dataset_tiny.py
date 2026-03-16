# split_dataset_tiny.py
import pandas as pd
import argparse
from sklearn.model_selection import train_test_split

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", required=True, help="Input CSV")
    parser.add_argument("--out_dir", default=".", help="Output folder")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--dedupe", action="store_true", help="Remove duplicates")
    args = parser.parse_args()
    
    df = pd.read_csv(getattr(args, "in"))
    
    if args.dedupe:
        df = df.drop_duplicates()
    
    # tiny dataset safe split
    if len(df) < 10:
        # just split 50-25-25 for tiny dataset
        train, temp = train_test_split(df, test_size=0.5, random_state=args.seed)
        val, test = train_test_split(temp, test_size=0.5, random_state=args.seed)
    else:
        # normal stratified split for bigger datasets
        train, temp = train_test_split(df, test_size=0.3, random_state=args.seed, stratify=df['label'])
        val, test = train_test_split(temp, test_size=0.5, random_state=args.seed, stratify=temp['label'])
    
    train.to_csv(f"{args.out_dir}/dataset.train.csv", index=False)
    val.to_csv(f"{args.out_dir}/dataset.val.csv", index=False)
    test.to_csv(f"{args.out_dir}/dataset.test.csv", index=False)

    print(f"Wrote:\n- {args.out_dir}/dataset.train.csv\n- {args.out_dir}/dataset.val.csv\n- {args.out_dir}/dataset.test.csv")
    print(f"train: n={len(train)} labels={train['label'].value_counts().to_dict()}")
    print(f"val: n={len(val)} labels={val['label'].value_counts().to_dict()}")
    print(f"test: n={len(test)} labels={test['label'].value_counts().to_dict()}")

if __name__ == "__main__":
    main()