-- FinGuard Analytical Queries
-- Three required queries for the database component

-- ============================================================================
-- Query 1: Rapid successive transactions
-- Find transactions by the same customer within 60 seconds of each other.
-- These indicate potential card testing or automated fraud.
-- ============================================================================
SELECT
    t1.transaction_id AS txn_id_1,
    t2.transaction_id AS txn_id_2,
    t1.customer_id,
    t1.amount AS amount_1,
    t2.amount AS amount_2,
    t1.timestamp AS time_1,
    t2.timestamp AS time_2,
    (julianday(t2.timestamp) - julianday(t1.timestamp)) * 86400 AS seconds_apart,
    t1.channel AS channel_1,
    t2.channel AS channel_2,
    t1.merchant_id AS merchant_1,
    t2.merchant_id AS merchant_2
FROM transactions t1
JOIN transactions t2
    ON t1.customer_id = t2.customer_id
    AND t2.transaction_id > t1.transaction_id
    AND (julianday(t2.timestamp) - julianday(t1.timestamp)) * 86400 BETWEEN 0 AND 60
ORDER BY t1.customer_id, t1.timestamp
LIMIT 100;


-- ============================================================================
-- Query 2: Amounts unusual vs customer history
-- Find transactions where the amount exceeds the customer's mean + 3 standard
-- deviations. Uses pre-computed rolling stats for efficiency.
-- ============================================================================
SELECT
    t.transaction_id,
    t.customer_id,
    t.amount,
    t.cust_avg_amount,
    t.cust_std_amount,
    t.amount_zscore,
    t.timestamp,
    t.channel,
    t.category,
    t.fraud_label,
    t.fraud_score,
    c.total_transactions AS customer_total_txns
FROM transactions t
JOIN customers c ON t.customer_id = c.customer_id
WHERE t.cust_std_amount > 0
    AND t.amount > (t.cust_avg_amount + 3 * t.cust_std_amount)
ORDER BY t.amount_zscore DESC
LIMIT 100;


-- ============================================================================
-- Query 3: First-time merchant category per customer
-- Find transactions where a customer is using a merchant category they have
-- never used before. This is a signal for account takeover or stolen cards
-- being tested in new verticals.
-- ============================================================================
SELECT
    t.transaction_id,
    t.customer_id,
    t.category,
    t.merchant_id,
    t.amount,
    t.timestamp,
    t.channel,
    t.fraud_label,
    t.fraud_score,
    c.dominant_category AS usual_category
FROM transactions t
JOIN customers c ON t.customer_id = c.customer_id
WHERE t.is_new_merchant_category = 1
ORDER BY t.timestamp
LIMIT 100;
