import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, ArrowLeft, LayoutDashboard } from 'lucide-react';
import QueryAssistant from '../components/QueryAssistant';

const ChatPage = () => {
    const { datasetId } = useParams();
    const navigate = useNavigate();

    return (
        <div className="view-enter" style={{ height: 'calc(100vh - 180px)', display: 'flex', flexDirection: 'column' }}>
            <header style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button 
                        onClick={() => navigate(`/dashboard/${datasetId}`)}
                        style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#fff', padding: '0.5rem', borderRadius: '8px', cursor: 'pointer' }}
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h2 style={{ margin: 0 }}>AI Multi-Metric Assistant</h2>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Context: {datasetId}</p>
                    </div>
                </div>
                
                <button 
                    className="btn-primary" 
                    onClick={() => navigate(`/dashboard/${datasetId}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'transparent', border: '1px solid var(--border-color)', boxShadow: 'none' }}
                >
                    <LayoutDashboard size={18} />
                    View Dashboard
                </button>
            </header>

            <div style={{ flexGrow: 1, maxHeight: '100%' }}>
                <QueryAssistant datasetId={datasetId} />
            </div>
        </div>
    );
};

export default ChatPage;
