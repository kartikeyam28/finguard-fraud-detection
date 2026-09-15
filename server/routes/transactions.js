const express = require("express");
const router = express.Router();
const db = require("../lib/db");

// GET /api/transactions — paginated list with filters
router.get("/", (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      channel,
      category,
      fraud_only,
      min_score,
      max_score,
      sort_by = "transaction_id",
      sort_order = "DESC",
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (channel) {
      conditions.push("channel = ?");
      params.push(channel);
    }
    if (category) {
      conditions.push("category = ?");
      params.push(category);
    }
    if (fraud_only === "true") {
      conditions.push("fraud_label = 1");
    }
    if (min_score) {
      conditions.push("fraud_score >= ?");
      params.push(parseFloat(min_score));
    }
    if (max_score) {
      conditions.push("fraud_score <= ?");
      params.push(parseFloat(max_score));
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Validate sort column
    const allowedSorts = [
      "transaction_id", "amount", "fraud_score", "timestamp",
    ];
    const safeSortBy = allowedSorts.includes(sort_by) ? sort_by : "transaction_id";
    const safeSortOrder = sort_order === "ASC" ? "ASC" : "DESC";

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM transactions ${where}`)
      .get(...params);

    const rows = db
      .prepare(
        `SELECT transaction_id, customer_id, merchant_id, amount, timestamp,
                channel, device, category, fraud_label, fraud_score,
                hour_of_day, day_of_week, amount_zscore, time_since_last_txn,
                txn_count_1h, is_new_merchant_category, cust_avg_amount, cust_std_amount
         FROM transactions ${where}
         ORDER BY ${safeSortBy} ${safeSortOrder}
         LIMIT ? OFFSET ?`
      )
      .all(...params, parseInt(limit), offset);

    res.json({
      transactions: rows,
      total: countRow.total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(countRow.total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/queue — investigator queue ranked by risk * value
router.get("/queue", (req, res) => {
  try {
    const { threshold = 0.5, limit = 100 } = req.query;

    const rows = db
      .prepare(
        `SELECT transaction_id, customer_id, merchant_id, amount, timestamp,
                channel, category, fraud_label, fraud_score,
                (fraud_score * amount) as value_at_risk,
                amount_zscore, time_since_last_txn, txn_count_1h,
                is_new_merchant_category, cust_avg_amount, cust_std_amount
         FROM transactions
         WHERE fraud_score >= ?
         ORDER BY (fraud_score * amount) DESC
         LIMIT ?`
      )
      .all(parseFloat(threshold), parseInt(limit));

    res.json({ queue: rows, threshold: parseFloat(threshold), count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/transactions/:id — single transaction with explanation
router.get("/:id", (req, res) => {
  try {
    const row = db
      .prepare(
        `SELECT * FROM transactions WHERE transaction_id = ?`
      )
      .get(parseInt(req.params.id));

    if (!row) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    // Build explanation
    const factors = [];

    if (row.amount_zscore > 2) {
      factors.push(
        `Amount ($${row.amount.toFixed(2)}) is ${row.amount_zscore.toFixed(1)} standard deviations above customer average ($${(row.cust_avg_amount || 0).toFixed(2)})`
      );
    }
    if (row.txn_count_1h >= 3) {
      factors.push(
        `High velocity: ${row.txn_count_1h} transactions in the last hour`
      );
    }
    if (row.is_new_merchant_category === 1) {
      factors.push(
        `First transaction in the "${row.category}" merchant category for this customer`
      );
    }
    if (row.time_since_last_txn < 60 && row.time_since_last_txn > 0) {
      factors.push(
        `Rapid succession: only ${row.time_since_last_txn.toFixed(0)} seconds since last transaction`
      );
    }
    if (row.channel === "online" || row.channel === "mobile") {
      factors.push(`Digital channel (${row.channel})`);
    }
    if (row.amount > 500) {
      factors.push(`High-value transaction ($${row.amount.toFixed(2)})`);
    }

    if (factors.length === 0 && row.fraud_score > 0.5) {
      factors.push(
        "Flagged based on PCA feature patterns (V1-V28) indicating anomalous transaction characteristics"
      );
    }

    res.json({
      transaction: row,
      explanation: {
        fraud_score: row.fraud_score,
        factors: factors,
        summary:
          factors.length > 0
            ? `This transaction was flagged because: ${factors.join("; ")}.`
            : "This transaction has a low fraud risk score.",
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
