const express = require("express");
const router = express.Router();
const db = require("../lib/db");
const fs = require("fs");
const path = require("path");

// GET /api/customers/segments — segment summaries
router.get("/segments", (req, res) => {
  try {
    // Try loading from JSON first (has richer data)
    const jsonPath = path.join(
      __dirname, "..", "..", "python", "outputs", "customer_segments.json"
    );

    if (fs.existsSync(jsonPath)) {
      const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      const segments = Object.entries(data.segments).map(([name, info]) => ({
        name,
        count: info.count,
        avg_txns: Math.round(info.avg_txns),
        avg_amount: parseFloat(info.avg_amount.toFixed(2)),
        avg_fraud_rate: parseFloat((info.avg_fraud_rate * 100).toFixed(4)),
        avg_unique_merchants: Math.round(info.avg_unique_merchants),
        online_ratio: parseFloat((info.online_ratio * 100).toFixed(1)),
        mobile_ratio: parseFloat((info.mobile_ratio * 100).toFixed(1)),
      }));

      return res.json({
        segments,
        anomaly_comparison: data.anomaly_comparison || null,
      });
    }

    // Fallback to DB
    const rows = db
      .prepare(
        `SELECT segment as name, COUNT(*) as count,
                AVG(total_transactions) as avg_txns,
                AVG(avg_amount) as avg_amount,
                AVG(fraud_rate) * 100 as avg_fraud_rate
         FROM customers
         GROUP BY segment
         ORDER BY count DESC`
      )
      .all();

    res.json({ segments: rows, anomaly_comparison: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id — customer profile
router.get("/:id", (req, res) => {
  try {
    const customer = db
      .prepare("SELECT * FROM customers WHERE customer_id = ?")
      .get(req.params.id);

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const account = db
      .prepare("SELECT * FROM accounts WHERE customer_id = ?")
      .get(req.params.id);

    const recentTxns = db
      .prepare(
        `SELECT transaction_id, amount, timestamp, channel, category,
                merchant_id, fraud_label, fraud_score
         FROM transactions
         WHERE customer_id = ?
         ORDER BY timestamp DESC
         LIMIT 20`
      )
      .all(req.params.id);

    res.json({ customer, account, recent_transactions: recentTxns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id/history — full transaction history (for tool calling)
router.get("/:id/history", (req, res) => {
  try {
    const { limit = 50 } = req.query;

    const rows = db
      .prepare(
        `SELECT transaction_id, amount, timestamp, channel, category,
                merchant_id, fraud_label, fraud_score, amount_zscore,
                txn_count_1h, is_new_merchant_category
         FROM transactions
         WHERE customer_id = ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(req.params.id, parseInt(limit));

    const customer = db
      .prepare("SELECT * FROM customers WHERE customer_id = ?")
      .get(req.params.id);

    res.json({ customer, transactions: rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers — list all customers with pagination
router.get("/", (req, res) => {
  try {
    const { page = 1, limit = 50, segment } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = "";
    const params = [];
    if (segment) {
      where = "WHERE segment = ?";
      params.push(segment);
    }

    const countRow = db
      .prepare(`SELECT COUNT(*) as total FROM customers ${where}`)
      .get(...params);

    const rows = db
      .prepare(
        `SELECT * FROM customers ${where}
         ORDER BY total_transactions DESC
         LIMIT ? OFFSET ?`
      )
      .all(...params, parseInt(limit), offset);

    res.json({
      customers: rows,
      total: countRow.total,
      page: parseInt(page),
      pages: Math.ceil(countRow.total / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
