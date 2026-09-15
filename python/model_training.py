"""
FinGuard Model Training
Trains fraud detection classifiers under severe class imbalance.
Compares three strategies: SMOTE, class weighting, threshold tuning.
Evaluates on PR-AUC (not ROC-AUC). Exports model artifacts.
"""

import json
import sqlite3
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import joblib
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    precision_recall_curve,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    confusion_matrix,
    classification_report,
    roc_auc_score,
)
from imblearn.over_sampling import SMOTE

warnings.filterwarnings("ignore")

OUTPUT_DIR = Path(__file__).parent / "outputs"
PLOTS_DIR = OUTPUT_DIR / "plots"
SEED = 42


def load_data() -> pd.DataFrame:
    csv_path = OUTPUT_DIR / "augmented_transactions.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Run data_pipeline.py first. Missing: {csv_path}")
    return pd.read_csv(csv_path)


def prepare_features(df: pd.DataFrame) -> tuple:
    """Prepare feature matrix and target vector."""
    with open(OUTPUT_DIR / "feature_columns.json") as f:
        meta = json.load(f)

    # Base numeric features
    v_cols = [f"V{i}" for i in range(1, 29)]
    numeric_features = v_cols + [
        "Amount", "hour_of_day", "day_of_week", "amount_zscore",
        "time_since_last_txn", "txn_count_1h", "txn_count_24h",
        "is_new_merchant_category", "cust_avg_amount", "cust_std_amount",
    ]

    # One-hot encode categoricals
    if "channel" in df.columns:
        channel_dummies = pd.get_dummies(df["channel"], prefix="channel").astype(np.float32)
        df = pd.concat([df, channel_dummies], axis=1)
        numeric_features += list(channel_dummies.columns)

    if "category" in df.columns:
        category_dummies = pd.get_dummies(df["category"], prefix="category").astype(np.float32)
        df = pd.concat([df, category_dummies], axis=1)
        numeric_features += list(category_dummies.columns)

    # Handle the target column
    target_col = "fraud_label" if "fraud_label" in df.columns else "Class"

    X = df[numeric_features].fillna(0).astype(np.float32)
    y = df[target_col].values

    print(f"Feature matrix: {X.shape}")
    print(f"Fraud rate: {y.mean():.4%}")

    return X, y, numeric_features


