import React, { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";

const DashboardPage = () => {
  const { datasetId } = useParams();

  const [data, setData] = useState([]);
  const [filterValue, setFilterValue] = useState(0);

  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await axios.get(
      `http://localhost:5000/api/employee/1/datasets/${datasetId}/visualization`
    );
    setData(res.data.data);
  };

  const filteredData = data.filter((d) => d.pm25 >= filterValue);

  const pieData = [
    { name: "Low", value: filteredData.filter(d => d.pm25 < 100).length },
    { name: "Medium", value: filteredData.filter(d => d.pm25 >= 100 && d.pm25 < 200).length },
    { name: "High", value: filteredData.filter(d => d.pm25 >= 200).length },
  ];

  const sendMessage = async () => {
    if (!message.trim()) return;

    const newMsgs = [...messages, { type: "user", text: message }];
    setMessages(newMsgs);
    setMessage("");

    try {
      const res = await axios.post(
        `http://localhost:5000/api/employee/1/datasets/${datasetId}/chatbot`,
        { message }
      );

      setMessages([
        ...newMsgs,
        { type: "bot", text: res.data.reply },
      ]);
    } catch {
      setMessages([
        ...newMsgs,
        { type: "bot", text: "Error 😢" },
      ]);
    }
  };

  return (
    <div className="space-y-6">

      <h1 className="text-3xl font-bold text-blue-400">📊 Dashboard</h1>

      {/* FILTER */}
      <div className="bg-[#1e293b] p-4 rounded-xl">
        <p>Filter PM2.5 ≥ {filterValue}</p>
        <input
          type="range"
          min="0"
          max="300"
          value={filterValue}
          onChange={(e) => setFilterValue(e.target.value)}
          className="w-full"
        />
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-2 gap-6">

        {/* LINE */}
        <div className="bg-[#1e293b] p-4 rounded-xl">
          <h2>📈 Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line dataKey="pm25" stroke="#3b82f6" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* BAR */}
        <div className="bg-[#1e293b] p-4 rounded-xl">
          <h2>📊 Comparison</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={filteredData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="pm25" fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* PIE */}
        <div className="bg-[#1e293b] p-4 rounded-xl">
          <h2>🥧 Distribution</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={pieData} dataKey="value" outerRadius={100}>
                {pieData.map((_, i) => (
                  <Cell key={i} fill={["#22c55e", "#facc15", "#ef4444"][i]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ================= BEAUTIFUL CHATBOT ================= */}
      <div className="bg-[#1e293b] p-5 rounded-xl shadow-lg">
        <h2 className="text-xl mb-3 font-semibold">🤖 AI Assistant</h2>

        {/* CHAT WINDOW */}
        <div className="h-64 overflow-y-auto bg-[#0f172a] rounded-lg p-3 space-y-3 mb-4">
          {messages.length === 0 && (
            <p className="text-gray-400 text-sm">
              Ask anything about your dataset...
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.type === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`px-4 py-2 rounded-lg max-w-xs text-sm ${
                  msg.type === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-700 text-gray-200"
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* INPUT */}
        <div className="flex gap-2">
          <input
            className="flex-1 p-2 rounded-lg bg-[#0f172a] border border-gray-600 text-white"
            placeholder="Ask something..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />

          <button
            onClick={sendMessage}
            className="bg-blue-600 px-4 rounded-lg hover:bg-blue-500"
          >
            Send
          </button>
        </div>
      </div>

    </div>
  );
};

export default DashboardPage;