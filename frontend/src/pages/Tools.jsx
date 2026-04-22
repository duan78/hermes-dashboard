import { useState, useEffect } from 'react'
import { Wrench, RefreshCw, Loader2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Settings, X, Check, Eye, EyeOff, ExternalLink, Radio, List } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

// ── Agent-Reach Channel Status Display (dynamic, grouped by status) ──

function AgentReachChannelList({ channels, onRecheck, rechecking }) {
  if (!channels || channels.length === 0) return null

  const okChannels = channels.filter(c => c.status === 'ok')
  const warnChannels = channels.filter(c => c.status === 'warn')
  const offChannels = channels.filter(c => c.status === 'off')
  const okCount = okChannels.length
  const totalCount = channels.length

  const statusIcon = (status) => {
    if (status === 'ok') return <span style={{ color: 'var(--success)' }}>✅</span>
    if (status === 'warn') return <span style={{ color: 'var(--warning)' }}>⚠️</span>
    return <span style={{ color: 'var(--error)' }}>❌</span>
  }

  const configBadge = (ch) => {
    if (ch.status === 'ok') {
      return <span className="badge badge-info" style={{ fontSize: 9, opacity: 0.7 }}>Zero-config</span>
    }
    if (ch.config_type === 'action') {
      return <span className="badge badge-error" style={{ fontSize: 9 }}>Action requise</span>
    }
    if (ch.config_type === 'env') {
      return <span className="badge badge-error" style={{ fontSize: 9 }}>Action requise</span>
    }
    return null
  }

  const renderChannel = (ch) => (
    <div key={ch.channel} style={{
      padding: '8px 12px',
      borderRadius: 8,
      background: ch.status === 'ok' ? 'rgba(34,197,94,0.04)' : ch.status === 'warn' ? 'rgba(234,179,8,0.04)' : 'rgba(255,255,255,0.02)',
      border: `1px solid ${ch.status === 'ok' ? 'rgba(34,197,94,0.12)' : ch.status === 'warn' ? 'rgba(234,179,8,0.12)' : 'rgba(255,255,255,0.06)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flexShrink: 0, fontSize: 12 }}>{statusIcon(ch.status)}</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{ch.name}</span>
        {configBadge(ch)}
        {ch.message && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 'auto', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={ch.message}>
            {ch.message}
          </span>
        )}
      </div>
      {ch.status === 'off' && ch.message && (
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, paddingLeft: 28, lineHeight: 1.4, whiteSpace: 'pre-wrap', maxWidth: '100%', overflowWrap: 'break-word' }}>
          💡 {ch.message.length > 200 ? ch.message.slice(0, 200) + '…' : ch.message}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Agent-Reach Channels
        </span>
        <span className="badge badge-success" style={{ fontSize: 10 }}>
          {okCount}/{totalCount} actifs
        </span>
        {onRecheck && (
          <Tooltip text="Revérifier les statuts de tous les canaux Agent-Reach">
            <button
              className="btn btn-sm"
              onClick={onRecheck}
              disabled={rechecking}
              style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: 11 }}
            >
              {rechecking ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
              {' '}Revérifier
            </button>
          </Tooltip>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {okChannels.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Actifs ({okChannels.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {okChannels.map(renderChannel)}
            </div>
          </div>
        )}
        {warnChannels.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Avertissement ({warnChannels.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {warnChannels.map(renderChannel)}
            </div>
          </div>
        )}
        {offChannels.length > 0 && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--error)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 }}>
              Inactifs ({offChannels.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {offChannels.map(renderChannel)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Agent-Reach combined mode section ──

function AgentReachCombinedSection({ channels }) {
  if (!channels || channels.length === 0) return null
  return (
    <div style={{
      marginTop: 10,
      padding: '10px 14px',
      background: 'rgba(99,102,241,0.06)',
      borderRadius: 8,
      border: '1px solid rgba(99,102,241,0.15)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Radio size={13} style={{ color: 'var(--accent)' }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent)' }}>Agent-Reach Channels</span>
        <span className="badge badge-success" style={{ fontSize: 10 }}>{channels.length} actifs</span>
        <Tooltip text="Agent-Reach fournit l'accès direct à 16 plateformes internet. Les canaux actifs sont automatiquement utilisés par le mode Combined pour enrichir les résultats de recherche." />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {channels.map(ch => (
          <span key={ch.channel} className="badge badge-success" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
            ✅ {ch.name}
          </span>
        ))}
      </div>
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
  const [arRechecking, setArRechecking] = useState(false)
  const [imgModel, setImgModel] = useState('')

  useEffect(() => {
    // Initialize values and detect active provider
    if (toolInfo.has_providers) {
      const activeIdx = toolInfo.providers.findIndex(p => p.is_active)
      if (activeIdx >= 0) setSelectedProvider(activeIdx)
      else if (toolInfo.providers.length > 0) setSelectedProvider(0)
    }
    // Load image_gen model from config
    if (toolKey === 'image_gen') {
      api.getConfig().then(d => {
        const cfg = d.config || d
        setImgModel(cfg?.image_gen?.model || '')
      }).catch(() => {})
    }
  }, [toolInfo, toolKey])

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
                  Combined Search Backends
                </span>
                <Tooltip text="When Combined mode is active, all configured search APIs are queried in parallel. Results are deduplicated by URL and merged for maximum coverage. The more backends you configure, the richer the results." />
                <span className="badge badge-success" style={{ fontSize: 10 }}>
                  {toolInfo.combined_active_count}/{toolInfo.combined_backends?.length || 0} active
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>
                {toolInfo.mode_description || 'Queries multiple search APIs in parallel and deduplicates results by URL for maximum coverage.'}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {toolInfo.combined_backends && toolInfo.combined_backends.map(be => (
                  <div key={be.key} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    background: be.is_set ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.04)',
                    border: `1px solid ${be.is_set ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
                    borderRadius: 8,
                    padding: '8px 12px',
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 13, lineHeight: '28px' }}>{be.name}</span>
                    {be.is_set ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, lineHeight: '28px' }}>
                        <span className="badge badge-success" style={{ fontSize: 10 }}><Check size={10} /> Configured</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{be.value_preview}</span>
                      </div>
                    ) : (
                      <div style={{ flex: 1, marginLeft: 4 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <span className="badge badge-error" style={{ fontSize: 10 }}>Not configured</span>
                          {be.url && (
                            <a href={be.url} target="_blank" rel="noopener" style={{ color: 'var(--accent)', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                              <ExternalLink size={10} /> Get key
                            </a>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <div style={{ position: 'relative', flex: 1 }}>
                            <input
                              className="form-input"
                              type={showValues[be.key] ? 'text' : 'password'}
                              placeholder={`Enter ${be.name} API key`}
                              value={values[be.key] !== undefined ? values[be.key] : ''}
                              onChange={e => setValues(prev => ({ ...prev, [be.key]: e.target.value }))}
                              onKeyDown={e => handleKeyDown(e, be.key)}
                              style={{ fontSize: 12, padding: '4px 32px 4px 8px' }}
                            />
                            <button
                              onClick={() => toggleShowValue(be.key)}
                              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 1 }}
                            >
                              {showValues[be.key] ? <EyeOff size={12} /> : <Eye size={12} />}
                            </button>
                          </div>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => handleSaveEnv(be.key)}
                            disabled={saving[be.key] || !values[be.key]}
                            style={{ fontSize: 11, padding: '4px 10px' }}
                          >
                            {saving[be.key] ? <Loader2 size={10} className="spin" /> : 'Save'}
                          </button>
                        </div>
                        {saveMsg[be.key] && (
                          <div style={{ fontSize: 10, marginTop: 2, color: saveMsg[be.key].startsWith('Error') ? 'var(--error)' : 'var(--success)' }}>
                            {saveMsg[be.key]}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Agent-Reach combined channels section */}
              {toolInfo.agent_reach_combined && toolInfo.agent_reach_combined.length > 0 && (
                <AgentReachCombinedSection channels={toolInfo.agent_reach_combined} />
              )}
            </div>
          )}
          {toolInfo.has_providers ? (
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
              {/* Image Gen Model Selection */}
              {toolKey === 'image_gen' && toolInfo.models && toolInfo.models.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Model
                    <Tooltip text="Select which image generation model to use. Models vary in quality, speed, and style." />
                  </div>
                  <select
                    className="form-select"
                    value={imgModel}
                    onChange={async (e) => {
                      const model = e.target.value
                      setImgModel(model)
                      try {
                        await api.setConfigValue('image_gen.model', model)
                        setSaveMsg(prev => ({ ...prev, '__img_model__': 'Model saved!' }))
                        setTimeout(() => setSaveMsg(prev => ({ ...prev, '__img_model__': null })), 3000)
                      } catch (err) {
                        setSaveMsg(prev => ({ ...prev, '__img_model__': 'Error: ' + err.message }))
                      }
                    }}
                    style={{ fontSize: 13, maxWidth: 400 }}
                  >
                    {toolInfo.models.map(m => (
                      <option key={m.id} value={m.id}>{m.name} ({m.speed})</option>
                    ))}
                  </select>
                  {saveMsg['__img_model__'] && (
                    <div style={{ fontSize: 11, marginTop: 4, color: saveMsg['__img_model__'].startsWith('Error') ? 'var(--error)' : 'var(--success)' }}>
                      {saveMsg['__img_model__']}
                    </div>
                  )}
                </div>
              )}
              {/* Agent-Reach channels shown inside Web Search category */}
              {toolInfo.agent_reach_channels && toolInfo.agent_reach_channels.length > 0 && (
                <AgentReachChannelList
                  channels={toolInfo.agent_reach_channels}
                  onRecheck={async () => {
                    setArRechecking(true)
                    try {
                      await api.checkAgentReach()
                      if (onSaved) onSaved()
                    } catch (e) { /* silent */ }
                    finally { setArRechecking(false) }
                  }}
                  rechecking={arRechecking}
                />
              )}
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
  const [activeTab, setActiveTab] = useState('platforms')
  const [registry, setRegistry] = useState(null)
  const [registryLoading, setRegistryLoading] = useState(false)
  const [registryFilter, setRegistryFilter] = useState('')
  const [imageGenModel, setImageGenModel] = useState('')

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

  const loadRegistry = async () => {
    setRegistryLoading(true)
    try {
      const data = await api.getToolsRegistry()
      setRegistry(data)
    } catch (e) {
      // ignore
    } finally {
      setRegistryLoading(false)
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

      {/* Top-level tabs */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={`tab ${activeTab === 'platforms' ? 'active' : ''}`} onClick={() => setActiveTab('platforms')}>
          Platforms ({toolEntries.length})
        </button>
        <button className={`tab ${activeTab === 'registry' ? 'active' : ''}`} onClick={() => { setActiveTab('registry'); if (!registry) loadRegistry() }}>
          <List size={13} style={{ verticalAlign: 'middle' }} /> Registered Tools
        </button>
      </div>

      {activeTab === 'registry' ? (
        <div className="card">
          {registryLoading ? <div className="spinner" /> : registry ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>All Registered Tools</span>
                <span className="badge badge-success" style={{ fontSize: 10 }}>{registry.enabled_count}/{registry.total} enabled</span>
                <input
                  className="form-input"
                  style={{ marginLeft: 'auto', maxWidth: 200, fontSize: 12 }}
                  placeholder="Search tools..."
                  value={registryFilter}
                  onChange={e => setRegistryFilter(e.target.value)}
                />
                <button className="btn btn-sm" onClick={loadRegistry}><RefreshCw size={12} /></button>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>Status</th>
                      <th>Name <Tooltip text="The tool's unique identifier used in function calls." /></th>
                      <th>Toolset <Tooltip text="Which toolset/group this tool belongs to." /></th>
                      <th>Description <Tooltip text="What this tool does — provided to the AI model so it knows when to use it." /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registry.tools
                      .filter(t => !registryFilter || t.name.toLowerCase().includes(registryFilter.toLowerCase()) || t.description.toLowerCase().includes(registryFilter.toLowerCase()))
                      .map(t => (
                      <tr key={t.name}>
                        <td>
                          <span className={`badge ${t.enabled ? 'badge-success' : 'badge-error'}`} style={{ fontSize: 10 }}>
                            {t.enabled ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 13 }}>{t.name}</td>
                        <td>
                          <span className="badge badge-info" style={{ fontSize: 10 }}>{t.toolset}</span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
              Failed to load registry. Click refresh to try again.
            </div>
          )}
        </div>
      ) : (
      <>
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
      </>
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
