import { useState, useEffect } from 'react'
import { LayoutDashboard, Activity, Cpu, MessageSquare, BookOpen, Clock, Radio, RefreshCw } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

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
        <Tooltip text="High-level status of your Hermes Agent: gateway health, active model, session count, installed skills, and connected platforms." />
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Status bar */}
      <div className="grid grid-4" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">
            Gateway
            <Tooltip text="The Hermes Agent gateway process that handles all AI interactions, tool execution, and platform connections. Running = active and accepting requests." />
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>
            <span className={`badge ${gw.state === 'running' ? 'badge-success' : 'badge-error'}`}>
              <span className="badge-dot" />
              {gw.state || 'Unknown'}
            </span>
          </div>
          <div className="stat-detail">
            Uptime: {formatUptime(data.uptime_seconds)}
            <Tooltip text="How long the gateway has been running since last restart. If uptime is short, the gateway may have recently restarted." />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Model
            <Tooltip text="The AI model currently active for all conversations. Configured in the Configuration page under Model settings." />
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>{data.model?.name || 'N/A'}</div>
          <div className="stat-detail">{data.model?.provider || ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Sessions
            <Tooltip text="Total number of conversation sessions. Each session represents a separate conversation thread across all platforms (CLI, Telegram, Discord, etc.)." />
          </div>
          <div className="stat-value">{data.sessions?.total || 0}</div>
          <div className="stat-detail">
            <MessageSquare size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            {data.sessions?.messages || 0} messages
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Skills / Cron
            <Tooltip text="Installed skills extend Hermes capabilities (coding, web search, etc.). Active cron jobs are scheduled tasks that run automatically at defined times." />
          </div>
          <div className="stat-value">{data.skills_installed} / {data.cron_active}</div>
          <div className="stat-detail">Installed / Active</div>
        </div>
      </div>

      {/* Platforms */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <Radio size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Platforms
            <Tooltip text="Communication platforms connected to Hermes. Each platform (CLI, Telegram, Discord, WhatsApp) can send and receive messages through the agent." />
          </span>
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
          <span className="card-title">
            <Activity size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Recent Logs
            <Tooltip text="Recent gateway log output showing agent activity, errors, and system events. Useful for debugging issues and monitoring agent behavior." />
          </span>
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
