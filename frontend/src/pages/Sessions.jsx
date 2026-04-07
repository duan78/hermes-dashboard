import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { MessageSquare, Trash2, Download, ArrowLeft, Clock, RefreshCw, Search, X, Scissors, Loader2, BarChart3, Calendar } from 'lucide-react'
import { useSessions, useSession, useSearchSessions, useDeleteSession, usePruneSessions, useExportSession } from '../hooks/useApi'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'

const SOURCE_COLORS = {
  Telegram: '#2AABEE',
  Discord: '#5865F2',
  Slack: '#4A154B',
  WhatsApp: '#25D366',
  CLI: '#10B981',
  local: '#6B7280',
}

function SourceBadge({ platform }) {
  const color = SOURCE_COLORS[platform] || 'var(--accent)'
  return (
    <span className="badge badge-info" style={{ background: `${color}22`, borderColor: color, color }}>
      {platform}
    </span>
  )
}

function TokenUsageBar({ tokens, label, color }) {
  if (!tokens || tokens === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ width: 80, color: 'var(--text-muted)' }}>{label}</span>
      <div style={{ flex: 1, background: 'var(--bg-tertiary)', borderRadius: 3, height: 6, overflow: 'hidden' }}>
        <div style={{ background: color, height: '100%', borderRadius: 3, width: '100%' }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', minWidth: 60, textAlign: 'right' }}>
        {tokens.toLocaleString()}
      </span>
    </div>
  )
}

function SessionDetail({ sessionId, onBack }) {
  const { data: session, isLoading, refetch } = useSession(sessionId)
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await refetch()
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' })
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

  if (isLoading) return <div className="spinner" />
  if (!session) return <div className="error-box">Session not found</div>

  const messages = session.messages || []
  const usage = session.usage || session.token_usage || {}

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
          <div className="stat-value" style={{ fontSize: 16 }}>
            <SourceBadge platform={session.platform || 'N/A'} />
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">
            Messages
            <Tooltip text="Total number of messages exchanged in this session, including user prompts, AI responses, and tool call results." />
          </div>
          <div className="stat-value">{messages.length}</div>
        </div>
      </div>

      {/* Token Usage Bars */}
      {(usage.input || usage.output || usage.cache_read || usage.cache_write || usage.reasoning) && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Token Usage</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '4px 0' }}>
            <TokenUsageBar tokens={usage.input} label="Input" color="#3b82f6" />
            <TokenUsageBar tokens={usage.output} label="Output" color="#10b981" />
            <TokenUsageBar tokens={usage.cache_read} label="Cache Read" color="#8b5cf6" />
            <TokenUsageBar tokens={usage.cache_write} label="Cache Write" color="#f59e0b" />
            <TokenUsageBar tokens={usage.reasoning} label="Reasoning" color="#ef4444" />
          </div>
        </div>
      )}

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
  const { data: sessions = [], isLoading, error: sessionsError, refetch } = useSessions()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const { data: searchResults, isLoading: searching } = useSearchSessions(debouncedQuery)
  const deleteMutation = useDeleteSession()
  const pruneMutation = usePruneSessions()
  const [showPrune, setShowPrune] = useState(false)
  const [pruneDays, setPruneDays] = useState(30)
  const [confirmModal, setConfirmModal] = useState(null)
  const debounceRef = useRef(null)

  const onSearchChange = (e) => {
    const val = e.target.value
    setSearchQuery(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(val), 300)
  }

  const clearSearch = () => {
    setSearchQuery('')
    setDebouncedQuery('')
  }

  const handlePrune = () => {
    setConfirmModal({
      message: `Prune all sessions older than ${pruneDays} days? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await pruneMutation.mutateAsync(pruneDays)
          refetch()
          setShowPrune(false)
        } catch (e) {
          console.error('Prune failed:', e)
        }
      }
    })
  }

  if (id) return <SessionDetail sessionId={id} onBack={() => navigate('/sessions')} />

  const deleteSession = (sid) => {
    setConfirmModal({
      message: 'Delete this session?',
      onConfirm: async () => {
        setConfirmModal(null)
        try { await deleteMutation.mutateAsync(sid) }
        catch (e) { console.error(e) }
      }
    })
  }

  const displaySessions = debouncedQuery ? (searchResults || []) : sessions

  // Compute stats
  const totalSessions = sessions.length
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
                aria-label="Prune age in days"
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>days</span>
              <button className="btn btn-sm btn-danger" onClick={handlePrune} disabled={pruneMutation.isPending}>
                {pruneMutation.isPending ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                {' '}Prune
              </button>
              <button className="btn btn-sm" onClick={() => setShowPrune(false)} aria-label="Cancel prune">
                <X size={12} />
              </button>
            </>
          )}
          {!showPrune && (
            <button className="btn btn-sm btn-danger" onClick={() => setShowPrune(true)}>
              <Scissors size={14} /> Prune
            </button>
          )}
          <button className="btn btn-sm" onClick={() => refetch()}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {sessionsError && <div className="error-box">{sessionsError.message}</div>}

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
              <SourceBadge key={p} platform={p} />
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
            aria-label="Search sessions"
          />
          {searchQuery && (
            <button className="search-clear-btn" onClick={clearSearch} aria-label="Clear search">
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
              {debouncedQuery && <th>Match</th>}
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
                <td><SourceBadge platform={s.platform} /></td>
                <td>{s.messages_count}</td>
                {debouncedQuery && (
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
                    <button className="btn btn-sm btn-danger" onClick={() => deleteSession(s.id)} aria-label="Delete session">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {displaySessions.length === 0 && (
              <tr><td colSpan={debouncedQuery ? 6 : 5} className="empty-state">
                {debouncedQuery ? 'No matching sessions found' : 'No sessions found'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      {confirmModal && <ConfirmModal title="Confirm" message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} confirmLabel="Delete" />}
    </div>
  )
}
