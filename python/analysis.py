"""
FinGuard Analysis
Quantifies base rate, demonstrates why accuracy fails under imbalance,
compares fraud vs legitimate distributions with statistical tests.
"""

import json
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
from scipy import stats

OUTPUT_DIR = Path(__file__).parent / "outputs"
PLOTS_DIR = OUTPUT_DIR / "plots"


def load_data() -> pd.DataFrame:
    csv_path = OUTPUT_DIR / "augmented_transactions.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"Run data_pipeline.py first. Missing: {csv_path}")
    return pd.read_csv(csv_path)


def base_rate_analysis(df: pd.DataFrame) -> dict:
    """Quantify the fraud base rate and show why accuracy is misleading."""
    total = len(df)
    fraud = (df["fraud_label"] == 1).sum() if "fraud_label" in df.columns else (df["Class"] == 1).sum()
    legit = total - fraud
    rate = fraud / total

    # Accuracy of "predict all legitimate" baseline
    baseline_accuracy = legit / total

    results = {
        "total_transactions": int(total),
        "fraud_count": int(fraud),
        "legitimate_count": int(legit),
        "fraud_rate": round(float(rate), 6),
        "fraud_rate_pct": round(float(rate * 100), 4),
        "baseline_accuracy": round(float(baseline_accuracy), 6),
        "baseline_accuracy_pct": round(float(baseline_accuracy * 100), 4),
        "accuracy_explanation": (
            f"A model that predicts every transaction as legitimate achieves "
            f"{baseline_accuracy*100:.2f}% accuracy. This is misleading because it "
            f"catches zero fraud. At a {rate*100:.2f}% base rate, accuracy is dominated "
            f"by the majority class and fails to measure detection capability."
        ),
    }

    print(f"\n--- Base Rate Analysis ---")
    print(f"Total transactions: {total:,}")
    print(f"Fraud: {fraud:,} ({rate:.4%})")
    print(f"Baseline (all-legit) accuracy: {baseline_accuracy:.4%}")
    print(f"Explanation: {results['accuracy_explanation']}")

    return results


