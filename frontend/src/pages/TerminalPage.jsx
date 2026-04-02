import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './terminal.css'

const WS_PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:'

export default function TerminalPage() {
  const termRef = useRef(null)
  const containerRef = useRef(null)
  const wsRef = useRef(null)
  const fitAddonRef = useRef(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
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

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    fitAddonRef.current = fitAddon
    termRef.current = term
    term.open(containerRef.current)

    // Connect WebSocket
    const token = localStorage.getItem('hermes_token') || ''
    const wsUrl = `${WS_PROTOCOL}//${window.location.host}/ws/terminal`
    const ws = new WebSocket(wsUrl)

    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      setConnected(true)
      setError(null)
      // Initial fit
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

    // Send terminal input to WebSocket
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

    return () => {
      resizeObserver.disconnect()
      disposable.dispose()
      term.dispose()
      if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    }
  }, [])

  const reconnect = () => {
    if (wsRef.current) {
      wsRef.current.close()
    }
    // Force remount by toggling connected
    setConnected(false)
    setError(null)
    // The useEffect cleanup + re-run will handle reconnection
    // We need to force a remount
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
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

      <div className="terminal-container">
        <div ref={containerRef} className="terminal-xterm" />
      </div>
    </div>
  )
}
