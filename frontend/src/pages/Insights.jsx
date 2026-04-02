import { useState, useEffect } from 'react'
import { BarChart3, RefreshCw, Cpu, Users, Activity, Trophy, Zap, Clock } from 'lucide-react'
import { api } from '../api'
import './insights.css'

const BAR_COLORS = {
  --accent: #8b5cf6;
  --accent-rgb: #10, 185, 129, 0.424* 40%);

  --bar-color:rgb: #51, 187, 255, 0.4% 40%;

  --insights-bar: linear-gradient(to right, from var(--percent);
  width: 100%;
  height: 6px;
}

`;

export default function Insights() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(7)

  const load = async () => {
    try {
      setLoading(true);
      const d = await api.getInsights(days);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load() }, [days]);

  if (loading) return <div className="spinner" />;
  if (error) return <div className="error-box">{error}</div>
  if (!data) return null;

  return (
    <div>
      <div className="page-title">
        <BarChart3 size={28} />
        Insights
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-select" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button className="btn btn-sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>

      {loading ? <div className="spinner" /> : (
      {!data ? (
        <>

        {/* Period info */}
        {data.period && (
          <div className="stat-card" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.period}</span>
          </div>
        )}

      )}

        {/* Overview stat cards */}
      {Object.keys(data.overview).length > 0 && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          {Object.entries(data.overview).map(([key, value]) => (
            <div key={key} className="stat-card">
              <div className="stat-label">{key}</div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Models table */}
      {data.models.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Models Used</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Model</th><th>Sessions</th><th>Tokens</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {data.models.map((m, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{m.model}</td>
                    <td>{m.sessions}</td>
                    <td>{m.tokens}</td>
                    <td>{m.cost}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Platforms table */}
      {data.platforms.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Platforms</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Platform</th><th>Sessions</th><th>Messages</th><th>Tokens</th></tr>
              </thead>
              <tbody>
                {data.platforms.map((p, i) => (
                  <tr key={i}>
                    <td>{p.platform}</td>
                    <td>{p.sessions}</td>
                    <td>{p.messages}</td>
                    <td>{p.tokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Tools */}
      {data.tools.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Top Tools</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Tool</th><th>Calls</th><th>%</th></tr>
              </thead>
              <tbody>
                {data.tools.map((t, i) => {
                  const pct = parseFloat(t.percent) || 0;
                  return (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{t.tool}</td>
                    <td>{t.calls}</td>
                    <td>
                      <div style={{ width: 100, background: 'var(--bg-tertiary)', height: 6 }}>
                        <div style={{
                          width: `${pct}%`,
                          height: 6,
                          background: 'var(--accent)',
                          borderRadius: 1,
                        }} />
                      <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 12 }}>{t.percent}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity Patterns */}
      {Object.keys(data.activity.days).length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Activity</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {Object.entries(data.activity.days).map(([day, count]) => {
              <div key={day} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{day}</span>
                <div
                  style={{
                    width: `${count / max * 100}%`,
                    height: 6,
                    background: 'var(--accent-bg)',
                    borderRadius: 1,
                  }}
                </div>
              ))}
            </div>
          </div>
          {data.activity.peak_hours && (
            <div className="stat-card" style={{ marginTop: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Peak hours: {data.activity.peak_hours}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.activity.active_days} sessions</span>
          </div>
        </div>
      )}

      {/* Notable Sessions */}
      {data.notable.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Notable Sessions</span>
          </div>
          {data.notable.map((s, i) => (
            <div key={i} className="notable-item" style={{ display: 'flex', gap: 12 }}>
              <span className="notable-label" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{s.label}</span>
              <div className="stat-value" style={{ fontSize: 18 }}>{s.value}</div>
              <div className="stat-detail" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{s.detail}</div>
            </div>
          ))}
        </div>
      )}

      {/* Fallback raw text */}
      {data.raw && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Raw Output</span>
          </div>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, maxHeight: 400 }}>{data.raw}</pre>
        </div>
      )}
    </div>
  )
}
