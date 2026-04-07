import { useEffect, useRef, useState } from 'react'
import './terminal.css'

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

/**
 * Build the WebSocket URL. Works both in direct dev mode and
 * behind a reverse-proxy path prefix like /dashboard/.
 *
 *  - Direct  (http://host:3100)  → ws://host:3100/ws/terminal
 *  - Proxied (http://host/dashboard/) → ws://host/dashboard/ws/terminal
 */
function buildWsUrl() {
  const proto = WS_PROTOCOL
  const host = window.location.host

  // Determine the base path from <base href> or the current pathname
  let base = ''
  const baseEl = document.querySelector('base')
  if (baseEl && baseEl.getAttribute('href')) {
    base = baseEl.getAttribute('href').replace(/\/$/, '')
  } else {
    // If the pathname starts with something other than / and contains
    // at least two segments (e.g. /dashboard/), treat the first as base
    const m = window.location.pathname.match(/^(\/[^/]+)\//)
    if (m) base = m[1]
  }

  return `${proto}//${host}${base}/ws/terminal`
}

export default function TerminalPage() {
  const termRef = useRef(null)
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const fitAddonRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState(null)

  useEffect(() => {
    let cancelled = false
    let term, fitAddon, disposable, resizeObserver, ws

    async function initTerminal() {
      try {
        // Dynamic import of xterm.js and addons
        const [{ Terminal }, { FitAddon }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ])

        // Dynamically inject xterm CSS if not already present
        if (!document.querySelector('link[data-xterm-css]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = new URL('@xterm/xterm/css/xterm.css', import.meta.url).href
          link.setAttribute('data-xterm-css', 'true')
          document.head.appendChild(link)
        }

        if (cancelled || !containerRef.current) return

        term = new Terminal({
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

        fitAddon = new FitAddon()
        term.loadAddon(fitAddon)
        fitAddonRef.current = fitAddon
        termRef.current = term
        term.open(containerRef.current)

        if (!cancelled) setLoading(false)

        // Connect WebSocket
        const wsUrl = buildWsUrl()
        ws = new WebSocket(wsUrl)
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          setConnected(true)
          setError(null)
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
          term.write('\r\n\x1b[31m--- Disconnected ---\x1b[0m\r\n')
        }

        wsRef.current = ws

        disposable = term.onData((data) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'input', data }))
          }
        })

        resizeObserver = new ResizeObserver(() => {
          fitAddon.fit()
          if (ws.readyState === WebSocket.OPEN && term.cols && term.rows) {
            ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
          }
        })

        resizeObserver.observe(containerRef.current)
      } catch (err) {
        if (!cancelled) {
          setInitError(err.message || 'Failed to load terminal')
          setLoading(false)
        }
      }
    }

    initTerminal()

    return () => {
      cancelled = true
      if (resizeObserver) resizeObserver.disconnect()
      if (disposable) disposable.dispose()
      if (term) term.dispose()
      if (ws && ws.readyState === WebSocket.OPEN) ws.close()
    }
  }, [])

  const reconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    setConnected(false)
    setError(null)
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }
    // Force remount via key change would be ideal, but we use container clearing
    // The useEffect won't re-run with empty deps, so reload the module
    window.location.reload()
  }

  if (initError) {
    return (
      <div>
        <div className="page-title">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
          Terminal
        </div>
        <div className="error-box">Failed to load terminal: {initError}</div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-title">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <polyline points="4 17 10 11 4 5" />
          <line x1="12" y1="19" x2="20" y2="19" />
        </svg>
        Terminal
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge ${connected ? 'badge-success' : 'badge-error'}`}>
            <span className="badge-dot" />
            {connected ? 'Connected' : 'Disconnected'}
          </span>
          <button className="btn btn-sm" onClick={reconnect}>
            Reconnect
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: '#94a3b8' }}>
          <div style={{
            width: 32, height: 32, border: '3px solid rgba(148,163,184,0.2)',
            borderTopColor: '#8b5cf6', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <span style={{ marginLeft: '0.75rem', fontSize: '0.875rem' }}>Loading terminal...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      ) : (
        <div className="terminal-container">
          <div ref={containerRef} className="terminal-xterm" />
        </div>
      )}
    </div>
  )
}
