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


// ✅ MAIN CONTENT
const DashboardContent = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();

  // 🔥 IMPORTANT (cross filter)
  const { filters, setSingleFilter, clearFilter } = useFilter();

  const [dashboardData, setDashboardData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const data = await getDashboardConfig(datasetId);
      setDashboardData(data);
    };
    fetchData();
  }, [datasetId]);

  // ✅ APPLY FILTER LOGIC
  const applyFilters = (data = []) => {
    return data.filter((item) => {
      return Object.keys(filters).every((key) => {
        const value = filters[key];

        if (Array.isArray(value)) {
          return value.includes(item[key]);
        }

        if (typeof value === "object") {
          return item[key] >= value.min && item[key] <= value.max;
        }

        return true;
      });
    });
  };

  // ✅ RENDER CHART WITH CROSS FILTER
  const renderChart = (chart) => {
    const data = applyFilters(chart.data || []);

    if (!data.length) return <p>No data</p>;

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
              const clickedValue = e?.payload?.[chart.x];
              if (clickedValue !== undefined) {
                setSingleFilter(chart.x, clickedValue);
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

      {/* ✅ SIDEBAR */}
      <SidebarFilter data={dashboardData?.charts?.[0]?.data || []} />

      {/* ✅ MAIN CONTENT */}
      <div style={{ flex: 1, padding: "25px" }}>

        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "25px",
          }}
        >
          <div>
            <h1 style={{ fontSize: "28px" }}>Dashboard</h1>
            <p style={{ opacity: 0.6 }}>{datasetId}</p>
          </div>

          <button
            onClick={() => navigate(`/chat/${datasetId}`)}
            className="btn-primary"
          >
            <MessageSquare size={16} /> AI Assistant
          </button>
        </div>

        {/* INSIGHTS */}
        <InsightsPanel
          summary={dashboardData.executive_summary}
          insights={dashboardData.insights}
        />

        {/* CHART GRID */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: "20px",
            marginTop: "20px",
          }}
        >
          {dashboardData.charts.map((chart, i) => (
            <div key={i} className="glass-panel" style={{ padding: "15px" }}>
              <h4 style={{ marginBottom: "10px" }}>{chart.title}</h4>
              {renderChart(chart)}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
};


// ✅ WRAPPER (IMPORTANT)
const DashboardPage = () => {
  return (
    <FilterProvider>
      <DashboardContent />
    </FilterProvider>
  );
};

export default DashboardPage;