def distribution_analysis(df: pd.DataFrame) -> dict:
    """Compare fraud vs legitimate distributions with statistical tests."""
    fraud_col = "fraud_label" if "fraud_label" in df.columns else "Class"
    fraud = df[df[fraud_col] == 1]
    legit = df[df[fraud_col] == 0]

    results = {}
    PLOTS_DIR.mkdir(parents=True, exist_ok=True)

    # --- Amount distribution ---
    stat_mw, p_mw = stats.mannwhitneyu(
        fraud["amount"] if "amount" in df.columns else fraud["Amount"],
        legit["amount"] if "amount" in df.columns else legit["Amount"],
        alternative="two-sided",
    )
    amt_col = "amount" if "amount" in df.columns else "Amount"
    results["amount_test"] = {
        "test": "Mann-Whitney U",
        "statistic": float(stat_mw),
        "p_value": float(p_mw),
        "significant": p_mw < 0.05,
        "fraud_median": float(fraud[amt_col].median()),
        "legit_median": float(legit[amt_col].median()),
        "interpretation": (
            f"Fraud median amount (${fraud[amt_col].median():.2f}) vs "
            f"legitimate (${legit[amt_col].median():.2f}). "
            f"{'Statistically significant' if p_mw < 0.05 else 'Not significant'} "
            f"difference (p={p_mw:.2e})."
        ),
    }

    # Plot amount distributions
    fig, ax = plt.subplots(1, 1, figsize=(10, 5))
    ax.hist(legit[amt_col].clip(upper=500), bins=50, alpha=0.7, label="Legitimate", color="gray")
    ax.hist(fraud[amt_col].clip(upper=500), bins=50, alpha=0.7, label="Fraud", color="black")
    ax.set_xlabel("Amount ($)")
    ax.set_ylabel("Count")
    ax.set_title("Transaction Amount Distribution: Fraud vs Legitimate")
    ax.legend()
    plt.tight_layout()
    plt.savefig(PLOTS_DIR / "amount_distribution.png", dpi=150)
    plt.close()

    # --- Time of day distribution ---
    if "hour_of_day" in df.columns:
        fraud_hours = fraud["hour_of_day"].value_counts().sort_index()
        legit_hours = legit["hour_of_day"].value_counts().sort_index()
        # Align indices
        all_hours = range(24)
        fraud_h = np.array([fraud_hours.get(h, 0) for h in all_hours])
        legit_h = np.array([legit_hours.get(h, 0) for h in all_hours])

        # Normalize to proportions for chi-squared
        fraud_prop = fraud_h / fraud_h.sum()
        legit_prop = legit_h / legit_h.sum()

        stat_chi, p_chi = stats.chisquare(fraud_h, f_exp=legit_h * (fraud_h.sum() / legit_h.sum()))

        results["time_of_day_test"] = {
            "test": "Chi-squared",
            "statistic": float(stat_chi),
            "p_value": float(p_chi),
            "significant": p_chi < 0.05,
            "interpretation": (
                f"Time-of-day distribution differs between fraud and legitimate "
                f"transactions. {'Statistically significant' if p_chi < 0.05 else 'Not significant'} "
                f"(p={p_chi:.2e})."
            ),
        }

        # Plot
        fig, ax = plt.subplots(1, 1, figsize=(10, 5))
        x = np.arange(24)
        width = 0.35
        ax.bar(x - width/2, legit_prop, width, label="Legitimate", color="gray")
        ax.bar(x + width/2, fraud_prop, width, label="Fraud", color="black")
        ax.set_xlabel("Hour of Day")
        ax.set_ylabel("Proportion")
        ax.set_title("Transaction Time Distribution: Fraud vs Legitimate")
        ax.set_xticks(x)
        ax.legend()
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "time_distribution.png", dpi=150)
        plt.close()

    # --- Channel distribution ---
    if "channel" in df.columns:
        fraud_ch = fraud["channel"].value_counts()
        legit_ch = legit["channel"].value_counts()

        channels = sorted(set(fraud_ch.index) | set(legit_ch.index))
        fraud_c = np.array([fraud_ch.get(c, 0) for c in channels])
        legit_c = np.array([legit_ch.get(c, 0) for c in channels])

        stat_ch_chi, p_ch_chi = stats.chisquare(
            fraud_c, f_exp=legit_c * (fraud_c.sum() / legit_c.sum())
        )

        results["channel_test"] = {
            "test": "Chi-squared",
            "statistic": float(stat_ch_chi),
            "p_value": float(p_ch_chi),
            "significant": p_ch_chi < 0.05,
            "fraud_distribution": {c: int(v) for c, v in zip(channels, fraud_c)},
            "legit_distribution": {c: int(v) for c, v in zip(channels, legit_c)},
            "interpretation": (
                f"Channel usage differs between fraud and legitimate. "
                f"{'Statistically significant' if p_ch_chi < 0.05 else 'Not significant'} "
                f"(p={p_ch_chi:.2e})."
            ),
        }

        # Plot
        fig, ax = plt.subplots(1, 1, figsize=(10, 5))
        fraud_rate_by_ch = {}
        for ch in channels:
            ch_total = fraud_ch.get(ch, 0) + legit_ch.get(ch, 0)
            fraud_rate_by_ch[ch] = fraud_ch.get(ch, 0) / ch_total if ch_total > 0 else 0

        ax.bar(fraud_rate_by_ch.keys(), fraud_rate_by_ch.values(), color="black")
        ax.set_xlabel("Channel")
        ax.set_ylabel("Fraud Rate")
        ax.set_title("Fraud Rate by Channel")
        plt.tight_layout()
        plt.savefig(PLOTS_DIR / "channel_fraud_rate.png", dpi=150)
        plt.close()

    return results


def main():
    print("=" * 60)
    print("FinGuard Analysis")
    print("=" * 60)

    df = load_data()

    base_results = base_rate_analysis(df)
    dist_results = distribution_analysis(df)

    all_results = {
        "base_rate": base_results,
        "distributions": dist_results,
    }

    output_path = OUTPUT_DIR / "analysis_results.json"
    with open(output_path, "w") as f:
        json.dump(all_results, f, indent=2)

    print(f"\nResults saved to {output_path}")
    print(f"Plots saved to {PLOTS_DIR}/")


if __name__ == "__main__":
    main()
