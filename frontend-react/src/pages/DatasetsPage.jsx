import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, Calendar, FileText, ChevronRight, Loader } from 'lucide-react';
import { getDatasets } from '../services/api';

const DatasetsPage = () => {
    const [datasets, setDatasets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchDatasets = async () => {
            try {
                const res = await getDatasets();
                if (res.success) {
                    setDatasets(res.data || []);
                }
            } catch (err) {
                console.error("Failed to fetch datasets:", err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchDatasets();
    }, []);

    if (isLoading) {
        return (
            <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column' }}>
                <Loader className="spinner" size={40} color="var(--primary)" />
                <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Retrieving your workspace...</p>
            </div>
        );
    }

    return (
        <div className="view-enter">
            <header style={{ marginBottom: '2.5rem' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>My Datasets</h1>
                <p style={{ color: 'var(--text-muted)' }}>Manage and analyze your historical data assets</p>
            </header>

            {datasets.length === 0 ? (
                <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center' }}>
                    <Database size={48} color="var(--text-muted)" style={{ marginBottom: '1.5rem' }} />
                    <h3>No datasets found</h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Upload your first dataset to start generating insights.</p>
                    <button className="btn-primary" onClick={() => navigate('/upload')}>Upload Dataset</button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {datasets.map((dataset) => (
                        <div 
                            key={dataset._id} 
                            className="glass-panel hover-scale" 
                            style={{ 
                                padding: '1.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease'
                            }}
                            onClick={() => navigate(`/dashboard/${dataset._id}`)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ 
                                    background: dataset.status === 'completed' ? 'rgba(63, 185, 80, 0.15)' : 'rgba(210, 153, 34, 0.15)', 
                                    padding: '0.75rem', 
                                    borderRadius: '10px' 
                                }}>
                                    <FileText color={dataset.status === 'completed' ? 'var(--secondary)' : 'var(--warning)'} />
                                </div>
                                <div>
                                    <h4 style={{ margin: 0, fontSize: '1.1rem' }}>{dataset.filename}</h4>
                                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Calendar size={14} /> {new Date(dataset.uploadedAt).toLocaleDateString()}
                                        </span>
                                        <span>{dataset.rows} Rows • {dataset.columns} Columns</span>
                                        <span style={{ 
                                            textTransform: 'capitalize', 
                                            color: dataset.status === 'completed' ? 'var(--secondary)' : 'var(--warning)',
                                            fontWeight: 600
                                        }}>
                                            {dataset.status}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <ChevronRight size={20} color="var(--text-muted)" />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DatasetsPage;
