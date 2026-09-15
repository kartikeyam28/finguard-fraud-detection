"""
FinGuard Data Pipeline
Loads Kaggle credit card fraud dataset, generates synthetic relational
dimensions, engineers features, and exports to SQLite.
"""

import os
import json
import sqlite3
import hashlib
from pathlib import Path

import numpy as np
import pandas as pd
import kagglehub

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SEED = 42
NUM_CUSTOMERS = 3000
NUM_MERCHANTS = 200
ZIPF_S = 1.5
ANCHOR_DATETIME = pd.Timestamp("2025-01-01 00:00:00", tz="UTC")

CATEGORIES = [
    "grocery", "fuel", "electronics", "travel", "dining",
    "healthcare", "entertainment", "clothing", "utilities", "services",
]

CHANNEL_WEIGHTS = {"online": 0.35, "in-store": 0.40, "ATM": 0.10, "mobile": 0.15}
CHANNEL_WEIGHTS_FRAUD = {"online": 0.50, "in-store": 0.15, "ATM": 0.05, "mobile": 0.30}

DEVICE_OPTIONS = {"mobile": 0.45, "desktop": 0.40, "POS terminal": 0.15}

OUTPUT_DIR = Path(__file__).parent / "outputs"
DB_PATH = OUTPUT_DIR / "transactions.db"

np.random.seed(SEED)


# ---------------------------------------------------------------------------
# 1. Download dataset
# ---------------------------------------------------------------------------
def download_dataset() -> pd.DataFrame:
    print("[1/6] Downloading dataset via kagglehub...")
    path = kagglehub.dataset_download("mlg-ulb/creditcardfraud")
    csv_path = os.path.join(path, "creditcard.csv")
    df = pd.read_csv(csv_path)
    print(f"  Loaded {len(df):,} rows, {df.shape[1]} columns")
    return df


# ---------------------------------------------------------------------------
# 2. Generate synthetic dimensions
# ---------------------------------------------------------------------------
def _zipf_weights(n: int, s: float) -> np.ndarray:
    ranks = np.arange(1, n + 1)
    weights = 1.0 / np.power(ranks, s)
    return weights / weights.sum()


def _deterministic_id(row_index: int, salt: str) -> str:
    h = hashlib.md5(f"{salt}_{row_index}".encode()).hexdigest()
    return h


def generate_synthetic_dimensions(df: pd.DataFrame) -> pd.DataFrame:
    print("[2/6] Generating synthetic dimensions...")
    rng = np.random.RandomState(SEED)
    n = len(df)

    # --- customer_id (Zipf-weighted) ---
    cust_weights = _zipf_weights(NUM_CUSTOMERS, ZIPF_S)
    cust_ids = [f"C-{i:04d}" for i in range(NUM_CUSTOMERS)]
    df["customer_id"] = rng.choice(cust_ids, size=n, p=cust_weights)

    # --- merchant_id + category ---
    merch_ids = [f"M-{i:03d}" for i in range(NUM_MERCHANTS)]
    merch_categories = [CATEGORIES[i % len(CATEGORIES)] for i in range(NUM_MERCHANTS)]
    merch_to_cat = dict(zip(merch_ids, merch_categories))

    # Fraud transactions skewed toward electronics/travel
    fraud_mask = df["Class"] == 1
    fraud_cat_weights = np.array([
        0.05, 0.03, 0.25, 0.25, 0.08,
        0.02, 0.05, 0.10, 0.02, 0.15,
    ])
    legit_cat_weights = np.array([
        0.20, 0.12, 0.08, 0.05, 0.15,
        0.10, 0.08, 0.10, 0.07, 0.05,
    ])

    def _pick_merchants(weights, size):
        cat_picks = rng.choice(CATEGORIES, size=size, p=weights)
        merchants = []
        for cat in cat_picks:
            cat_merchs = [m for m, c in merch_to_cat.items() if c == cat]
            merchants.append(rng.choice(cat_merchs))
        return merchants

    merchant_col = np.empty(n, dtype=object)
    category_col = np.empty(n, dtype=object)

    fraud_idx = df.index[fraud_mask].values
    legit_idx = df.index[~fraud_mask].values

    fraud_merchs = _pick_merchants(fraud_cat_weights, len(fraud_idx))
    legit_merchs = _pick_merchants(legit_cat_weights, len(legit_idx))

    merchant_col[fraud_idx] = fraud_merchs
    merchant_col[legit_idx] = legit_merchs

    for i in range(n):
        category_col[i] = merch_to_cat[merchant_col[i]]

    df["merchant_id"] = merchant_col
    df["category"] = category_col

    # --- channel ---
    channels_list = list(CHANNEL_WEIGHTS.keys())
    legit_ch_w = np.array(list(CHANNEL_WEIGHTS.values()))
    fraud_ch_w = np.array(list(CHANNEL_WEIGHTS_FRAUD.values()))

    channel_col = np.empty(n, dtype=object)
    channel_col[fraud_idx] = rng.choice(channels_list, size=len(fraud_idx), p=fraud_ch_w)
    channel_col[legit_idx] = rng.choice(channels_list, size=len(legit_idx), p=legit_ch_w)
    df["channel"] = channel_col

    # --- device (only for online/mobile) ---
    device_list = list(DEVICE_OPTIONS.keys())
    device_w = np.array(list(DEVICE_OPTIONS.values()))
    device_col = np.full(n, None, dtype=object)
    digital_mask = df["channel"].isin(["online", "mobile"])
    digital_idx = df.index[digital_mask].values
    device_col[digital_idx] = rng.choice(device_list, size=len(digital_idx), p=device_w)
    df["device"] = device_col

    # --- timestamp ---
    df["timestamp"] = ANCHOR_DATETIME + pd.to_timedelta(df["Time"], unit="s")

    print(f"  Assigned {NUM_CUSTOMERS} customers, {NUM_MERCHANTS} merchants, "
          f"{len(CATEGORIES)} categories")
    return df