def train_and_evaluate(X_train, X_test, y_train, y_test, feature_names) -> dict:
    """Train three strategies and compare."""
    results = {}
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(1, 1, figsize=(10, 7))

    # -------------------------------------------------------------------------
    # Strategy A: SMOTE oversampling
    # -------------------------------------------------------------------------
    print("\n--- Strategy A: SMOTE ---")
    smote = SMOTE(random_state=SEED, sampling_strategy=0.5)
    X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
    print(f"  Resampled: {len(X_resampled):,} rows, fraud rate: {y_resampled.mean():.2%}")

    clf_smote = RandomForestClassifier(
        n_estimators=100, max_depth=15, random_state=SEED, n_jobs=-1
    )
    clf_smote.fit(X_resampled, y_resampled)
    y_scores_smote = clf_smote.predict_proba(X_test)[:, 1]

    pr_auc_smote = average_precision_score(y_test, y_scores_smote)
    prec_smote, rec_smote, thresh_smote = precision_recall_curve(y_test, y_scores_smote)
    ax.plot(rec_smote, prec_smote, label=f"SMOTE (PR-AUC={pr_auc_smote:.4f})", color="black")

    # Find best F1 threshold
    f1_scores_smote = 2 * (prec_smote[:-1] * rec_smote[:-1]) / (prec_smote[:-1] + rec_smote[:-1] + 1e-8)
    best_idx_smote = np.argmax(f1_scores_smote)
    best_thresh_smote = thresh_smote[best_idx_smote]

    y_pred_smote = (y_scores_smote >= best_thresh_smote).astype(int)
    results["smote"] = {
        "pr_auc": float(pr_auc_smote),
        "roc_auc": float(roc_auc_score(y_test, y_scores_smote)),
        "best_threshold": float(best_thresh_smote),
        "best_f1": float(f1_scores_smote[best_idx_smote]),
        "precision": float(precision_score(y_test, y_pred_smote)),
        "recall": float(recall_score(y_test, y_pred_smote)),
        "confusion_matrix": confusion_matrix(y_test, y_pred_smote).tolist(),
    }
    print(f"  PR-AUC: {pr_auc_smote:.4f}")
    print(f"  Best threshold: {best_thresh_smote:.4f}, F1: {f1_scores_smote[best_idx_smote]:.4f}")

    # -------------------------------------------------------------------------
    # Strategy B: Class weighting
    # -------------------------------------------------------------------------
    print("\n--- Strategy B: Class Weighting ---")
    clf_weighted = RandomForestClassifier(
        n_estimators=100, max_depth=15, class_weight="balanced",
        random_state=SEED, n_jobs=-1
    )
    clf_weighted.fit(X_train, y_train)
    y_scores_weighted = clf_weighted.predict_proba(X_test)[:, 1]

    pr_auc_weighted = average_precision_score(y_test, y_scores_weighted)
    prec_w, rec_w, thresh_w = precision_recall_curve(y_test, y_scores_weighted)
    ax.plot(rec_w, prec_w, label=f"Class Weight (PR-AUC={pr_auc_weighted:.4f})",
            color="gray", linestyle="--")

    f1_scores_w = 2 * (prec_w[:-1] * rec_w[:-1]) / (prec_w[:-1] + rec_w[:-1] + 1e-8)
    best_idx_w = np.argmax(f1_scores_w)
    best_thresh_w = thresh_w[best_idx_w]

    y_pred_w = (y_scores_weighted >= best_thresh_w).astype(int)
    results["class_weight"] = {
        "pr_auc": float(pr_auc_weighted),
        "roc_auc": float(roc_auc_score(y_test, y_scores_weighted)),
        "best_threshold": float(best_thresh_w),
        "best_f1": float(f1_scores_w[best_idx_w]),
        "precision": float(precision_score(y_test, y_pred_w)),
        "recall": float(recall_score(y_test, y_pred_w)),
        "confusion_matrix": confusion_matrix(y_test, y_pred_w).tolist(),
    }
    print(f"  PR-AUC: {pr_auc_weighted:.4f}")
    print(f"  Best threshold: {best_thresh_w:.4f}, F1: {f1_scores_w[best_idx_w]:.4f}")

    # -------------------------------------------------------------------------
    # Strategy C: Threshold tuning (no resampling, no weighting)
    # -------------------------------------------------------------------------
    print("\n--- Strategy C: Threshold Tuning ---")
    clf_default = RandomForestClassifier(
        n_estimators=100, max_depth=15, random_state=SEED, n_jobs=-1
    )
    clf_default.fit(X_train, y_train)
    y_scores_default = clf_default.predict_proba(X_test)[:, 1]

    pr_auc_default = average_precision_score(y_test, y_scores_default)
    prec_d, rec_d, thresh_d = precision_recall_curve(y_test, y_scores_default)
    ax.plot(rec_d, prec_d, label=f"Threshold Tuning (PR-AUC={pr_auc_default:.4f})",
            color="black", linestyle=":")

    f1_scores_d = 2 * (prec_d[:-1] * rec_d[:-1]) / (prec_d[:-1] + rec_d[:-1] + 1e-8)
    best_idx_d = np.argmax(f1_scores_d)
    best_thresh_d = thresh_d[best_idx_d]

    y_pred_d = (y_scores_default >= best_thresh_d).astype(int)
    results["threshold_tuning"] = {
        "pr_auc": float(pr_auc_default),
        "roc_auc": float(roc_auc_score(y_test, y_scores_default)),
        "best_threshold": float(best_thresh_d),
        "best_f1": float(f1_scores_d[best_idx_d]),
        "precision": float(precision_score(y_test, y_pred_d)),
        "recall": float(recall_score(y_test, y_pred_d)),
        "confusion_matrix": confusion_matrix(y_test, y_pred_d).tolist(),
    }
    print(f"  PR-AUC: {pr_auc_default:.4f}")
    print(f"  Best threshold: {best_thresh_d:.4f}, F1: {f1_scores_d[best_idx_d]:.4f}")

    # --- Finalize PR curve plot ---
    ax.set_xlabel("Recall")
    ax.set_ylabel("Precision")
    ax.set_title("Precision-Recall Curves: Three Imbalance Strategies")
    ax.legend()
    ax.set_xlim([0, 1])
    ax.set_ylim([0, 1])
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "pr_curves_comparison.png", dpi=150)
    plt.close()

    # --- Select best model ---
    best_strategy = max(results, key=lambda k: results[k]["pr_auc"])
    results["best_strategy"] = best_strategy
    print(f"\nBest strategy: {best_strategy} (PR-AUC={results[best_strategy]['pr_auc']:.4f})")

    # --- PR-AUC explanation ---
    results["pr_auc_explanation"] = (
        "We evaluate using Precision-Recall AUC (PR-AUC) instead of ROC-AUC because "
        "the dataset has extreme class imbalance (~0.17% fraud). ROC-AUC measures the "
        "tradeoff between true positive rate and false positive rate. At low base rates, "
        "the false positive rate (FPR = FP / (FP + TN)) is deflated by the enormous number "
        "of true negatives, making even a mediocre model appear to have high ROC-AUC. "
        "PR-AUC directly measures the precision-recall tradeoff on the minority (fraud) class, "
        "which is what we actually care about: of the transactions we flag, how many are real "
        "fraud (precision), and of all real fraud, how many do we catch (recall). A random "
        "classifier achieves PR-AUC equal to the base rate (~0.0017), making improvements "
        "directly interpretable."
    )

    return results, {
        "smote": clf_smote,
        "class_weight": clf_weighted,
        "threshold_tuning": clf_default,
    }


