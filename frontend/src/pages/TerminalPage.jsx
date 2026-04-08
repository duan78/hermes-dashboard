import { useEffect, useRef, useState, useCallback } from 'react'
import Tooltip from '../components/Tooltip'
import './terminal.css'

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000

/**
 * Build the WebSocket URL. Works both in direct dev mode and
 * behind a reverse-proxy path prefix like /dashboard/.
 */
function buildWsUrl() {
  const proto = WS_PROTOCOL
  const host = window.location.host

  let base = ''
  const baseEl = document.querySelector('base')
  if (baseEl && baseEl.getAttribute('href')) {
    base = baseEl.getAttribute('href').replace(/\/$/, '')
  } else {
    const m = window.location.pathname.match(/^(\/[^/]+)\//)
    if (m) base = m[1]
  }

  const token = localStorage.getItem('hermes_token') || ''
  const sep = token ? '?' : ''
  return `${proto}//${host}${base}/ws/terminal${sep}${token ? 'token=' + encodeURIComponent(token) : ''}`
}

export default function TerminalPage() {
  const termRef = useRef(null)
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const fitAddonRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef(null)
  const disposedRef = useRef(false)

  const connectWs = useCallback((term, fitAddon) => {
    if (disposedRef.current) return

    const wsUrl = buildWsUrl()
    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      setReconnecting(false)
      setError(null)
      reconnectAttemptRef.current = 0
      setTimeout(() => fitAddon.fit(), 100)
    }

    ws.onmessage = (event) => {
      const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data)
      term.write(text)
    }

    ws.onerror = () => {
      setError('WebSocket error')
    }

    ws.onclose = () => {
      setConnected(false)
      if (!disposedRef.current) {
        term.write('\r\n\x1b[31m--- Disconnected ---\x1b[0m\r\n')
        // Auto-reconnect with exponential backoff
        const attempt = reconnectAttemptRef.current
        const delay = Math.min(RECONNECT_BASE_DELAY * Math.pow(2, attempt), RECONNECT_MAX_DELAY)
        reconnectAttemptRef.current = attempt + 1
        setReconnecting(true)
        term.write(`\r\n\x1b[33mReconnecting in ${delay / 1000}s (attempt ${attempt + 1})...\x1b[0m\r\n`)
        reconnectTimerRef.current = setTimeout(() => {
          if (!disposedRef.current) {
            connectWs(term, fitAddon)
          }
        }, delay)
      }
    }

    // Send terminal input
    const disposable = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
      }
    })
    resizeObserver.observe(containerRef.current)

    // Store cleanup for this connection
    ws._cleanup = () => {
      resizeObserver.disconnect()
      disposable.dispose()
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    let term, fitAddon, TerminalCls, FitAddonCls
    disposedRef.current = false

    Promise.all([
      import('@xterm/xterm').then(m => { TerminalCls = m.Terminal }),
      import('@xterm/addon-fit').then(m => { FitAddonCls = m.FitAddon }),
      import('@xterm/xterm/css/xterm.css'),
    ]).then(() => {
      if (disposedRef.current || !containerRef.current) return

      term = new TerminalCls({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: "'JetBrains Mono', 'Fira Code', ui-monospace, monospace",
        theme: {
          background: '#0f1117',
          foreground: '#e4e6eb',
          cursor: '#8b5cf6',
          cursorAccent: '#0f1117',
          selectionBackground: 'rgba(139, 92, 246, 0.3)',
          black: '#0f1117',
          red: '#ef4444',
          green: '#10b981',
          yellow: '#f59e0b',
          blue: '#3b82f6',
          magenta: '#8b5cf6',
          cyan: '#06b6d4',
          white: '#e4e6eb',
          brightBlack: '#6b7280',
          brightRed: '#f87171',
          brightGreen: '#34d399',
          brightYellow: '#fbbf24',
          brightBlue: '#60a5fa',
          brightMagenta: '#a78bfa',
          brightCyan: '#22d3ee',
          brightWhite: '#f9fafb',
        },
        allowProposedApi: true,
      })

      fitAddon = new FitAddonCls()
      term.loadAddon(fitAddon)
      fitAddonRef.current = fitAddon
      termRef.current = term
      term.open(containerRef.current)
      setLoading(false)

      connectWs(term, fitAddon)
    }).catch(() => {
      if (!disposedRef.current) {
        setError('Failed to load terminal')
        setLoading(false)
      }
    })

    return () => {
      disposedRef.current = true
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }
      if (wsRef.current?._cleanup) {
        wsRef.current._cleanup()
      }
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close()
        }
        wsRef.current = null
      }
      if (termRef.current) {
        termRef.current.dispose()
        termRef.current = null
      }
    }
  }, [connectWs])

  const reconnect = () => {
    // Reset backoff and reconnect immediately
    reconnectAttemptRef.current = 0
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (wsRef.current?._cleanup) {
      wsRef.current._cleanup()
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setReconnecting(false)
    setError(null)
    // Reconnect immediately
    if (termRef.current && fitAddonRef.current) {
      connectWs(termRef.current, fitAddonRef.current)
    }
  }

  return (
    <div>
      <div className="page-title">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        Terminal
        <Tooltip text="Interactive terminal connected to the server via WebSocket. Type commands and they execute remotely in real-time. Auto-reconnects on disconnect." />
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${connected ? 'badge-success' : reconnecting ? 'badge-warning' : 'badge-error'}`}>
            <span className="badge-dot" />
            {connected ? 'Connected' : reconnecting ? 'Reconnecting...' : 'Disconnected'}
            <Tooltip text={connected ? 'WebSocket connection to the server is active. Commands will execute immediately.' : reconnecting ? 'Connection lost. Automatically retrying with exponential backoff.' : 'Not connected to the server. Click Reconnect or wait for auto-retry.'} />
          </span>
          <button className="btn btn-sm" onClick={reconnect}>
            Reconnect
            <Tooltip text="Force an immediate reconnection attempt. Resets the backoff timer and tries to establish a fresh WebSocket connection." />
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="terminal-container">
        {loading ? (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: '100%', color: 'var(--text-secondary, #94a3b8)'
          }}>
            Loading terminal...
          </div>
        ) : null}
        <div ref={containerRef} className="terminal-xterm" />
      </div>
    </div>
  )
}
