-- FinGuard Database Schema
-- Relational schema for customers, accounts, transactions, merchants

-- Drop existing tables (order matters for foreign keys)
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS accounts;
DROP TABLE IF EXISTS merchants;
DROP TABLE IF EXISTS customers;

-- Customers: synthetic customer profiles
CREATE TABLE customers (
    customer_id TEXT PRIMARY KEY,
    segment TEXT DEFAULT 'unassigned',
    total_transactions INTEGER DEFAULT 0,
    total_amount REAL DEFAULT 0.0,
    avg_amount REAL DEFAULT 0.0,
    fraud_rate REAL DEFAULT 0.0,
    dominant_category TEXT,
    dominant_channel TEXT,
    created_at TEXT
);

-- Accounts: one account per customer (simplified)
CREATE TABLE accounts (
    account_id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    account_type TEXT CHECK(account_type IN ('checking', 'savings', 'credit')),
    balance REAL DEFAULT 0.0,
    opened_at TEXT
);

-- Merchants: synthetic merchant pool
CREATE TABLE merchants (
    merchant_id TEXT PRIMARY KEY,
    merchant_name TEXT,
    category TEXT,
    risk_score REAL DEFAULT 0.0
);

-- Transactions: augmented credit card transactions
CREATE TABLE transactions (
    transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id TEXT NOT NULL REFERENCES customers(customer_id),
    account_id TEXT REFERENCES accounts(account_id),
    merchant_id TEXT REFERENCES merchants(merchant_id),
    amount REAL NOT NULL,
    timestamp TEXT NOT NULL,
    channel TEXT CHECK(channel IN ('online', 'in-store', 'ATM', 'mobile')),
    device TEXT,
    category TEXT,
    fraud_label INTEGER DEFAULT 0,
    fraud_score REAL DEFAULT 0.0,
    hour_of_day INTEGER,
    day_of_week INTEGER,
    amount_zscore REAL,
    time_since_last_txn REAL,
    txn_count_1h INTEGER DEFAULT 0,
    txn_count_24h INTEGER DEFAULT 0,
    is_new_merchant_category INTEGER DEFAULT 0,
    cust_avg_amount REAL,
    cust_std_amount REAL,
    -- PCA features from original dataset
    V1 REAL, V2 REAL, V3 REAL, V4 REAL, V5 REAL,
    V6 REAL, V7 REAL, V8 REAL, V9 REAL, V10 REAL,
    V11 REAL, V12 REAL, V13 REAL, V14 REAL, V15 REAL,
    V16 REAL, V17 REAL, V18 REAL, V19 REAL, V20 REAL,
    V21 REAL, V22 REAL, V23 REAL, V24 REAL, V25 REAL,
    V26 REAL, V27 REAL, V28 REAL
);

-- Indexes for query performance
CREATE INDEX idx_txn_customer ON transactions(customer_id);
CREATE INDEX idx_txn_timestamp ON transactions(timestamp);
CREATE INDEX idx_txn_fraud ON transactions(fraud_label);
CREATE INDEX idx_txn_channel ON transactions(channel);
CREATE INDEX idx_txn_category ON transactions(category);
CREATE INDEX idx_txn_merchant ON transactions(merchant_id);
CREATE INDEX idx_txn_score ON transactions(fraud_score DESC);
CREATE INDEX idx_accounts_customer ON accounts(customer_id);
