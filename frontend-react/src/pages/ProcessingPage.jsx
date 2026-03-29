import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Database, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { getDatasetStatus } from '../services/api';

const PIPELINE_STEPS = [
  "Validating Schema & Schema Profiles",
  "Cleaning Constraints & Sampling",
  "Detecting Implicit Relationships",
  "Engineering Advanced Features",
  "Evaluating Machine Learning Models",
  "Executing Time-Series Forecasts",
  "Extracting Performance KPIs",
  "Generating Metric Graph Definitions",
  "Discovering Anomalies & Trends",
  "Compiling Visualization Dashboards"
];

const ProcessingPage = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();

  const [status, setStatus]           = useState('processing');
  const [error, setError]             = useState('');
  const [simulatedStep, setSimulatedStep] = useState(0);
  const pollFailures                  = useRef(0);
  const MAX_POLL_FAILURES             = 10;

  // ── Poll Backend Status ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!datasetId) return;

    const interval = setInterval(async () => {
      try {
        const res = await getDatasetStatus(datasetId);
        console.log(`[POLL] Status for ${datasetId}:`, res);

        // Reset failure counter on success
        pollFailures.current = 0;

        if (res && res.status) {
          if (res.status === 'completed') {
            setStatus('completed');
            clearInterval(interval);
            setTimeout(() => navigate(`/dashboard/${datasetId}`), 1500);

          } else if (res.status === 'failed') {
            setStatus('failed');
            setError(res.error || 'Pipeline execution failed during artifact generation.');
            clearInterval(interval);
          }
          // still 'processing' → keep polling
        }
      } catch (err) {
        pollFailures.current += 1;
        console.warn(`[POLL] Attempt failed (${pollFailures.current}/${MAX_POLL_FAILURES}):`, err.message);

        if (pollFailures.current >= MAX_POLL_FAILURES) {
          clearInterval(interval);
          setStatus('failed');
          setError('Lost connection to the server while monitoring your dataset. Please check the backend and try again.');
        }
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [datasetId, navigate]);

  // ── Simulated Progress Bar (keeps user engaged) ─────────────────────────────
  useEffect(() => {
    if (status !== 'processing') return;

    // Advance one step every ~2.5 s so the bar doesn't blaze through instantly
    const stepInterval = setInterval(() => {
      setSimulatedStep(prev => (prev < PIPELINE_STEPS.length - 1 ? prev + 1 : prev));
    }, 2500);

    return () => clearInterval(stepInterval);
  }, [status]);

  const progressPct = Math.round(((simulatedStep + 1) / PIPELINE_STEPS.length) * 100);

  return (
    <div className="view-enter flex-center" style={{ minHeight: '60vh', flexDirection: 'column' }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '3rem' }}>

        {/* ── Processing State ─────────────────────────── */}
        {status === 'processing' && (
          <div style={{ textAlign: 'center' }}>
            <div className="flex-center" style={{ marginBottom: '2rem' }}>
              <div style={{ position: 'relative' }}>
                <Database size={64} color="var(--primary)" style={{ opacity: 0.5 }} />
                <div style={{
                  position: 'absolute',
                  top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                  width: '80px', height: '80px',
                  border: '4px solid transparent',
                  borderTopColor: 'var(--accent)',
                  borderRightColor: 'var(--primary)',
                  borderRadius: '50%',
                  animation: 'spin 1.5s cubic-bezier(0.68, -0.55, 0.265, 1.55) infinite'
                }} />
              </div>
            </div>

            <h2 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Orchestrating AI Pipeline...</h2>

            <div style={{
              background: 'rgba(88, 166, 255, 0.1)',
              border: '1px solid var(--primary)',
              padding: '0.75rem',
              borderRadius: '8px',
              color: 'var(--primary)',
              fontWeight: '500',
              display: 'inline-block',
              marginBottom: '1rem'
            }}>
              Status: Processing — {progressPct}% complete
            </div>

            <div style={{
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '8px',
              padding: '1.5rem',
              marginTop: '2rem',
              textAlign: 'left'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <Clock size={20} color="var(--primary)" />
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  Executing Module {simulatedStep + 1} of {PIPELINE_STEPS.length}
                </span>
              </div>

              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', margin: 0, fontWeight: 500 }}>
                {PIPELINE_STEPS[simulatedStep]}
              </h3>

              <div style={{ marginTop: '1.5rem', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, var(--secondary), var(--accent))',
                  width: `${progressPct}%`,
                  transition: 'width 2s ease'
                }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Success State ────────────────────────────── */}
        {status === 'completed' && (
          <div style={{ textAlign: 'center', animation: 'fadeSlideUp 0.5s ease forwards' }}>
            <CheckCircle size={80} color="var(--success)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ marginBottom: '1rem', color: 'var(--success)' }}>Dataset Processed Successfully</h2>
            <p style={{ color: 'var(--text-muted)' }}>Redirecting to your visualization dashboard...</p>
          </div>
        )}

        {/* ── Failed State ──────────────────────────────── */}
        {status === 'failed' && (
          <div style={{ textAlign: 'center', animation: 'fadeSlideUp 0.5s ease forwards' }}>
            <AlertTriangle size={80} color="var(--danger)" style={{ marginBottom: '1.5rem' }} />
            <h2 style={{ marginBottom: '1rem', color: 'var(--danger)' }}>Processing Failed</h2>
            <div style={{
              background: 'rgba(248, 81, 73, 0.1)',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--danger)',
              color: 'var(--text-main)',
              marginBottom: '2rem',
              textAlign: 'left'
            }}>
              <strong>Error Detail:</strong> {error}
            </div>
            <button className="btn-primary" onClick={() => navigate('/')} style={{ background: 'var(--danger)' }}>
              Upload New Dataset
            </button>
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin {
          0%   { transform: translate(-50%, -50%) rotate(0deg); }
          100% { transform: translate(-50%, -50%) rotate(360deg); }
        }
      ` }} />
    </div>
  );
};

export default ProcessingPage;
