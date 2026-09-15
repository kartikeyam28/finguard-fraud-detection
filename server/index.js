require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const path = require("path");

const transactionsRouter = require("./routes/transactions");
const customersRouter = require("./routes/customers");
const dashboardRouter = require("./routes/dashboard");
const assistantRouter = require("./routes/assistant");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use("/api/transactions", transactionsRouter);
app.use("/api/customers", customersRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/assistant", assistantRouter);

// Serve React frontend in production
const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res) => {
  if (!req.path.startsWith("/api")) {
    res.sendFile(path.join(clientDist, "index.html"));
  }
});

app.listen(PORT, () => {
  console.log(`FinGuard server running on port ${PORT}`);
});
