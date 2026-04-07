import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  MessageCircle, Plus, Send, Loader2, Wrench, ChevronDown, ChevronRight,
  Bot, User, Trash2, PanelLeftClose, PanelLeft, Square
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import './chat.css'

// ── Helpers ──

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(typeof ts === 'number' ? ts * 1000 : ts)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function getSessionPreview(session) {
  if (session.preview) return session.preview.slice(0, 60)
  if (session.created) {
    try {
      const d = new Date(session.created)
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    } catch {}
  }
  return `Session ${session.id?.slice(0, 8) || 'unknown'}`
}

// ── Markdown Component ──

function ChatMarkdown({ children }) {
  return (
    <div className="chat-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {children}
      </ReactMarkdown>
    </div>
  )
}

// ── Tool Call Bubble ──

function ToolCallBubble({ name, phase }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="tool-call-bubble">
      <button className="tool-call-header" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Wrench size={12} />
        <span className="tool-call-name">{name || 'tool'}</span>
        {phase === 'calling' && <Loader2 size={10} className="spin" />}
      </button>
    </div>
  )
}

// ── Typing Indicator ──

function TypingIndicator() {
  return (
    <div className="chat-msg assistant">
      <div className="chat-msg-avatar"><Bot size={16} /></div>
      <div className="chat-msg-body">
        <div className="typing-indicator">
          <span /><span /><span />
        </div>
      </div>
    </div>
  )
}

// ── Message Item ──

function ChatMessage({ msg }) {
  const isUser = msg.role === 'user'
  const content = msg.content || ''

  return (
    <div className={`chat-msg ${isUser ? 'user' : 'assistant'}`}>
      <div className={`chat-msg-avatar ${isUser ? 'user' : 'assistant'}`}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>
      <div className="chat-msg-body">
        {isUser ? (
          <div className="chat-msg-text">{content}</div>
        ) : (
          <ChatMarkdown>{content}</ChatMarkdown>
        )}
        {msg.timestamp && (
          <div className="chat-msg-time">{formatTime(msg.timestamp)}</div>
        )}
      </div>
    </div>
  )
}

// ── Streaming Message ──

function StreamingMessage({ text }) {
  return (
    <div className="chat-msg assistant streaming">
      <div className="chat-msg-avatar assistant"><Bot size={16} /></div>
      <div className="chat-msg-body">
        {text ? (
          <ChatMarkdown>{text}</ChatMarkdown>
        ) : (
          <TypingIndicator />
        )}
      </div>
    </div>
  )
}

// ── Session Sidebar ──

