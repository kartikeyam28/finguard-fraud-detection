# FinGuard — Transaction Fraud Detection & Customer Intelligence Platform

**CP-03 | Sharda University Data Science & Generative AI Programme**

## Problem Statement

Fraudulent transactions make up well under 1% of activity. A model that predicts "not fraud" for every transaction achieves 99.83% accuracy and catches nothing. Detection systems must balance fraud caught against legitimate customers blocked—both sides carry cost. FinGuard addresses this by building a full-stack fraud detection and investigation platform that operates under severe class imbalance.

## Approach

1. **Data Augmentation**: The Kaggle credit card fraud dataset (`mlg-ulb/creditcardfraud`) contains ~284,807 real transactions with PCA-anonymized features but no relational structure. We augment it with synthetic dimensions (customer IDs, merchants, channels, devices) to create realistic relational data while preserving the original fraud signal.

2. **Feature Engineering**: Time-of-day, day-of-week, rolling per-customer aggregates, velocity measures, and anomaly flags.

3. **Imbalance-Aware Modelling**: Three strategies compared head-to-head (SMOTE, class weighting, threshold tuning), evaluated on PR-AUC.

4. **Customer Segmentation**: K-Means clustering into named behavioral personas + Isolation Forest anomaly detection.

5. **RAG-Powered Investigation**: Policy document retrieval (ChromaDB) + Gemini-powered case summaries with citations and tool calling.

> **Documented Assumption**: Only the relational metadata (customer IDs, merchants, channels, devices) is synthetically generated. The fraud signal (Class label) comes entirely from the original Kaggle dataset. This stays within the brief's "public or synthetic data only" restriction.

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Node.js + Express |
| Database | SQLite |
| ML/Data | Python (pandas, scikit-learn, imbalanced-learn) |
| Vector Store | ChromaDB |
| LLM | Google Gemini (gemini-2.0-flash) |

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│   React Client   │────▶│  Express Server  │────▶│     SQLite DB      │
│  (Vite + TW)     │     │   (Port 3001)    │     │  284K transactions │
└─────────────────┘     │                  │     │  3K customers      │
                        │  /api/dashboard  │     │  200 merchants     │
                        │  /api/transactions│     └────────────────────┘
                        │  /api/customers  │
                        │  /api/assistant  │────▶ ChromaDB (policy docs)
                        │                  │────▶ Gemini API (LLM)
                        └──────────────────┘
```

## Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- Kaggle account (for dataset download)
- Google AI Studio API key (for Gemini)

### 1. Clone and configure
```bash
git clone https://github.com/<your-username>/finguard-fraud-detection.git
cd finguard-fraud-detection
cp .env.example .env
# Edit .env with your API keys
```

### 2. Run Python pipeline
```bash
cd python
pip install -r requirements.txt
python data_pipeline.py     # Download + augment + feature engineer → SQLite
python model_training.py    # Train models, evaluate, write scores to DB
python segmentation.py      # Cluster customers, anomaly detection
python analysis.py          # Statistical analysis + plots
python build_vectorstore.py # Build ChromaDB for RAG
```

### 3. Start backend
```bash
cd server
npm install
npm run dev
```

### 4. Start frontend
```bash
cd client
npm install
npm run dev
```

Open http://localhost:5173

## Results

| Metric | Value |
|--------|-------|
| Dataset size | 284,807 transactions |
| Fraud rate | ~0.17% |
| Baseline accuracy (all-legit) | ~99.83% |
| Best PR-AUC | See `python/outputs/evaluation_metrics.json` |
| Imbalance strategies compared | SMOTE, class weighting, threshold tuning |
| Customer segments | 4-6 named personas |
| Policy documents indexed | 6 |

## Functionality Checklist

- [x] Transaction scoring with a tunable decision threshold
- [x] Investigator queue ranked by risk and value at risk
- [x] Per-transaction explanation of the flag
- [x] Customer segmentation with named personas
- [x] Case summary generation with policy citations
- [x] Assistant retrieves customer transaction history on request

## Repository Structure

```
├── python/              # ML pipeline
│   ├── data_pipeline.py
│   ├── model_training.py
│   ├── segmentation.py
│   ├── analysis.py
│   ├── build_vectorstore.py
│   └── policy_docs/     # 6 synthetic policy documents
├── server/              # Express backend
│   ├── routes/          # API endpoints
│   └── lib/             # DB + Gemini clients
├── client/              # React frontend
│   └── src/pages/       # 5 page components
├── sql/                 # Schema + analytical queries
├── notebooks/           # Executed Jupyter notebooks
└── docs/                # Architecture + slides
```

## Team

Sharda University — Data Science & Generative AI Programme, CP-03