# ---------------------------------------------------------------------------
# 3. Feature engineering
# ---------------------------------------------------------------------------
def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    print("[3/6] Engineering features...")

    # Time features
    df["hour_of_day"] = df["timestamp"].dt.hour
    df["day_of_week"] = df["timestamp"].dt.dayofweek

    # Sort by customer and time for rolling calculations
    df = df.sort_values(["customer_id", "timestamp"]).reset_index(drop=True)

    # Per-customer rolling aggregates
    grp = df.groupby("customer_id")

    # Rolling mean/std of amount (window=50 transactions)
    df["cust_avg_amount"] = grp["Amount"].transform(
        lambda x: x.rolling(50, min_periods=1).mean()
    )
    df["cust_std_amount"] = grp["Amount"].transform(
        lambda x: x.rolling(50, min_periods=1).std().fillna(0)
    )

    # Amount z-score relative to customer history
    df["amount_zscore"] = np.where(
        df["cust_std_amount"] > 0,
        (df["Amount"] - df["cust_avg_amount"]) / df["cust_std_amount"],
        0.0,
    )

    # Time since last transaction per customer (seconds)
    df["time_since_last_txn"] = grp["Time"].diff().fillna(0)

    # Transaction count in last 1h and 24h (approximated via rolling time windows)
    # Using a count-based approach for efficiency
    df["cust_txn_count"] = grp.cumcount() + 1

    # Velocity: transactions within 3600s (1h) window
    def _count_within_window(times, window_sec):
        counts = np.zeros(len(times), dtype=np.int32)
        times_arr = times.values
        for i in range(len(times_arr)):
            t = times_arr[i]
            j = i - 1
            count = 0
            while j >= 0 and (t - times_arr[j]) <= window_sec:
                count += 1
                j -= 1
            counts[i] = count
        return counts

    # For performance, use a vectorized approximation instead of per-row loop
    # Group-level: count txns in last 1h by checking time differences
    print("  Computing velocity measures (this may take a moment)...")
    txn_count_1h = []
    txn_count_24h = []
    for _, group in grp["Time"]:
        times = group.values
        c1h = np.zeros(len(times), dtype=np.int32)
        c24h = np.zeros(len(times), dtype=np.int32)
        for i in range(len(times)):
            t = times[i]
            # Count backwards
            j = i - 1
            while j >= 0 and (t - times[j]) <= 3600:
                c1h[i] += 1
                j -= 1
            j = i - 1
            while j >= 0 and (t - times[j]) <= 86400:
                c24h[i] += 1
                j -= 1
        txn_count_1h.append(pd.Series(c1h, index=group.index))
        txn_count_24h.append(pd.Series(c24h, index=group.index))

    df["txn_count_1h"] = pd.concat(txn_count_1h)
    df["txn_count_24h"] = pd.concat(txn_count_24h)

    # First-time merchant category flag
    df["is_new_merchant_category"] = 0
    seen_cats = {}
    for idx, row in df.iterrows():
        cid = row["customer_id"]
        cat = row["category"]
        if cid not in seen_cats:
            seen_cats[cid] = set()
            df.at[idx, "is_new_merchant_category"] = 1
        elif cat not in seen_cats[cid]:
            df.at[idx, "is_new_merchant_category"] = 1
        seen_cats[cid].add(cat)

    print(f"  Engineered {df.shape[1]} total columns")
    return df


