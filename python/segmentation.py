"""
FinGuard Customer Segmentation
K-Means clustering into behavioral personas + Isolation Forest anomaly detection.
Compares unsupervised anomaly flags against supervised model predictions.
"""

import json
import sqlite3
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.cluster import KMeans
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score

OUTPUT_DIR = Path(__file__).parent / "outputs"
PLOTS_DIR = OUTPUT_DIR / "plots"
SEED = 42

PERSONA_NAMES = {
    0: "High-Value Frequent Buyer",
    1: "Low-Activity Saver",
    2: "Online-Heavy Spender",
    3: "Cautious Regular",
    4: "New/Infrequent Customer",
    5: "ATM-Dependent User",
}


def load_data() -> pd.DataFrame:
    csv_path = OUTPUT_DIR / "augmented_transactions.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Run data_pipeline.py first.")
    return pd.read_csv(csv_path)


def build_customer_aggregates(df: pd.DataFrame) -> pd.DataFrame:
    """Build per-customer feature vectors for clustering."""
    fraud_col = "fraud_label" if "fraud_label" in df.columns else "Class"
    amt_col = "amount" if "amount" in df.columns else "Amount"

    agg = df.groupby("customer_id").agg(
        total_txns=(fraud_col, "count"),
        total_amount=(amt_col, "sum"),
        avg_amount=(amt_col, "mean"),
        std_amount=(amt_col, "std"),
        max_amount=(amt_col, "max"),
        fraud_count=(fraud_col, "sum"),
        fraud_rate=(fraud_col, "mean"),
        unique_merchants=("merchant_id", "nunique"),
        unique_categories=("category", "nunique"),
        avg_time_between_txns=("time_since_last_txn", "mean"),
        online_ratio=("channel", lambda x: (x == "online").mean()),
        mobile_ratio=("channel", lambda x: (x == "mobile").mean()),
    ).reset_index()

    agg["std_amount"] = agg["std_amount"].fillna(0)
    agg["avg_time_between_txns"] = agg["avg_time_between_txns"].fillna(0)

    return agg


def cluster_customers(agg: pd.DataFrame) -> tuple:
    """K-Means clustering with silhouette-based k selection."""
    feature_cols = [
        "total_txns", "total_amount", "avg_amount", "std_amount", "max_amount",
        "unique_merchants", "unique_categories", "avg_time_between_txns",
        "online_ratio", "mobile_ratio",
    ]

    X = agg[feature_cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Try k=3 to k=7
    silhouettes = {}
    for k in range(3, 8):
        km = KMeans(n_clusters=k, random_state=SEED, n_init=10)
        labels = km.fit_predict(X_scaled)
        sil = silhouette_score(X_scaled, labels)
        silhouettes[k] = sil
        print(f"  k={k}: silhouette={sil:.4f}")

    best_k = max(silhouettes, key=silhouettes.get)
    print(f"  Selected k={best_k} (silhouette={silhouettes[best_k]:.4f})")

    # Final clustering
    km_final = KMeans(n_clusters=best_k, random_state=SEED, n_init=10)
    agg["cluster"] = km_final.fit_predict(X_scaled)

    # Assign persona names
    # Sort clusters by avg_amount to assign meaningful names
    cluster_means = agg.groupby("cluster")["avg_amount"].mean().sort_values(ascending=False)
    name_mapping = {}
    for i, cluster_id in enumerate(cluster_means.index):
        name_mapping[cluster_id] = PERSONA_NAMES.get(i, f"Segment {i}")
    agg["segment"] = agg["cluster"].map(name_mapping)

    # Plot silhouette scores
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(list(silhouettes.keys()), list(silhouettes.values()), "o-", color="black")
    ax.set_xlabel("Number of Clusters (k)")
    ax.set_ylabel("Silhouette Score")
    ax.set_title("Silhouette Score vs Number of Clusters")
    ax.axvline(x=best_k, color="gray", linestyle="--", label=f"Selected k={best_k}")
    ax.legend()
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "silhouette_scores.png", dpi=150)
    plt.close()

    return agg, silhouettes, best_k


def anomaly_detection(agg: pd.DataFrame) -> pd.DataFrame:
    """Isolation Forest anomaly detection on customer aggregates."""
    feature_cols = [
        "total_txns", "total_amount", "avg_amount", "std_amount", "max_amount",
        "unique_merchants", "unique_categories", "avg_time_between_txns",
        "online_ratio", "mobile_ratio",
    ]

    X = agg[feature_cols].values
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    iso = IsolationForest(
        n_estimators=100, contamination=0.02, random_state=SEED
    )
    agg["anomaly_label"] = iso.fit_predict(X_scaled)
    agg["anomaly_score"] = -iso.score_samples(X_scaled)  # Higher = more anomalous

    # Convert: -1 (anomaly) -> 1, 1 (normal) -> 0
    agg["is_anomaly"] = (agg["anomaly_label"] == -1).astype(int)

    n_anomalies = agg["is_anomaly"].sum()
    print(f"  Isolation Forest: {n_anomalies} anomalous customers ({n_anomalies/len(agg)*100:.1f}%)")

    return agg


