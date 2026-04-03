import { useState, useEffect } from 'react'
import { Webhook, Plus, Trash2, RefreshCw, Loader2, ExternalLink } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './webhooks.css'

export default function Webhooks() {
  const [webhooks, setWebhooks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [newUrl, setNewUrl] = useState('')
  const [newEvents, setNewEvents] = useState('')
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [raw, setRaw] = useState('')

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listWebhooks()
      setWebhooks(data.webhooks || [])
      setRaw(data.raw || '')
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!newUrl.trim()) return
    setAdding(true)
    try {
      const events = newEvents.split(',').map(e => e.trim()).filter(Boolean)
      await api.createWebhook(newUrl.trim(), events)
      setNewUrl('')
      setNewEvents('')
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (url) => {
    if (!confirm(`Delete webhook: ${url}?`)) return
    setDeleting(url)
    try {
      await api.deleteWebhook(url)
      load()
    } catch (e) {
      setError(e.message)
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Webhook size={28} />
        Webhooks
        <Tooltip text="Manage Hermes webhooks. Webhooks let you receive real-time HTTP callbacks when events occur in Hermes (new messages, session events, etc.). Configure a URL to receive POST requests." />
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Add webhook form */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Add Webhook
            <Tooltip text="Register a new webhook endpoint. Hermes will send HTTP POST requests to this URL when matching events occur." />
          </span>
        </div>
        <div className="webhook-add-form">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">URL</label>
            <input
              type="url"
              className="form-input"
              placeholder="https://example.com/webhook"
              value={newUrl}
              onChange={e => setNewUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">
              Events
              <Tooltip text="Comma-separated list of events to subscribe to. Leave empty for all events." />
            </label>
            <input
              type="text"
              className="form-input"
              placeholder="message.created, session.ended"
              value={newEvents}
              onChange={e => setNewEvents(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
          <button className="btn btn-primary" onClick={handleAdd} disabled={adding || !newUrl.trim()}>
            {adding ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>
      </div>

      {/* Webhook list */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Active Webhooks
            <Tooltip text="Currently registered webhooks. Each webhook receives POST requests for the configured events." />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{webhooks.length} webhook(s)</span>
        </div>

        {webhooks.length === 0 ? (
          <div className="empty-state">No webhooks configured</div>
        ) : (
          webhooks.map((wh, i) => (
            <div key={i} className="webhook-card">
              <div>
                <div className="webhook-url">
                  <ExternalLink size={12} style={{ marginRight: 6, opacity: 0.5 }} />
                  {wh.url}
                </div>
                {wh.events && wh.events.length > 0 && (
                  <div className="webhook-events" style={{ marginTop: 4 }}>
                    {wh.events.map((e, j) => (
                      <span key={j} className="badge badge-info" style={{ fontSize: 10 }}>{e}</span>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => handleDelete(wh.url)}
                disabled={deleting === wh.url}
              >
                {deleting === wh.url ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Raw output */}
      {raw && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Raw Output
              <Tooltip text="Unparsed output from hermes webhook list. Shown for debugging the parser." />
            </span>
          </div>
          <pre style={{ maxHeight: 200, overflow: 'auto' }}>{raw}</pre>
        </div>
      )}
    </div>
  )
}
