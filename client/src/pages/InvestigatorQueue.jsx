import { useState, useEffect } from "react";

export default function InvestigatorQueue() {
  const [queue, setQueue] = useState([]);
  const [threshold, setThreshold] = useState(0.5);
  const [loading, setLoading] = useState(true);
  const [caseSummary, setCaseSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryTxnId, setSummaryTxnId] = useState(null);

  useEffect(() => {
    fetchQueue();
  }, [threshold]);

  async function fetchQueue() {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions/queue?threshold=${threshold}&limit=100`);
      const data = await res.json();
      setQueue(data.queue || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function generateCaseSummary(txnId) {
    setSummaryLoading(true);
    setSummaryTxnId(txnId);
    setCaseSummary(null);
    try {
      const res = await fetch("/api/assistant/case-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: txnId }),
      });
      const data = await res.json();
      setCaseSummary(data);
    } catch (err) {
      setCaseSummary({ error: err.message });
    }
    setSummaryLoading(false);
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Investigator Queue</h1>

      {/* Threshold */}
      <div className="mb-4 p-4 border border-gray-200 bg-white">
        <label className="text-sm font-medium block mb-1">
          Threshold: {threshold.toFixed(2)} | Flagged: {queue.length}
        </label>
        <input
          type="range"
          min="0.1"
          max="0.95"
          step="0.05"
          value={threshold}
          onChange={(e) => setThreshold(parseFloat(e.target.value))}
          className="w-full accent-black"
        />
      </div>

      {/* Queue table */}
      <div className="border border-gray-200 bg-white overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-3 py-2 font-medium">Rank</th>
              <th className="text-left px-3 py-2 font-medium">Txn ID</th>
              <th className="text-left px-3 py-2 font-medium">Customer</th>
              <th className="text-right px-3 py-2 font-medium">Amount</th>
              <th className="text-right px-3 py-2 font-medium">Score</th>
              <th className="text-right px-3 py-2 font-medium">Value at Risk</th>
              <th className="text-left px-3 py-2 font-medium">Channel</th>
              <th className="text-left px-3 py-2 font-medium">Time</th>
              <th className="text-center px-3 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-500">Loading...</td></tr>
            ) : queue.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-500">No flagged transactions at this threshold</td></tr>
            ) : (
              queue.map((txn, i) => (
                <tr key={txn.transaction_id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">{i + 1}</td>
                  <td className="px-3 py-2">{txn.transaction_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{txn.customer_id}</td>
                  <td className="px-3 py-2 text-right">${txn.amount?.toFixed(2)}</td>
                  <td className={`px-3 py-2 text-right ${txn.fraud_score >= 0.8 ? "text-red-700 font-semibold" : ""}`}>
                    {txn.fraud_score?.toFixed(4)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    ${txn.value_at_risk?.toFixed(2)}
                  </td>
                  <td className="px-3 py-2">{txn.channel}</td>
                  <td className="px-3 py-2 text-xs">{txn.timestamp}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => generateCaseSummary(txn.transaction_id)}
                      className="text-xs px-2 py-1 border border-black hover:bg-black hover:text-white"
                    >
                      Case Summary
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Case summary panel */}
      {(summaryLoading || caseSummary) && (
        <div className="mt-6 border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">
              Case Summary — Transaction #{summaryTxnId}
            </h2>
            <button
              onClick={() => { setCaseSummary(null); setSummaryTxnId(null); }}
              className="text-xs text-gray-500 hover:text-black"
            >
              Close
            </button>
          </div>
          {summaryLoading ? (
            <p className="text-gray-500 text-sm">Generating case summary...</p>
          ) : caseSummary?.error ? (
            <p className="text-red-600 text-sm">{caseSummary.error}</p>
          ) : (
            <div className="text-sm">
              {caseSummary?.factors?.length > 0 && (
                <div className="mb-3">
                  <p className="font-medium text-xs text-gray-500 mb-1">Risk Factors</p>
                  <ul className="list-disc list-inside text-xs">
                    {caseSummary.factors.map((f, i) => <li key={i}>{f}</li>)}
                  </ul>
                </div>
              )}
              <div className="whitespace-pre-wrap text-gray-700 text-xs leading-relaxed">
                {caseSummary?.summary}
              </div>
              {caseSummary?.citations?.length > 0 && (
                <div className="mt-3 pt-2 border-t border-gray-100">
                  <p className="font-medium text-xs text-gray-500 mb-1">Sources</p>
                  {caseSummary.citations.map((c, i) => (
                    <span key={i} className="text-xs text-gray-500 mr-3">
                      [{c.source}: {c.section}]
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
