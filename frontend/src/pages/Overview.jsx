import { useState, useEffect } from 'react'
import { LayoutDashboard, Activity, Cpu, MessageSquare, BookOpen, Clock, Radio, RefreshCw } from 'lucide-react'
import { api } from '../api'

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return 'N/A'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function Overview() {
  const [data, setData] = useState(null)
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const [overview, logData] = await Promise.all([
        api.getOverview(),
        api.getLogs(50),
      ])
      setData(overview)
      setLogs(logData.logs || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading && !data) return <div className="spinner" />
  if (error) return <div className="error-box">{error}</div>
  if (!data) return null

  const gw = data.gateway || {}

  return (
    <div>
      <div className="page-title">
        <LayoutDashboard size={28} />
        Overview
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Status bar */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Gateway</div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            <span className={`badge ${gw.state === 'running' ? 'badge-success' : 'badge-error'}`}>
              <span className="badge-dot" />
              {gw.state || 'Unknown'}
            </span>
          </div>
          <div className="stat-detail">Uptime: {formatUptime(data.uptime_seconds)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Model</div>
          <div className="stat-value" style={{ fontSize: 18 }}>{data.model?.name || 'N/A'}</div>
          <div className="stat-detail">{data.model?.provider || ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Sessions</div>
          <div className="stat-value">{data.sessions?.total || 0}</div>
          <div className="stat-detail">Total</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Skills / Cron</div>
          <div className="stat-value">{data.skills_installed} / {data.cron_active}</div>
          <div className="stat-detail">Installed / Active</div>
        </div>
      </div>

      {/* Platforms */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Radio size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Platforms</span>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {Object.entries(data.platforms || {}).map(([name, state]) => (
            <span key={name} className={`badge ${state === 'connected' ? 'badge-success' : 'badge-warning'}`}>
              <span className="badge-dot" />
              {name}: {state}
            </span>
          ))}
          {Object.keys(data.platforms || {}).length === 0 && (
            <span className="badge badge-warning">No active platforms</span>
          )}
        </div>
      </div>

      {/* Recent Logs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><Activity size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />Recent Logs</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{logs.length} lines</span>
        </div>
        <div className="log-viewer">
          {logs.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>No logs available</div>
          ) : (
            logs.map((line, i) => (
              <div key={i} className="log-line">{line}</div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
