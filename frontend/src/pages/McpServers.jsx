import { useState, useEffect, useCallback, useRef } from 'react'
import { Network, RefreshCw, Plus, Trash2, Zap, Loader2, X, ChevronDown, ChevronRight, Edit3, Power, Info, Key, Wifi, WifiOff, Shield, AlertCircle, CheckCircle2, XCircle, Circle } from 'lucide-react'
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
  sampling_enabled: "Enable LLM sampling callbacks for this MCP server. Some MCP servers can request LLM completions (e.g. for summarization, analysis). This controls whether Hermes responds to those requests.",
  sampling_model: "Model to use for MCP sampling callbacks. Leave empty to use the main agent model.",
  sampling_max_tokens: "Maximum tokens the model can generate per sampling request. Caps output length to prevent runaway generation.",
  sampling_timeout: "Timeout in seconds for each sampling request. If the model takes longer, the request is cancelled.",
  sampling_max_rpm: "Maximum sampling requests per minute. Rate-limits how often this server can call back to the LLM.",
  sampling_allowed_models: "List of model names the server is allowed to request. If empty, only the default model is used. One model per line.",
  connection_status: "Real-time connection status of this MCP server. Green = connected, Yellow = reconnecting, Red = disconnected.",
  oauth_status: "Status of OAuth authentication for this MCP server.",
  oauth_revoke: "Revoke the OAuth token. You will need to re-authorize to reconnect.",
  oauth_test: "Test whether the OAuth token is still valid and not expired.",
  oauth_authorize: "Configure OAuth authorization for MCP servers that require it.",
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
  const [samplingEnabled, setSamplingEnabled] = useState(false)
  const [samplingModel, setSamplingModel] = useState('')
  const [samplingMaxTokens, setSamplingMaxTokens] = useState('')
  const [samplingTimeout, setSamplingTimeout] = useState('')
  const [samplingMaxRpm, setSamplingMaxRpm] = useState('')
  const [samplingAllowedModels, setSamplingAllowedModels] = useState('')

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
      if (samplingEnabled || samplingModel || samplingMaxTokens || samplingTimeout || samplingMaxRpm || samplingAllowedModels) {
        body.sampling = { enabled: samplingEnabled }
        if (samplingModel) body.sampling.model = samplingModel
        if (samplingMaxTokens) body.sampling.max_tokens_cap = parseInt(samplingMaxTokens)
        if (samplingTimeout) body.sampling.timeout = parseInt(samplingTimeout)
        if (samplingMaxRpm) body.sampling.max_rpm = parseInt(samplingMaxRpm)
        if (samplingAllowedModels.trim()) body.sampling.allowed_models = samplingAllowedModels.trim().split('\n').map(s => s.trim()).filter(Boolean)
      }
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
        <details className="mcp-sampling-details" style={{ marginTop: 12 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ChevronRight size={14} />
            Sampling Configuration
            <Tooltip text="Configure LLM sampling callbacks for this server. Some MCP servers request the model to generate text (e.g. for summarization).">
              <Info size={12} className="inline-icon" />
            </Tooltip>
          </summary>
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            <div className="mcp-form-row">
              <label className="mcp-label">
                Sampling Enabled <Tooltip text={TOOLTIPS.sampling_enabled}><Info size={12} className="inline-icon" /></Tooltip>
              </label>
              <label className="toggle-wrap" style={{ margin: 0 }}>
                <input type="checkbox" checked={samplingEnabled} onChange={e => setSamplingEnabled(e.target.checked)} />
                <span className="toggle-track" />
              </label>
            </div>
            <div className="mcp-form-row">
              <label className="mcp-label">
                Model <Tooltip text={TOOLTIPS.sampling_model}><Info size={12} className="inline-icon" /></Tooltip>
              </label>
              <input type="text" className="form-input" placeholder="Leave empty for main model" value={samplingModel} onChange={e => setSamplingModel(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div className="mcp-form-row">
                <label className="mcp-label">
                  Max Tokens <Tooltip text={TOOLTIPS.sampling_max_tokens}><Info size={12} className="inline-icon" /></Tooltip>
                </label>
                <input type="number" className="form-input" placeholder="e.g. 4096" value={samplingMaxTokens} onChange={e => setSamplingMaxTokens(e.target.value)} min="1" />
              </div>
              <div className="mcp-form-row">
                <label className="mcp-label">
                  Timeout (s) <Tooltip text={TOOLTIPS.sampling_timeout}><Info size={12} className="inline-icon" /></Tooltip>
                </label>
                <input type="number" className="form-input" placeholder="e.g. 30" value={samplingTimeout} onChange={e => setSamplingTimeout(e.target.value)} min="1" />
              </div>
              <div className="mcp-form-row">
                <label className="mcp-label">
                  Max RPM <Tooltip text={TOOLTIPS.sampling_max_rpm}><Info size={12} className="inline-icon" /></Tooltip>
                </label>
                <input type="number" className="form-input" placeholder="e.g. 60" value={samplingMaxRpm} onChange={e => setSamplingMaxRpm(e.target.value)} min="1" />
              </div>
            </div>
            <div className="mcp-form-row">
              <label className="mcp-label">
                Allowed Models <Tooltip text={TOOLTIPS.sampling_allowed_models}><Info size={12} className="inline-icon" /></Tooltip>
              </label>
              <textarea className="form-textarea" placeholder="One model per line (e.g. claude-sonnet-4, gpt-4o)" value={samplingAllowedModels} onChange={e => setSamplingAllowedModels(e.target.value)} style={{ fontSize: 12, minHeight: 50 }} />
            </div>
          </div>
        </details>

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
  const [samplingEnabled, setSamplingEnabled] = useState(false)
  const [samplingModel, setSamplingModel] = useState('')
  const [samplingMaxTokens, setSamplingMaxTokens] = useState('')
  const [samplingTimeout, setSamplingTimeout] = useState('')
  const [samplingMaxRpm, setSamplingMaxRpm] = useState('')
  const [samplingAllowedModels, setSamplingAllowedModels] = useState('')

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
          // Load sampling config
          const samp = res.config.sampling || {}
          setSamplingEnabled(!!samp.enabled)
          setSamplingModel(samp.model || '')
          setSamplingMaxTokens(samp.max_tokens_cap != null ? String(samp.max_tokens_cap) : '')
          setSamplingTimeout(samp.timeout != null ? String(samp.timeout) : '')
          setSamplingMaxRpm(samp.max_rpm != null ? String(samp.max_rpm) : '')
          setSamplingAllowedModels((samp.allowed_models || []).join('\n'))
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
      // Sampling config
      if (samplingEnabled || samplingModel || samplingMaxTokens || samplingTimeout || samplingMaxRpm || samplingAllowedModels.trim()) {
        newConfig.sampling = { enabled: samplingEnabled }
        if (samplingModel) newConfig.sampling.model = samplingModel
        if (samplingMaxTokens) newConfig.sampling.max_tokens_cap = parseInt(samplingMaxTokens)
        if (samplingTimeout) newConfig.sampling.timeout = parseInt(samplingTimeout)
        if (samplingMaxRpm) newConfig.sampling.max_rpm = parseInt(samplingMaxRpm)
        if (samplingAllowedModels.trim()) newConfig.sampling.allowed_models = samplingAllowedModels.trim().split('\n').map(s => s.trim()).filter(Boolean)
      }
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
          <details className="mcp-sampling-details" style={{ marginTop: 12 }}>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ChevronRight size={14} />
              Sampling Configuration
              <Tooltip text="Configure LLM sampling callbacks for this server. Some MCP servers request the model to generate text (e.g. for summarization).">
                <Info size={12} className="inline-icon" />
              </Tooltip>
            </summary>
            <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
              <div className="mcp-form-row">
                <label className="mcp-label">
                  Sampling Enabled <Tooltip text={TOOLTIPS.sampling_enabled}><Info size={12} className="inline-icon" /></Tooltip>
                </label>
                <label className="toggle-wrap" style={{ margin: 0 }}>
                  <input type="checkbox" checked={samplingEnabled} onChange={e => setSamplingEnabled(e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </div>
              <div className="mcp-form-row">
                <label className="mcp-label">
                  Model <Tooltip text={TOOLTIPS.sampling_model}><Info size={12} className="inline-icon" /></Tooltip>
                </label>
                <input type="text" className="form-input" placeholder="Leave empty for main model" value={samplingModel} onChange={e => setSamplingModel(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div className="mcp-form-row">
                  <label className="mcp-label">
                    Max Tokens <Tooltip text={TOOLTIPS.sampling_max_tokens}><Info size={12} className="inline-icon" /></Tooltip>
                  </label>
                  <input type="number" className="form-input" placeholder="e.g. 4096" value={samplingMaxTokens} onChange={e => setSamplingMaxTokens(e.target.value)} min="1" />
                </div>
                <div className="mcp-form-row">
                  <label className="mcp-label">
                    Timeout (s) <Tooltip text={TOOLTIPS.sampling_timeout}><Info size={12} className="inline-icon" /></Tooltip>
                  </label>
                  <input type="number" className="form-input" placeholder="e.g. 30" value={samplingTimeout} onChange={e => setSamplingTimeout(e.target.value)} min="1" />
                </div>
                <div className="mcp-form-row">
                  <label className="mcp-label">
                    Max RPM <Tooltip text={TOOLTIPS.sampling_max_rpm}><Info size={12} className="inline-icon" /></Tooltip>
                  </label>
                  <input type="number" className="form-input" placeholder="e.g. 60" value={samplingMaxRpm} onChange={e => setSamplingMaxRpm(e.target.value)} min="1" />
                </div>
              </div>
              <div className="mcp-form-row">
                <label className="mcp-label">
                  Allowed Models <Tooltip text={TOOLTIPS.sampling_allowed_models}><Info size={12} className="inline-icon" /></Tooltip>
                </label>
                <textarea className="form-textarea" placeholder="One model per line (e.g. claude-sonnet-4, gpt-4o)" value={samplingAllowedModels} onChange={e => setSamplingAllowedModels(e.target.value)} style={{ fontSize: 12, minHeight: 50 }} />
              </div>
            </div>
          </details>

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


// Task 3: Connection status indicator
function ConnectionStatusDot({ serverName, connectionStatuses }) {
  const status = connectionStatuses?.find(s => s.name === serverName)
  if (!status) return null

  const dotStyles = {
    connected: { color: '#22c55e', label: 'Connected' },
    connecting: { color: '#eab308', label: 'Connecting...' },
    disconnected: { color: '#ef4444', label: 'Disconnected' },
    disabled: { color: '#94a3b8', label: 'Disabled' },
  }
  const info = dotStyles[status.status] || dotStyles.disabled

  return (
    <Tooltip text={TOOLTIPS.connection_status}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
        <Circle size={8} fill={info.color} stroke={info.color} />
        <span style={{ color: info.color }}>{info.label}</span>
        {status.retry_count > 0 && (
          <span style={{ color: '#eab308', fontSize: 10 }}>(retry #{status.retry_count})</span>
        )}
      </span>
    </Tooltip>
  )
}

function ServerCard({ server, onToggle, onRemove, onEdit, connectionStatuses }) {
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
          <ConnectionStatusDot serverName={server.name} connectionStatuses={connectionStatuses} />
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


// Task 2: OAuth Connections section
function OAuthConnections({ connections, loading, onRevoke, onTest }) {
  const statusBadge = (status) => {
    const styles = {
      connected: { background: 'var(--success-bg, #d4edda)', color: 'var(--success, #155724)' },
      disconnected: { background: 'var(--error-bg, #f8d7da)', color: 'var(--error, #721c24)' },
      error: { background: 'var(--error-bg, #f8d7da)', color: 'var(--error, #721c24)' },
    }
    const icons = { connected: CheckCircle2, disconnected: XCircle, error: AlertCircle }
    const Icon = icons[status] || AlertCircle
    return (
      <span className="badge" style={{ ...styles[status] || styles.error, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Icon size={12} /> {status}
      </span>
    )
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span className="card-title">
          <Key size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
          OAuth Connections
          <Tooltip text="OAuth tokens for MCP servers that require authentication. Tokens are stored in ~/.hermes/.mcp_oauth/." />
        </span>
      </div>
      {loading ? <div className="spinner" style={{ padding: 16 }} /> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Server Name <Tooltip text="The MCP server name associated with this OAuth token." /></th>
                <th>Status <Tooltip text="connected = valid token, disconnected = no token or expired." /></th>
                <th>Token Type <Tooltip text="The type of OAuth token (e.g. Bearer)." /></th>
                <th>Expiry <Tooltip text="When the OAuth token expires." /></th>
                <th>Scope <Tooltip text="OAuth scopes/permissions granted by the token." /></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {connections.map((conn, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{conn.server_name}</td>
                  <td>{statusBadge(conn.status)}</td>
                  <td><span className="badge badge-info">{conn.token_type}</span></td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{conn.expires_at || '-'}</td>
                  <td style={{ fontSize: 12 }}>{conn.scope || '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Tooltip text={TOOLTIPS.oauth_test}>
                        <button className="btn btn-sm" onClick={() => onTest(conn.server_name)}>
                          <Zap size={12} /> Test
                        </button>
                      </Tooltip>
                      <Tooltip text={TOOLTIPS.oauth_revoke}>
                        <button className="btn btn-sm btn-danger" onClick={() => onRevoke(conn.server_name)}>
                          <Shield size={12} /> Revoke
                        </button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
              {connections.length === 0 && (
                <tr>
                  <td colSpan={6} className="empty-state">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <Key size={32} style={{ opacity: 0.3 }} />
                      <span>No OAuth connections configured</span>
                      <Tooltip text={TOOLTIPS.oauth_authorize}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          OAuth tokens are created when connecting to MCP servers that require authentication.
                        </span>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
  const [oauthConnections, setOauthConnections] = useState([])
  const [oauthLoading, setOauthLoading] = useState(false)
  const [connStatuses, setConnStatuses] = useState([])
  const [connLoading, setConnLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('servers')

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

  // Load OAuth and connection status, poll connection status every 30 seconds
  const loadOAuth = useCallback(async () => {
    setOauthLoading(true)
    try {
      const data = await api.mcpOAuthStatus()
      setOauthConnections(data.connections || [])
    } catch {}
    finally { setOauthLoading(false) }
  }, [])

  const loadConnStatus = useCallback(async () => {
    setConnLoading(true)
    try {
      const data = await api.mcpConnectionStatus()
      setConnStatuses(data.servers || [])
    } catch {}
    finally { setConnLoading(false) }
  }, [])

  useEffect(() => {
    loadOAuth()
    loadConnStatus()
    const interval = setInterval(loadConnStatus, 30000)
    return () => clearInterval(interval)
  }, [loadOAuth, loadConnStatus])

  const revokeOAuth = async (name) => {
    try {
      await api.mcpOAuthRevoke(name)
      showFeedback(`OAuth token for "${name}" revoked`, 'success')
      loadOAuth()
    } catch (e) {
      showFeedback(`Revoke failed: ${e.message}`, 'error')
    }
  }

  const testOAuth = async (name) => {
    try {
      const res = await api.mcpOAuthTest(name)
      showFeedback(res.success ? `OAuth for "${name}" is valid` : `OAuth test failed: ${res.message}`, res.success ? 'success' : 'error')
    } catch (e) {
      showFeedback(`OAuth test failed: ${e.message}`, 'error')
    }
  }

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
            <ServerCard key={s.name} server={s} onToggle={handleToggle} onRemove={setRemoveTarget} onEdit={setEditTarget} connectionStatuses={connStatuses} />
          ))}
        </div>
      )}

      {/* Task 2: OAuth Connections Section */}
      <OAuthConnections connections={oauthConnections} loading={oauthLoading} onRevoke={revokeOAuth} onTest={testOAuth} />

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
