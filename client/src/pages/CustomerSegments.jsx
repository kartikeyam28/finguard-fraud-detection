import { useState, useEffect } from "react";

export default function CustomerSegments() {
  const [segments, setSegments] = useState([]);
  const [anomalyComparison, setAnomalyComparison] = useState(null);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerDetail, setCustomerDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSegments();
  }, []);

  async function fetchSegments() {
    try {
      const res = await fetch("/api/customers/segments");
      const data = await res.json();
      setSegments(data.segments || []);
      setAnomalyComparison(data.anomaly_comparison);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  async function loadSegmentCustomers(segmentName) {
    if (selectedSegment === segmentName) {
      setSelectedSegment(null);
      setCustomers([]);
      return;
    }
    setSelectedSegment(segmentName);
    setSelectedCustomer(null);
    setCustomerDetail(null);
    try {
      const res = await fetch(`/api/customers?segment=${encodeURIComponent(segmentName)}&limit=30`);
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadCustomerDetail(customerId) {
    if (selectedCustomer === customerId) {
      setSelectedCustomer(null);
      setCustomerDetail(null);
      return;
    }
    try {
      const res = await fetch(`/api/customers/${customerId}`);
      const data = await res.json();
      setSelectedCustomer(customerId);
      setCustomerDetail(data);
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) {
    return <div className="p-6 text-gray-500">Loading segments...</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Customer Segments</h1>

      {/* Segment cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {segments.map((seg) => (
          <div
            key={seg.name}
            className={`border p-4 cursor-pointer ${
              selectedSegment === seg.name
                ? "border-black bg-black text-white"
                : "border-gray-200 bg-white hover:border-gray-400"
            }`}
            onClick={() => loadSegmentCustomers(seg.name)}
          >
            <h3 className="font-semibold text-sm">{seg.name}</h3>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className={selectedSegment === seg.name ? "text-gray-300" : "text-gray-500"}>Customers: </span>
                {seg.count}
              </div>
              <div>
                <span className={selectedSegment === seg.name ? "text-gray-300" : "text-gray-500"}>Avg Txns: </span>
                {seg.avg_txns}
              </div>
              <div>
                <span className={selectedSegment === seg.name ? "text-gray-300" : "text-gray-500"}>Avg Amount: </span>
                ${seg.avg_amount?.toFixed(2)}
              </div>
              <div>
                <span className={selectedSegment === seg.name ? "text-gray-300" : "text-gray-500"}>Fraud Rate: </span>
                {seg.avg_fraud_rate?.toFixed(4)}%
              </div>
              {seg.online_ratio !== undefined && (
                <div>
                  <span className={selectedSegment === seg.name ? "text-gray-300" : "text-gray-500"}>Online: </span>
                  {seg.online_ratio}%
                </div>
              )}
              {seg.mobile_ratio !== undefined && (
                <div>
                  <span className={selectedSegment === seg.name ? "text-gray-300" : "text-gray-500"}>Mobile: </span>
                  {seg.mobile_ratio}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Anomaly comparison */}
      {anomalyComparison && (
        <div className="mb-6 p-4 border border-gray-200 bg-white">
          <h2 className="text-sm font-semibold mb-2">Anomaly Detection Comparison</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-gray-500 block">Anomalous Customers</span>
              <span className="font-medium">{anomalyComparison.anomalous_customers}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Normal Customers</span>
              <span className="font-medium">{anomalyComparison.normal_customers}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Anomalous Fraud Rate</span>
              <span className="font-medium">{(anomalyComparison.anomalous_avg_fraud_rate * 100).toFixed(4)}%</span>
            </div>
            <div>
              <span className="text-gray-500 block">Normal Fraud Rate</span>
              <span className="font-medium">{(anomalyComparison.normal_avg_fraud_rate * 100).toFixed(4)}%</span>
            </div>
          </div>
          {anomalyComparison.interpretation && (
            <p className="text-xs text-gray-600 mt-2">{anomalyComparison.interpretation}</p>
          )}
        </div>
      )}

      {/* Customer list for selected segment */}
      {selectedSegment && customers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-2">Customers in "{selectedSegment}"</h2>
          <div className="border border-gray-200 bg-white overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-3 py-2 font-medium">ID</th>
                  <th className="text-right px-3 py-2 font-medium">Txns</th>
                  <th className="text-right px-3 py-2 font-medium">Total Amount</th>
                  <th className="text-right px-3 py-2 font-medium">Avg Amount</th>
                  <th className="text-right px-3 py-2 font-medium">Fraud Rate</th>
                  <th className="text-left px-3 py-2 font-medium">Category</th>
                  <th className="text-left px-3 py-2 font-medium">Channel</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.customer_id}
                    className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                    onClick={() => loadCustomerDetail(c.customer_id)}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{c.customer_id}</td>
                    <td className="px-3 py-2 text-right">{c.total_transactions}</td>
                    <td className="px-3 py-2 text-right">${c.total_amount?.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">${c.avg_amount?.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right">{(c.fraud_rate * 100).toFixed(4)}%</td>
                    <td className="px-3 py-2">{c.dominant_category}</td>
                    <td className="px-3 py-2">{c.dominant_channel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer detail */}
      {selectedCustomer && customerDetail && (
        <div className="border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold mb-3">
            Customer {selectedCustomer}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-4">
            <div><span className="text-gray-500 block">Segment</span>{customerDetail.customer?.segment}</div>
            <div><span className="text-gray-500 block">Total Txns</span>{customerDetail.customer?.total_transactions}</div>
            <div><span className="text-gray-500 block">Avg Amount</span>${customerDetail.customer?.avg_amount?.toFixed(2)}</div>
            <div><span className="text-gray-500 block">Fraud Rate</span>{(customerDetail.customer?.fraud_rate * 100).toFixed(4)}%</div>
          </div>

          <h3 className="text-xs font-medium text-gray-500 mb-2">Recent Transactions</h3>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-2 py-1">ID</th>
                  <th className="text-right px-2 py-1">Amount</th>
                  <th className="text-left px-2 py-1">Channel</th>
                  <th className="text-left px-2 py-1">Category</th>
                  <th className="text-left px-2 py-1">Time</th>
                  <th className="text-right px-2 py-1">Score</th>
                  <th className="text-center px-2 py-1">Fraud</th>
                </tr>
              </thead>
              <tbody>
                {customerDetail.recent_transactions?.map((t) => (
                  <tr key={t.transaction_id} className="border-b border-gray-50">
                    <td className="px-2 py-1">{t.transaction_id}</td>
                    <td className="px-2 py-1 text-right">${t.amount?.toFixed(2)}</td>
                    <td className="px-2 py-1">{t.channel}</td>
                    <td className="px-2 py-1">{t.category}</td>
                    <td className="px-2 py-1">{t.timestamp}</td>
                    <td className="px-2 py-1 text-right">{t.fraud_score?.toFixed(4)}</td>
                    <td className="px-2 py-1 text-center">
                      {t.fraud_label === 1 ? <span className="text-red-600 font-bold">YES</span> : "no"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
