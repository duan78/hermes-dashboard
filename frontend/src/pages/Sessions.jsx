import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MessageSquare, Trash2, Download, ArrowLeft, Clock, RefreshCw } from 'lucide-react'
import { api } from '../api'

function SessionDetail({ sessionId, onBack }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getSession(sessionId)
      .then(setSession)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [sessionId])

  if (loading) return <div className="spinner" />
  if (!session) return <div className="error-box">Session not found</div>

  const messages = session.messages || []

  return (
    <div>
      <div className="page-title">
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        Session: {sessionId}
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Model</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{session.model || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Platform</div>
          <div className="stat-value" style={{ fontSize: 16 }}>{session.platform || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Messages</div>
          <div className="stat-value">{messages.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Messages</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{messages.length} total</span>
        </div>
        <div style={{ maxHeight: 600, overflowY: 'auto' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              background: msg.role === 'user' ? 'var(--bg-tertiary)' : 'transparent',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: msg.role === 'user' ? 'var(--accent)' : 'var(--success)', marginBottom: 4 }}>
                {msg.role.toUpperCase()}
                {msg.timestamp && <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>{msg.timestamp}</span>}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {msg.content || ''}
              </div>
              {msg.tool_calls && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                  Tool calls: {msg.tool_calls.map(tc => tc.function?.name || tc.name).join(', ')}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Sessions() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listSessions()
      setSessions(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  if (id) return <SessionDetail sessionId={id} onBack={() => navigate('/sessions')} />

  const deleteSession = async (sid) => {
    if (!confirm('Delete this session?')) return
    try { await api.deleteSession(sid); load() }
    catch (e) { setError(e.message) }
  }

  return (
    <div>
      <div className="page-title">
        <MessageSquare size={28} />
        Sessions
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Model</th>
              <th>Platform</th>
              <th>Messages</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map(s => (
              <tr key={s.id}>
                <td>
                  <a href={`#/sessions/${s.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {s.id}
                  </a>
                </td>
                <td>{s.model}</td>
                <td><span className="badge badge-info">{s.platform}</span></td>
                <td>{s.messages_count}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => navigate(`/sessions/${s.id}`)}>
                      <MessageSquare size={12} /> View
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => deleteSession(s.id)}>
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sessions.length === 0 && (
              <tr><td colSpan={5} className="empty-state">No sessions found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
