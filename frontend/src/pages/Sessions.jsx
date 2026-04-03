import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MessageSquare, Trash2, Download, ArrowLeft, Clock, RefreshCw, Search, X, Scissors, Loader2, BarChart3, Calendar } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

function SessionDetail({ sessionId, onBack }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    api.getSession(sessionId)
      .then(setSession)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [sessionId])

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await api.exportSession(sessionId)
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `session-${sessionId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed:', e)
    } finally {
      setExporting(false)
    }
  }

  if (loading) return <div className="spinner" />
  if (!session) return <div className="error-box">Session not found</div>

  const messages = session.messages || []

  return (
    <div>
      <div className="page-title">
        <button className="btn btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        Session: {sessionId}
        <Tooltip text="Detailed view of a single conversation session. Shows the AI model used, the originating platform, and all messages exchanged." />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
            {' '}Export
          </button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-label">
            Model
            <Tooltip text="The AI model that was used for this session's conversations." />
          </div>
          <div className="stat-value" style={{ fontSize: 16 }}>{session.model || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Platform
            <Tooltip text="Where this conversation originated: CLI (terminal), Telegram, Discord, WhatsApp, or other connected platforms." />
          </div>
          <div className="stat-value" style={{ fontSize: 16 }}>{session.platform || 'N/A'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Messages
            <Tooltip text="Total number of messages exchanged in this session, including user prompts, AI responses, and tool call results." />
          </div>
          <div className="stat-value">{messages.length}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Messages
            <Tooltip text="Full conversation history for this session. User messages are highlighted. Tool calls show which external tools the AI used during the conversation." />
          </span>
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

function HighlightText({ text, query }) {
  if (!query) return text
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  )
}

export default function Sessions() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [pruning, setPruning] = useState(false)
  const [showPrune, setShowPrune] = useState(false)
  const [pruneDays, setPruneDays] = useState(30)
  const debounceRef = useRef(null)

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

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) {
      setSearchResults(null)
      return
    }
    try {
      setSearching(true)
      const results = await api.searchSessions(q)
      setSearchResults(results)
    } catch (e) {
      console.error('Search failed:', e)
    } finally {
      setSearching(false)
    }
  }, [])

  const onSearchChange = (e) => {
    const val = e.target.value
    setSearchQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults(null)
  }

  const handlePrune = async () => {
    if (!confirm(`Prune all sessions older than ${pruneDays} days? This cannot be undone.`)) return
    setPruning(true)
    try {
      await api.pruneSessions(pruneDays)
      load()
      setShowPrune(false)
    } catch (e) {
      setError(e.message)
    } finally {
      setPruning(false)
    }
  }

  if (id) return <SessionDetail sessionId={id} onBack={() => navigate('/sessions')} />

  const deleteSession = async (sid) => {
    if (!confirm('Delete this session?')) return
    try { await api.deleteSession(sid); load() }
    catch (e) { setError(e.message) }
  }

  const displaySessions = searchResults !== null ? searchResults : sessions

  // Compute stats
  const totalSessions = sessions.length
  const totalMessages = sessions.reduce((sum, s) => sum + (s.messages_count || 0), 0)
  const platformCounts = sessions.reduce((acc, s) => {
    const p = s.platform || 'unknown'
    acc[p] = (acc[p] || 0) + 1
    return acc
  }, {})
  // Sessions per day (last 7 days)
  const now = Date.now()
  const dayBuckets = Array(7).fill(0)
  const dayLabels = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * 86400000)
    dayLabels.push(d.toLocaleDateString('en', { weekday: 'short' }))
  }
  sessions.forEach(s => {
    if (s.created) {
      try {
        const t = new Date(s.created).getTime()
        const daysAgo = Math.floor((now - t) / 86400000)
        if (daysAgo >= 0 && daysAgo < 7) {
          dayBuckets[6 - daysAgo]++
        }
      } catch {}
    }
  })

  return (
    <div>
      <div className="page-title">
        <MessageSquare size={28} />
        Sessions
        <Tooltip text="All conversation sessions across every platform. Each session is a separate conversation with the AI agent. Click a session to view its full message history." />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {showPrune && (
            <>
              <input
                type="number"
                className="form-input"
                style={{ width: 80, padding: '4px 8px', fontSize: 13 }}
                value={pruneDays}
                onChange={e => setPruneDays(Number(e.target.value))}
                min={1}
                placeholder="days"
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>days</span>
              <button className="btn btn-sm btn-danger" onClick={handlePrune} disabled={pruning}>
                {pruning ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                {' '}Prune
              </button>
              <button className="btn btn-sm" onClick={() => setShowPrune(false)}>
                <X size={12} />
              </button>
            </>
          )}
          {!showPrune && (
            <button className="btn btn-sm btn-danger" onClick={() => setShowPrune(true)}>
              <Scissors size={14} /> Prune
            </button>
          )}
          <button className="btn btn-sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Stats */}
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="stat-card">
          <div className="stat-label">
            Total Sessions
            <Tooltip text="Total number of unique conversation sessions across all platforms." />
          </div>
          <div className="stat-value">{totalSessions}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Total Messages
            <Tooltip text="Total messages across all sessions." />
          </div>
          <div className="stat-value">{sessions.reduce((sum, s) => sum + (s.messages_count || 0), 0)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <BarChart3 size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            By Platform
            <Tooltip text="Number of sessions per communication platform." />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
            {Object.entries(platformCounts).map(([p, c]) => (
              <span key={p} className="badge badge-info" style={{ fontSize: 10 }}>{p}: {c}</span>
            ))}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            <Calendar size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
            Last 7 Days
            <Tooltip text="Number of sessions created per day over the last 7 days." />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 32, marginTop: 4 }}>
            {dayBuckets.map((count, i) => {
              const max = Math.max(...dayBuckets, 1)
              const h = Math.max((count / max) * 28, 2)
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{count}</div>
                  <div style={{
                    background: count > 0 ? 'var(--accent)' : 'var(--border)',
                    height: h,
                    borderRadius: 2,
                    transition: 'height 0.2s',
                  }} />
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>{dayLabels[i]}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="session-search-bar">
        <div className="session-search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="form-input session-search-input"
            placeholder="Search sessions..."
            value={searchQuery}
            onChange={onSearchChange}
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={clearSearch}>
              <X size={14} />
            </button>
          )}
        </div>
        {searching && <span className="search-loading">Searching...</span>}
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Session ID <Tooltip text="Unique identifier for each conversation session. Click to view the full message history." /></th>
              <th>Model <Tooltip text="AI model used for this session's conversations." /></th>
              <th>Platform <Tooltip text="Communication channel where the conversation took place (CLI, Telegram, Discord, WhatsApp, etc.)." /></th>
              <th>Messages <Tooltip text="Total number of messages (user + assistant + tool results) exchanged in this session." /></th>
              {searchResults !== null && <th>Match</th>}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {displaySessions.map(s => (
              <tr key={s.id}>
                <td>
                  <a href={`#/sessions/${s.id}`} style={{ color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    {s.id}
                  </a>
                  {s.preview && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <HighlightText text={s.preview.slice(0, 100)} query={searchQuery} />
                    </div>
                  )}
                </td>
                <td>{s.model}</td>
                <td><span className="badge badge-info">{s.platform}</span></td>
                <td>{s.messages_count}</td>
                {searchResults !== null && (
                  <td>
                    {s.snippet ? (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        <HighlightText text={s.snippet} query={searchQuery} />
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {(s.matched_in || []).join(', ')}
                      </span>
                    )}
                  </td>
                )}
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
            {displaySessions.length === 0 && (
              <tr><td colSpan={searchResults !== null ? 6 : 5} className="empty-state">
                {searchResults !== null ? 'No matching sessions found' : 'No sessions found'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
