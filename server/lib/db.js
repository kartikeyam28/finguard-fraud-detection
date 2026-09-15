const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "..", "..", "python", "outputs", "transactions.db");

let db;
try {
  db = new Database(DB_PATH, { readonly: false });
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
} catch (err) {
  console.error("Failed to open SQLite database:", err.message);
  console.error("Run the Python data pipeline first to create the database.");
  process.exit(1);
}

module.exports = db;
