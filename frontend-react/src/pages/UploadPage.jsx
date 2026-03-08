import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, File, AlertCircle } from 'lucide-react';
import { uploadDataset } from '../services/api';

const UploadPage = () => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    setError('');
    const droppedFile = e.dataTransfer.files[0];
    validateAndSetFile(droppedFile);
  };

  const handleFileChange = (e) => {
    setError('');
    const selectedFile = e.target.files[0];
    validateAndSetFile(selectedFile);
  };

  const validateAndSetFile = (selectedFile) => {
    if (!selectedFile) return;
    
    const validTypes = [
      'text/csv', 
      'application/vnd.ms-excel', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    
    if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.xlsx')) {
      setError('Invalid file type. Please upload a CSV or XLSX file.');
      return;
    }
    
    if (selectedFile.size > 100 * 1024 * 1024) { // 100MB limit
      setError('File is too large. Maximum size is 100MB.');
      return;
    }
    
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    setError('');
    
    try {
      const response = await uploadDataset(file);
      if (response && response.datasetId) {
        navigate(`/processing/${response.datasetId}`);
      } else {
        setError('Upload succeeded but dataset ID is missing in response.');
        setIsUploading(false);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || err.message || 'An error occurred during upload.');
      setIsUploading(false);
    }
  };

  return (
    <div className="view-enter flex-center" style={{ minHeight: '60vh', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 className="gradient-text" style={{ fontSize: '3rem', marginBottom: '1rem' }}>Data Intelligence, Automated</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.25rem', maxWidth: '600px', margin: '0 auto' }}>
          Instantly transform raw CSV and Excel datasets into actionable insights, interactive dashboards, and accurate forecasts.
        </p>
      </div>
      
      <div className="glass-panel" style={{ width: '100%', maxWidth: '700px', padding: '3rem 2rem' }}>
        <div 
          onClick={() => fileInputRef.current.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragActive ? 'var(--primary)' : 'var(--border-color)'}`,
            borderRadius: '12px',
            padding: '4rem 2rem',
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: isDragActive ? 'rgba(88, 166, 255, 0.05)' : 'transparent',
            transition: 'all 0.3s ease',
            marginBottom: '2rem'
          }}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            style={{ display: 'none' }} 
            accept=".csv, .xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
          />
          
          {file ? (
            <div className="flex-center" style={{ flexDirection: 'column', gap: '1rem' }}>
              <File size={64} color="var(--primary)" />
              <div>
                <h3 style={{ margin: '0.5rem 0' }}>{file.name}</h3>
                <p style={{ color: 'var(--text-muted)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button 
                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                style={{
                  background: 'none', 
                  border: 'none', 
                  color: 'var(--danger)', 
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  marginTop: '0.5rem'
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex-center" style={{ flexDirection: 'column', gap: '1.5rem' }}>
              <UploadCloud size={64} color={isDragActive ? 'var(--primary)' : 'var(--text-muted)'} />
              <div>
                <h3 style={{ margin: '0.5rem 0', fontSize: '1.5rem' }}>Click or Drag dataset here</h3>
                <p style={{ color: 'var(--text-muted)' }}>Supports CSV and XLSX files up to 100MB</p>
              </div>
            </div>
          )}
        </div>
        
        {error && (
          <div style={{ 
            backgroundColor: 'rgba(248, 81, 73, 0.1)', 
            border: '1px solid var(--danger)', 
            padding: '1rem', 
            borderRadius: '8px',
            color: 'var(--danger)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginBottom: '2rem'
          }}>
            <AlertCircle size={20} />
            <span>{error}</span>
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button 
            className="btn-primary" 
            onClick={(e) => { e.stopPropagation(); handleUpload(); }} 
            disabled={!file || isUploading}
            style={{ width: '100%', maxWidth: '300px', padding: '1rem' }}
          >
            {isUploading ? (
              <span className="flex-center" style={{ gap: '0.5rem' }}>
                <span className="spinner" style={{
                  width: '20px', height: '20px', 
                  border: '3px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></span>
                Analyzing Dataset...
              </span>
            ) : (
              'Generate Insights Pipeline'
            )}
          </button>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes spin { 
          0% { transform: rotate(0deg); } 
          100% { transform: rotate(360deg); } 
        }
      `}} />
    </div>
  );
};

export default UploadPage;
