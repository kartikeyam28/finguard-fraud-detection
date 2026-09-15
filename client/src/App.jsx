import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import TransactionScoring from "./pages/TransactionScoring";
import InvestigatorQueue from "./pages/InvestigatorQueue";
import CustomerSegments from "./pages/CustomerSegments";
import Assistant from "./pages/Assistant";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard" },
  { path: "/scoring", label: "Transaction Scoring" },
  { path: "/queue", label: "Investigator Queue" },
  { path: "/segments", label: "Customer Segments" },
  { path: "/assistant", label: "Assistant" },
];

export default function App() {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <nav className="w-56 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-lg font-bold tracking-tight">FinGuard</h1>
          <p className="text-xs text-gray-500 mt-0.5">Fraud Detection Platform</p>
        </div>
        <ul className="flex-1 py-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `block px-4 py-2 text-sm ${
                    isActive
                      ? "bg-black text-white font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-gray-50">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/scoring" element={<TransactionScoring />} />
          <Route path="/queue" element={<InvestigatorQueue />} />
          <Route path="/segments" element={<CustomerSegments />} />
          <Route path="/assistant" element={<Assistant />} />
        </Routes>
      </main>
    </div>
  );
}
