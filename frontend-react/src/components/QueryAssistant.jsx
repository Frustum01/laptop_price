import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader } from 'lucide-react';
import { askQuery } from '../services/api';

const QueryAssistant = ({ datasetId }) => {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Hello! I am your semantic data assistant. Ask me questions about total sales, trends, averages, or specific feature impacts.' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !datasetId || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const response = await askQuery(datasetId, userMsg);
      const answer = response?.answer || "I'm sorry, I couldn't compute an answer for that.";
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: answer,
        intent: response?.intent,
        confidence: response?.confidence
      }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        role: 'system', 
        content: 'There was an error connecting to the Semantic Query Engine. ' + (err.response?.data?.message || '') 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '500px', overflow: 'hidden' }}>
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Bot color="var(--secondary)" />
        <h3 style={{ margin: 0 }}>Semantic Insight Assistant</h3>
      </div>
      
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
          }}>
            <div style={{ 
              background: msg.role === 'user' ? 'rgba(88, 166, 255, 0.2)' : 'rgba(0,0,0,0.3)',
              padding: '0.6rem',
              borderRadius: '50%'
            }}>
              {msg.role === 'user' ? <User size={18} color="var(--primary)" /> : <Bot size={18} color="var(--accent)" />}
            </div>
            
            <div style={{
              background: msg.role === 'user' ? 'rgba(31, 111, 235, 0.2)' : 'rgba(0,0,0,0.2)',
              padding: '1rem 1.25rem',
              borderRadius: '12px',
              borderTopRightRadius: msg.role === 'user' ? '4px' : '12px',
              borderTopLeftRadius: msg.role === 'system' ? '4px' : '12px',
              maxWidth: '80%',
              border: `1px solid ${msg.role === 'user' ? 'rgba(88, 166, 255, 0.3)' : 'var(--border-color)'}`
            }}>
              <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{msg.content}</p>
              
              {msg.intent && msg.intent !== 'rejected' && (
                <div style={{ 
                  marginTop: '0.75rem', 
                  fontSize: '0.75rem', 
                  color: 'var(--text-muted)',
                  display: 'flex', 
                  gap: '0.5rem'
                }}>
                  <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    Intent: {msg.intent}
                  </span>
                  <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                    Confidence: {msg.confidence}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', color: 'var(--text-muted)' }}>
            <Loader size={18} className="spinner" style={{ animation: 'spin 1.5s linear infinite' }} />
            <span style={{ fontSize: '0.9rem' }}>Analyzing records...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your data..."
            style={{
              flexGrow: 1,
              background: 'rgba(0,0,0,0.2)',
              border: '1px solid var(--border-color)',
              padding: '1rem',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '1rem',
              outline: 'none'
            }}
            disabled={isLoading}
          />
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={!input.trim() || isLoading}
            style={{ padding: '0 1.5rem' }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        input:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
        }
      `}} />
    </div>
  );
};

export default QueryAssistant;
