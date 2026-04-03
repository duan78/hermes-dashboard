import { useState, useEffect, useCallback, useRef } from 'react'
import { UserCheck, RefreshCw, CheckCircle, XCircle, Trash2, Loader2, Clock, ShieldCheck } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './auth-pairing.css'

export default function AuthPairing() {
  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  // Actions
  const [actionLoading, setActionLoading] = useState({})

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const loadData = useCallback(async () => {
    try {
      const data = await api.authPairingList()
      setPending(data.pending || [])
      setApproved(data.approved || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleApprove = async (code) => {
    setActionLoading(prev => ({ ...prev, [`approve-${code}`]: true }))
    try {
      await api.authPairingApprove(code)
      showFeedback('Pairing approved', 'success')
      loadData()
    } catch (e) {
      showFeedback(`Approval failed: ${e.message}`, 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [`approve-${code}`]: false }))
    }
  }

  const handleRevoke = async (user) => {
    setActionLoading(prev => ({ ...prev, [`revoke-${user}`]: true }))
    try {
      await api.authPairingRevoke(user)
      showFeedback(`Access revoked for "${user}"`, 'success')
      loadData()
    } catch (e) {
      showFeedback(`Revoke failed: ${e.message}`, 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [`revoke-${user}`]: false }))
    }
  }

  const handleClearPending = async () => {
    setActionLoading(prev => ({ ...prev, clearPending: true }))
    try {
      await api.authPairingClearPending()
      showFeedback('Pending requests cleared', 'success')
      loadData()
    } catch (e) {
      showFeedback(`Clear failed: ${e.message}`, 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, clearPending: false }))
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <UserCheck size={28} />
        Auth Pairing
        <Tooltip text="Manage device pairing and authentication. Approve pending pairing requests or revoke access for approved devices." />
        <button className="btn btn-sm" onClick={loadData} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {feedback && (
        <div className={`action-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {/* Pending */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <Clock size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Pending Requests
            <Tooltip text="Pairing requests waiting for approval. Approve to grant access, or clear all to reject them." />
          </span>
          {pending.length > 0 && (
            <button
              className="btn btn-sm"
              onClick={handleClearPending}
              disabled={!!actionLoading.clearPending}
            >
              {actionLoading.clearPending ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
              Clear All
            </button>
          )}
        </div>
        {pending.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>No pending pairing requests</div>
        ) : (
          <div className="auth-list">
            {pending.map((item, i) => (
              <div key={i} className="auth-row pending">
                <div className="auth-info">
                  <div className="auth-code">
                    <code>{item.code || item.pairing_code || item.id}</code>
                  </div>
                  {item.platform && <span className="auth-platform-badge">{item.platform}</span>}
                  {item.created_at && <span className="auth-time">{item.created_at}</span>}
                </div>
                <Tooltip text="Approve this pairing request">
                  <button
                    className="btn btn-sm btn-approve"
                    onClick={() => handleApprove(item.code || item.pairing_code || item.id)}
                    disabled={!!actionLoading[`approve-${item.code || item.pairing_code || item.id}`]}
                  >
                    {actionLoading[`approve-${item.code || item.pairing_code || item.id}`]
                      ? <Loader2 size={14} className="spin" />
                      : <CheckCircle size={14} />}
                    Approve
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approved */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ShieldCheck size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
            Approved Devices
            <Tooltip text="Devices that have been paired and have active access. Revoke to remove their access." />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{approved.length} devices</span>
        </div>
        {approved.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>No approved devices</div>
        ) : (
          <div className="auth-list">
            {approved.map((item, i) => (
              <div key={i} className="auth-row approved">
                <div className="auth-info">
                  <div className="auth-user">
                    <ShieldCheck size={14} style={{ color: 'var(--success)' }} />
                    <span style={{ fontWeight: 600 }}>{item.user || item.name || item.device}</span>
                  </div>
                  {item.platform && <span className="auth-platform-badge">{item.platform}</span>}
                  {item.approved_at && <span className="auth-time">{item.approved_at}</span>}
                </div>
                <Tooltip text="Revoke access for this device">
                  <button
                    className="btn btn-sm btn-danger-icon"
                    onClick={() => handleRevoke(item.user || item.name || item.device)}
                    disabled={!!actionLoading[`revoke-${item.user || item.name || item.device}`]}
                  >
                    {actionLoading[`revoke-${item.user || item.name || item.device}`]
                      ? <Loader2 size={14} className="spin" />
                      : <XCircle size={14} />}
                    Revoke
                  </button>
                </Tooltip>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
