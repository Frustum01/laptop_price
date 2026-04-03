import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getDashboardConfig } from "../services/api";
import InsightsPanel from "../components/InsightsPanel";
import SidebarFilter from "../components/SidebarFilter";
import { FilterProvider, useFilter } from "../context/FilterContext";

import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

import { MessageSquare } from "lucide-react";

const COLORS = ["#58a6ff", "#bc8cff", "#3fb950", "#d29922", "#f85149"];

// ================= MAIN CONTENT =================
const DashboardContent = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();

  const { filters, setSingleFilter, clearFilter } = useFilter();
  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await getDashboardConfig(datasetId);
      setDashboardData(data);
    };
    fetchData();
  }, [datasetId]);

  // ✅ FINAL SMART FILTER (NO DATA BUG FIXED)
  const applyFilters = (data = []) => {
    return data.filter((item) => {
      return Object.keys(filters).every((key) => {

        // 🔥 IGNORE FILTER IF COLUMN NOT PRESENT
        if (!(key in item)) return true;

        const value = filters[key];
        if (!value) return true;

        // MULTI SELECT SUPPORT
        if (Array.isArray(value)) {
          return value.some(
            (v) =>
              String(item[key]).trim().toLowerCase() ===
              String(v).trim().toLowerCase()
          );
        }

        return true;
      });
    });
  };

  // ================= CHART =================
  const renderChart = (chart) => {
    const data = applyFilters(chart.data || []);

    if (!data.length) {
      return <p style={{ opacity: 0.6 }}>No data</p>;
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey={chart.x} />
          <YAxis />
          <Tooltip />

          <Bar
            dataKey={chart.y}
            onClick={(e) => {
              const val = e?.payload?.[chart.x];
              if (val !== undefined) {
                setSingleFilter(chart.x, String(val).trim());
              }
            }}
            onDoubleClick={() => clearFilter(chart.x)}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  if (!dashboardData) return <p>Loading...</p>;

  return (
    <div style={{ display: "flex" }}>
      {/* SIDEBAR */}
      <SidebarFilter data={dashboardData?.charts?.[0]?.data || []} />

      {/* MAIN */}
      <div style={{ flex: 1, padding: "25px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h1>Dashboard</h1>

          <button
            onClick={() => navigate(`/chat/${datasetId}`)}
            className="btn-primary"
          >
            <MessageSquare size={16} /> AI Assistant
          </button>
        </div>

        <InsightsPanel
          summary={dashboardData.executive_summary}
          insights={dashboardData.insights}
        />

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "20px",
          marginTop: "20px"
        }}>
          {dashboardData.charts.map((chart, i) => (
            <div key={i} className="glass-panel" style={{ padding: "15px" }}>
              <h4>{chart.title}</h4>
              {renderChart(chart)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ================= WRAPPER =================
const DashboardPage = () => {
  return (
    <FilterProvider>
      <DashboardContent />
    </FilterProvider>
  );
};

export default DashboardPage;