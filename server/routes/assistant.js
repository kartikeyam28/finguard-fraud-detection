const express = require("express");
const router = express.Router();
const db = require("../lib/db");
const { generateContent, generateWithTools } = require("../lib/gemini");
const path = require("path");
const fs = require("fs");

// Policy search is done via direct file reading (no ChromaDB server needed)

// Simple policy document search (fallback when ChromaDB server isn't running)
function searchPolicies(query, topK = 5) {
  const policyDir = path.join(__dirname, "..", "..", "python", "policy_docs");
  if (!fs.existsSync(policyDir)) return [];

  const files = fs.readdirSync(policyDir).filter((f) => f.endsWith(".md"));
  const results = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(policyDir, file), "utf-8");
    const sourceName = file.replace(".md", "").replace(/_/g, " ");

    // Split into sections
    const sections = content.split(/(?=^## )/m);

    for (const section of sections) {
      const lines = section.trim().split("\n");
      const heading = lines[0]?.replace(/^#+\s*/, "").trim() || "";
      const text = section.trim();

      // Simple keyword matching score
      const queryWords = query.toLowerCase().split(/\s+/);
      const textLower = text.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        if (word.length > 2 && textLower.includes(word)) {
          score += 1;
        }
      }

      if (score > 0) {
        results.push({
          text: text.slice(0, 800),
          source: sourceName,
          section: heading,
          score,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}

// Tool execution functions
function executeGetCustomerHistory(customerId, limit = 20) {
  const rows = db
    .prepare(
      `SELECT transaction_id, amount, timestamp, channel, category,
              merchant_id, fraud_label, fraud_score
       FROM transactions
       WHERE customer_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    )
    .all(customerId, limit);

  const customer = db
    .prepare("SELECT * FROM customers WHERE customer_id = ?")
    .get(customerId);

  return { customer, transactions: rows, count: rows.length };
}

function executeGetTransactionDetails(transactionId) {
  const row = db
    .prepare("SELECT * FROM transactions WHERE transaction_id = ?")
    .get(transactionId);

  if (!row) return { error: "Transaction not found" };

  // Build explanation factors
  const factors = [];
  if (row.amount_zscore > 2) {
    factors.push(
      `Amount ($${row.amount.toFixed(2)}) is ${row.amount_zscore.toFixed(1)}σ above customer average`
    );
  }
  if (row.txn_count_1h >= 3) {
    factors.push(`${row.txn_count_1h} transactions in the last hour`);
  }
  if (row.is_new_merchant_category === 1) {
    factors.push(`First "${row.category}" transaction for this customer`);
  }
  if (row.time_since_last_txn < 60 && row.time_since_last_txn > 0) {
    factors.push(`${row.time_since_last_txn.toFixed(0)}s since last transaction`);
  }

  return {
    transaction: row,
    factors,
  };
}

const SYSTEM_INSTRUCTION = `You are a fraud investigation assistant for FinGuard, a transaction fraud detection platform.

Your role:
- Help investigators understand flagged transactions and determine appropriate actions.
- Reference specific policy documents when making recommendations.
- Always cite your sources using [Source: Document Name, Section: Section Name] format.
- When asked about a customer's history, use the get_customer_history tool.
- When asked about a specific transaction, use the get_transaction_details tool.
- Be concise and factual. Do not speculate beyond what the data shows.
- Frame recommendations in terms of the applicable policies and procedures.

Important: You are assisting with synthetic/demo data for a university project. All customer IDs, transaction data, and policies are synthetic.`;

// POST /api/assistant/chat — conversational assistant with RAG + tool calling
router.post("/chat", async (req, res) => {
  try {
    const { message, conversationHistory = [], transactionId } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // 1. Retrieve relevant policy context
    const policyResults = searchPolicies(message);
    let policyContext = "";
    const citations = [];

    if (policyResults.length > 0) {
      policyContext = "\n\nRelevant policy context:\n";
      for (const r of policyResults) {
        policyContext += `\n--- [Source: ${r.source}, Section: ${r.section}] ---\n${r.text}\n`;
        citations.push({ source: r.source, section: r.section });
      }
    }

    // 2. Add transaction context if provided
    let txnContext = "";
    if (transactionId) {
      const txnData = executeGetTransactionDetails(parseInt(transactionId));
      if (txnData.transaction) {
        txnContext = `\n\nCurrent transaction under review:\n${JSON.stringify(txnData, null, 2)}`;
      }
    }

    // 3. Build messages for Gemini
    const fullSystemInstruction = SYSTEM_INSTRUCTION + policyContext + txnContext;

    const messages = [
      ...conversationHistory.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: message },
    ];

    // 4. Call Gemini with tool declarations
    const result = await generateWithTools(messages, fullSystemInstruction);

    // 5. Handle potential function calls
    let response = result.response;
    let responseText = "";

    const candidate = response.candidates?.[0];
    if (!candidate) {
      return res.status(500).json({ error: "No response from model" });
    }

    // Check for function calls
    const parts = candidate.content?.parts || [];
    let functionCallHandled = false;

    for (const part of parts) {
      if (part.functionCall) {
        functionCallHandled = true;
        const fnName = part.functionCall.name;
        const fnArgs = part.functionCall.args;

        let fnResult;
        if (fnName === "get_customer_history") {
          fnResult = executeGetCustomerHistory(
            fnArgs.customer_id,
            fnArgs.limit || 20
          );
        } else if (fnName === "get_transaction_details") {
          fnResult = executeGetTransactionDetails(fnArgs.transaction_id);
        } else {
          fnResult = { error: `Unknown function: ${fnName}` };
        }

        // Send function result back to Gemini
        const followUp = await generateContent(
          `Function ${fnName} returned:\n${JSON.stringify(fnResult, null, 2)}\n\nBased on this data and the policy context, please respond to the user's original question: "${message}"`,
          fullSystemInstruction
        );
        responseText = followUp;
      } else if (part.text) {
        responseText += part.text;
      }
    }

    res.json({
      response: responseText,
      citations,
      toolsUsed: functionCallHandled,
    });
  } catch (err) {
    console.error("Assistant error:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/assistant/case-summary — generate case summary for a flagged transaction
router.post("/case-summary", async (req, res) => {
  try {
    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: "transactionId is required" });
    }

    // Fetch transaction details
    const txnData = executeGetTransactionDetails(parseInt(transactionId));
    if (!txnData.transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const txn = txnData.transaction;

    // Fetch customer context
    const custData = executeGetCustomerHistory(txn.customer_id, 10);

    // Retrieve applicable policies
    const policyResults = searchPolicies(
      `fraud investigation ${txn.fraud_score > 0.8 ? "critical high priority" : "standard"} transaction amount ${txn.amount} channel ${txn.channel} ${txn.category}`
    );

    let policyContext = "";
    const citations = [];
    for (const r of policyResults) {
      policyContext += `\n[Source: ${r.source}, Section: ${r.section}]\n${r.text}\n`;
      citations.push({ source: r.source, section: r.section });
    }

    const prompt = `Generate a structured case summary for this flagged transaction.

Transaction:
- ID: ${txn.transaction_id}
- Customer: ${txn.customer_id}
- Amount: $${txn.amount.toFixed(2)}
- Channel: ${txn.channel}
- Category: ${txn.category}
- Fraud Score: ${txn.fraud_score.toFixed(4)}
- Timestamp: ${txn.timestamp}
- Merchant: ${txn.merchant_id}

Risk factors: ${txnData.factors.join("; ") || "None identified from rule-based checks"}

Customer profile:
- Segment: ${custData.customer?.segment || "Unknown"}
- Total transactions: ${custData.customer?.total_transactions || 0}
- Average amount: $${(custData.customer?.avg_amount || 0).toFixed(2)}
- Fraud rate: ${((custData.customer?.fraud_rate || 0) * 100).toFixed(4)}%

Recent transactions (last 10):
${custData.transactions.slice(0, 10).map((t) => `  - $${t.amount.toFixed(2)} at ${t.merchant_id} (${t.channel}) on ${t.timestamp} [score: ${t.fraud_score.toFixed(3)}]`).join("\n")}

Applicable policies:
${policyContext}

Format the case summary with these sections:
1. Risk Assessment (severity level, fraud score interpretation)
2. Key Findings (what triggered the flag, unusual patterns)
3. Applicable Policies (cite specific policy sections)
4. Recommended Actions (based on policy guidelines)
5. Priority and SLA (based on escalation matrix)

Always cite policy documents in [Source: X, Section: Y] format.`;

    const summary = await generateContent(prompt, SYSTEM_INSTRUCTION);

    res.json({
      summary,
      transaction: {
        id: txn.transaction_id,
        amount: txn.amount,
        fraud_score: txn.fraud_score,
        channel: txn.channel,
        category: txn.category,
        customer_id: txn.customer_id,
      },
      factors: txnData.factors,
      citations,
    });
  } catch (err) {
    console.error("Case summary error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
