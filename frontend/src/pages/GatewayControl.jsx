import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, RefreshCw, Play, Square, RotateCcw, Loader2, Search, ChevronDown } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import './gateway.css'

export default function GatewayControl() {
  const [status, setStatus] = useState(null)
  const [logs, setLogs] = useState([])
  const [totalLines, setTotalLines] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logLoading, setLogLoading] = useState(false)
  const [error, setError] = useState(null)

  // Controls
  const [actionLoading, setActionLoading] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null)
  const [feedback, setFeedback] = useState(null)

  // Logs
  const [live, setLive] = useState(false)
  const [level, setLevel] = useState('all')
  const [search, setSearch] = useState('')
  const [logLines, setLogLines] = useState(100)
  const logListRef = useRef(null)
  const eventSourceRef = useRef(null)
  const feedbackTimer = useRef(null)

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.gatewayStatus()
      setStatus(s)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadLogs = useCallback(async (lines) => {
    try {
      setLogLoading(true)
      const data = await api.gatewayLogs(lines || logLines, level, search)
      setLogs(data.logs || [])
      setTotalLines(data.total_lines || 0)
    } catch (e) {
      console.error('Failed to load logs:', e)
    } finally {
      setLogLoading(false)
    }
  }, [logLines, level, search])

  useEffect(() => { loadStatus() }, [])

  useEffect(() => {
    loadLogs()
  }, [level])

  // Auto-refresh status every 5 seconds
  useEffect(() => {
    const interval = setInterval(loadStatus, 5000)
    return () => clearInterval(interval)
  }, [loadStatus])

  // SSE live streaming
  useEffect(() => {
    if (live) {
      const levelParam = level !== 'all' ? `?level=${level}` : ''
      const es = new EventSource(`/api/gateway/logs/stream${levelParam}`)
      es.onmessage = (e) => {
        try {
          const entry = JSON.parse(e.data)
          setLogs(prev => [...prev.slice(-999), entry])
          // Auto-scroll
          if (logListRef.current) {
            logListRef.current.scrollTop = logListRef.current.scrollHeight
          }
        } catch {}
      }
      es.onerror = () => {
        setLive(false)
      }
      eventSourceRef.current = es
      return () => { es.close() }
    } else {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [live, level])

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 5000)
  }

  const handleAction = async (action) => {
    setConfirmAction(null)
    setActionLoading(action)
    try {
      let result
      if (action === 'restart') result = await api.gatewayRestart()
      else if (action === 'stop') result = await api.gatewayStop()
      else if (action === 'start') result = await api.gatewayStart()

      showFeedback(`Gateway ${action}ed successfully. State: ${result.new_state || 'unknown'}`, 'success')
      loadStatus()
    } catch (e) {
      showFeedback(`Failed to ${action}: ${e.message}`, 'error')
    } finally {
      setActionLoading(null)
    }
  }

  const isRunning = status?.state === 'running'
  const isStopped = status?.state === 'stopped' || status?.state === 'inactive'

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Activity size={28} />
        Gateway Control
        <Tooltip text="Control and monitor the Hermes gateway service. View real-time status, start/stop/restart the service, and stream live logs." />
        <button className="btn btn-sm" onClick={loadStatus} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {feedback && (
        <div className={`action-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {/* Section 1: Status */}
      <div className="gateway-status-card">
        <div className="gateway-status-header">
          <div>
            <h3 style={{ margin: 0, fontSize: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              Gateway Status
              <Tooltip text="Current state of the Hermes gateway systemd service. Running means the service is active and processing requests." />
            </h3>
          </div>
          <div className={`gateway-state-badge state-${status?.state || 'unknown'}`}>
            <span className="badge-dot" />
            {status?.state || 'Unknown'}
          </div>
        </div>

        <div className="gateway-metrics">
          <div className="gateway-metric">
            <div className="gateway-metric-value">{status?.pid || '—'}</div>
            <div className="gateway-metric-label">
              PID
              <Tooltip text="Process ID of the running gateway service." />
            </div>
          </div>
          <div className="gateway-metric">
            <div className="gateway-metric-value">{status?.memory_current_mb ?? '—'} MB</div>
            <div className="gateway-metric-label">
              Memory
              <Tooltip text="Current memory usage of the gateway process." />
            </div>
          </div>
          <div className="gateway-metric">
            <div className="gateway-metric-value">{status?.memory_peak_mb ?? '—'} MB</div>
            <div className="gateway-metric-label">
              Memory Peak
              <Tooltip text="Peak memory usage since the service started." />
            </div>
          </div>
          <div className="gateway-metric">
            <div className="gateway-metric-value">{status?.cpu_seconds ?? '—'}s</div>
            <div className="gateway-metric-label">
              CPU Time
              <Tooltip text="Total CPU time consumed by the gateway process." />
            </div>
          </div>
          <div className="gateway-metric">
            <div className="gateway-metric-value">{status?.tasks ?? '—'}</div>
            <div className="gateway-metric-label">
              Tasks
              <Tooltip text="Number of tasks/threads currently managed by the gateway." />
            </div>
          </div>
          <div className="gateway-metric">
            <div className="gateway-metric-value" style={{ fontSize: 14 }}>
              {status?.service_enabled ? 'Enabled' : 'Disabled'}
            </div>
            <div className="gateway-metric-label">
              Service
              <Tooltip text="Whether the gateway service is enabled for auto-start on boot." />
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Controls */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Controls
            <Tooltip text="Manage the gateway service. Restart reloads the service, Stop shuts it down, Start brings it back up." />
          </span>
        </div>
        <div className="gateway-controls">
          <button
            className="btn btn-restart"
            onClick={() => setConfirmAction('restart')}
            disabled={!isRunning || !!actionLoading}
          >
            {actionLoading === 'restart' ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
            Restart
          </button>
          <button
            className="btn btn-stop-gw"
            onClick={() => setConfirmAction('stop')}
            disabled={!isRunning || !!actionLoading}
          >
            {actionLoading === 'stop' ? <Loader2 size={14} className="spin" /> : <Square size={14} />}
            Stop
          </button>
          <button
            className="btn btn-start-gw"
            onClick={() => handleAction('start')}
            disabled={!isStopped || !!actionLoading}
          >
            {actionLoading === 'start' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            Start
          </button>
        </div>
      </div>

      {/* Section 3: Logs */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Logs
            <Tooltip text="Gateway log output. Use Live mode for real-time streaming. Filter by level or search within messages." />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {totalLines} total lines
          </span>
        </div>

        <div className="gateway-logs-header">
          <button
            className={`live-toggle ${live ? 'active' : ''}`}
            onClick={() => setLive(!live)}
          >
            <span className="live-dot" />
            {live ? 'Live' : 'Go Live'}
          </button>
          <select className="form-select" value={level} onChange={e => setLevel(e.target.value)} aria-label="Filter log level">
            <option value="all">All Levels</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              className="form-input"
              placeholder="Search logs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadLogs()}
              style={{ paddingLeft: 28, fontSize: 12, padding: '4px 8px 4px 28px' }}
              aria-label="Search logs"
            />
          </div>
          <button className="btn btn-sm" onClick={() => loadLogs()} disabled={logLoading} aria-label="Refresh logs">
            {logLoading ? <Loader2 size={12} className="spin" /> : <RefreshCw size={12} />}
          </button>
        </div>

        <div className="gateway-log-list" ref={logListRef}>
          {logs.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>No logs available</div>
          ) : (
            logs.map((entry, i) => (
              <div key={i} className="gateway-log-entry">
                {entry.timestamp && <span className="log-ts">{entry.timestamp.split(' ')[1]}</span>}
                <span className={`log-level-badge level-${entry.level}`}>{entry.level}</span>
                {entry.logger && <span className="log-logger">{entry.logger}</span>}
                <span className="log-msg">{entry.message}</span>
              </div>
            ))
          )}
        </div>

        {!live && logs.length > 0 && (
          <div className="load-more-btn">
            <button className="btn btn-sm" onClick={() => { setLogLines(prev => prev + 200); loadLogs(logLines + 200) }}>
              <ChevronDown size={14} /> Load More
            </button>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <ConfirmModal
          title={`Confirm ${confirmAction}`}
          message={`Are you sure you want to ${confirmAction} the Hermes gateway? ${confirmAction === 'stop' ? 'This will disconnect all platforms.' : 'This will briefly interrupt all active connections.'}`}
          onConfirm={() => handleAction(confirmAction)}
          onCancel={() => setConfirmAction(null)}
          loading={!!actionLoading}
        />
      )}
    </div>
  )
}
