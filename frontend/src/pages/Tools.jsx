import { useState, useEffect } from 'react'
import { Wrench, RefreshCw, Loader2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Settings, X, Check, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

// ── Agent-Reach Channel Display ──

function AgentReachChannels({ data, loading, onRefresh }) {
  const [installing, setInstalling] = useState(null)
  const [installMsg, setInstallMsg] = useState({})

  const handleInstall = async (key, name) => {
    setInstalling(key)
    setInstallMsg(prev => ({ ...prev, [key]: null }))
    try {
      const res = await api.configureAgentReach(key)
      if (res.status === 'ok') {
        setInstallMsg(prev => ({ ...prev, [key]: 'Installed!' }))
        if (onRefresh) setTimeout(onRefresh, 1000)
      } else {
        setInstallMsg(prev => ({ ...prev, [key]: res.output || 'Install failed' }))
      }
    } catch (e) {
      setInstallMsg(prev => ({ ...prev, [key]: `Error: ${e.message}` }))
    } finally {
      setInstalling(null)
    }
  }

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 32 }}><Loader2 size={20} className="spin" /></div>
  }

  if (!data || !data.installed) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        Agent Reach is not installed. <code>pip install agent-reach</code>
        {data && data.error && <div style={{ marginTop: 8, color: 'var(--error)', fontSize: 12 }}>{data.error}</div>}
      </div>
    )
  }

  const channels = data.channels || {}
  const entries = Object.entries(channels)
  if (entries.length === 0) {
    return <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No channels found.</div>
  }

  const okCount = entries.filter(([, v]) => v.status === 'ok').length
  const total = entries.length

  // Group by tier
  const tiers = { 0: [], 1: [], 2: [] }
  for (const [key, val] of entries) {
    const tier = val.tier ?? 1
    if (!tiers[tier]) tiers[tier] = []
    tiers[tier].push([key, val])
  }

  const tierLabels = { 0: 'Zero Config', 1: 'Optional', 2: 'Advanced' }
  const tierColors = { 0: 'var(--success)', 1: 'var(--accent)', 2: 'var(--warning)' }

  const statusIcon = (status) => {
    if (status === 'ok') return <span style={{ color: 'var(--success)' }}><Check size={14} /></span>
    if (status === 'warn') return <span style={{ color: 'var(--warning)' }}>⚠</span>
    return <span style={{ color: 'var(--error)' }}>✕</span>
  }

  return (
    <div>
      <div style={{
        background: 'var(--accent-alpha, rgba(99,102,241,0.1))',
        border: '1px solid var(--accent, #6366f1)',
        borderRadius: 10,
        padding: '12px 16px',
        marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>
          Agent Reach — Multi-platform search &amp; read
        </span>
        <span className="badge badge-success" style={{ fontSize: 11 }}>
          {okCount}/{total} channels active
        </span>
      </div>

      {[0, 1, 2].map(tier => {
        const items = tiers[tier]
        if (!items || items.length === 0) return null
        return (
          <div key={tier} style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                color: tierColors[tier],
              }}>
                {tierLabels[tier]}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                ({items.length})
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(([key, val]) => (
                <div key={key} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: val.status === 'ok' ? 'rgba(34,197,94,0.06)' :
                              val.status === 'warn' ? 'rgba(234,179,8,0.06)' :
                              'rgba(239,68,68,0.04)',
                  border: `1px solid ${
                    val.status === 'ok' ? 'rgba(34,197,94,0.15)' :
                    val.status === 'warn' ? 'rgba(234,179,8,0.2)' :
                    'rgba(239,68,68,0.1)'
                  }`,
                }}>
                  <div style={{ flexShrink: 0 }}>{statusIcon(val.status)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{val.name || key}</span>
                      {val.backends && val.backends.length > 0 && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {val.backends.map((b, i) => (
                            <span key={i} style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 4,
                              background: 'var(--bg-tertiary, rgba(255,255,255,0.08))',
                              color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                            }}>{b}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    {val.message && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={val.message}>
                        {val.message}
                      </div>
                    )}
                    {installMsg[key] && (
                      <div style={{ fontSize: 11, marginTop: 4, color: installMsg[key].startsWith('Error') ? 'var(--error)' : 'var(--success)' }}>
                        {installMsg[key]}
                      </div>
                    )}
                  </div>
                  {val.status !== 'ok' && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleInstall(key, val.name)}
                      disabled={installing === key}
                      title={`Install ${val.name || key}`}
                    >
                      {installing === key ? <Loader2 size={12} className="spin" /> : 'Install'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tool Config Panel (Modal/Drawer) ──

function ToolConfigPanel({ toolKey, toolInfo, onClose, onSaved }) {
  const [saving, setSaving] = useState({})
  const [values, setValues] = useState({})
  const [showValues, setShowValues] = useState({})
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [saveMsg, setSaveMsg] = useState({})
  const [agentReachData, setAgentReachData] = useState(null)
  const [agentReachLoading, setAgentReachLoading] = useState(false)

  useEffect(() => {
    // Initialize values and detect active provider
    if (toolInfo.has_providers) {
      const activeIdx = toolInfo.providers.findIndex(p => p.is_active)
      if (activeIdx >= 0) setSelectedProvider(activeIdx)
      else if (toolInfo.providers.length > 0) setSelectedProvider(0)
    }
  }, [toolInfo])

  useEffect(() => {
    // Load Agent-Reach channel status when this category is opened
    if (toolInfo.channels) {
      setAgentReachLoading(true)
      api.getAgentReachStatus()
        .then(data => setAgentReachData(data))
        .catch(() => setAgentReachData({ installed: false, channels: {} }))
        .finally(() => setAgentReachLoading(false))
    }
  }, [toolInfo])

  const handleSaveEnv = async (key, configKey, configValue) => {
    const val = values[key]
    if (val === undefined) return
    setSaving(prev => ({ ...prev, [key]: true }))
    setSaveMsg(prev => ({ ...prev, [key]: null }))
    try {
      await api.setToolEnv(key, val, configKey, configValue)
      setSaveMsg(prev => ({ ...prev, [key]: 'Saved!' }))
      setSaving(prev => ({ ...prev, [key]: false }))
      onSaved()
      setTimeout(() => setSaveMsg(prev => ({ ...prev, [key]: null })), 3000)
    } catch (e) {
      setSaveMsg(prev => ({ ...prev, [key]: `Error: ${e.message}` }))
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleKeyDown = (e, key, configKey, configValue) => {
    if (e.key === 'Enter') handleSaveEnv(key, configKey, configValue)
  }

  const toggleShowValue = (key) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (!toolInfo) return null

  return (
    <div className="tool-config-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="tool-config-panel" onClick={e => e.stopPropagation()} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="tool-config-header">
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Settings size={20} style={{ color: 'var(--accent)' }} />
              {toolInfo.name || toolKey}
            </h2>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{toolKey}</span>
          </div>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>

        <div className="tool-config-body">
          {toolInfo.mode === "combined" && (
            <div style={{
              background: 'var(--accent-alpha, rgba(99,102,241,0.1))',
              border: '1px solid var(--accent, #6366f1)',
              borderRadius: 10,
              padding: '14px 16px',
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>
                  ⚡ Combined Mode Active
                </span>
                {toolInfo.active_provider && (
                  <span className="badge badge-success" style={{ fontSize: 10 }}>Active</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                {toolInfo.mode_description || 'Queries multiple search APIs in parallel and deduplicates results by URL.'}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {toolInfo.combined_backends && toolInfo.combined_backends.map(be => (
                  <div key={be.key} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: be.is_set ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${be.is_set ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.2)'}`,
                    borderRadius: 8,
                    padding: '6px 10px',
                    fontSize: 12,
                  }}>
                    <span style={{ fontWeight: 600 }}>{be.name}</span>
                    {be.is_set ? (
                      <span style={{ color: 'var(--success)', fontSize: 11 }}><Check size={12} /> {be.value_preview}</span>
                    ) : (
                      <span style={{ color: 'var(--error)', fontSize: 11 }}>Not configured</span>
                    )}
                    {!be.is_set && be.url && (
                      <a href={be.url} target="_blank" rel="noopener" style={{ color: 'var(--accent)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <ExternalLink size={10} /> Get key
                      </a>
                    )}
                  </div>
                ))}
              </div>
              {toolInfo.combined_active_count > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                  {toolInfo.combined_active_count} backend{toolInfo.combined_active_count > 1 ? 's' : ''} configured — results are queried in parallel and deduplicated
                </div>
              )}
            </div>
          )}
          {toolInfo.channels ? (
            <AgentReachChannels data={agentReachData} loading={agentReachLoading} onRefresh={() => {
              setAgentReachLoading(true)
              api.getAgentReachStatus()
                .then(data => setAgentReachData(data))
                .catch(() => setAgentReachData({ installed: false, channels: {} }))
                .finally(() => setAgentReachLoading(false))
            }} />
          ) : toolInfo.has_providers ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Provider
                </div>
                {toolInfo.providers.map((prov, idx) => (
                  <label key={idx} className={`tool-provider-option ${selectedProvider === idx ? 'active' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input
                        type="radio"
                        name="provider"
                        checked={selectedProvider === idx}
                        onChange={() => setSelectedProvider(idx)}
                        style={{ accentColor: 'var(--accent)' }}
                      />
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 14 }}>{prov.name}</span>
                          {prov.is_active && (
                            <span className="badge badge-success" style={{ fontSize: 10 }}>Active</span>
                          )}
                          {prov.configured && !prov.is_active && (
                            <span className="badge badge-info" style={{ fontSize: 10 }}>Configured</span>
                          )}
                        </div>
                        {prov.tag && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{prov.tag}</div>
                        )}
                      </div>
                    </div>
                    {selectedProvider === idx && prov.env_vars && prov.env_vars.length > 0 && (
                      <div className="tool-env-vars">
                        {prov.env_vars.map(ev => (
                          <div key={ev.key} className="tool-env-field">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                                {ev.label || ev.key}
                              </label>
                              {ev.url && (
                                <a href={ev.url} target="_blank" rel="noopener" style={{ color: 'var(--accent)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                  <ExternalLink size={10} /> Get key
                                </a>
                              )}
                              <span style={{ marginLeft: 'auto' }}>
                                {ev.is_set ? (
                                  <span className="badge badge-success" style={{ fontSize: 10 }}><Check size={10} /> Set</span>
                                ) : (
                                  <span className="badge badge-error" style={{ fontSize: 10 }}>Missing</span>
                                )}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <div style={{ position: 'relative', flex: 1 }}>
                                <input
                                  className="form-input"
                                  type={showValues[ev.key] ? 'text' : 'password'}
                                  placeholder={ev.is_set ? (ev.value_preview || '****') : `Enter ${ev.label || ev.key}`}
                                  value={values[ev.key] !== undefined ? values[ev.key] : ''}
                                  onChange={e => setValues(prev => ({ ...prev, [ev.key]: e.target.value }))}
                                  onKeyDown={e => handleKeyDown(e, ev.key, prov.config_key, prov.config_value)}
                                  style={{ fontSize: 13, padding: '6px 36px 6px 10px' }}
                                />
                                <button
                                  onClick={() => toggleShowValue(ev.key)}
                                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                                >
                                  {showValues[ev.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => handleSaveEnv(ev.key, prov.config_key, prov.config_value)}
                                disabled={saving[ev.key] || !values[ev.key]}
                              >
                                {saving[ev.key] ? <Loader2 size={12} className="spin" /> : 'Save'}
                              </button>
                            </div>
                            {saveMsg[ev.key] && (
                              <div style={{ fontSize: 11, marginTop: 4, color: saveMsg[ev.key].startsWith('Error') ? 'var(--error)' : 'var(--success)' }}>
                                {saveMsg[ev.key]}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedProvider === idx && prov.env_vars && prov.env_vars.length === 0 && (
                      <div className="tool-env-vars">
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>
                          No API key required for this provider.
                          {prov.config_key && (
                            <button
                              className="btn btn-sm btn-primary"
                              style={{ marginLeft: 8 }}
                              onClick={() => handleSaveEnv('__noop__', '', prov.config_key, prov.config_value)}
                              disabled={saving['__noop__']}
                            >
                              {saving['__noop__'] ? <Loader2 size={12} className="spin" /> : 'Set as Active'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                API Keys
              </div>
              {toolInfo.configured ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--success)', fontSize: 13 }}>
                  <Check size={14} /> All required keys are configured
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: 'var(--warning)', fontSize: 13 }}>
                  Some required keys are missing
                </div>
              )}
              {toolInfo.env_vars && toolInfo.env_vars.map(ev => (
                <div key={ev.key} className="tool-env-field">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {ev.label || ev.key}
                    </label>
                    {ev.url && (
                      <a href={ev.url} target="_blank" rel="noopener" style={{ color: 'var(--accent)', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <ExternalLink size={10} /> Get key
                      </a>
                    )}
                    <span style={{ marginLeft: 'auto' }}>
                      {ev.is_set ? (
                        <span className="badge badge-success" style={{ fontSize: 10 }}><Check size={10} /> Set</span>
                      ) : (
                        <span className="badge badge-error" style={{ fontSize: 10 }}>Missing</span>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        className="form-input"
                        type={showValues[ev.key] ? 'text' : 'password'}
                        placeholder={ev.is_set ? (ev.value_preview || '****') : `Enter ${ev.label || ev.key}`}
                        value={values[ev.key] !== undefined ? values[ev.key] : ''}
                        onChange={e => setValues(prev => ({ ...prev, [ev.key]: e.target.value }))}
                        onKeyDown={e => handleKeyDown(e, ev.key)}
                        style={{ fontSize: 13, padding: '6px 36px 6px 10px' }}
                      />
                      <button
                        onClick={() => toggleShowValue(ev.key)}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                      >
                        {showValues[ev.key] ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleSaveEnv(ev.key)}
                      disabled={saving[ev.key] || !values[ev.key]}
                    >
                      {saving[ev.key] ? <Loader2 size={12} className="spin" /> : 'Save'}
                    </button>
                  </div>
                  {saveMsg[ev.key] && (
                    <div style={{ fontSize: 11, marginTop: 4, color: saveMsg[ev.key].startsWith('Error') ? 'var(--error)' : 'var(--success)' }}>
                      {saveMsg[ev.key]}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Tools Page ──

export default function Tools() {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [platformFilter, setPlatformFilter] = useState('')
  const [collapsedPlatforms, setCollapsedPlatforms] = useState({})
  const [togglingTools, setTogglingTools] = useState({})
  const [toolConfig, setToolConfig] = useState(null)
  const [configLoading, setConfigLoading] = useState(false)
  const [selectedTool, setSelectedTool] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listTools()
      setOutput(data.output || '')
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const loadConfig = async () => {
    setConfigLoading(true)
    try {
      const data = await api.getToolConfig()
      setToolConfig(data)
    } catch (e) {
      // Config endpoint may not be available yet
    } finally {
      setConfigLoading(false)
    }
  }

  useEffect(() => { load(); loadConfig() }, [])

  // Parse the tools output
  const lines = output.split('\n')
  const toolEntries = []
  let currentPlatform = 'cli'

  for (const line of lines) {
    const platMatch = line.match(/Built-in toolsets \((\w+)\)/)
    if (platMatch) currentPlatform = platMatch[1]

    const match = line.match(/([✓✗])\s+(enabled|disabled)\s+(\w+)\s+(.+)/)
    if (match) {
      toolEntries.push({
        enabled: match[1] === '✓',
        name: match[3],
        description: match[4].trim(),
        platform: currentPlatform,
      })
    }
  }

  const platforms = [...new Set(toolEntries.map(t => t.platform))]
  const filtered = platformFilter
    ? toolEntries.filter(t => t.platform === platformFilter)
    : toolEntries

  // Group by platform
  const grouped = {}
  for (const tool of filtered) {
    if (!grouped[tool.platform]) grouped[tool.platform] = []
    grouped[tool.platform].push(tool)
  }

  const togglePlatform = (plat) => {
    setCollapsedPlatforms(prev => ({ ...prev, [plat]: !prev[plat] }))
  }

  const handleToggle = async (toolName, platform, currentlyEnabled) => {
    const key = `${platform}:${toolName}`
    setTogglingTools(prev => ({ ...prev, [key]: true }))
    try {
      if (currentlyEnabled) {
        await api.disableTool(toolName, platform)
      } else {
        await api.enableTool(toolName, platform)
      }
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setTogglingTools(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
    }
  }

  const openToolConfig = (toolName) => {
    if (toolConfig && toolConfig[toolName]) {
      setSelectedTool({ key: toolName, info: toolConfig[toolName] })
    }
  }

  const hasConfig = (toolName) => toolConfig && toolConfig[toolName]

  return (
    <div>
      <div className="page-title">
        <Wrench size={28} />
        Tools
        <Tooltip text="All available tools the AI agent can use to interact with the world: execute code, browse the web, read/write files, manage memory, and more. Tools can be enabled or disabled per platform." />
        <button className="btn btn-sm" onClick={() => { load(); loadConfig() }} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Platform filter tabs */}
      {toolEntries.length > 0 && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button
            className={`tab ${!platformFilter ? 'active' : ''}`}
            onClick={() => setPlatformFilter('')}
          >
            All ({toolEntries.length})
          </button>
          {platforms.map(plat => {
            const count = toolEntries.filter(t => t.platform === plat).length
            return (
              <button
                key={plat}
                className={`tab ${platformFilter === plat ? 'active' : ''}`}
                onClick={() => setPlatformFilter(plat)}
              >
                {plat} ({count})
              </button>
            )
          })}
        </div>
      )}

      {toolEntries.length > 0 ? (
        Object.entries(grouped).map(([platform, tools]) => (
          <div key={platform} style={{ marginBottom: 16 }}>
            <button
              className="card"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer', width: '100%', marginBottom: 0,
                borderBottomLeftRadius: collapsedPlatforms[platform] ? undefined : 0,
                borderBottomRightRadius: collapsedPlatforms[platform] ? undefined : 0,
              }}
              onClick={() => togglePlatform(platform)}
            >
              {collapsedPlatforms[platform] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <span style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>{platform}</span>
              <span className="badge badge-info">{tools.length} tools</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {tools.filter(t => t.enabled).length} enabled
              </span>
            </button>
            {!collapsedPlatforms[platform] && (
              <div className="table-container" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>
                        Toggle
                        <Tooltip text="Enable or disable this tool. When enabled, the AI agent can use it. When disabled, the tool is hidden from the agent." />
                      </th>
                      <th>Name <Tooltip text="The tool's identifier used in function calls. This is the exact name the AI references when invoking a tool." /></th>
                      <th>Description <Tooltip text="What the tool does and when the agent uses it. This description is provided to the AI model so it knows when to call each tool." /></th>
                      <th style={{ width: 60 }}>Config</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => {
                      const toggleKey = `${platform}:${tool.name}`
                      const isToggling = !!togglingTools[toggleKey]
                      const configurable = hasConfig(tool.name)
                      return (
                        <tr key={tool.name}>
                          <td>
                            <button
                              className={`btn btn-sm ${tool.enabled ? 'btn-primary' : ''}`}
                              style={{ minWidth: 80, justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggle(tool.name, platform, tool.enabled)
                              }}
                              disabled={isToggling}
                              title={tool.enabled
                                ? 'Click to disable this tool — the agent will no longer be able to use it'
                                : 'Click to enable this tool — the agent will be able to use it'}
                            >
                              {isToggling ? (
                                <Loader2 size={14} className="spin" />
                              ) : tool.enabled ? (
                                <><ToggleRight size={14} /> On</>
                              ) : (
                                <><ToggleLeft size={14} /> Off</>
                              )}
                            </button>
                          </td>
                          <td>
                            <span
                              style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, cursor: configurable ? 'pointer' : 'default' }}
                              className={configurable ? 'tool-name-clickable' : ''}
                              onClick={() => configurable && openToolConfig(tool.name)}
                              title={configurable ? 'Click to configure this tool' : ''}
                            >
                              {tool.name}
                            </span>
                          </td>
                          <td>{tool.description}</td>
                          <td>
                            {configurable && (
                              <button
                                className="btn btn-sm"
                                onClick={() => openToolConfig(tool.name)}
                                title="Configure tool settings and API keys"
                              >
                                <Settings size={13} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      ) : loading ? (
        <div className="spinner" />
      ) : (
        <div className="card">
          <pre>{output}</pre>
        </div>
      )}

      {/* Tool Config Panel */}
      {selectedTool && (
        <ToolConfigPanel
          toolKey={selectedTool.key}
          toolInfo={selectedTool.info}
          onClose={() => setSelectedTool(null)}
          onSaved={loadConfig}
        />
      )}
    </div>
  )
}
