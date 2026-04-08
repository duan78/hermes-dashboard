import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Bot, Play, Square, Send, Plus, Trash2, ChevronDown, ChevronRight,
  Activity, Clock, FolderOpen, RefreshCw, Terminal, AlertCircle, Loader2
} from 'lucide-react'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import { api } from '../api'
import './claude-code.css'

const STATUS_CONFIG = {
  working: { label: 'Working', color: 'status-working', icon: Activity },
  waiting_approval: { label: 'Waiting', color: 'status-waiting', icon: AlertCircle },
  idle: { label: 'Idle', color: 'status-idle', icon: Terminal },
  interrupted: { label: 'Interrupted', color: 'status-interrupted', icon: Square },
  completed: { label: 'Completed', color: 'status-completed', icon: Play },
  unknown: { label: 'Unknown', color: 'status-unknown', icon: Terminal },
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unknown
  const Icon = cfg.icon
  return (
    <span className={`cc-status-badge ${cfg.color}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  )
}

function SessionCard({ session, onExpand, onSend, onStop, onKill, isExpanded }) {
  const [sendMsg, setSendMsg] = useState('')
  const [showSend, setShowSend] = useState(false)

  const handleSend = () => {
    if (sendMsg.trim()) {
      onSend(session.name, sendMsg)
      setSendMsg('')
    }
  }

  return (
    <div className={`cc-session-card ${isExpanded ? 'expanded' : ''}`}>
      <div className="cc-session-header" onClick={() => onExpand(session.name)}>
        <div className="cc-session-info">
          <Bot size={18} />
          <span className="cc-session-name">{session.name}</span>
          <StatusBadge status={session.status} />
        </div>
        <div className="cc-session-meta">
          {session.cpu_percent > 0 && (
            <Tooltip text="CPU usage">
              <span className="cc-stat">CPU {session.cpu_percent}%</span>
            </Tooltip>
          )}
          {session.memory_mb > 0 && (
            <Tooltip text="Memory usage">
              <span className="cc-stat">RAM {session.memory_mb}MB</span>
            </Tooltip>
          )}
          {session.workdir && (
            <Tooltip text="Working directory">
              <span className="cc-stat cc-dir">{session.workdir.split('/').slice(-2).join('/')}</span>
            </Tooltip>
          )}
          <ChevronDown size={16} className={`cc-chevron ${isExpanded ? 'open' : ''}`} />
        </div>
      </div>

      {isExpanded && (
        <div className="cc-session-body">
          <div className="cc-output">
            <pre>{session.last_output || 'No output'}</pre>
          </div>
          <div className="cc-session-actions">
            <Tooltip text="Send Ctrl+C to stop current operation">
              <button className="cc-btn cc-btn-stop" onClick={() => onStop(session.name)}>
                <Square size={14} /> Stop
              </button>
            </Tooltip>
            <Tooltip text="Send a text message to Claude Code">
              <button className="cc-btn cc-btn-send" onClick={() => setShowSend(!showSend)}>
                <Send size={14} /> Send
              </button>
            </Tooltip>
            <Tooltip text="Kill this tmux session entirely">
              <button className="cc-btn cc-btn-kill" onClick={() => onKill(session.name)}>
                <Trash2 size={14} /> Kill
              </button>
            </Tooltip>
          </div>
          {showSend && (
            <div className="cc-send-form">
              <input
                type="text"
                value={sendMsg}
                onChange={(e) => setSendMsg(e.target.value)}
                placeholder="Type a message..."
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                autoFocus
                aria-label="Message to send to Claude Code"
              />
              <button className="cc-btn cc-btn-send" onClick={handleSend} aria-label="Send message">
                <Send size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HistorySession({ session, onViewMessages }) {
  const [expanded, setExpanded] = useState(false)
  const [messages, setMessages] = useState(null)
  const [loading, setLoading] = useState(false)

  const handleViewMessages = async () => {
    if (expanded && messages) {
      setExpanded(false)
      return
    }
    setLoading(true)
    try {
      const data = await api.sessionMessages(session.id)
      setMessages(data)
      setExpanded(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="cc-history-item">
      <div className="cc-history-header" onClick={handleViewMessages}>
        <div className="cc-history-info">
          <FolderOpen size={14} />
          <span className="cc-history-project">{session.project}</span>
          <span className="cc-history-meta">
            {session.turns_approx} turns · {session.size_kb}KB
            {session.subagents_count > 0 && ` · ${session.subagents_count} subagents`}
          </span>
        </div>
        <div className="cc-history-date">
          <Clock size={12} />
          {new Date(session.last_modified).toLocaleString()}
          <ChevronRight size={14} className={`cc-chevron ${expanded ? 'open' : ''}`} />
        </div>
      </div>
      {expanded && messages && (
        <div className="cc-history-messages">
          {messages.messages.map((msg, i) => (
            <div key={i} className={`cc-msg cc-msg-${msg.role}`}>
              <span className="cc-msg-role">{msg.role === 'assistant' ? '🤖' : '👤'}</span>
              <pre className="cc-msg-content">{msg.content || '(empty)'}</pre>
            </div>
          ))}
          {messages.messages.length === 0 && (
            <div className="cc-empty">No messages found</div>
          )}
        </div>
      )}
      {loading && <div className="cc-loading"><Loader2 size={16} className="spin" /> Loading messages...</div>}
    </div>
  )
}

function NewSessionForm({ onCreated }) {
  const [name, setName] = useState('claude-session')
  const [workdir, setWorkdir] = useState('/root')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      await api.createClaudeSession(name, workdir)
      setName('claude-session')
      if (onCreated) onCreated()
    } catch (err) {
      console.error(err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="cc-new-form">
      <h3>
        <Plus size={16} /> New Claude Code Session
        <Tooltip text="Create a new Claude Code tmux session for delegated development work.">
          <span className="cc-help">?</span>
        </Tooltip>
      </h3>
      <div className="cc-form-row">
        <Tooltip text="Session name (will be prefixed with claude- if not already)">
          <label>Session</label>
        </Tooltip>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="Session name" />
      </div>
      <div className="cc-form-row">
        <Tooltip text="Working directory for Claude Code">
          <label>Workdir</label>
        </Tooltip>
        <input type="text" value={workdir} onChange={(e) => setWorkdir(e.target.value)} aria-label="Working directory" />
      </div>
      <button className="cc-btn cc-btn-create" onClick={handleCreate} disabled={creating}>
        {creating ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
        Launch Claude Code
      </button>
    </div>
  )
}

export default function ClaudeCode() {
  const [tab, setTab] = useState('active')
  const [active, setActive] = useState([])
  const [history, setHistory] = useState([])
  const [stats, setStats] = useState(null)
  const [expandedSession, setExpandedSession] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [confirmModal, setConfirmModal] = useState(null)
  const pollRef = useRef(null)

  const fetchActive = useCallback(async () => {
    try {
      const data = await api.activeClaudeSessions()
      setActive(data.sessions || [])
    } catch (err) {
      console.error(err)
    }
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api.claudeCodeHistory()
      setHistory(data.sessions || [])
    } catch (err) {
      console.error(err)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.claudeCodeStats()
      setStats(data)
    } catch (err) {
      console.error(err)
    }
  }, [])

  // Poll active sessions every 3 seconds
  useEffect(() => {
    fetchActive()
    fetchStats()
    pollRef.current = setInterval(fetchActive, 3000)
    return () => clearInterval(pollRef.current)
  }, [fetchActive, fetchStats])

  // Fetch history on mount or tab switch
  useEffect(() => {
    if (tab === 'history') fetchHistory()
  }, [tab, fetchHistory])

  const refreshAll = async () => {
    setRefreshing(true)
    await Promise.all([fetchActive(), fetchHistory(), fetchStats()])
    setRefreshing(false)
  }

  const handleStop = async (session) => {
    await api.stopClaudeSession(session)
    setTimeout(fetchActive, 500)
  }

  const handleSend = async (session, message) => {
    await api.sendClaudeSession(session, message)
    setTimeout(fetchActive, 1000)
  }

  const handleKill = async (session) => {
    setConfirmModal({
      message: `Kill session ${session}?`,
      onConfirm: async () => {
        setConfirmModal(null)
        await api.killClaudeSession(session)
        setTimeout(fetchActive, 500)
      }
    })
  }

  const handleCreated = () => {
    setTimeout(fetchActive, 2000)
  }

  return (
    <div className="cc-page">
      <div className="cc-header">
        <h1>
          <Bot size={24} /> Claude Code Monitor
          <Tooltip text="Monitor and control Claude Code sessions running in tmux. View active sessions, past conversations, and manage delegated development work.">
            <span className="cc-help">?</span>
          </Tooltip>
        </h1>
        <div className="cc-header-actions">
          {stats && (
            <div className="cc-quick-stats">
              <Tooltip text="Currently running Claude Code sessions">
                <span className="cc-qs">{stats.active_sessions} active</span>
              </Tooltip>
              <Tooltip text="Total past sessions in history">
                <span className="cc-qs">{stats.total_past_sessions} past</span>
              </Tooltip>
              <Tooltip text="Number of different projects">
                <span className="cc-qs">{stats.total_projects} projects</span>
              </Tooltip>
            </div>
          )}
          <Tooltip text="Refresh all data">
            <button className="cc-btn cc-btn-refresh" onClick={refreshAll} aria-label="Refresh all data">
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="cc-tabs">
        <button className={`cc-tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>
          <Activity size={14} /> Active Sessions
          {active.length > 0 && <span className="cc-tab-count">{active.length}</span>}
        </button>
        <button className={`cc-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          <Clock size={14} /> History
        </button>
        <button className={`cc-tab ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}>
          <Plus size={14} /> New Session
        </button>
      </div>

      {tab === 'active' && (
        <div className="cc-content">
          {active.length === 0 ? (
            <div className="cc-empty-state">
              <Bot size={48} />
              <h3>No Claude Code sessions running</h3>
              <p>Create a new session to start delegating development work.</p>
              <button className="cc-btn cc-btn-create" onClick={() => setTab('new')}>
                <Plus size={14} /> New Session
              </button>
            </div>
          ) : (
            active.map((s) => (
              <SessionCard
                key={s.name}
                session={s}
                isExpanded={expandedSession === s.name}
                onExpand={(n) => setExpandedSession(expandedSession === n ? null : n)}
                onSend={handleSend}
                onStop={handleStop}
                onKill={handleKill}
              />
            ))
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="cc-content">
          {history.length === 0 ? (
            <div className="cc-empty-state">
              <Clock size={48} />
              <h3>No session history yet</h3>
              <p>Past Claude Code sessions will appear here.</p>
            </div>
          ) : (
            history.map((s) => (
              <HistorySession key={s.id} session={s} />
            ))
          )}
        </div>
      )}

      {tab === 'new' && (
        <div className="cc-content">
          <NewSessionForm onCreated={handleCreated} />
        </div>
      )}
      {confirmModal && <ConfirmModal title="Confirm" message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} confirmLabel="Kill" />}
    </div>
  )
}
