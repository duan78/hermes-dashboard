import { useEffect, useRef, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000

// Event -> query keys to invalidate
const EVENT_INVALIDATIONS = {
  'session:new': [['sessions'], ['overview']],
  'platform:status': [['platforms', 'status'], ['overview']],
  'cost:update': [['overview'], ['insights']],
  'cron:output': [['cron']],
  'notification:new': [['notifications'], ['notification-stats']],
  'activity:new': [['activity']],
}

export function useWebSocket(enabled = true) {
  const queryClient = useQueryClient()
  const wsRef = useRef(null)
  const reconnectAttempt = useRef(0)
  const reconnectTimer = useRef(null)
  const mounted = useRef(true)

  const connect = useCallback(() => {
    const token = localStorage.getItem('hermes_user_token') || localStorage.getItem('hermes_token') || ''

    if (!token) {
      // No token yet — retry later
      if (mounted.current) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_BASE)
      }
      return
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}/ws/hub`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      // Send auth as first message
      ws.send(JSON.stringify({ type: 'auth', token }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'auth_ok') {
          reconnectAttempt.current = 0
          return
        }

        if (msg.type === 'auth_error') {
          console.warn('[WS] Auth failed:', msg.data?.message)
          ws.close()
          return
        }

        // Invalidate relevant query caches based on event type
        const keys = EVENT_INVALIDATIONS[msg.type]
        if (keys) {
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key })
          }
        }
      } catch {
        // Ignore malformed messages
      }
    }

    ws.onclose = () => {
      if (!mounted.current) return
      const delay = Math.min(
        RECONNECT_BASE * Math.pow(2, reconnectAttempt.current),
        RECONNECT_MAX
      )
      reconnectAttempt.current++
      reconnectTimer.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      // onclose will fire after this, which handles reconnection
    }
  }, [queryClient])

  useEffect(() => {
    mounted.current = true

    if (enabled) {
      connect()
    }

    return () => {
      mounted.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on intentional close
        wsRef.current.close()
      }
    }
  }, [connect, enabled])

  return wsRef
}
