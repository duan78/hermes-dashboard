import { useState, useEffect } from 'react'
import { Radio, RefreshCw, Wifi, WifiOff, Users, Key, Check, X, Loader2 } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

export default function Platforms() {
  const [platforms, setPlatforms] = useState({})
  const [channels, setChannels] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [pairingOutput, setPairingOutput] = useState('')
  const [pairingLoading, setPairingLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState({})

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

  useEffect(() => { load(); loadPairing() }, [])

  // Parse pairing output into entries
  const parsePairingEntries = (text) => {
    if (!text) return []
    const entries = []
    for (const line of text.split('\n')) {
      // Try patterns like "code  user_id  platform  status"
      const match = line.match(/([A-Z0-9\-]{4,})\s+(\S+)\s+(\w+)\s+(\w+)/i)
      if (match) {
        entries.push({ code: match[1], userId: match[2], platform: match[3], status: match[4] })
        continue
      }
      // Simpler: just a code
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
          return (
            <div key={name} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 16, fontWeight: 600, textTransform: 'capitalize' }}>{name}</span>
                <span className={`badge ${isConnected ? 'badge-success' : state === 'not_configured' ? 'badge-warning' : 'badge-error'}`}>
                  {isConnected ? <Wifi size={12} /> : <WifiOff size={12} />}
                  {state}
                  <Tooltip text={isConnected
                    ? 'Connected and actively receiving/sending messages. The platform is fully operational.'
                    : state === 'not_configured'
                      ? 'Platform is not configured. Add the required credentials and settings in the Configuration page to enable it.'
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
            </div>
          )
        })}
      </div>

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