function ChatSidebar({ sessions, activeId, onSelect, onNew, onDelete, collapsed, onToggle }) {
  if (collapsed) {
    return (
      <div className="chat-sidebar collapsed">
        <button className="chat-sidebar-toggle" onClick={onToggle} title="Expand sidebar">
          <PanelLeft size={16} />
        </button>
      </div>
    )
  }

  return (
    <div className="chat-sidebar">
      <div className="chat-sidebar-header">
        <span className="chat-sidebar-title">Sessions</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-sm btn-primary" onClick={onNew} title="New chat">
            <Plus size={14} />
          </button>
          <button className="chat-sidebar-toggle" onClick={onToggle} title="Collapse sidebar">
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>
      <div className="chat-sidebar-list">
        {sessions.length === 0 && (
          <div className="chat-sidebar-empty">No sessions yet</div>
        )}
        {sessions.map(s => (
          <button
            key={s.id}
            className={`chat-sidebar-item ${s.id === activeId ? 'active' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="chat-sidebar-item-title">{getSessionPreview(s)}</div>
            <div className="chat-sidebar-item-meta">
              {s.model && <span>{s.model}</span>}
              <span>{s.messages_count || 0} msgs</span>
            </div>
            {onDelete && (
              <button
                className="chat-sidebar-item-delete"
                onClick={e => { e.stopPropagation(); onDelete(s.id) }}
                title="Delete session"
              >
                <Trash2 size={12} />
              </button>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Chat Input ──

function ChatInput({ onSend, disabled, onStop }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [])

  useEffect(() => { adjustHeight() }, [value, adjustHeight])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div className="chat-input-wrap">
      <textarea
        ref={textareaRef}
        className="chat-input"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? 'Waiting for response...' : 'Type a message... (Shift+Enter for new line)'}
        disabled={disabled}
        rows={1}
      />
      {disabled && onStop ? (
        <button
          className="chat-stop-btn"
          onClick={onStop}
          title="Stop generating"
        >
          <Square size={18} />
        </button>
      ) : (
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          title="Send message"
        >
          {disabled ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
        </button>
      )}
    </div>
  )
}

// ── Main Chat Page ──

export default function Chat() {
  const { id: routeId } = useParams()
  const navigate = useNavigate()
  const [sessions, setSessions] = useState([])
  const [messages, setMessages] = useState([])
  const [activeId, setActiveId] = useState(routeId || null)
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)
  const messagesEndRef = useRef(null)

  // Load sessions list
  const loadSessions = useCallback(async () => {
    try {
      const data = await api.listSessions()
      setSessions(Array.isArray(data) ? data : [])
    } catch (e) {
      // Silently fail — sidebar just shows empty
    }
  }, [])

  // Load messages for active session
  const loadMessages = useCallback(async (sid) => {
    if (!sid) { setMessages([]); return }
    try {
      const data = await api.getSession(sid)
      setMessages(Array.isArray(data.messages) ? data.messages : [])
    } catch (e) {
      setMessages([])
    }
  }, [])

  useEffect(() => { loadSessions() }, [loadSessions])
  useEffect(() => {
    if (routeId && routeId !== activeId) setActiveId(routeId)
  }, [routeId])

  useEffect(() => {
    if (activeId) {
      loadMessages(activeId)
    } else {
      setMessages([])
    }
  }, [activeId, loadMessages])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  // Navigate to session
  const selectSession = useCallback((sid) => {
    setActiveId(sid)
    setError(null)
    navigate(`/chat/${sid}`)
  }, [navigate])

  // New session
  const newSession = useCallback(() => {
    setActiveId(null)
    setMessages([])
    setError(null)
    navigate('/chat')
  }, [navigate])

  // Delete session
  const deleteSession = useCallback(async (sid) => {
    try { await api.deleteSession(sid) } catch {}
    loadSessions()
    if (sid === activeId) newSession()
  }, [activeId, loadSessions, newSession])

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setStreaming(false)
    setStreamingText('')
  }, [])

  // SSE streaming send
  const sendMessage = useCallback(async (text) => {
    if (streaming) return

    // Optimistic user message
    const userMsg = { role: 'user', content: text, timestamp: Date.now() / 1000 }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)
    setStreamingText('')
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const token = localStorage.getItem('hermes_token') || ''
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          message: text,
          session_id: activeId || undefined,
          history: messages.map(m => ({ role: m.role, content: m.content || '' })),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const err = await response.text()
        throw new Error(err || `Server error ${response.status}`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''
      let resolvedSessionId = activeId

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''

        for (const block of events) {
          if (!block.trim()) continue
          let eventType = ''
          let eventData = ''

          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) eventType = line.slice(7).trim()
            else if (line.startsWith('data: ')) eventData += line.slice(6)
            else if (line.startsWith('data:')) eventData += line.slice(5)
          }

          if (!eventType) continue

          try {
            const payload = JSON.parse(eventData)

            if (eventType === 'started') {
              if (payload.session_id && !resolvedSessionId) {
                resolvedSessionId = payload.session_id
                setActiveId(payload.session_id)
                navigate(`/chat/${payload.session_id}`, { replace: true })
              }
            } else if (eventType === 'chunk') {
              fullText = payload.full || (fullText + (payload.text || ''))
              setStreamingText(fullText)
            } else if (eventType === 'tool') {
              // Tool calls are shown inline during streaming
            } else if (eventType === 'done') {
              // Stream complete
              if (payload.session_id && !resolvedSessionId) {
                resolvedSessionId = payload.session_id
              }
            } else if (eventType === 'error') {
              setError(payload.message || 'Stream error')
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Add assistant message
      if (fullText) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: fullText,
          timestamp: Date.now() / 1000,
        }])
      }
      setStreamingText('')
      loadSessions()
    } catch (err) {
      if (err.name === 'AbortError') return
      setError(err.message || 'Failed to send message')
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [streaming, activeId, messages, navigate, loadSessions])

  return (
    <div className="chat-page">
      <ChatSidebar
        sessions={sessions}
        activeId={activeId}
        onSelect={selectSession}
        onNew={newSession}
        onDelete={deleteSession}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
      />
      <div className="chat-main">
        {!activeId && messages.length === 0 ? (
          <div className="chat-empty">
            <MessageCircle size={48} strokeWidth={1} />
            <h2>Hermes Chat</h2>
            <p>Send a message to start a new conversation, or select an existing session.</p>
          </div>
        ) : (
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <ChatMessage key={i} msg={msg} />
            ))}
            {streaming && <StreamingMessage text={streamingText} />}
            {error && (
              <div className="chat-error">
                <strong>Error:</strong> {error}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
        <ChatInput
          onSend={sendMessage}
          disabled={streaming}
          onStop={stopStreaming}
        />
      </div>
    </div>
  )
}