def extract_feature_importance(clf, feature_names: list) -> list:
    """Get top 15 feature importances for explanations."""
    importances = clf.feature_importances_
    indices = np.argsort(importances)[::-1][:15]
    top_features = [
        {"feature": feature_names[i], "importance": float(importances[i])}
        for i in indices
    ]

    # Plot
    fig, ax = plt.subplots(figsize=(10, 6))
    names = [f["feature"] for f in top_features]
    values = [f["importance"] for f in top_features]
    ax.barh(range(len(names)), values, color="black")
    ax.set_yticks(range(len(names)))
    ax.set_yticklabels(names)
    ax.set_xlabel("Importance")
    ax.set_title("Top 15 Feature Importances")
    ax.invert_yaxis()
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "feature_importance.png", dpi=150)
    plt.close()

    return top_features


def update_fraud_scores(best_clf, feature_names: list):
    """Write fraud scores back to SQLite for all transactions."""
    print("\nUpdating fraud scores in SQLite...")
    db_path = OUTPUT_DIR / "transactions.db"
    if not db_path.exists():
        print("  SQLite DB not found, skipping score update.")
        return

    conn = sqlite3.connect(str(db_path))

    # Load all transactions
    df = pd.read_csv(OUTPUT_DIR / "augmented_transactions.csv")

    # Prepare features (same as training)
    v_cols = [f"V{i}" for i in range(1, 29)]
    numeric_features = v_cols + [
        "Amount", "hour_of_day", "day_of_week", "amount_zscore",
        "time_since_last_txn", "txn_count_1h", "txn_count_24h",
        "is_new_merchant_category", "cust_avg_amount", "cust_std_amount",
    ]

    if "channel" in df.columns:
        channel_dummies = pd.get_dummies(df["channel"], prefix="channel").astype(np.float32)
        df = pd.concat([df, channel_dummies], axis=1)
        numeric_features += list(channel_dummies.columns)

    if "category" in df.columns:
        category_dummies = pd.get_dummies(df["category"], prefix="category").astype(np.float32)
        df = pd.concat([df, category_dummies], axis=1)
        numeric_features += list(category_dummies.columns)

    # Align features with training feature set
    for col in feature_names:
        if col not in df.columns:
            df[col] = 0.0

    X_all = df[feature_names].fillna(0).astype(np.float32)
    scores = best_clf.predict_proba(X_all)[:, 1]

    # Update scores in DB (transaction_id is 1-indexed autoincrement)
    cursor = conn.cursor()
    batch_size = 5000
    for i in range(0, len(scores), batch_size):
        batch = [(float(scores[j]), j + 1) for j in range(i, min(i + batch_size, len(scores)))]
        cursor.executemany(
            "UPDATE transactions SET fraud_score = ? WHERE transaction_id = ?",
            batch,
        )
    conn.commit()
    conn.close()
    print(f"  Updated {len(scores):,} fraud scores in SQLite.")


def main():
    print("=" * 60)
    print("FinGuard Model Training")
    print("=" * 60)

    df = load_data()
    X, y, feature_names = prepare_features(df)

    # Stratified split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y
    )
    print(f"Train: {len(X_train):,} ({y_train.mean():.4%} fraud)")
    print(f"Test:  {len(X_test):,} ({y_test.mean():.4%} fraud)")

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train and evaluate
    results, models = train_and_evaluate(
        X_train_scaled, X_test_scaled, y_train, y_test, feature_names
    )

    # Select best model
    best_strategy = results["best_strategy"]
    best_clf = models[best_strategy]

    # Feature importance
    top_features = extract_feature_importance(best_clf, feature_names)
    results["feature_importance"] = top_features

    # Save artifacts
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    joblib.dump(best_clf, OUTPUT_DIR / "model.joblib")
    joblib.dump(scaler, OUTPUT_DIR / "scaler.joblib")

    threshold_data = {
        "default_threshold": results[best_strategy]["best_threshold"],
        "strategy": best_strategy,
    }
    with open(OUTPUT_DIR / "threshold.json", "w") as f:
        json.dump(threshold_data, f, indent=2)

    with open(OUTPUT_DIR / "evaluation_metrics.json", "w") as f:
        json.dump(results, f, indent=2)

    # Save feature names used during training
    with open(OUTPUT_DIR / "training_features.json", "w") as f:
        json.dump(feature_names, f)

    print(f"\nModel saved: {OUTPUT_DIR / 'model.joblib'}")
    print(f"Scaler saved: {OUTPUT_DIR / 'scaler.joblib'}")
    print(f"Metrics saved: {OUTPUT_DIR / 'evaluation_metrics.json'}")

    # Update fraud scores in SQLite
    update_fraud_scores(best_clf, feature_names)

    print("\nModel training complete.")


if __name__ == "__main__":
    main()
