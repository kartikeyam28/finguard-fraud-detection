import { useState, useEffect } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [threshold, setThreshold] = useState(0.5);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [threshold]);

  async function fetchData() {
    setLoading(true);
    try {
      const [statsRes, chRes, catRes, timeRes] = await Promise.all([
        fetch(`/api/dashboard/stats?threshold=${threshold}`),
        fetch("/api/dashboard/by-channel"),
        fetch("/api/dashboard/by-category"),
        fetch("/api/dashboard/over-time"),
      ]);
      setStats(await statsRes.json());
      const chData = await chRes.json();
      setChannels(chData.channels || []);
      const catData = await catRes.json();
      setCategories(catData.categories || []);
      const timeData = await timeRes.json();
      setTimeline((timeData.timeline || []).map((t) => ({
        ...t,
        fraud_rate_pct: (t.fraud_rate * 100).toFixed(3),
      })));
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    }
    setLoading(false);
  }

  if (loading && !stats) {
    return <div className="p-6 text-gray-500">Loading dashboard...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Dashboard</h1>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Fraud Rate" value={`${(stats.fraud_rate * 100).toFixed(3)}%`} />
          <StatCard label="Flagged Transactions" value={stats.flagged_transactions?.toLocaleString()} />
          <StatCard label="Value at Risk" value={`$${(stats.value_at_risk || 0).toFixed(2)}`} />
          <StatCard label="Detection Rate" value={`${(stats.detection_rate * 100).toFixed(1)}%`} />
          <StatCard label="Total Transactions" value={stats.total_transactions?.toLocaleString()} />
          <StatCard label="Actual Fraud" value={stats.actual_fraud?.toLocaleString()} />
          <StatCard label="Precision" value={`${(stats.precision * 100).toFixed(1)}%`} />
          <StatCard label="False Positives" value={stats.false_positives?.toLocaleString()} />
        </div>
      )}

      {/* Threshold control */}
      <div className="mb-6 p-4 border border-gray-200 bg-white">
        <label className="text-sm font-medium block mb-1">
          Decision Threshold: {threshold.toFixed(2)}
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
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>More flags (0.1)</span>
          <span>Fewer flags (0.95)</span>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Fraud by channel */}
        <div className="border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold mb-3">Fraud Rate by Channel</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={channels}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
              <Tooltip formatter={(v) => `${(v * 100).toFixed(3)}%`} />
              <Bar dataKey="fraud_rate" fill="#000" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Fraud by category */}
        <div className="border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold mb-3">Fraud Rate by Category</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categories} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v * 100).toFixed(1)}%`} />
              <YAxis type="category" dataKey="category" tick={{ fontSize: 11 }} width={80} />
              <Tooltip formatter={(v) => `${(v * 100).toFixed(3)}%`} />
              <Bar dataKey="fraud_rate" fill="#333" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detection over time */}
        <div className="border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold mb-3">Fraud Rate Over Time</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={timeline.slice(-30)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="fraud_rate_pct" stroke="#000" dot={false} strokeWidth={1.5} name="Fraud %" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* False positive volume */}
        <div className="border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold mb-3">Transaction Volume by Channel</h2>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={channels}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="total" fill="#666" name="Total" />
              <Bar dataKey="fraud_count" fill="#000" name="Fraud" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold mt-1">{value ?? "—"}</div>
    </div>
  );
}
