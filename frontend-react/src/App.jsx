import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './layout/MainLayout';
import UploadPage from './pages/UploadPage';
import ProcessingPage from './pages/ProcessingPage';
import DashboardPage from './pages/DashboardPage';
import DatasetsPage from './pages/DatasetsPage';
import ChatPage from './pages/ChatPage';

function App() {
  return (
    <BrowserRouter>
      <MainLayout>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/processing/:datasetId" element={<ProcessingPage />} />
          <Route path="/dashboard/:datasetId" element={<DashboardPage />} />
          <Route path="/chat/:datasetId" element={<ChatPage />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}

export default App;
