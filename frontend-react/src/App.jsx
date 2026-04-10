import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import MainLayout from "./layout/MainLayout";
import UploadPage from "./pages/UploadPage";
import ProcessingPage from "./pages/ProcessingPage";
import DashboardPage from "./pages/DashboardPage";
import DatasetsPage from "./pages/DatasetsPage";
import ChatPage from "./pages/ChatPage";

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          {/* Default route */}
          <Route path="/" element={<UploadPage />} />

          {/* Upload */}
          <Route path="/upload" element={<UploadPage />} />

          {/* Datasets */}
          <Route path="/datasets" element={<DatasetsPage />} />

          {/* Processing */}
          <Route
            path="/processing/:datasetId"
            element={<ProcessingPage />}
          />

          {/* ✅ Dashboard (REQUIRES datasetId) */}
          <Route
            path="/dashboard/:datasetId"
            element={<DashboardPage />}
          />

          {/* ✅ Chat */}
          <Route path="/chat/:datasetId" element={<ChatPage />} />

          {/* ❗ OPTIONAL: fallback route */}
          <Route path="*" element={<h1 style={{ color: "white" }}>Page Not Found</h1>} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;