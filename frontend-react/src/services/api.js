import axios from 'axios';

const API_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
    baseURL: API_URL,
});

export const uploadDataset = async (file) => {
    const formData = new FormData();
    formData.append('dataset', file);
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
        question:  question,
    });
    return response.data;
};

export const getDatasets = async () => {
    const response = await api.get('/datasets');
    return response.data;
};

// ── Data Modification Helpers ────────────────────────────────────────────────

/**
 * Preview (read-only): returns how many rows will be affected by an operation.
 * Calls POST /api/data/preview  — no CSV write happens.
 */
export const previewOperation = async (datasetId, operationParams) => {
    const response = await api.post('/data/preview', {
        datasetId,
        ...operationParams,
    });
    return response.data;
};

/**
 * Execute a confirmed write operation.
 * operationType: 'update' | 'delete' | 'fill_null'
 * params: { column, condition, new_value, method, value }
 */
export const executeDataWrite = async (datasetId, operationType, params) => {
    let endpoint;
    let body = { datasetId, ...params };

    if (operationType === 'update') {
        endpoint = '/data/update';
    } else if (operationType === 'delete') {
        endpoint = '/data/delete';
    } else if (operationType === 'fill_null') {
        endpoint = '/data/fill-null';
    } else {
        throw new Error(`Unknown operation type: ${operationType}`);
    }

    const response = await api.post(endpoint, body);
    return response.data;
};

/**
 * Download the detailed dataset summary report as a Markdown file.
 * Triggers a browser file-save dialog.
 */
export const downloadSummaryReport = async (datasetId) => {
    const response = await api.get(`/datasets/${datasetId}/summary-report`, {
        responseType: 'blob',
    });

    // Create a download link and trigger it
    const blob = new Blob([response.data], { type: 'text/markdown' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');

    // Extract filename from Content-Disposition header if available
    const disposition = response.headers['content-disposition'];
    let filename = `DataInsights_Summary_${datasetId.slice(0, 12)}.md`;
    if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match) filename = match[1];
    }

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

export default api;