# ---------------------------------------------------------------------------
# 4. Memory optimization
# ---------------------------------------------------------------------------
def optimize_memory(df: pd.DataFrame) -> pd.DataFrame:
    print("[4/6] Optimizing memory...")
    initial_mem = df.memory_usage(deep=True).sum() / 1e6

    # Downcast V1-V28 to float32
    v_cols = [f"V{i}" for i in range(1, 29)]
    for col in v_cols:
        df[col] = df[col].astype(np.float32)

    # Downcast other float columns
    float_cols = ["Amount", "cust_avg_amount", "cust_std_amount", "amount_zscore",
                  "time_since_last_txn"]
    for col in float_cols:
        if col in df.columns:
            df[col] = df[col].astype(np.float32)

    # Downcast int columns
    int_cols = ["Class", "hour_of_day", "day_of_week", "txn_count_1h",
                "txn_count_24h", "is_new_merchant_category", "cust_txn_count"]
    for col in int_cols:
        if col in df.columns:
            df[col] = df[col].astype(np.int8) if df[col].max() < 127 else df[col].astype(np.int16)

    # Categoricals
    for col in ["customer_id", "merchant_id", "category", "channel", "device"]:
        df[col] = df[col].astype("category")

    final_mem = df.memory_usage(deep=True).sum() / 1e6
    print(f"  Memory: {initial_mem:.1f} MB -> {final_mem:.1f} MB "
          f"({(1 - final_mem/initial_mem)*100:.0f}% reduction)")
    return df


# ---------------------------------------------------------------------------
# 5. Export to SQLite
# ---------------------------------------------------------------------------
def export_to_sqlite(df: pd.DataFrame):
    print("[5/6] Exporting to SQLite...")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Convert categoricals back to string for SQLite
    df_export = df.copy()
    for col in df_export.select_dtypes(include=["category"]).columns:
        df_export[col] = df_export[col].astype(str)

    # Convert timestamp to ISO string
    df_export["timestamp"] = df_export["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    # Read and execute schema
    schema_path = Path(__file__).parent.parent / "sql" / "schema.sql"
    if schema_path.exists():
        cursor.executescript(schema_path.read_text())

    # --- Populate merchants table ---
    merchants = df_export[["merchant_id", "category"]].drop_duplicates()
    merchants["merchant_name"] = merchants["merchant_id"].apply(
        lambda m: f"Merchant {m.split('-')[1]}"
    )
    merchants["risk_score"] = np.random.RandomState(SEED).uniform(0.0, 1.0, len(merchants))
    for _, row in merchants.iterrows():
        cursor.execute(
            "INSERT OR IGNORE INTO merchants (merchant_id, merchant_name, category, risk_score) VALUES (?, ?, ?, ?)",
            (row["merchant_id"], row["merchant_name"], row["category"], round(row["risk_score"], 4)),
        )

    # --- Populate customers table ---
    cust_agg = df_export.groupby("customer_id").agg(
        total_transactions=("Class", "count"),
        total_amount=("Amount", "sum"),
        avg_amount=("Amount", "mean"),
        fraud_rate=("Class", "mean"),
        dominant_category=("category", lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else "unknown"),
        dominant_channel=("channel", lambda x: x.mode().iloc[0] if len(x.mode()) > 0 else "unknown"),
    ).reset_index()
    cust_agg["segment"] = "unassigned"
    cust_agg["created_at"] = "2025-01-01"

    for _, row in cust_agg.iterrows():
        cursor.execute(
            "INSERT OR IGNORE INTO customers (customer_id, segment, total_transactions, total_amount, avg_amount, fraud_rate, dominant_category, dominant_channel, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (row["customer_id"], row["segment"], int(row["total_transactions"]),
             round(float(row["total_amount"]), 2), round(float(row["avg_amount"]), 2),
             round(float(row["fraud_rate"]), 6), row["dominant_category"],
             row["dominant_channel"], row["created_at"]),
        )

    # --- Populate accounts table (1 account per customer) ---
    rng = np.random.RandomState(SEED + 1)
    acct_types = ["checking", "savings", "credit"]
    for cid in cust_agg["customer_id"]:
        acct_id = f"A-{cid.split('-')[1]}"
        cursor.execute(
            "INSERT OR IGNORE INTO accounts (account_id, customer_id, account_type, balance, opened_at) VALUES (?, ?, ?, ?, ?)",
            (acct_id, cid, rng.choice(acct_types),
             round(rng.uniform(100, 50000), 2), "2024-06-01"),
        )

    # --- Populate transactions table ---
    # Select columns for transactions table
    txn_cols = [
        "customer_id", "merchant_id", "amount", "timestamp", "channel",
        "device", "category", "Class", "hour_of_day", "day_of_week",
        "amount_zscore", "time_since_last_txn", "txn_count_1h", "txn_count_24h",
        "is_new_merchant_category", "cust_avg_amount", "cust_std_amount",
    ]
    # Add V1-V28
    v_cols = [f"V{i}" for i in range(1, 29)]
    txn_cols.extend(v_cols)

    # Rename for DB
    df_txn = df_export.copy()
    df_txn = df_txn.rename(columns={"Amount": "amount", "Class": "fraud_label"})
    df_txn["account_id"] = df_txn["customer_id"].apply(lambda c: f"A-{c.split('-')[1]}")
    df_txn["fraud_score"] = 0.0  # Will be updated after model training

    # Map column names
    insert_cols = [
        "customer_id", "account_id", "merchant_id", "amount", "timestamp",
        "channel", "device", "category", "fraud_label", "fraud_score",
        "hour_of_day", "day_of_week", "amount_zscore", "time_since_last_txn",
        "txn_count_1h", "txn_count_24h", "is_new_merchant_category",
        "cust_avg_amount", "cust_std_amount",
    ] + v_cols

    placeholders = ", ".join(["?"] * len(insert_cols))
    col_names = ", ".join(insert_cols)

    # Batch insert
    batch_size = 5000
    rows = df_txn[insert_cols].values.tolist()
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        # Replace numpy types with Python native
        clean_batch = []
        for row in batch:
            clean_row = []
            for val in row:
                if isinstance(val, (np.integer,)):
                    clean_row.append(int(val))
                elif isinstance(val, (np.floating,)):
                    clean_row.append(float(val))
                elif val is None or (isinstance(val, float) and np.isnan(val)):
                    clean_row.append(None)
                else:
                    clean_row.append(val)
            clean_batch.append(clean_row)
        cursor.executemany(
            f"INSERT INTO transactions ({col_names}) VALUES ({placeholders})",
            clean_batch,
        )

    conn.commit()

    # Verify
    count = cursor.execute("SELECT COUNT(*) FROM transactions").fetchone()[0]
    fraud_count = cursor.execute("SELECT COUNT(*) FROM transactions WHERE fraud_label = 1").fetchone()[0]
    cust_count = cursor.execute("SELECT COUNT(*) FROM customers").fetchone()[0]
    merch_count = cursor.execute("SELECT COUNT(*) FROM merchants").fetchone()[0]

    print(f"  SQLite DB: {count:,} transactions, {fraud_count:,} fraud, "
          f"{cust_count:,} customers, {merch_count:,} merchants")
    conn.close()


