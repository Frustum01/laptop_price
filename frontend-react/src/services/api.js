import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_URL,
});

export const uploadDataset = async (file) => {
    const formData = new FormData();
    formData.append('dataset', file);
    
    // Let axios set the proper boundary for multipart/form-data
    const response = await api.post('/upload', formData);
    return response.data;
};

export const getDatasetStatus = async (datasetId) => {
    const response = await api.get(`/dataset-status/${datasetId}`);
    return response.data;
};

export const getDashboardConfig = async (datasetId) => {
    const response = await api.get(`/dashboard/${datasetId}`);
    return response.data;
};

export const getAnalytics = async (datasetId) => {
    const response = await api.get(`/analytics/${datasetId}`);
    return response.data;
};

export const askQuery = async (datasetId, question) => {
    const response = await api.post('/query', {
        datasetId: datasetId,
        question: question,
    });
    return response.data;
};

export const getDatasets = async () => {
    const response = await api.get('/datasets');
    return response.data;
};

export default api;
