const express = require("express");
const router = express.Router();
const db = require("../lib/db");
const fs = require("fs");
const path = require("path");

// GET /api/dashboard/stats — overall metrics
router.get("/stats", (req, res) => {
  try {
    const { threshold = 0.5 } = req.query;
    const t = parseFloat(threshold);

    const total = db.prepare("SELECT COUNT(*) as c FROM transactions").get().c;
    const fraudActual = db
      .prepare("SELECT COUNT(*) as c FROM transactions WHERE fraud_label = 1")
      .get().c;
    const flagged = db
      .prepare("SELECT COUNT(*) as c FROM transactions WHERE fraud_score >= ?")
      .get(t).c;

    const totalAmount = db
      .prepare("SELECT SUM(amount) as s FROM transactions")
      .get().s;
    const fraudAmount = db
      .prepare("SELECT SUM(amount) as s FROM transactions WHERE fraud_label = 1")
      .get().s;
    const valueAtRisk = db
      .prepare(
        "SELECT SUM(fraud_score * amount) as s FROM transactions WHERE fraud_score >= ?"
      )
      .get(t).s;

    // True positives: flagged AND actually fraud
    const truePositives = db
      .prepare(
        "SELECT COUNT(*) as c FROM transactions WHERE fraud_score >= ? AND fraud_label = 1"
      )
      .get(t).c;

    // False positives: flagged but NOT fraud
    const falsePositives = db
      .prepare(
        "SELECT COUNT(*) as c FROM transactions WHERE fraud_score >= ? AND fraud_label = 0"
      )
      .get(t).c;

    const detectionRate =
      fraudActual > 0 ? truePositives / fraudActual : 0;

    const precision = flagged > 0 ? truePositives / flagged : 0;

    res.json({
      total_transactions: total,
      actual_fraud: fraudActual,
      fraud_rate: fraudActual / total,
      flagged_transactions: flagged,
      total_amount: totalAmount,
      fraud_amount: fraudAmount,
      value_at_risk: valueAtRisk,
      detection_rate: detectionRate,
      precision: precision,
      false_positives: falsePositives,
      threshold: t,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/by-channel
router.get("/by-channel", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT channel,
                COUNT(*) as total,
                SUM(fraud_label) as fraud_count,
                CAST(SUM(fraud_label) AS REAL) / COUNT(*) as fraud_rate,
                SUM(CASE WHEN fraud_label = 1 THEN amount ELSE 0 END) as fraud_amount,
                AVG(amount) as avg_amount
         FROM transactions
         GROUP BY channel
         ORDER BY fraud_rate DESC`
      )
      .all();
    res.json({ channels: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/by-category
router.get("/by-category", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT category,
                COUNT(*) as total,
                SUM(fraud_label) as fraud_count,
                CAST(SUM(fraud_label) AS REAL) / COUNT(*) as fraud_rate,
                SUM(CASE WHEN fraud_label = 1 THEN amount ELSE 0 END) as fraud_amount,
                AVG(amount) as avg_amount
         FROM transactions
         GROUP BY category
         ORDER BY fraud_rate DESC`
      )
      .all();
    res.json({ categories: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/over-time — fraud detection rate by day
router.get("/over-time", (req, res) => {
  try {
    const rows = db
      .prepare(
        `SELECT DATE(timestamp) as date,
                COUNT(*) as total,
                SUM(fraud_label) as fraud_count,
                CAST(SUM(fraud_label) AS REAL) / COUNT(*) as fraud_rate,
                SUM(CASE WHEN fraud_label = 1 THEN amount ELSE 0 END) as fraud_amount
         FROM transactions
         GROUP BY DATE(timestamp)
         ORDER BY date`
      )
      .all();
    res.json({ timeline: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/false-positives — FP analysis at threshold
router.get("/false-positives", (req, res) => {
  try {
    const { threshold = 0.5 } = req.query;
    const t = parseFloat(threshold);

    const fp = db
      .prepare(
        `SELECT COUNT(*) as count,
                AVG(fraud_score) as avg_score,
                AVG(amount) as avg_amount
         FROM transactions
         WHERE fraud_score >= ? AND fraud_label = 0`
      )
      .get(t);

    const tp = db
      .prepare(
        `SELECT COUNT(*) as count
         FROM transactions
         WHERE fraud_score >= ? AND fraud_label = 1`
      )
      .get(t);

    // FP by channel
    const fpByChannel = db
      .prepare(
        `SELECT channel, COUNT(*) as count
         FROM transactions
         WHERE fraud_score >= ? AND fraud_label = 0
         GROUP BY channel
         ORDER BY count DESC`
      )
      .all(t);

    res.json({
      threshold: t,
      false_positives: fp.count,
      true_positives: tp.count,
      fp_avg_score: fp.avg_score,
      fp_avg_amount: fp.avg_amount,
      fp_by_channel: fpByChannel,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/metrics — model evaluation metrics
router.get("/metrics", (req, res) => {
  try {
    const metricsPath = path.join(
      __dirname, "..", "..", "python", "outputs", "evaluation_metrics.json"
    );
    if (fs.existsSync(metricsPath)) {
      const data = JSON.parse(fs.readFileSync(metricsPath, "utf-8"));
      return res.json(data);
    }
    res.json({ error: "Metrics not available. Run model training first." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
