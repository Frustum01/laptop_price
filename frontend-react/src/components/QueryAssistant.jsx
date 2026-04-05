import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader, AlertTriangle, CheckCircle, XCircle, Database } from 'lucide-react';
import { askQuery, previewOperation, executeDataWrite } from '../services/api';

// ── Write-intent detection ───────────────────────────────────────────────────
// Returns null for read queries, or { operation_type, column, condition, new_value, method, value }
// Covers many natural-language phrasings so users don't need to follow a rigid syntax.

const WRITE_PATTERNS = [
  // UPDATE — "update/change/set COLUMN to VALUE where CONDITION"
  {
    op: 'update',
    re: /(?:update|set|change|replace)\s+(?:the\s+)?(\w[\w\s]*?)\s+(?:to|with|as)\s+([^\s][\w\s.,-]*?)(?:\s+where\s+(.+))?$/i,
    extract: (m) => ({ column: m[1].trim(), new_value: m[2].trim(), condition: m[3]?.trim() || '' }),
  },
  // UPDATE alt — "where/for CONDITION set/change COLUMN to VALUE"
  {
    op: 'update',
    re: /(?:where|for)\s+(.+?)\s+(?:set|change|update)\s+([^\s][\w\s]*?)\s+to\s+(.+)/i,
    extract: (m) => ({ condition: m[1].trim(), column: m[2].trim(), new_value: m[3].trim() }),
  },

  // DELETE — must say "rows" explicitly to avoid false positives
  {
    op: 'delete',
    re: /(?:delete|remove|drop)\s+(?:all\s+)?rows?\s+(?:where\s+|that\s+have\s+|where\s+the\s+)?(.+)/i,
    extract: (m) => ({ condition: m[1].trim() }),
  },

  // ── FILL NULL patterns — covers many phrasings ────────────────────────────

  // Standard: "fill null(s) in COLUMN with VALUE/METHOD"
  //           "fill missing in COLUMN with VALUE"
  {
    op: 'fill_null',
    re: /(?:fill|impute)\s+(?:null|missing|nan|empty|na)\s*(?:values?\s+)?(?:in\s+)?(['"]?\w[\w\s]*['"]?)(?:\s+with\s+(.+))?/i,
    extract: (m) => {
      const col = m[1].trim().replace(/['"]/g, '');
      const raw = (m[2] || 'mean').trim().toLowerCase().replace(/^['"]|['"]$/g, '');
      const method = ['mean', 'median', 'mode'].includes(raw) ? raw : 'value';
      return { column: col, method, value: method === 'value' ? raw : '' };
    },
  },

  // Reversed: "fill VALUE inplace of / for / instead of null in COLUMN"
  //            "put VALUE inplace of null in COLUMN"
  //            "fill no inplace of null in gender column"  ← user's exact phrase
  {
    op: 'fill_null',
    re: /(?:fill|put|use|set)\s+(['"]?[\w.]+['"]?)\s+(?:inplace\s+of|in\s+place\s+of|instead\s+of|for|where|when)\s+(?:null|missing|nan|empty|na)\s*(?:values?\s+)?(?:in\s+|on\s+|for\s+)?(['"]?\w[\w\s]*['"]?)/i,
    extract: (m) => {
      const val = m[1].trim().replace(/['"]/g, '');
      const col = m[2].trim().replace(/['"]/g, '');
      const method = ['mean', 'median', 'mode'].includes(val.toLowerCase()) ? val.toLowerCase() : 'value';
      return { column: col, method, value: method === 'value' ? val : '' };
    },
  },

  // "replace null with VALUE in COLUMN"
  // "replace missing values in COLUMN with VALUE"
  {
    op: 'fill_null',
    re: /(?:replace|fix|change|convert)\s+(?:null|missing|nan|empty|na)\s*(?:values?\s+)?(?:in\s+)?(['"]?\w[\w\s]*['"]?)\s+with\s+(.+)/i,
    extract: (m) => {
      const col = m[1].trim().replace(/['"]/g, '');
      const raw = m[2].trim().toLowerCase().replace(/^['"]|['"]$/g, '');
      const method = ['mean', 'median', 'mode'].includes(raw) ? raw : 'value';
      return { column: col, method, value: method === 'value' ? raw : '' };
    },
  },

  // "COLUMN null fill with VALUE" / "COLUMN missing replace VALUE"
  {
    op: 'fill_null',
    re: /(['"]?\w[\w\s]*['"]?)\s+(?:null|missing|nan)\s+(?:fill|replace|set|change)\s+(?:with\s+)?(.+)/i,
    extract: (m) => {
      const col = m[1].trim().replace(/['"]/g, '');
      const raw = m[2].trim().toLowerCase().replace(/^['"]|['"]$/g, '');
      const method = ['mean', 'median', 'mode'].includes(raw) ? raw : 'value';
      return { column: col, method, value: method === 'value' ? raw : '' };
    },
  },
];

function detectWriteIntent(question) {
  const q = question.trim();
  for (const { op, re, extract } of WRITE_PATTERNS) {
    const m = q.match(re);
    if (m) {
      return { operation_type: op, ...extract(m) };
    }
  }
  return null;
}

// ── Confirmation Card Component ───────────────────────────────────────────────

const ConfirmCard = ({ previewData, onConfirm, onCancel, isExecuting }) => {
  const { operation_type, column, condition, new_value, method, value, preview_count, total_rows } = previewData;
  const count = preview_count ?? 0;

  const opLabel = { update: 'UPDATE', delete: 'DELETE ROWS', fill_null: 'FILL NULLS' }[operation_type] || operation_type.toUpperCase();
  const opColor = operation_type === 'delete' ? 'var(--danger)' : 'var(--warning)';
  const bgColor = operation_type === 'delete' ? 'rgba(248,81,73,0.08)' : 'rgba(210,153,34,0.08)';

  const rows = [
    ['Operation', opLabel],
    column    && ['Column',      column],
    condition && ['Condition',   condition],
    new_value && ['New Value',   new_value],
    method && method !== 'value' && ['Fill Method', method],
    value     && ['Fill Value',  value],
    ['Rows Affected', count >= 0
      ? `${count.toLocaleString()} of ${(total_rows || 0).toLocaleString()} rows`
      : 'Unknown'],
  ].filter(Boolean);

  return (
    <div style={{
      background: bgColor,
      border: `1px solid ${opColor}`,
      borderRadius: '12px',
      padding: '1.25rem 1.4rem',
      maxWidth: '480px',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.9rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <AlertTriangle size={18} color={opColor} />
        <span style={{ fontWeight: 700, color: opColor, fontSize: '0.95rem', letterSpacing: '0.02em' }}>
          Confirm Data Change
        </span>
      </div>

      <div style={{
        background: 'rgba(0,0,0,0.25)',
        borderRadius: '8px',
        padding: '0.75rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}>
        {rows.map(([label, val]) => (
          <div key={label} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.85rem', alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--text-muted)', minWidth: '96px', flexShrink: 0 }}>{label}</span>
            <span style={{ color: 'var(--text-main)', fontFamily: 'monospace', wordBreak: 'break-all' }}>{val}</span>
          </div>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        ⚠️ This will permanently modify the dataset on disk. Are you sure?
      </p>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          id="confirm-data-change-btn"
          onClick={onConfirm}
          disabled={isExecuting}
          style={{
            flex: 1, padding: '0.6rem 1rem',
            background: 'rgba(63,185,80,0.15)', border: '1px solid var(--success)',
            color: 'var(--success)', borderRadius: '8px',
            cursor: isExecuting ? 'wait' : 'pointer', fontWeight: 600, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => { if (!isExecuting) e.currentTarget.style.background = 'rgba(63,185,80,0.28)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(63,185,80,0.15)'; }}
        >
          {isExecuting
            ? <><Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> Applying…</>
            : <><CheckCircle size={14} /> Yes, apply changes</>}
        </button>
        <button
          id="cancel-data-change-btn"
          onClick={onCancel}
          disabled={isExecuting}
          style={{
            flex: 1, padding: '0.6rem 1rem',
            background: 'rgba(248,81,73,0.1)', border: '1px solid var(--danger)',
            color: 'var(--danger)', borderRadius: '8px',
            cursor: isExecuting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
            transition: 'background 0.2s',
          }}
          onMouseEnter={e => { if (!isExecuting) e.currentTarget.style.background = 'rgba(248,81,73,0.22)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(248,81,73,0.1)'; }}
        >
          <XCircle size={14} /> Cancel
        </button>
      </div>
    </div>
  );
};

// ── Result Badge ───────────────────────────────────────────────────────────────

const ResultBadge = ({ result, operationType }) => {
  if (!result) return null;
  const r = result?.data?.result || {};
  const lines = [];

  if (operationType === 'update' && r.rows_updated !== undefined) {
    lines.push(`✅ Updated ${r.rows_updated.toLocaleString()} row(s) in column "${r.column}"`);
  } else if (operationType === 'delete' && r.rows_deleted !== undefined) {
    lines.push(`✅ Deleted ${r.rows_deleted.toLocaleString()} row(s)`);
    lines.push(`   ${r.rows_remaining.toLocaleString()} rows remaining`);
  } else if (operationType === 'fill_null' && r.filled !== undefined) {
    lines.push(`✅ Filled ${r.filled.toLocaleString()} null(s) in "${r.column}" using ${r.method}${r.fill_value ? ` → "${r.fill_value}"` : ''}`);
    if (r.remaining_nulls > 0) lines.push(`   ${r.remaining_nulls} null(s) still remain`);
    else lines.push(`   No nulls remain in this column.`);
  } else {
    lines.push('✅ Operation completed successfully');
  }

  return (
    <div style={{
      background: 'rgba(63,185,80,0.1)',
      border: '1px solid var(--success)',
      borderRadius: '10px',
      padding: '0.85rem 1.1rem',
      maxWidth: '440px',
    }}>
      {lines.map((l, i) => (
        <p key={i} style={{ margin: 0, fontSize: '0.88rem', color: i === 0 ? 'var(--success)' : 'var(--text-muted)', fontFamily: 'monospace' }}>{l}</p>
      ))}
    </div>
  );
};

// ── Main QueryAssistant Component ─────────────────────────────────────────────

const QueryAssistant = ({ datasetId }) => {
  const [messages, setMessages] = useState([
    {
      role: 'system',
      content: 'Hello! I\'m your AI data assistant.\n\nAsk me questions about your data, or use natural language to modify it:\n• "How many nulls in the Gender column?"\n• "Fill no inplace of null in gender column"\n• "Update price to 45000 where Company == Dell"\n• "Delete rows where RAM == 4 GB"',
    },
  ]);
  const [input, setInput]         = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef                 = useRef(null);

  const [pendingOp, setPendingOp]     = useState(null);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pendingOp]);

  const addMessage = useCallback((msg) => setMessages(prev => [...prev, msg]), []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || !datasetId || isLoading || pendingOp) return;

    const userMsg = input.trim();
    setInput('');
    addMessage({ role: 'user', content: userMsg });
    setIsLoading(true);

    try {
      const intent = detectWriteIntent(userMsg);

      if (intent) {
        // Write path — show preview then confirmation card
        addMessage({ role: 'system', content: '🔍 Analysing your request…', isTemp: true });
        try {
          const previewRes  = await previewOperation(datasetId, intent);
          const previewData = { ...intent, ...(previewRes?.data?.result || {}) };
          setMessages(prev => prev.filter(m => !m.isTemp));
          setPendingOp({ intent, previewData });
        } catch (prevErr) {
          setMessages(prev => prev.filter(m => !m.isTemp));
          addMessage({
            role: 'system',
            content: `⚠️ Could not preview operation: ${prevErr.response?.data?.message || prevErr.message}. Please check your syntax and try again.`,
          });
        }
      } else {
        // Read path — RAG / code execution
        const response = await askQuery(datasetId, userMsg);
        
        if (response?.intent === 'requires_confirmation' && response?.previewData) {
          const previewData = response.previewData;
          addMessage({ role: 'system', content: '🔍 Analysing your request…', isTemp: true });
          try {
            const previewRes  = await previewOperation(datasetId, previewData);
            const finalPreview = { ...previewData, ...(previewRes?.data?.result || {}) };
            setMessages(prev => prev.filter(m => !m.isTemp));
            setPendingOp({ intent: previewData, previewData: finalPreview });
          } catch (prevErr) {
            setMessages(prev => prev.filter(m => !m.isTemp));
            addMessage({
              role: 'system',
              content: `⚠️ Could not preview operation: ${prevErr.response?.data?.message || prevErr.message}.`,
            });
          }
          return;
        }

        const answer   = response?.answer || "I'm sorry, I couldn't compute an answer for that.";
        addMessage({
          role: 'system',
          content: answer,
          intent: response?.intent,
          confidence: response?.confidence,
        });
      }
    } catch (err) {
      console.error(err);
      addMessage({
        role: 'system',
        content: 'Error connecting to the Semantic Query Engine. ' + (err.response?.data?.message || ''),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!pendingOp) return;
    setIsExecuting(true);
    const { intent } = pendingOp;
    // LLMs sometimes put the fill value in new_value instead of value
    const fillValue = intent.value || intent.new_value || '';
    try {
      const result = await executeDataWrite(datasetId, intent.operation_type, {
        column:    intent.column,
        condition: intent.condition,
        new_value: intent.new_value,
        method:    intent.method,
        value:     intent.operation_type === 'fill_null' ? fillValue : intent.value,
      });
      setPendingOp(null);
      addMessage({ role: 'system', content: '__result__', resultData: result, operationType: intent.operation_type });
    } catch (err) {
      setPendingOp(null);
      addMessage({ role: 'system', content: `❌ Operation failed: ${err.response?.data?.message || err.message}` });
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancel = () => {
    setPendingOp(null);
    addMessage({ role: 'system', content: '🚫 Operation cancelled. Your dataset was not changed.' });
  };

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '500px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Bot color="var(--secondary)" />
        <h3 style={{ margin: 0 }}>Semantic Insight Assistant</h3>
        {pendingOp && (
          <span style={{
            marginLeft: 'auto', fontSize: '0.75rem',
            background: 'rgba(210,153,34,0.15)', color: 'var(--warning)',
            border: '1px solid var(--warning)', padding: '0.2rem 0.6rem',
            borderRadius: '999px', fontWeight: 600,
          }}>
            ⚠️ Pending confirmation
          </span>
        )}
      </div>

      {/* Messages */}
      <div style={{ flexGrow: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.map((msg, idx) => (
          <div key={idx} style={{
            display: 'flex', gap: '1rem', alignItems: 'flex-start',
            flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
          }}>
            <div style={{
              background: msg.role === 'user' ? 'rgba(88,166,255,0.2)' : 'rgba(0,0,0,0.3)',
              padding: '0.6rem', borderRadius: '50%', flexShrink: 0,
            }}>
              {msg.role === 'user' ? <User size={18} color="var(--primary)" /> : <Bot size={18} color="var(--accent)" />}
            </div>

            {msg.content === '__result__' ? (
              <ResultBadge result={msg.resultData} operationType={msg.operationType} />
            ) : (
              <div style={{
                background: msg.role === 'user' ? 'rgba(31,111,235,0.2)' : 'rgba(0,0,0,0.2)',
                padding: '1rem 1.25rem', borderRadius: '12px',
                borderTopRightRadius: msg.role === 'user' ? '4px' : '12px',
                borderTopLeftRadius:  msg.role === 'system' ? '4px' : '12px',
                maxWidth: '80%',
                border: `1px solid ${msg.role === 'user' ? 'rgba(88,166,255,0.3)' : 'var(--border-color)'}`,
              }}>
                <p style={{ margin: 0, whiteSpace: 'pre-wrap', opacity: msg.isTemp ? 0.6 : 1 }}>{msg.content}</p>
                {msg.intent && msg.intent !== 'rejected' && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
                    <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                      Intent: {msg.intent}
                    </span>
                    <span style={{ background: 'rgba(255,255,255,0.05)', padding: '0.1rem 0.4rem', borderRadius: '4px' }}>
                      Confidence: {msg.confidence}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Confirmation Card */}
        {pendingOp && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem', borderRadius: '50%', flexShrink: 0 }}>
              <Database size={18} color="var(--warning)" />
            </div>
            <ConfirmCard
              previewData={pendingOp.previewData}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              isExecuting={isExecuting}
            />
          </div>
        )}

        {isLoading && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', color: 'var(--text-muted)' }}>
            <Loader size={18} style={{ animation: 'spin 1.5s linear infinite' }} />
            <span style={{ fontSize: '0.9rem' }}>Analyzing records…</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '1rem', borderTop: '1px solid var(--border-color)' }}>
        {pendingOp && (
          <p style={{ margin: '0 0 0.6rem', fontSize: '0.78rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={12} /> Please confirm or cancel the pending operation before sending a new message.
          </p>
        )}
        <form onSubmit={handleSend} style={{ display: 'flex', gap: '1rem' }}>
          <input
            id="chat-query-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              pendingOp
                ? 'Confirm or cancel above first…'
                : 'Ask a question or say "fill no inplace of null in gender column"…'
            }
            style={{
              flexGrow: 1, background: 'rgba(0,0,0,0.2)',
              border: `1px solid ${pendingOp ? 'var(--warning)' : 'var(--border-color)'}`,
              padding: '1rem', borderRadius: '8px', color: '#fff',
              fontSize: '1rem', outline: 'none', opacity: pendingOp ? 0.6 : 1,
            }}
            disabled={isLoading || !!pendingOp}
          />
          <button
            id="chat-send-btn"
            type="submit"
            className="btn-primary"
            disabled={!input.trim() || isLoading || !!pendingOp}
            style={{ padding: '0 1.5rem' }}
          >
            <Send size={18} />
          </button>
        </form>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        #chat-query-input:focus {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px rgba(88, 166, 255, 0.2);
        }
        @keyframes spin {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      ` }} />
    </div>
  );
};

export default QueryAssistant;
