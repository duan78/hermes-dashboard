import { useState, useEffect, useCallback, useRef } from 'react'
import { Shield, RefreshCw, Eye, EyeOff, Plus, Trash2, Search, Loader2, CheckCircle, XCircle, X } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './env-vars.css'

function ConfirmModal({ title, message, onConfirm, onCancel, loading }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-sm" onClick={onCancel} style={{ padding: '2px 8px' }}><X size={16} /></button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : null} Delete
          </button>
        </div>
      </div>
    </div>
  )
}

export default function EnvVars() {
  const [vars, setVars] = useState([])
  const [required, setRequired] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  // Form
  const [formKey, setFormKey] = useState('')
  const [formValue, setFormValue] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // Filter
  const [search, setSearch] = useState('')

  // Visible values
  const [visibleKeys, setVisibleKeys] = useState(new Set())

  // Confirm delete
  const [deleteKey, setDeleteKey] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const loadData = useCallback(async () => {
    try {
      const [v, r] = await Promise.all([api.envVarsList(), api.envVarsRequired()])
      setVars(v.vars || [])
      setRequired(r.required || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const toggleVisible = (key) => {
    setVisibleKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formKey.trim()) return
    setFormLoading(true)
    try {
      await api.envVarsSet(formKey.trim(), formValue)
      showFeedback(`Variable "${formKey.trim()}" saved`, 'success')
      setFormKey('')
      setFormValue('')
      loadData()
    } catch (e) {
      showFeedback(`Failed to save: ${e.message}`, 'error')
    } finally {
      setFormLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await api.envVarsDelete(deleteKey)
      showFeedback(`Variable "${deleteKey}" deleted`, 'success')
      setDeleteKey(null)
      loadData()
    } catch (e) {
      showFeedback(`Failed to delete: ${e.message}`, 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  const filtered = vars.filter(v => v.key.toLowerCase().includes(search.toLowerCase()))

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Shield size={28} />
        Environment Variables
        <Tooltip text="Manage environment variables used by Hermes. View, set, and delete configuration keys. Required variables are checked for completeness." />
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

      {/* Required Variables */}
      {required.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">
              Required Variables
              <Tooltip text="These variables are required for proper Hermes operation. Ensure all are configured." />
            </span>
          </div>
          <div className="env-required-grid">
            {required.map(r => (
              <div key={r.key} className={`env-required-card ${r.configured ? 'configured' : 'missing'}`}>
                <div className="env-required-status">
                  {r.configured ? <CheckCircle size={18} /> : <XCircle size={18} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="env-required-key">{r.key}</div>
                  {r.description && <div className="env-required-desc">{r.description}</div>}
                  {r.category && <span className="env-category-badge">{r.category}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            All Variables
            <Tooltip text="All environment variables currently set in the Hermes environment. Sensitive values are masked by default." />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{vars.length} variables</span>
        </div>
        <div className="env-search-bar">
          <Search size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            type="text"
            className="form-input"
            placeholder="Filter variables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, fontSize: 13 }}
          />
        </div>
        <div className="env-vars-list">
          {filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 20 }}>
              {search ? 'No variables match your filter' : 'No environment variables set'}
            </div>
          ) : (
            filtered.map(v => (
              <div key={v.key} className="env-var-row">
                <div className="env-var-key">{v.key}</div>
                <div className="env-var-value">
                  <code>{visibleKeys.has(v.key) ? v.value : (v.has_value ? v.value : '(empty)')}</code>
                </div>
                <div className="env-var-badges">
                  {v.is_sensitive && <span className="env-badge sensitive">Sensitive</span>}
                  {v.has_value ? (
                    <span className="env-badge has-value">Set</span>
                  ) : (
                    <span className="env-badge empty">Empty</span>
                  )}
                </div>
                <div className="env-var-actions">
                  <Tooltip text={visibleKeys.has(v.key) ? 'Hide value' : 'Reveal value'}>
                    <button className="btn btn-sm" onClick={() => toggleVisible(v.key)}>
                      {visibleKeys.has(v.key) ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </Tooltip>
                  <Tooltip text="Edit variable">
                    <button className="btn btn-sm" onClick={() => { setFormKey(v.key); setFormValue('') }}>
                      <RefreshCw size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip text="Delete variable">
                    <button className="btn btn-sm btn-danger-icon" onClick={() => setDeleteKey(v.key)}>
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add / Edit Form */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            {formKey ? `Edit: ${formKey}` : 'Add Variable'}
            <Tooltip text="Set an environment variable. The value will be stored securely. Leave value empty to clear it." />
          </span>
          {formKey && (
            <button className="btn btn-sm" onClick={() => { setFormKey(''); setFormValue('') }}>
              <X size={14} /> Cancel Edit
            </button>
          )}
        </div>
        <form className="env-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="form-input"
            placeholder="KEY"
            value={formKey}
            onChange={e => setFormKey(e.target.value)}
            disabled={!!formKey && formKey !== formKey}
            style={{ fontFamily: 'var(--font-mono)', maxWidth: 300 }}
          />
          <input
            type="text"
            className="form-input"
            placeholder="Value"
            value={formValue}
            onChange={e => setFormValue(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary" type="submit" disabled={formLoading || !formKey.trim()}>
            {formLoading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            {formKey ? 'Update' : 'Add'}
          </button>
        </form>
      </div>

      {deleteKey && (
        <ConfirmModal
          title="Delete Variable"
          message={`Are you sure you want to delete the environment variable "${deleteKey}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteKey(null)}
          loading={deleteLoading}
        />
      )}
    </div>
  )
}
