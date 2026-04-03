import { useState, useEffect } from 'react'
import { Radio, RefreshCw, Wifi, WifiOff, Users, Key, Check, X, Loader2, Settings, Eye, EyeOff, Save } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

function ConfigureModal({ platform, envVars, onClose, onSave }) {
  const [formValues, setFormValues] = useState({})
  const [revealed, setRevealed] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    // Initialize form values
    const init = {}
    for (const v of envVars) {
      init[v.key] = ''
    }
    setFormValues(init)
    setRevealed({})
    setSaved(false)
    setError(null)
  }, [platform, envVars])

  const handleSave = async () => {
    // Only include non-empty values
    const vars = {}
    for (const v of envVars) {
      if (formValues[v.key]) {
        vars[v.key] = formValues[v.key]
      }
    }
    if (Object.keys(vars).length === 0) {
      setError('Please fill in at least one value')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(platform, vars)
      setSaved(true)
      setTimeout(() => onClose(), 1200)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={18} />
            Configure {platform.charAt(0).toUpperCase() + platform.slice(1).replace('_', ' ')}
          </h3>
          <button className="btn btn-sm" onClick={onClose} style={{ padding: '2px 8px' }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 0' }}>
          {envVars.map(v => (
            <div key={v.key} style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                {v.label}
                {v.is_set && <span className="badge badge-success" style={{ marginLeft: 8, fontSize: 10 }}>Set</span>}
              </label>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{v.description}</div>
              <div style={{ position: 'relative' }}>
                <input
                  type={v.password && !revealed[v.key] ? 'password' : 'text'}
                  className="form-control"
                  placeholder={v.is_set ? '•••••••• (leave blank to keep current)' : `Enter ${v.label}...`}
                  value={formValues[v.key] || ''}
                  onChange={e => setFormValues(prev => ({ ...prev, [v.key]: e.target.value }))}
                  style={{ width: '100%', paddingRight: v.password ? 40 : 12, boxSizing: 'border-box' }}
                />
                {v.password && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setRevealed(prev => ({ ...prev, [v.key]: !prev[v.key] }))}
                    style={{
                      position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
                      padding: '2px 6px', border: 'none', background: 'transparent', color: 'var(--text-muted)'
                    }}
                  >
                    {revealed[v.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          {saved ? (
            <button className="btn btn-primary" disabled>
              <Check size={14} /> Saved!
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
              {' '}Save
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Platforms() {
  const [platforms, setPlatforms] = useState({})
  const [channels, setChannels] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pairingOutput, setPairingOutput] = useState('')
  const [pairingLoading, setPairingLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

  // Configuration modal state
  const [envVars, setEnvVars] = useState({})
  const [envVarsLoading, setEnvVarsLoading] = useState(false)
  const [modalPlatform, setModalPlatform] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const [p, c] = await Promise.all([api.getPlatformsStatus(), api.getChannels()])
      setPlatforms(p)
      setChannels(c.platforms || {})
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadPairing = async () => {
    setPairingLoading(true)
    try {
      const data = await api.listPairing()
      setPairingOutput(data.output || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setPairingLoading(false)
    }
  }

  const approvePairing = async (code) => {
    setActionLoading(prev => ({ ...prev, [code]: true }))
    try {
      await api.approvePairing(code)
      loadPairing()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading(prev => ({ ...prev, [code]: false }))
    }
  }

  const revokePairing = async (userId) => {
    if (!confirm(`Revoke pairing for "${userId}"?`)) return
    setActionLoading(prev => ({ ...prev, [`revoke:${userId}`]: true }))
    try {
      await api.revokePairing(userId)
      loadPairing()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading(prev => ({ ...prev, [`revoke:${userId}`]: false }))
    }
  }

  const openConfigure = async (platformName) => {
    if (envVars[platformName]) {
      setModalPlatform(platformName)
      return
    }
    setEnvVarsLoading(true)
    try {
      const data = await api.getPlatformEnvVars()
      setEnvVars(data)
      setModalPlatform(platformName)
    } catch (e) {
      setError(e.message)
    } finally {
      setEnvVarsLoading(false)
    }
  }

  const handleConfigureSave = async (platform, vars) => {
    const result = await api.configurePlatform(platform, vars)
    // Refresh env vars and platform status
    const [envData] = await Promise.all([api.getPlatformEnvVars(), load()])
    setEnvVars(envData)
    return result
  }

  useEffect(() => { load(); loadPairing() }, [])

  // Parse pairing output into entries
  const parsePairingEntries = (text) => {
    if (!text) return []
    const entries = []
    for (const line of text.split('\n')) {
      const match = line.match(/([A-Z0-9\-]{4,})\s+(\S+)\s+(\w+)\s+(\w+)/i)
      if (match) {
        entries.push({ code: match[1], userId: match[2], platform: match[3], status: match[4] })
        continue
      }
      const codeMatch = line.match(/\b([A-Z0-9]{6,})\b/)
      if (codeMatch && !entries.find(e => e.code === codeMatch[1])) {
        const parts = line.trim().split(/\s+/)
        entries.push({
          code: codeMatch[1],
          userId: parts[1] || '',
          platform: parts[2] || '',
          status: parts[3] || 'pending',
        })
      }
    }
    return entries
  }

  const pairingEntries = parsePairingEntries(pairingOutput)

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Radio size={28} />
        Platform Connections
        <Tooltip text="Communication platforms connected to Hermes. Each platform (CLI, Telegram, Discord, WhatsApp, Slack, Signal) can send and receive messages through the AI agent. Configure each platform in its respective settings." />
        <button className="btn btn-sm" onClick={() => { load(); loadPairing() }} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Platform Status */}
      <div className="grid grid-3">
        {Object.entries(platforms).map(([name, info]) => {
          const state = info.state
          const isConnected = state === 'connected'
          const isNotConfigured = state === 'not_configured'
          return (
            <div key={name} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600, textTransform: 'capitalize' }}>{name}</span>
                <span className={`badge ${isConnected ? 'badge-success' : isNotConfigured ? 'badge-warning' : 'badge-error'}`}>
                  {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {state}
                  <Tooltip text={isConnected
                    ? 'Connected and actively receiving/sending messages. The platform is fully operational.'
                    : isNotConfigured
                      ? 'Platform is not configured. Click Configure to add the required credentials and enable it.'
                      : 'Disconnected — the platform was configured but the connection has been lost. Check API credentials and network connectivity.'}
                  />
                </span>
              </div>
              {info.updated_at && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Last update: {info.updated_at}
                  <Tooltip text="When the platform status was last checked or updated. If this is stale, the platform may have changed state since." />
                </div>
              )}
              <div style={{ marginTop: 12 }}>
                {isNotConfigured ? (
                  <button className="btn btn-primary btn-sm" onClick={() => openConfigure(name)} disabled={envVarsLoading}>
                    {envVarsLoading ? <Loader2 size={12} className="spin" /> : <Settings size={12} />}
                    {' '}Configure
                  </button>
                ) : (
                  <button className="btn btn-sm" onClick={() => openConfigure(name)} disabled={envVarsLoading}>
                    {envVarsLoading ? <Loader2 size={12} className="spin" /> : <Settings size={12} />}
                    {' '}Settings
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Configure Modal */}
      {modalPlatform && envVars[modalPlatform] && (
        <ConfigureModal
          platform={modalPlatform}
          envVars={envVars[modalPlatform]}
          onClose={() => setModalPlatform(null)}
          onSave={handleConfigureSave}
        />
      )}

      {/* Pairing Section */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <Key size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Pairing Requests
            <Tooltip text="Pending pairing requests from users trying to connect a new device or platform. Approve to allow access, or revoke to deny." />
          </span>
          <button className="btn btn-sm" onClick={loadPairing} disabled={pairingLoading}>
            {pairingLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            {' '}Refresh
          </button>
        </div>
        {pairingLoading && !pairingOutput ? (
          <div className="spinner" style={{ margin: '20px auto' }} />
        ) : pairingEntries.length > 0 ? (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>User ID</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pairingEntries.map((entry, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{entry.code}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{entry.userId || '-'}</td>
                    <td><span className="badge badge-info">{entry.platform || '-'}</span></td>
                    <td><span className={`badge ${entry.status === 'approved' ? 'badge-success' : 'badge-warning'}`}>{entry.status}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => approvePairing(entry.code)}
                          disabled={!!actionLoading[entry.code]}
                        >
                          {actionLoading[entry.code] ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                          {' '}Approve
                        </button>
                        {entry.userId && (
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => revokePairing(entry.userId)}
                            disabled={!!actionLoading[`revoke:${entry.userId}`]}
                          >
                            {actionLoading[`revoke:${entry.userId}`] ? <Loader2 size={12} className="spin" /> : <X size={12} />}
                            {' '}Revoke
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : pairingOutput ? (
          <pre style={{ maxHeight: 200 }}>{pairingOutput}</pre>
        ) : (
          <div className="empty-state">No pending pairing requests</div>
        )}
      </div>

      {/* Channel Directory */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <Users size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Channel Directory
            <Tooltip text="Directory of all configured channels across platforms. Channels represent specific chat rooms, DMs, or group conversations where the agent is active. Each channel maps to a unique conversation session." />
          </span>
        </div>
        {Object.entries(channels).map(([platform, chs]) => (
          <div key={platform} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'capitalize' }}>{platform}</h3>
            {chs.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No channels</span>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Name <Tooltip text="Display name or title of the channel. For Discord: channel name. For Telegram: chat title or username." /></th>
                      <th>Type <Tooltip text="Channel type: 'dm' for direct messages, 'group' for group chats, 'channel' for Discord/Slack channels, 'server' for Discord guilds." /></th>
                      <th>ID <Tooltip text="Unique platform-specific identifier for this channel. Used internally to route messages to the correct conversation session." /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {chs.map(ch => (
                      <tr key={ch.id}>
                        <td>{ch.name}</td>
                        <td><span className="badge badge-info">{ch.type}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{ch.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {Object.keys(channels).length === 0 && (
          <div className="empty-state">No channels configured</div>
        )}
      </div>
    </div>
  )
}
