import { useState, useEffect } from 'react'
import { Radio, RefreshCw, Wifi, WifiOff, Users } from 'lucide-react'
import { api } from '../api'

export default function Platforms() {
  const [platforms, setPlatforms] = useState({})
  const [channels, setChannels] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

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

  useEffect(() => { load() }, [])

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Radio size={28} />
        Platform Connections
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
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
                </span>
              </div>
              {info.updated_at && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Last update: {info.updated_at}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Channel Directory */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title"><Users size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Channel Directory</span>
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
                    <tr><th>Name</th><th>Type</th><th>ID</th></tr>
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