# ---------------------------------------------------------------------------
# 6. Export feature metadata
# ---------------------------------------------------------------------------
def export_metadata(df: pd.DataFrame):
    print("[6/6] Exporting metadata...")
    feature_cols = [f"V{i}" for i in range(1, 29)] + [
        "Amount", "hour_of_day", "day_of_week", "amount_zscore",
        "time_since_last_txn", "txn_count_1h", "txn_count_24h",
        "is_new_merchant_category", "cust_avg_amount", "cust_std_amount",
    ]
    # Add one-hot encoded categorical features
    channel_cats = ["online", "in-store", "ATM", "mobile"]
    category_cats = CATEGORIES
    feature_cols += [f"channel_{c}" for c in channel_cats]
    feature_cols += [f"category_{c}" for c in category_cats]

    metadata = {
        "feature_columns": feature_cols,
        "num_rows": len(df),
        "num_customers": df["customer_id"].nunique(),
        "num_merchants": df["merchant_id"].nunique(),
        "fraud_rate": float((df["Class"] == 1).mean()),
        "categories": CATEGORIES,
        "channels": list(CHANNEL_WEIGHTS.keys()),
    }

    meta_path = OUTPUT_DIR / "feature_columns.json"
    with open(meta_path, "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"  Saved metadata to {meta_path}")

    # Also export CSV for notebooks
    csv_path = OUTPUT_DIR / "augmented_transactions.csv"
    df_csv = df.copy()
    for col in df_csv.select_dtypes(include=["category"]).columns:
        df_csv[col] = df_csv[col].astype(str)
    df_csv["timestamp"] = df_csv["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")
    df_csv.to_csv(csv_path, index=False)
    print(f"  Saved CSV ({csv_path.stat().st_size / 1e6:.1f} MB)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("FinGuard Data Pipeline")
    print("=" * 60)

    df = download_dataset()
    df = generate_synthetic_dimensions(df)
    df = engineer_features(df)
    df = optimize_memory(df)
    export_to_sqlite(df)
    export_metadata(df)

    print("\nPipeline complete.")
    print(f"  Database: {DB_PATH}")
    print(f"  Fraud rate: {(df['Class'] == 1).mean():.4%}")


if __name__ == "__main__":
    main()
