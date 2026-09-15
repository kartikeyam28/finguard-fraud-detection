import { useState, useEffect } from "react";

export default function TransactionScoring() {
  const [transactions, setTransactions] = useState([]);
  const [threshold, setThreshold] = useState(0.5);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ channel: "", category: "", fraud_only: false });
  const limit = 30;

  useEffect(() => {
    fetchTransactions();
  }, [page, threshold, filters]);

  async function fetchTransactions() {
    setLoading(true);
    const params = new URLSearchParams({
      page: page.toString(),
      limit: limit.toString(),
      min_score: threshold.toString(),
      sort_by: "fraud_score",
      sort_order: "DESC",
    });
    if (filters.channel) params.set("channel", filters.channel);
    if (filters.category) params.set("category", filters.category);
    if (filters.fraud_only) params.set("fraud_only", "true");

    try {
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function loadExplanation(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setExplanation(null);
      return;
    }
    try {
      const res = await fetch(`/api/transactions/${id}`);
      const data = await res.json();
      setExpandedId(id);
      setExplanation(data.explanation);
    } catch (err) {
      console.error(err);
    }
  }

  const pages = Math.ceil(total / limit);

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Transaction Scoring</h1>

      {/* Threshold slider */}
      <div className="mb-4 p-4 border border-gray-200 bg-white">
        <label className="text-sm font-medium block mb-1">
          Fraud Score Threshold: {threshold.toFixed(2)}
        </label>
        <input
          type="range"
          min="0.05"
          max="0.95"
          step="0.05"
          value={threshold}
          onChange={(e) => {
            setThreshold(parseFloat(e.target.value));
            setPage(1);
          }}
          className="w-full accent-black"
        />
        <p className="text-xs text-gray-500 mt-1">
          Showing transactions with fraud score &ge; {threshold.toFixed(2)} ({total.toLocaleString()} results)
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <select
          className="border border-gray-300 px-2 py-1 text-sm bg-white"
          value={filters.channel}
          onChange={(e) => { setFilters((f) => ({ ...f, channel: e.target.value })); setPage(1); }}
        >
          <option value="">All Channels</option>
          <option value="online">Online</option>
          <option value="in-store">In-store</option>
          <option value="ATM">ATM</option>
          <option value="mobile">Mobile</option>
        </select>
        <select
          className="border border-gray-300 px-2 py-1 text-sm bg-white"
          value={filters.category}
          onChange={(e) => { setFilters((f) => ({ ...f, category: e.target.value })); setPage(1); }}
        >
          <option value="">All Categories</option>
          {["grocery","fuel","electronics","travel","dining","healthcare","entertainment","clothing","utilities","services"].map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            checked={filters.fraud_only}
            onChange={(e) => { setFilters((f) => ({ ...f, fraud_only: e.target.checked })); setPage(1); }}
          />
          Confirmed fraud only
        </label>
      </div>

      {/* Table */}
      <div className="border border-gray-200 bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-3 py-2 font-medium">ID</th>
              <th className="text-left px-3 py-2 font-medium">Customer</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-right px-3 py-2 font-medium">Score</th>
              <th className="text-left px-3 py-2 font-medium">Channel</th>
              <th className="text-left px-3 py-2 font-medium">Category</th>
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-center px-3 py-2 font-medium">Fraud</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-500">Loading...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-500">No transactions at this threshold</td></tr>
            ) : (
              transactions.map((txn) => (
                <TxnRow
                  key={txn.transaction_id}
                  txn={txn}
                  isExpanded={expandedId === txn.transaction_id}
                  explanation={expandedId === txn.transaction_id ? explanation : null}
                  onClick={() => loadExplanation(txn.transaction_id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center gap-2 mt-3 text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-2 py-1 border border-gray-300 disabled:opacity-30"
          >
            Prev
          </button>
          <span>Page {page} of {pages}</span>
          <button
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="px-2 py-1 border border-gray-300 disabled:opacity-30"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function TxnRow({ txn, isExpanded, explanation, onClick }) {
  const scoreColor =
    txn.fraud_score >= 0.8 ? "text-red-700 font-semibold" :
    txn.fraud_score >= 0.5 ? "text-gray-800 font-medium" :
    "text-gray-500";

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        onClick={onClick}
      >
        <td className="px-3 py-2">{txn.transaction_id}</td>
        <td className="px-3 py-2 font-mono text-xs">{txn.customer_id}</td>
        <td className="px-3 py-2 text-right">${txn.amount?.toFixed(2)}</td>
        <td className={`px-3 py-2 text-right ${scoreColor}`}>
          {txn.fraud_score?.toFixed(4)}
        </td>
        <td className="px-3 py-2">{txn.channel}</td>
        <td className="px-3 py-2">{txn.category}</td>
        <td className="px-3 py-2 text-xs">{txn.timestamp}</td>
        <td className="px-3 py-2 text-center">
          {txn.fraud_label === 1 ? (
            <span className="text-red-600 font-bold">YES</span>
          ) : (
            <span className="text-gray-400">no</span>
          )}
        </td>
      </tr>
      {isExpanded && explanation && (
        <tr className="bg-gray-50">
          <td colSpan={8} className="px-4 py-3">
            <div className="text-sm">
              <p className="font-medium mb-1">Explanation</p>
              <p className="text-gray-700">{explanation.summary}</p>
              {explanation.factors?.length > 0 && (
                <ul className="mt-2 list-disc list-inside text-gray-600 text-xs">
                  {explanation.factors.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
