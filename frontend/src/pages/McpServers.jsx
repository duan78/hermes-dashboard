import { useState, useEffect, useCallback, useRef } from 'react'
import { Network, RefreshCw, Plus, Trash2, Zap, Loader2, X, ChevronDown, ChevronRight, Edit3, Power, Info } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import './mcp-servers.css'

const TOOLTIPS = {
  type: "The MCP transport type. stdio launches a local process, http connects to a remote server.",
  transport: "The command or URL used to communicate with the MCP server.",
  tools: "Tools exposed by this MCP server. They are available in all Hermes conversations.",
  envVars: "Environment variables passed to the server. Useful for API keys.",
  toggle: "Enable or disable this MCP server without removing it. A disabled server won't connect on startup.",
  test: "Test the connection to the server and verify tools are accessible.",
  status: "Current server status. Enabled servers connect automatically on Hermes startup.",
}

function maskValue(val) {
  if (!val || typeof val !== 'string') return val
  if (val.length <= 8) return '****'
  return val.slice(0, 4) + '****' + val.slice(-4)
}


function KvRow({ items, onChange, onRemove, sensitiveKeys = [] }) {
  return items.map((item, idx) => (
    <div key={idx} className="mcp-kv-row">
      <input className="form-input mcp-kv-input" placeholder="Key" value={item.key} onChange={e => onChange(idx, 'key', e.target.value)} />
      <input className="form-input mcp-kv-input" type={sensitiveKeys.some(k => k.test(item.key)) ? 'password' : 'text'} placeholder="Value" value={item.value} onChange={e => onChange(idx, 'value', e.target.value)} />
      <button className="btn btn-sm btn-danger-icon" onClick={() => onRemove(idx)}><X size={12} /></button>
    </div>
  ))
}