def compare_supervised_vs_unsupervised(agg: pd.DataFrame) -> dict:
    """Compare anomaly detection flags against supervised fraud rate."""
    # Customers flagged as anomalous by Isolation Forest
    anomalous = agg[agg["is_anomaly"] == 1]
    normal = agg[agg["is_anomaly"] == 0]

    comparison = {
        "anomalous_customers": int(len(anomalous)),
        "normal_customers": int(len(normal)),
        "anomalous_avg_fraud_rate": float(anomalous["fraud_rate"].mean()) if len(anomalous) > 0 else 0,
        "normal_avg_fraud_rate": float(normal["fraud_rate"].mean()) if len(normal) > 0 else 0,
        "anomalous_avg_amount": float(anomalous["avg_amount"].mean()) if len(anomalous) > 0 else 0,
        "normal_avg_amount": float(normal["avg_amount"].mean()) if len(normal) > 0 else 0,
        "interpretation": "",
    }

    if comparison["anomalous_avg_fraud_rate"] > comparison["normal_avg_fraud_rate"]:
        ratio = comparison["anomalous_avg_fraud_rate"] / max(comparison["normal_avg_fraud_rate"], 1e-8)
        comparison["interpretation"] = (
            f"Anomalous customers have {ratio:.1f}x higher average fraud rate than normal customers. "
            f"The unsupervised Isolation Forest broadly agrees with the supervised model's fraud signals, "
            f"validating that behavioral outliers correlate with fraud risk."
        )
    else:
        comparison["interpretation"] = (
            "Anomalous customers do not show higher fraud rates, suggesting the Isolation Forest "
            "captures different behavioral outliers (e.g., unusual spending patterns, merchant diversity) "
            "rather than fraud specifically. This is expected — unsupervised methods detect general "
            "anomalies, not fraud-specific signals."
        )

    print(f"\n  Anomalous customer avg fraud rate: {comparison['anomalous_avg_fraud_rate']:.4%}")
    print(f"  Normal customer avg fraud rate: {comparison['normal_avg_fraud_rate']:.4%}")
    print(f"  {comparison['interpretation']}")

    return comparison


def save_results(agg: pd.DataFrame, silhouettes: dict, best_k: int, comparison: dict):
    """Save segmentation results to JSON and update SQLite."""
    # Build segment profiles
    segments = {}
    for segment_name in agg["segment"].unique():
        seg_data = agg[agg["segment"] == segment_name]
        segments[segment_name] = {
            "count": int(len(seg_data)),
            "avg_txns": float(seg_data["total_txns"].mean()),
            "avg_amount": float(seg_data["avg_amount"].mean()),
            "avg_fraud_rate": float(seg_data["fraud_rate"].mean()),
            "avg_unique_merchants": float(seg_data["unique_merchants"].mean()),
            "online_ratio": float(seg_data["online_ratio"].mean()),
            "mobile_ratio": float(seg_data["mobile_ratio"].mean()),
            "customers": seg_data["customer_id"].tolist(),
        }

    output = {
        "segments": segments,
        "best_k": best_k,
        "silhouettes": {str(k): float(v) for k, v in silhouettes.items()},
        "anomaly_comparison": comparison,
    }

    with open(OUTPUT_DIR / "customer_segments.json", "w") as f:
        json.dump(output, f, indent=2, default=str)

    # Update customer segments in SQLite
    db_path = OUTPUT_DIR / "transactions.db"
    if db_path.exists():
        conn = sqlite3.connect(str(db_path))
        cursor = conn.cursor()
        for _, row in agg.iterrows():
            cursor.execute(
                "UPDATE customers SET segment = ? WHERE customer_id = ?",
                (row["segment"], row["customer_id"]),
            )
        conn.commit()
        conn.close()
        print(f"\n  Updated customer segments in SQLite.")

    print(f"  Segments saved to {OUTPUT_DIR / 'customer_segments.json'}")


def main():
    print("=" * 60)
    print("FinGuard Customer Segmentation")
    print("=" * 60)

    df = load_data()

    print("\n[1/4] Building customer aggregates...")
    agg = build_customer_aggregates(df)
    print(f"  {len(agg)} customers")

    print("\n[2/4] Clustering customers...")
    agg, silhouettes, best_k = cluster_customers(agg)

    print("\n[3/4] Running anomaly detection...")
    agg = anomaly_detection(agg)

    print("\n[4/4] Comparing supervised vs unsupervised...")
    comparison = compare_supervised_vs_unsupervised(agg)

    save_results(agg, silhouettes, best_k, comparison)

    print("\nSegmentation complete.")


if __name__ == "__main__":
    main()
