import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { Zap, ChevronDown, RefreshCw, Clock, CheckCircle, AlertCircle } from 'lucide-react'

export default function AutofeedIndicator() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const qc = useQueryClient()

  const { data: status } = useQuery({
    queryKey: ['autofeed-status'],
    queryFn: () => api.getAutofeedStatus(),
    refetchInterval: 30000,
  })

  const triggerMutation = useMutation({
    mutationFn: () => api.triggerAutofeedScan(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['autofeed-status'] })
    },
  })

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (!status) return null

  const stateColor = status.running ? '#22c55e' : status.last_error ? '#ef4444' : '#f59e0b'
  const stateLabel = status.running ? 'Running' : status.last_error ? 'Error' : 'Idle'
  const StateIcon = status.running ? CheckCircle : status.last_error ? AlertCircle : Clock

  return (
    <div className="autofeed-indicator" ref={ref}>
      <button className="autofeed-btn" onClick={() => setOpen(!open)} title="Autofeed Status">
        <Zap size={16} style={{ color: stateColor }} />
        <span className="autofeed-label" style={{ color: stateColor }}>{stateLabel}</span>
        <ChevronDown size={14} />
      </button>

      {open && (
        <div className="autofeed-dropdown">
          <div className="autofeed-dropdown-header">
            <Zap size={16} />
            <span>Autofeed Service</span>
          </div>

          <div className="autofeed-stat-row">
            <span className="autofeed-stat-label">Status</span>
            <span className="autofeed-stat-value" style={{ color: stateColor }}>
              <StateIcon size={14} /> {stateLabel}
            </span>
          </div>

          <div className="autofeed-stat-row">
            <span className="autofeed-stat-label">Interval</span>
            <span className="autofeed-stat-value">{Math.round((status.interval || 300) / 60)} min</span>
          </div>

          {status.last_scan && (
            <div className="autofeed-stat-row">
              <span className="autofeed-stat-label">Last scan</span>
              <span className="autofeed-stat-value">
                {new Date(status.last_scan).toLocaleTimeString()}
              </span>
            </div>
          )}

          {status.next_scan && (
            <div className="autofeed-stat-row">
              <span className="autofeed-stat-label">Next scan</span>
              <span className="autofeed-stat-value">
                {new Date(status.next_scan).toLocaleTimeString()}
              </span>
            </div>
          )}

          {status.scan_count != null && (
            <div className="autofeed-stat-row">
              <span className="autofeed-stat-label">Scans run</span>
              <span className="autofeed-stat-value">{status.scan_count}</span>
            </div>
          )}

          {status.items_created != null && (
            <div className="autofeed-stat-row">
              <span className="autofeed-stat-label">Items created</span>
              <span className="autofeed-stat-value">{status.items_created}</span>
            </div>
          )}

          {status.notifications_sent != null && (
            <div className="autofeed-stat-row">
              <span className="autofeed-stat-label">Notifications</span>
              <span className="autofeed-stat-value">{status.notifications_sent}</span>
            </div>
          )}

          {status.last_error && (
            <div className="autofeed-error">
              {status.last_error}
            </div>
          )}

          <button
            className="autofeed-force-btn"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending || status.running}
          >
            <RefreshCw size={14} className={triggerMutation.isPending ? 'spin' : ''} />
            {triggerMutation.isPending ? 'Scanning...' : 'Force Scan'}
          </button>
        </div>
      )}
    </div>
  )
}