function AddServerForm({ onClose, onAdded }) {
  const [formType, setFormType] = useState('stdio')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [envVars, setEnvVars] = useState([{ key: '', value: '' }])
  const [headers, setHeaders] = useState([{ key: '', value: '' }])
  const [timeout, setTimeout_] = useState('60')
  const [connectTimeout, setConnectTimeout] = useState('30')
  const [loading, setLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)

  const addKv = (setter) => setter(prev => [...prev, { key: '', value: '' }])
  const updateKv = (setter, idx, field, val) => setter(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  const removeKv = (setter, idx) => setter(prev => prev.filter((_, i) => i !== idx))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const body = { name: name.trim(), type: formType }
      if (formType === 'stdio') {
        body.command = command
        if (args.trim()) body.args = args.trim().split(/\s+/)
      } else {
        body.url = url
      }
      if (timeout) body.timeout = parseInt(timeout)
      if (connectTimeout) body.connect_timeout = parseInt(connectTimeout)
      await api.mcpAdd(body)
      onAdded(name.trim())
    } catch (err) {
      setTestResult({ success: false, message: err.message })
    } finally {
      setLoading(false)
    }
  }

  const handleTest = async () => {
    if (!name.trim()) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await api.mcpTest(name.trim())
      setTestResult({ success: res.success !== false, message: res.success ? `Connected. ${res.tools?.length || 0} tools found.` : (res.output || 'Test failed') })
    } catch (err) {
      setTestResult({ success: false, message: err.message })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="card mcp-add-card">
      <div className="card-header">
        <span className="card-title">Add MCP Server</span>
        <button className="btn btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      <form className="mcp-form" onSubmit={handleSubmit}>
        <div className="mcp-form-row">
          <label className="mcp-label">Name</label>
          <input type="text" className="form-input" placeholder="my-server" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="mcp-form-row">
          <label className="mcp-label">
            Type <Tooltip text={TOOLTIPS.type}><Info size={12} className="inline-icon" /></Tooltip>
          </label>
          <select className="form-select" value={formType} onChange={e => setFormType(e.target.value)}>
            <option value="stdio">stdio</option>
            <option value="sse">sse</option>
            <option value="streamable-http">streamable-http</option>
          </select>
        </div>
        {formType === 'stdio' ? (
          <>
            <div className="mcp-form-row">
              <label className="mcp-label">Command</label>
              <input type="text" className="form-input" placeholder="npx -y @modelcontextprotocol/server-filesystem" value={command} onChange={e => setCommand(e.target.value)} />
            </div>
            <div className="mcp-form-row">
              <label className="mcp-label">Args <span style={{ fontWeight: 400, fontSize: 11 }}>(space-separated)</span></label>
              <input type="text" className="form-input" placeholder="/path/to/dir" value={args} onChange={e => setArgs(e.target.value)} />
            </div>
          </>
        ) : (
          <div className="mcp-form-row">
            <label className="mcp-label">URL</label>
            <input type="text" className="form-input" placeholder="http://localhost:3000/mcp" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
        )}
        <div className="mcp-form-row">
          <label className="mcp-label">Timeout (s)</label>
          <input type="number" className="form-input" value={timeout} onChange={e => setTimeout_(e.target.value)} min="1" />
        </div>
        <div className="mcp-form-row">
          <label className="mcp-label">Connect Timeout (s)</label>
          <input type="number" className="form-input" value={connectTimeout} onChange={e => setConnectTimeout(e.target.value)} min="1" />
        </div>
        <div className="mcp-form-row">
          <label className="mcp-label">
            Env Vars <Tooltip text={TOOLTIPS.envVars}><Info size={12} className="inline-icon" /></Tooltip>
          </label>
          <div style={{ flex: 1 }}>
            <KvRow items={envVars} onChange={(i, f, v) => updateKv(setEnvVars, i, f, v)} onRemove={(i) => removeKv(setEnvVars, i)} sensitiveKeys={[/key/i, /token/i, /secret/i, /auth/i, /pass/i]} />
            <button type="button" className="btn btn-sm" onClick={() => addKv(setEnvVars)} style={{ marginTop: 4 }}>
              <Plus size={12} /> Add Env Var
            </button>
          </div>
        </div>
        {formType !== 'stdio' && (
          <div className="mcp-form-row">
            <label className="mcp-label">Headers</label>
            <div style={{ flex: 1 }}>
              <KvRow items={headers} onChange={(i, f, v) => updateKv(setHeaders, i, f, v)} onRemove={(i) => removeKv(setHeaders, i)} />
              <button type="button" className="btn btn-sm" onClick={() => addKv(setHeaders)} style={{ marginTop: 4 }}>
                <Plus size={12} /> Add Header
              </button>
            </div>
          </div>
        )}
        {testResult && (
          <div className={`mcp-test-result ${testResult.success ? 'success' : 'error'}`}>
            {testResult.message}
          </div>
        )}
        <div className="mcp-form-actions">
          <button type="button" className="btn" onClick={handleTest} disabled={testLoading || !name.trim()}>
            {testLoading ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
            Test
          </button>
          <button className="btn btn-primary" type="submit" disabled={loading || !name.trim()}>
            {loading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Add Server
          </button>
        </div>
      </form>
    </div>
  )
}

function EditServerModal({ server, onClose, onSaved }) {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [envVars, setEnvVars] = useState([{ key: '', value: '' }])
  const [headers, setHeaders] = useState([{ key: '', value: '' }])
  const [command, setCommand] = useState('')
  const [argsStr, setArgsStr] = useState('')
  const [url, setUrl] = useState('')
  const [timeout, setTimeout_] = useState('')
  const [connectTimeout, setConnectTimeout] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const res = await api.mcpConfig(server.name)
        if (res.config) {
          setConfig(res.config)
          setCommand(res.config.command || '')
          setArgsStr((res.config.args || []).join(' '))
          setUrl(res.config.url || '')
          setTimeout_(String(res.config.timeout || ''))
          setConnectTimeout(String(res.config.connect_timeout || ''))
          const env = res.config.env || {}
          setEnvVars(Object.keys(env).length > 0 ? Object.entries(env).map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }])
          const hdrs = res.config.headers || {}
          setHeaders(Object.keys(hdrs).length > 0 ? Object.entries(hdrs).map(([k, v]) => ({ key: k, value: v })) : [{ key: '', value: '' }])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    })()
  }, [server.name])

  const addKv = (setter) => setter(prev => [...prev, { key: '', value: '' }])
  const updateKv = (setter, idx, field, val) => setter(prev => prev.map((item, i) => i === idx ? { ...item, [field]: val } : item))
  const removeKv = (setter, idx) => setter(prev => prev.filter((_, i) => i !== idx))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const newConfig = { ...config }
      newConfig.command = command || undefined
      newConfig.args = argsStr.trim() ? argsStr.trim().split(/\s+/) : undefined
      newConfig.url = url || undefined
      newConfig.timeout = timeout ? parseInt(timeout) : undefined
      newConfig.connect_timeout = connectTimeout ? parseInt(connectTimeout) : undefined
      const envObj = {}
      envVars.filter(kv => kv.key.trim()).forEach(kv => { envObj[kv.key.trim()] = kv.value })
      newConfig.env = Object.keys(envObj).length > 0 ? envObj : undefined
      const hdrObj = {}
      headers.filter(kv => kv.key.trim()).forEach(kv => { hdrObj[kv.key.trim()] = kv.value })
      newConfig.headers = Object.keys(hdrObj).length > 0 ? hdrObj : undefined
      // Remove undefined values
      Object.keys(newConfig).forEach(k => newConfig[k] === undefined && delete newConfig[k])
      await api.mcpUpdateConfig(server.name, newConfig)
      onSaved(server.name)
    } catch (err) {
      // could show error feedback
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal" onClick={e => e.stopPropagation()}><div className="spinner" /></div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal mcp-edit-modal" onClick={e => e.stopPropagation()} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="modal-header">
          <h3>Edit: {server.name}</h3>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <form className="mcp-form" onSubmit={handleSave}>
          <div className="mcp-form-row">
            <label className="mcp-label">Command</label>
            <input type="text" className="form-input" value={command} onChange={e => setCommand(e.target.value)} />
          </div>
          <div className="mcp-form-row">
            <label className="mcp-label">Args</label>
            <input type="text" className="form-input" value={argsStr} onChange={e => setArgsStr(e.target.value)} placeholder="space-separated args" />
          </div>
          <div className="mcp-form-row">
            <label className="mcp-label">URL</label>
            <input type="text" className="form-input" value={url} onChange={e => setUrl(e.target.value)} />
          </div>
          <div className="mcp-form-row">
            <label className="mcp-label">Timeout (s)</label>
            <input type="number" className="form-input" value={timeout} onChange={e => setTimeout_(e.target.value)} min="1" />
          </div>
          <div className="mcp-form-row">
            <label className="mcp-label">Connect Timeout (s)</label>
            <input type="number" className="form-input" value={connectTimeout} onChange={e => setConnectTimeout(e.target.value)} min="1" />
          </div>
          <div className="mcp-form-row">
            <label className="mcp-label">
              Env Vars <Tooltip text={TOOLTIPS.envVars}><Info size={12} className="inline-icon" /></Tooltip>
            </label>
            <div style={{ flex: 1 }}>
              <KvRow items={envVars} onChange={(i, f, v) => updateKv(setEnvVars, i, f, v)} onRemove={(i) => removeKv(setEnvVars, i)} sensitiveKeys={[/key/i, /token/i, /secret/i, /auth/i, /pass/i]} />
              <button type="button" className="btn btn-sm" onClick={() => addKv(setEnvVars)} style={{ marginTop: 4 }}>
                <Plus size={12} /> Add Env Var
              </button>
            </div>
          </div>
          <div className="mcp-form-row">
            <label className="mcp-label">Headers</label>
            <div style={{ flex: 1 }}>
              <KvRow items={headers} onChange={(i, f, v) => updateKv(setHeaders, i, f, v)} onRemove={(i) => removeKv(setHeaders, i)} />
              <button type="button" className="btn btn-sm" onClick={() => addKv(setHeaders)} style={{ marginTop: 4 }}>
                <Plus size={12} /> Add Header
              </button>
            </div>
          </div>
          <div className="mcp-form-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? <Loader2 size={14} className="spin" /> : null}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ServerCard({ server, onToggle, onRemove, onEdit }) {
  const [expanded, setExpanded] = useState(false)
  const [tools, setTools] = useState(null)
  const [toolsLoading, setToolsLoading] = useState(false)
  const [configData, setConfigData] = useState(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [toggleLoading, setToggleLoading] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const isEnabled = server.status === 'enabled'

  const showFeedback = (msg, type) => {
    setFeedback({ message: msg, type })
    setTimeout(() => setFeedback(null), 4000)
  }

  const loadTools = async () => {
    if (tools !== null) { setExpanded(!expanded); return }
    setToolsLoading(true)
    try {
      const res = await api.mcpDetail(server.name)
      setTools(res.tools || [])
      setExpanded(true)
    } catch {
      setTools([])
      setExpanded(true)
    } finally {
      setToolsLoading(false)
    }
  }

  const loadConfig = async () => {
    setConfigLoading(true)
    try {
      const res = await api.mcpConfig(server.name)
      setConfigData(res.config)
    } catch {
      setConfigData(null)
    } finally {
      setConfigLoading(false)
    }
  }

  const handleTest = async () => {
    setTestLoading(true)
    try {
      const res = await api.mcpTest(server.name)
      showFeedback(res.success !== false ? `Connected. ${res.tools?.length || 0} tools found.` : 'Test failed: ' + (res.output || 'Unknown error'), res.success !== false ? 'success' : 'error')
    } catch (err) {
      showFeedback('Test failed: ' + err.message, 'error')
    } finally {
      setTestLoading(false)
    }
  }

  const handleToggle = async () => {
    setToggleLoading(true)
    try {
      await api.mcpToggle(server.name, !isEnabled)
      onToggle(server.name)
    } catch (err) {
      showFeedback('Toggle failed: ' + err.message, 'error')
    } finally {
      setToggleLoading(false)
    }
  }

  const handleExpand = () => {
    loadTools()
    if (!configData) loadConfig()
  }

  const envEntries = configData?.env ? Object.entries(configData.env) : []
  const headerEntries = configData?.headers ? Object.entries(configData.headers) : []

  return (
    <div className="mcp-card">
      <div className="mcp-card-header">
        <div className="mcp-card-header-left">
          <button className="btn btn-icon mcp-expand-btn" onClick={handleExpand}>
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
          <span className="mcp-server-name">{server.name}</span>
          <Tooltip text={TOOLTIPS.type}>
            <span className={`mcp-type-badge mcp-type-${server.type}`}>{server.type}</span>
          </Tooltip>
          <Tooltip text={TOOLTIPS.status}>
            <span className={`mcp-status-badge ${isEnabled ? 'enabled' : 'disabled'}`}>
              {isEnabled ? '● enabled' : '○ disabled'}
            </span>
          </Tooltip>
        </div>
        <div className="mcp-card-actions">
          <Tooltip text={TOOLTIPS.toggle}>
            <button className="btn btn-sm" onClick={handleToggle} disabled={toggleLoading}>
              {toggleLoading ? <Loader2 size={14} className="spin" /> : <Power size={14} />}
              {isEnabled ? 'Disable' : 'Enable'}
            </button>
          </Tooltip>
          <Tooltip text={TOOLTIPS.test}>
            <button className="btn btn-sm" onClick={handleTest} disabled={testLoading}>
              {testLoading ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
              Test
            </button>
          </Tooltip>
          <button className="btn btn-sm" onClick={() => onEdit(server)}><Edit3 size={14} /> Edit</button>
          <button className="btn btn-sm btn-danger-icon" onClick={() => onRemove(server.name)}><Trash2 size={14} /></button>
        </div>
      </div>

      {feedback && <div className={`mcp-feedback ${feedback.type}`}>{feedback.message}</div>}

      <div className="mcp-card-info">
        <Tooltip text={TOOLTIPS.transport}>
          <div className="mcp-info-item">
            <span className="mcp-info-label">Transport</span>
            <span className="mcp-info-value mcp-mono">{server.transport}</span>
          </div>
        </Tooltip>
        <Tooltip text={TOOLTIPS.tools}>
          <div className="mcp-info-item">
            <span className="mcp-info-label">Tools</span>
            <span className="mcp-info-value">{server.tools_count}</span>
          </div>
        </Tooltip>
        {configData?.timeout && (
          <div className="mcp-info-item">
            <span className="mcp-info-label">Timeout</span>
            <span className="mcp-info-value">{configData.timeout}s</span>
          </div>
        )}
        {configData?.connect_timeout && (
          <div className="mcp-info-item">
            <span className="mcp-info-label">Connect Timeout</span>
            <span className="mcp-info-value">{configData.connect_timeout}s</span>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mcp-card-details">
          {toolsLoading && <div className="spinner" style={{ padding: 16 }} />}
          {!toolsLoading && tools && tools.length > 0 && (
            <div className="mcp-section">
              <div className="mcp-section-title">Tools ({tools.length})</div>
              <div className="mcp-tools-list">
                {tools.map((tool, i) => (
                  <Tooltip key={i} text={tool.description || ''}>
                    <div className="mcp-tool-item">
                      <span className="mcp-tool-name">{tool.name}</span>
                      <span className="mcp-tool-desc">{tool.description}</span>
                    </div>
                  </Tooltip>
                ))}
              </div>
            </div>
          )}
          {!toolsLoading && tools && tools.length === 0 && (
            <div className="mcp-section">
              <div className="mcp-section-title">Tools</div>
              <div className="mcp-empty-detail">No tools found</div>
            </div>
          )}

          {envEntries.length > 0 && (
            <Tooltip text={TOOLTIPS.envVars}>
              <div className="mcp-section">
                <div className="mcp-section-title">Environment Variables</div>
                <div className="mcp-env-list">
                  {envEntries.map(([k, v], i) => (
                    <div key={i} className="mcp-env-item">
                      <span className="mcp-env-key">{k}</span>
                      <span className="mcp-env-value">{maskValue(v)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Tooltip>
          )}

          {headerEntries.length > 0 && (
            <div className="mcp-section">
              <div className="mcp-section-title">Headers</div>
              <div className="mcp-env-list">
                {headerEntries.map(([k, v], i) => (
                  <div key={i} className="mcp-env-item">
                    <span className="mcp-env-key">{k}</span>
                    <span className="mcp-env-value">{maskValue(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {configLoading && <div className="spinner" style={{ padding: 16 }} />}
        </div>
      )}
    </div>
  )
}

export default function McpServers() {
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const loadServers = useCallback(async () => {
    try {
      const data = await api.mcpList()
      setServers(data.servers || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadServers() }, [loadServers])

  const handleAdded = (name) => {
    showFeedback(`Server "${name}" added`, 'success')
    setShowForm(false)
    loadServers()
  }

  const handleRemove = async () => {
    setRemoveLoading(true)
    try {
      await api.mcpRemove(removeTarget)
      showFeedback(`Server "${removeTarget}" removed`, 'success')
      setRemoveTarget(null)
      loadServers()
    } catch (e) {
      showFeedback(`Remove failed: ${e.message}`, 'error')
    } finally {
      setRemoveLoading(false)
    }
  }

  const handleToggle = (name) => {
    showFeedback(`Server "${name}" toggled`, 'success')
    loadServers()
  }

  const handleEditSaved = (name) => {
    showFeedback(`Server "${name}" updated`, 'success')
    setEditTarget(null)
    loadServers()
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Network size={28} />
        MCP Servers
        <Tooltip text="Manage Model Context Protocol servers. Add MCP servers to extend Hermes with external tools and data sources." />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} /> Add Server
          </button>
          <button className="btn btn-sm" onClick={loadServers}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {feedback && <div className={`action-feedback ${feedback.type}`}>{feedback.message}</div>}

      {showForm && <AddServerForm onClose={() => setShowForm(false)} onAdded={handleAdded} />}

      {servers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Network size={48} style={{ opacity: 0.3 }} />
            <p>No MCP servers configured</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Add an MCP server to extend Hermes with external tools.
            </p>
          </div>
        </div>
      ) : (
        <div className="mcp-list">
          {servers.map(s => (
            <ServerCard key={s.name} server={s} onToggle={handleToggle} onRemove={setRemoveTarget} onEdit={setEditTarget} />
          ))}
        </div>
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remove Server"
          message={`Are you sure you want to remove the MCP server "${removeTarget}"?`}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
          loading={removeLoading}
        />
      )}

      {editTarget && (
        <EditServerModal server={editTarget} onClose={() => setEditTarget(null)} onSaved={handleEditSaved} />
      )}
    </div>
  )
}
