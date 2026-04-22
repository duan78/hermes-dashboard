import { useState, useEffect } from 'react'
import { LayoutDashboard, Activity, Cpu, MessageSquare, Radio, RefreshCw, Package, ChevronDown, Loader2, RotateCcw, Database } from 'lucide-react'
import { useOverview, useLogs, useSystemMetrics, useHermesVersion, useHermesChangelog, useHermesUpdate } from '../hooks/useApi'
import Tooltip from '../components/Tooltip'
import { api } from '../api'
import './overview.css'

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return 'N/A'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function ProgressBar({ percent, color }) {
  return (
    <div style={{ background: 'var(--bg-tertiary)', borderRadius: 4, height: 6, overflow: 'hidden', width: '100%' }}>
      <div style={{
        background: color,
        height: '100%',
        width: `${Math.min(percent, 100)}%`,
        borderRadius: 4,
        transition: 'width 0.3s',
      }} />
    </div>
  )
}

function getCpuColor(pct) {
  if (pct < 50) return 'var(--success)'
  if (pct < 80) return 'var(--warning)'
  return 'var(--error)'
}

// ── Context Usage Card ──

function ContextUsageCard() {
  const [ctxData, setCtxData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.contextStatus().then(data => {
      setCtxData(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  if (loading || !ctxData) return null

  const contextLength = ctxData.context_length || 128000
  const compressionEnabled = ctxData.compression_enabled || false
  const estimatedTokens = ctxData.estimated_tokens || 0
  const events = ctxData.compression_events || []
  const usagePercent = ctxData.usage_percent || 0
  const color = usagePercent > 80 ? 'var(--error)' : usagePercent > 50 ? 'var(--warning)' : 'var(--success)'

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div className="card-header">
        <span className="card-title">
          <Database size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
          Context Usage
          <Tooltip text="Estimated context window usage based on conversation length. The context window limits how much conversation history the model can see at once. Compression summarizes old messages to stay within limits." />
        </span>
        <span className="badge badge-info" style={{ fontSize: 10 }}>
          {ctxData.model || 'unknown'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16, padding: '0 4px' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            Context Window
            <Tooltip text="Maximum tokens the model can process in a single conversation turn. Larger windows allow longer conversations." />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {(contextLength / 1000).toFixed(0)}K
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            Est. Usage
            <Tooltip text="Estimated context window usage based on conversation length." />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color }}>
            {usagePercent.toFixed(1)}%
          </div>
          <div style={{ marginTop: 4 }}>
            <ProgressBar percent={usagePercent} color={color} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
            ~{estimatedTokens.toLocaleString()} / {contextLength.toLocaleString()} tokens
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            Compression
            <Tooltip text="Whether automatic context compression is enabled. When context exceeds the threshold, older messages are summarized." />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            <span className={`badge ${compressionEnabled ? 'badge-success' : 'badge-warning'}`}>
              {compressionEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
            Compression Events
            <Tooltip text="Number of compression events recorded in log files." />
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {events.length}
          </div>
        </div>
      </div>
      {events.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Compression History
            <Tooltip text="Recent context compression events showing when conversations were summarized to save tokens." />
          </div>
          <div style={{ maxHeight: 150, overflow: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--bg-tertiary)' }}>
                  <th style={{ padding: '6px 10px', textAlign: 'left' }}>
                    Date
                    <Tooltip text="When the compression event occurred." />
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'center' }}>
                    Ratio
                    <Tooltip text="Compression ratio achieved. Lower values mean more aggressive compression." />
                  </th>
                  <th style={{ padding: '6px 10px', textAlign: 'center' }}>
                    Messages
                    <Tooltip text="Number of messages affected by this compression event." />
                  </th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 10).map((ev, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 10px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{ev.date || '-'}</td>
                    <td style={{ padding: '4px 10px', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{ev.ratio != null ? ev.ratio : '-'}</td>
                    <td style={{ padding: '4px 10px', textAlign: 'center' }}>{ev.messages_affected != null ? ev.messages_affected : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Overview() {
  const [showChangelog, setShowChangelog] = useState(false)
  const [updateFeedback, setUpdateFeedback] = useState(null)
  const [confirmUpdate, setConfirmUpdate] = useState(false)
  const [lastCheck, setLastCheck] = useState(null)

  const { data, loading: overviewLoading, error: overviewError, refetch: refetchOverview } = useOverview()
  const { data: logData } = useLogs(50)
  const { data: sysMetrics } = useSystemMetrics()
  const { data: versionInfo, refetch: refetchVersion } = useHermesVersion()
  const { data: changelog, refetch: refetchChangelog } = useHermesChangelog()
  const updateMutation = useHermesUpdate()

  const logs = logData?.logs || []

  const refresh = () => {
    refetchOverview()
  }

  const checkForUpdates = async () => {
    const result = await refetchVersion()
    if (result.data) setLastCheck(new Date().toISOString())
  }

  const doUpdate = async () => {
    setConfirmUpdate(false)
    setUpdateFeedback(null)
    try {
      const res = await updateMutation.mutateAsync()
      if (res.success) {
        setUpdateFeedback({ type: 'success', message: 'Update successful! Restart the gateway to apply changes.' })
        await refetchVersion()
      } else {
        setUpdateFeedback({ type: 'error', message: res.error || res.output || 'Update failed' })
      }
    } catch (e) {
      setUpdateFeedback({ type: 'error', message: e.message })
    }
  }

  const loadChangelog = () => {
    refetchChangelog()
  }

  if (overviewLoading) return <div className="spinner" />
  if (overviewError) return <div className="error-box">{overviewError}</div>
  if (!data) return null

  const gw = data.gateway || {}

  return (
    <div>
      <div className="page-title">
        <LayoutDashboard size={28} />
        Overview
        <Tooltip text="High-level status of your Hermes Agent: gateway health, active model, session count, installed skills, connected platforms, and system metrics." />
        <button className="btn btn-sm" onClick={refresh} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Row 1: Status bar */}
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
            <Tooltip text="How long the gateway has been running since last restart." />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Model
            <Tooltip text="The AI model currently active for all conversations." />
          </div>
          <div className="stat-value" style={{ fontSize: 18 }}>{data.model?.name || 'N/A'}</div>
          <div className="stat-detail">{data.model?.provider || ''}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Sessions
            <Tooltip text="Total number of conversation sessions across all platforms." />
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
            <Tooltip text="Installed skills extend Hermes capabilities. Active cron jobs are scheduled tasks that run automatically." />
          </div>
          <div className="stat-value">{data.skills_installed} / {data.cron_active}</div>
          <div className="stat-detail">Installed / Active</div>
        </div>
      </div>

      {/* Row 2: System Metrics */}
      {sysMetrics && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <div className="stat-label">
              CPU Usage
              <Tooltip text="Current CPU utilization percentage." />
            </div>
            <div className="stat-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: getCpuColor(sysMetrics.cpu_percent) }}>{sysMetrics.cpu_percent}%</span>
            </div>
            <div style={{ marginTop: 6 }}>
              <ProgressBar percent={sysMetrics.cpu_percent} color={getCpuColor(sysMetrics.cpu_percent)} />
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              RAM
              <Tooltip text="System memory usage." />
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {sysMetrics.ram_used_gb} / {sysMetrics.ram_total_gb} GB
            </div>
            <div style={{ marginTop: 6 }}>
              <ProgressBar percent={sysMetrics.ram_percent} color={sysMetrics.ram_percent < 70 ? 'var(--success)' : sysMetrics.ram_percent < 90 ? 'var(--warning)' : 'var(--error)'} />
              <div className="stat-detail">{sysMetrics.ram_percent}% used</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Disk
              <Tooltip text="Root filesystem disk usage." />
            </div>
            <div className="stat-value" style={{ fontSize: 20 }}>
              {sysMetrics.disk_used_gb} / {sysMetrics.disk_total_gb} GB
            </div>
            <div style={{ marginTop: 6 }}>
              <ProgressBar percent={sysMetrics.disk_percent} color={sysMetrics.disk_percent < 70 ? 'var(--success)' : sysMetrics.disk_percent < 90 ? 'var(--warning)' : 'var(--error)'} />
              <div className="stat-detail">{sysMetrics.disk_percent}% used</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Load Average
              <Tooltip text="System load averages over 1, 5, and 15 minutes." />
            </div>
            <div className="stat-value" style={{ fontSize: 16, fontFamily: 'var(--font-mono)' }}>
              {sysMetrics.load_avg[0]?.toFixed(2)}
            </div>
            <div className="stat-detail">
              1m / {sysMetrics.load_avg[1]?.toFixed(2)} / {sysMetrics.load_avg[2]?.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Context Usage Card */}
      <ContextUsageCard />

      {/* Row 3: Hermes Agent Version */}
      {versionInfo && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">
              <Package size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
              Hermes Agent
              <Tooltip text="Current Hermes Agent version and update status. Pull latest changes from git and reinstall dependencies. Gateway restart required after update." />
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              {lastCheck && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Last checked: {new Date(lastCheck).toLocaleTimeString()}
                </span>
              )}
              <button className="btn btn-sm" onClick={checkForUpdates} disabled={refetchVersion.isLoading} style={{ fontSize: 11 }}>
                <RefreshCw size={12} />
                {' '}Check Updates
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', padding: '0 4px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                {versionInfo.current_version || 'v?'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                {versionInfo.version_date && <span>Released {versionInfo.version_date}</span>}
                {versionInfo.python_version && (
                  <span style={{ marginLeft: 8 }}>Python {versionInfo.python_version}</span>
                )}
                {versionInfo.openai_sdk_version && (
                  <span style={{ marginLeft: 8 }}>OpenAI SDK {versionInfo.openai_sdk_version}</span>
                )}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              {versionInfo.update_available ? (
                <div>
                  <span className="badge badge-warning" style={{ fontSize: 13, padding: '6px 14px' }}>
                    {versionInfo.commits_behind} update{versionInfo.commits_behind === 1 ? '' : 's'} available
                  </span>
                  <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                    <button className="btn btn-sm" onClick={() => { setShowChangelog(!showChangelog); if (!changelog) loadChangelog() }} style={{ fontSize: 11 }}>
                      <ChevronDown size={12} /> {showChangelog ? 'Hide' : 'View'} Changelog
                    </button>
                    <button
                      className="btn btn-sm"
                      style={{ background: 'rgba(245,158,11,0.1)', borderColor: 'var(--warning)', color: '#d4a574' }}
                      onClick={() => setConfirmUpdate(true)}
                      disabled={updateMutation.isPending}
                    >
                      <RotateCcw size={12} />
                      {' '}Update Now
                      <Tooltip text="Pull latest changes from git and reinstall dependencies. Gateway restart required after update." />
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="badge badge-success" style={{ fontSize: 13, padding: '6px 14px' }}>
                    Up to date
                  </span>
                </div>
              )}

              {updateFeedback && (
                <div className={`action-feedback ${updateFeedback.type}`} style={{ marginTop: 12 }}>
                  {updateFeedback.message}
                </div>
              )}
            </div>
          </div>

          {/* Changelog */}
          {showChangelog && changelog && changelog.commits && changelog.commits.length > 0 && (
            <div style={{ marginTop: 16, maxHeight: 300, overflow: 'auto', background: 'var(--bg-primary)', borderRadius: 'var(--radius)', padding: 8 }}>
              {changelog.commits.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 12px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent)', flexShrink: 0 }}>{c.hash.slice(0, 7)}</span>
                  <span style={{ color: 'var(--text-secondary)' }}>{c.message}</span>
                </div>
              ))}
              {changelog.total_behind > 20 && (
                <div style={{ textAlign: 'center', padding: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                  ... and {changelog.total_behind - 20} more commits
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Update confirmation modal */}
      {confirmUpdate && (
        <div className="modal-overlay" onClick={() => setConfirmUpdate(false)} role="dialog" aria-modal="true">
          <div className="modal" onClick={e => e.stopPropagation()} onKeyDown={e => e.key === 'Escape' && setConfirmUpdate(false)}>
            <div className="modal-header">
              <h3>Confirm Hermes Agent Update</h3>
              <button className="btn btn-sm" onClick={() => setConfirmUpdate(false)} style={{ padding: '2px 8px' }} aria-label="Close">X</button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5, margin: '12px 0' }}>
              This will pull the latest changes from Git and reinstall Hermes dependencies.
              <br />
              <strong style={{ color: 'var(--warning)' }}>The Gateway must be restarted</strong> after the update for changes to take effect.
              <br />
              Continue?
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmUpdate(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={doUpdate} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
                {' '}Update Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Platforms */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">
            <Radio size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 8 }} />
            Platforms
            <Tooltip text="Communication platforms connected to Hermes." />
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
            <Tooltip text="Recent gateway log output." />
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
