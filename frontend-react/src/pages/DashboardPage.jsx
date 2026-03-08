import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getDashboardConfig } from '../services/api';
import InsightsPanel from '../components/InsightsPanel';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, AreaChart, Area 
} from 'recharts';
import { MessageSquare, Database } from 'lucide-react';

const COLORS = ['#58a6ff', '#bc8cff', '#3fb950', '#d29922', '#f85149'];

const DashboardPage = () => {
  const { datasetId } = useParams();
  const navigate = useNavigate();
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!datasetId) return;

    const fetchDashboard = async () => {
      try {
        console.log(`[FETCH] Loading dashboard for: ${datasetId}`);
        const config = await getDashboardConfig(datasetId);
        console.log(`[FETCH] Dashboard config retrieved:`, config);
        setDashboardData(config);
      } catch (err) {
        console.error("Dashboard Config Error:", err);
        setError("Failed to load dashboard configuration. This dataset might still be processing.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboard();
  }, [datasetId]);

  if (isLoading) {
    return (
      <div className="view-enter flex-center" style={{ minHeight: '60vh', flexDirection: 'column' }}>
        <div className="spinner" style={{
            width: '40px', height: '40px', 
            border: '4px solid rgba(88, 166, 255, 0.2)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
        }}></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Synchronizing workspace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="view-enter glass-panel" style={{ padding: '3rem', textAlign: 'center', marginTop: '4rem' }}>
        <h2 style={{ color: 'var(--warning)', marginBottom: '1rem' }}>Dataset Processing</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{error}</p>
        <button className="btn-primary" onClick={() => navigate('/datasets')}>Go to Workspace</button>
      </div>
    );
  }

  const renderKPIs = () => {
    if (!dashboardData?.kpis) return null;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {dashboardData.kpis.map((kpi, idx) => (
          <div key={idx} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{kpi.label}</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '2rem', margin: 0 }}>{kpi.value}</h2>
              {kpi.trend && (
                <span style={{ fontSize: '0.85rem', color: kpi.trend > 0 ? 'var(--success)' : 'var(--danger)' }}>
                   {kpi.trend > 0 ? '+' : ''}{kpi.trend}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderChart = (chartConfig) => {
    const data = chartConfig.data || [];
    const xKey = chartConfig.x;
    const yKey = chartConfig.y;
    const isHorizontal = chartConfig.horizontal === true;

    const ChartWrapper = ({ children }) => (
      <div className="glass-panel" style={{ padding: '1.5rem', height: '400px', display: 'flex', flexDirection: 'column' }}>
        <h4 style={{ marginBottom: '1.5rem', color: 'var(--text-main)', fontWeight: 600 }}>{chartConfig.title}</h4>
        <div style={{ flexGrow: 1, width: '100%' }}>
          {children}
        </div>
      </div>
    );

    if (!data || data.length === 0) return null;

    const tooltipStyle = { backgroundColor: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '8px' };
    const gridStyle = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.05)' };

    switch (chartConfig.type) {
      case 'bar':
        return (
          <ChartWrapper key={chartConfig.id}>
            <ResponsiveContainer>
              <BarChart data={data} layout={isHorizontal ? 'vertical' : 'horizontal'}>
                <CartesianGrid {...gridStyle} />
                {isHorizontal ? (
                  <>
                    <YAxis dataKey={xKey} type="category" stroke="var(--text-muted)" fontSize={11} width={100} />
                    <XAxis type="number" stroke="var(--text-muted)" fontSize={11} />
                  </>
                ) : (
                  <>
                    <XAxis dataKey={xKey} stroke="var(--text-muted)" fontSize={11} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} />
                  </>
                )}
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey={yKey} radius={isHorizontal ? [0,4,4,0] : [4,4,0,0]}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartWrapper>
        );
      case 'line':
        return (
          <ChartWrapper key={chartConfig.id}>
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey={xKey} stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line type="monotone" dataKey={yKey} stroke="var(--accent)" strokeWidth={3} dot={{ r: 4, fill: 'var(--accent)' }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartWrapper>
        );
      case 'area':
        return (
          <ChartWrapper key={chartConfig.id}>
            <ResponsiveContainer>
              <AreaChart data={data}>
                <defs>
                  <linearGradient id={`grad-${chartConfig.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...gridStyle} />
                <XAxis dataKey={xKey} stroke="var(--text-muted)" fontSize={11} />
                <YAxis stroke="var(--text-muted)" fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey={yKey} stroke="var(--primary)" strokeWidth={2}
                  fill={`url(#grad-${chartConfig.id})`} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartWrapper>
        );
      case 'pie':
        return (
          <ChartWrapper key={chartConfig.id}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data} dataKey={yKey} nameKey={xKey} cx="50%" cy="50%"
                  outerRadius={110} innerRadius={40}
                  label={({ name, percent }) => `${String(name).slice(0,12)} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}>
                  {data.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartWrapper>
        );
      default:
        return null;
    }
  };

  return (
    <div className="view-enter">
      <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Intelligence Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Database size={16} /> {datasetId}
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
            <button 
                className="btn-primary" 
                onClick={() => navigate(`/chat/${datasetId}`)}
                style={{ background: 'rgba(188, 140, 255, 0.1)', color: 'var(--accent)', border: '1px solid rgba(188, 140, 255, 0.2)', boxShadow: 'none' }}
            >
                <MessageSquare size={18} />
                AI Assistant
            </button>
        </div>
      </header>

      {renderKPIs()}

      {dashboardData && (
        <>
          <InsightsPanel 
            summary={dashboardData.executive_summary} 
            insights={dashboardData.insights} 
          />
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(500px, 1fr))', gap: '2rem', marginTop: '2rem' }}>
            {dashboardData.charts?.map(chart => renderChart(chart))}
          </div>
        </>
      )}
    </div>
  );
};

export default DashboardPage;
