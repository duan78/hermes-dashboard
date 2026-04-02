import { useState, useEffect } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { api } from '../api'
import './insights.css'

export default function Insights() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(7)

  const load = async () => {
    try {
      setLoading(true)
      const d = await api.getInsights(days)
      setData(d)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  if (loading) return <div className="spinner" />
  if (error) return <div className="error-box">{error}</div>
  if (!data) return null

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

      {/* Period info */}
      {data.period && (
        <div className="insights-period">{data.period}</div>
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

      {/* Models Used */}
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
                    <td className="mono-sm">{m.model}</td>
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

      {/* Platforms */}
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
                <tr><th>Tool</th><th>Calls</th><th>Usage</th></tr>
              </thead>
              <tbody>
                {data.tools.map((t, i) => {
                  const pct = parseFloat(t.percent) || 0
                  return (
                    <tr key={i}>
                      <td className="mono-sm">{t.tool}</td>
                      <td>{t.calls}</td>
                      <td>
                        <div className="progress-row">
                          <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="progress-label">{t.percent}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
          <div className="activity-chart">
            {Object.entries(data.activity.days).map(([day, count]) => {
              const max = Math.max(...Object.values(data.activity.days))
              return (
                <div key={day} className="activity-bar-col">
                  <div className="activity-bar-count">{count}</div>
                  <div className="activity-bar-track">
                    <div
                      className="activity-bar-fill"
                      style={{ height: max > 0 ? `${(count / max) * 100}%` : '0%' }}
                    />
                  </div>
                  <div className="activity-bar-label">{day}</div>
                </div>
              )
            })}
          </div>
          <div className="activity-meta">
            {data.activity.peak_hours && (
              <span>Peak hours: {data.activity.peak_hours}</span>
            )}
            {data.activity.active_days > 0 && (
              <span>Active days: {data.activity.active_days}</span>
            )}
          </div>
        </div>
      )}

      {/* Notable Sessions */}
      {data.notable.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Notable Sessions</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Metric</th><th>Value</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {data.notable.map((s, i) => (
                  <tr key={i}>
                    <td className="fw-600">{s.label}</td>
                    <td className="mono-sm">{s.value}</td>
                    <td className="mono-xs text-muted">{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw Output fallback */}
      {data.raw && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Raw Output</span>
          </div>
          <pre className="raw-output">{data.raw}</pre>
        </div>
      )}
    </div>
  )
}
