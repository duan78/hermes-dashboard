import { useState, useEffect, useCallback, useRef } from 'react'
import { Puzzle, RefreshCw, Plus, Trash2, Power, PowerOff, ArrowUpCircle, Loader2 } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import './plugins.css'

export default function Plugins() {
  const [plugins, setPlugins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  // Install form
  const [installUrl, setInstallUrl] = useState('')
  const [installLoading, setInstallLoading] = useState(false)

  // Action loading per plugin
  const [actionLoading, setActionLoading] = useState({})
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const loadPlugins = useCallback(async () => {
    try {
      const data = await api.pluginsList()
      setPlugins(data.plugins || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPlugins() }, [loadPlugins])

  const setPluginLoading = (name, loading) => {
    setActionLoading(prev => ({ ...prev, [name]: loading }))
  }

  const handleInstall = async (e) => {
    e.preventDefault()
    if (!installUrl.trim()) return
    setInstallLoading(true)
    try {
      await api.pluginsInstall(installUrl.trim())
      showFeedback('Plugin installed successfully', 'success')
      setInstallUrl('')
      loadPlugins()
    } catch (e) {
      showFeedback(`Install failed: ${e.message}`, 'error')
    } finally {
      setInstallLoading(false)
    }
  }

  const handleToggle = async (plugin) => {
    const action = plugin.enabled ? 'disable' : 'enable'
    setPluginLoading(plugin.name, true)
    try {
      await (plugin.enabled ? api.pluginsDisable(plugin.name) : api.pluginsEnable(plugin.name))
      showFeedback(`Plugin "${plugin.name}" ${action}d`, 'success')
      loadPlugins()
    } catch (e) {
      showFeedback(`Failed to ${action}: ${e.message}`, 'error')
    } finally {
      setPluginLoading(plugin.name, false)
    }
  }

  const handleUpdate = async (name) => {
    setPluginLoading(name, true)
    try {
      await api.pluginsUpdate(name)
      showFeedback(`Plugin "${name}" updated`, 'success')
      loadPlugins()
    } catch (e) {
      showFeedback(`Update failed: ${e.message}`, 'error')
    } finally {
      setPluginLoading(name, false)
    }
  }

  const handleRemove = async () => {
    setRemoveLoading(true)
    try {
      await api.pluginsRemove(removeTarget)
      showFeedback(`Plugin "${removeTarget}" removed`, 'success')
      setRemoveTarget(null)
      loadPlugins()
    } catch (e) {
      showFeedback(`Remove failed: ${e.message}`, 'error')
    } finally {
      setRemoveLoading(false)
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Puzzle size={28} />
        Plugins
        <Tooltip text="Manage Hermes plugins. Install new plugins from URLs, enable/disable existing ones, update or remove them." />
        <button className="btn btn-sm" onClick={loadPlugins} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {feedback && (
        <div className={`action-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {/* Install form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            Install Plugin
            <Tooltip text="Install a new plugin by providing its URL (git repository or package URL)." />
          </span>
        </div>
        <form className="plugin-install-form" onSubmit={handleInstall}>
          <input
            type="text"
            className="form-input"
            placeholder="Plugin URL (git repo or package URL)"
            value={installUrl}
            onChange={e => setInstallUrl(e.target.value)}
            style={{ flex: 1 }}
            aria-label="Plugin URL"
          />
          <button className="btn btn-primary" type="submit" disabled={installLoading || !installUrl.trim()}>
            {installLoading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Install
          </button>
        </form>
      </div>

      {/* Plugin list */}
      <div className="plugin-grid">
        {plugins.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Puzzle size={48} style={{ opacity: 0.3 }} />
              <p>No plugins installed</p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                Install a plugin by providing its URL above.
              </p>
            </div>
          </div>
        ) : (
          plugins.map(p => (
            <div key={p.name} className={`plugin-card ${p.enabled ? 'enabled' : 'disabled'}`}>
              <div className="plugin-card-header">
                <div>
                  <div className="plugin-name">{p.name}</div>
                  <div className="plugin-meta">
                    {p.version && <span className="plugin-version">v{p.version}</span>}
                    {p.source && <span className="plugin-source">{p.source}</span>}
                  </div>
                </div>
                <span className={`plugin-status-badge ${p.enabled ? 'active' : 'inactive'}`}>
                  {p.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {p.path && (
                <div className="plugin-path">
                  <Tooltip text="Plugin installation path">
                    <code>{p.path}</code>
                  </Tooltip>
                </div>
              )}
              <div className="plugin-actions">
                <Tooltip text={p.enabled ? 'Disable plugin' : 'Enable plugin'}>
                  <button
                    className={`btn btn-sm ${p.enabled ? 'btn-plugin-disable' : 'btn-plugin-enable'}`}
                    onClick={() => handleToggle(p)}
                    disabled={!!actionLoading[p.name]}
                  >
                    {actionLoading[p.name] ? <Loader2 size={14} className="spin" /> : (p.enabled ? <PowerOff size={14} /> : <Power size={14} />)}
                    {p.enabled ? 'Disable' : 'Enable'}
                  </button>
                </Tooltip>
                <Tooltip text="Check for updates">
                  <button className="btn btn-sm" onClick={() => handleUpdate(p.name)} disabled={!!actionLoading[p.name]}>
                    <ArrowUpCircle size={14} /> Update
                  </button>
                </Tooltip>
                <Tooltip text="Remove plugin">
                  <button className="btn btn-sm btn-danger-icon" onClick={() => setRemoveTarget(p.name)}>
                    <Trash2 size={14} /> Remove
                  </button>
                </Tooltip>
              </div>
            </div>
          ))
        )}
      </div>

      {removeTarget && (
        <ConfirmModal
          title="Remove Plugin"
          message={`Are you sure you want to remove the plugin "${removeTarget}"? This cannot be undone.`}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
          loading={removeLoading}
          confirmLabel="Remove"
        />
      )}
    </div>
  )
}
