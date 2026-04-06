import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Save, RefreshCw, Plus, Trash2, X, Check, AlertTriangle,
  Settings, Thermometer, Shield, Zap, Layers, ChevronDown, ChevronUp,
  DollarSign, Info, Cpu, Server, Activity, Plug, CreditCard
} from 'lucide-react'
import { api } from '../api'
import './moa.css'

const DEFAULT_CONFIG = {
  reference_models: [
    { model: 'qwen/qwen3-coder:free', provider: 'openrouter' },
    { model: 'nousresearch/hermes-3-llama-3.1-405b:free', provider: 'openrouter' },
    { model: 'openai/gpt-oss-120b:free', provider: 'openrouter' },
    { model: 'z-ai/glm-4.5-air:free', provider: 'openrouter' },
  ],
  aggregator_model: 'glm-5',
  aggregator_provider: 'custom',
  reference_temperature: 0.6,
  aggregator_temperature: 0.4,
  min_successful_references: 1,
}

const PROVIDER_COLORS = {
  openrouter: '#34d399',
  nvidia: '#76b900',
  cerebras: '#6366f1',
  google: '#4285f4',
  groq: '#f55036',
  mistral: '#ff7000',
  custom: '#60a5fa',
  anthropic: '#d4a574',
  openai: '#10a37f',
}

function getProviderColor(pid) {
  return PROVIDER_COLORS[pid] || '#94a3b8'
}

function getModelName(entry) {
  if (typeof entry === 'string') return entry
  return entry.model || ''
}

function getProviderId(entry) {
  if (typeof entry === 'string') return 'openrouter'
  return entry.provider || 'openrouter'
}

function isFreeModel(model) {
  return model.includes(':free') || model.endsWith(':free')
}

function normalizeRefModels(models) {
  if (!Array.isArray(models)) return []
  return models.map(m => {
    if (typeof m === 'string') return { model: m, provider: 'openrouter' }
    if (m && m.model) return { model: m.model, provider: m.provider || 'openrouter' }
    return null
  }).filter(Boolean)
}

function estimateCostPerCall(refModels, providers) {
  let totalCost = 0
  const details = []
  for (const entry of refModels) {
    const m = getModelName(entry)
    const p = getProviderId(entry)
    const pCfg = providers && providers[p]
    const isFree = isFreeModel(m)
    const cost = isFree ? 0 : 0.01 // rough estimate
    totalCost += cost
    details.push({ model: m, provider: p, cost, isFree, type: isFree ? 'Gratuit' : 'Payant' })
  }
  return { totalCost, details }
}

const EMPTY_PROVIDER = {
  name: '', base_url: '', api_key_env: '', type: 'openai-compatible',
  description: '', models: [],
}

export default function MoaConfig() {
  const [config, setConfig] = useState(null)
  const [providers, setProviders] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editConfig, setEditConfig] = useState(null)
  const [editProviders, setEditProviders] = useState(null)
  const [newModel, setNewModel] = useState('')
  const [newModelProvider, setNewModelProvider] = useState('openrouter')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [activeTab, setActiveTab] = useState('config')
  const [testResults, setTestResults] = useState({})
  const [testingProvider, setTestingProvider] = useState(null)
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [newProvider, setNewProvider] = useState({ ...EMPTY_PROVIDER })
  const [newProviderId, setNewProviderId] = useState('')

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const loadConfig = useCallback(async () => {
    try {
      setLoading(true)
      const [moaData, provData] = await Promise.all([
        api.getMoaConfig(),
        api.getMoaProviders().catch(() => ({})),
      ])
      // Normalize reference_models to dict format
      const normalized = { ...moaData }
      normalized.reference_models = normalizeRefModels(moaData.reference_models)
      setConfig(normalized)
      setEditConfig(normalized)
      setProviders(provData)
      setEditProviders(provData)
    } catch (e) {
      console.error('MOA config load error:', e)
      setConfig(DEFAULT_CONFIG)
      setEditConfig(DEFAULT_CONFIG)
      setProviders({})
      setEditProviders({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadConfig() }, [loadConfig])

  const handleSave = async () => {
    if (!editConfig) return
    try {
      setSaving(true)
      await api.saveMoaConfig(editConfig)
      setConfig(editConfig)
      setEditing(false)
      showToast('MOA configuration saved')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveProviders = async () => {
    if (!editProviders) return
    try {
      setSaving(true)
      await api.saveMoaProviders(editProviders)
      setProviders(editProviders)
      showToast('MOA providers saved')
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditConfig(config)
    setEditProviders(providers)
    setEditing(false)
    setNewModel('')
    setNewModelProvider('openrouter')
    setShowAddProvider(false)
    setNewProvider({ ...EMPTY_PROVIDER })
    setNewProviderId('')
  }

  const addReferenceModel = () => {
    if (!newModel.trim()) return
    const entry = { model: newModel.trim(), provider: newModelProvider }
    const models = [...(editConfig.reference_models || []), entry]
    setEditConfig({ ...editConfig, reference_models: models })
    setNewModel('')
  }

  const removeReferenceModel = (index) => {
    const models = editConfig.reference_models.filter((_, i) => i !== index)
    setEditConfig({ ...editConfig, reference_models: models })
  }

  const updateRefModelProvider = (index, newProvider) => {
    const models = editConfig.reference_models.map((m, i) =>
      i === index ? { ...m, provider: newProvider } : m
    )
    setEditConfig({ ...editConfig, reference_models: models })
  }

  const updateField = (key, value) => {
    setEditConfig({ ...editConfig, [key]: value })
  }

  const handleTestProvider = async (pid) => {
    setTestingProvider(pid)
    try {
      const result = await api.testMoaProvider(pid)
      setTestResults(prev => ({ ...prev, [pid]: result }))
    } catch (e) {
      setTestResults(prev => ({ ...prev, [pid]: { status: 'error', error: e.message } }))
    } finally {
      setTestingProvider(null)
    }
  }

  const addProvider = () => {
    if (!newProviderId.trim() || !newProvider.base_url.trim()) return
    const pid = newProviderId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')
    const provs = { ...(editProviders || {}) }
    provs[pid] = {
      name: newProvider.name || pid,
      base_url: newProvider.base_url.trim(),
      api_key_env: newProvider.api_key_env.trim(),
      type: newProvider.type || 'openai-compatible',
      description: newProvider.description || '',
      models: (newProvider.models || '').split('\n').map(s => s.trim()).filter(Boolean),
    }
    setEditProviders(provs)
    setShowAddProvider(false)
    setNewProvider({ ...EMPTY_PROVIDER })
    setNewProviderId('')
    showToast(`Provider "${pid}" added (save to apply)`)
  }

  const removeProvider = (pid) => {
    const provs = { ...(editProviders || {}) }
    delete provs[pid]
    setEditProviders(provs)
    showToast(`Provider "${pid}" removed (save to apply)`)
  }

  if (loading) return <div className="spinner" />

  const cfg = editing ? editConfig : config || DEFAULT_CONFIG
  const provs = editing ? editProviders : providers || {}
  const refModels = cfg.reference_models || []
  const providerIds = Object.keys(provs)

  const cost = estimateCostPerCall(refModels, provs)

  const tabs = [
    { id: 'config', label: 'Configuration', icon: Settings },
    { id: 'providers', label: 'Providers', icon: Plug },
    { id: 'costs', label: 'Costs', icon: DollarSign },
  ]

  return (
    <div className="moa-config">
      {/* Header */}
      <div className="moa-header">
        <div className="moa-title">
          <Layers size={24} />
          <div>
            <h2>Mixture of Agents (MoA)</h2>
            <p className="moa-subtitle">
              Multi-model collaborative reasoning with multi-provider support
            </p>
          </div>
        </div>
        <div className="moa-actions">
          <button className="btn btn-sm" onClick={loadConfig} disabled={saving}>
            <RefreshCw size={14} /> Refresh
          </button>
          {!editing ? (
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              <Settings size={14} /> Edit
            </button>
          ) : (
            <>
              <button className="btn" onClick={handleCancel} disabled={saving}>
                <X size={14} /> Cancel
              </button>
              <button className="btn btn-primary" onClick={activeTab === 'providers' ? handleSaveProviders : handleSave} disabled={saving}>
                {saving ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="moa-stats-bar">
        <div className="moa-stat-card">
          <div className="moa-stat-label"><Brain size={13} /> Reference Models</div>
          <div className="moa-stat-value">{refModels.length}</div>
        </div>
        <div className="moa-stat-card">
          <div className="moa-stat-label"><Cpu size={13} /> Aggregator</div>
          <div className="moa-stat-value">{cfg.aggregator_model || '—'}</div>
        </div>
        <div className="moa-stat-card">
          <div className="moa-stat-label"><Server size={13} /> Provider</div>
          <div className="moa-stat-value">
            <span className={`moa-provider-badge ${cfg.aggregator_provider}`}>
              {cfg.aggregator_provider === 'custom' ? 'Z.AI (Custom)' : 'OpenRouter'}
            </span>
          </div>
        </div>
        <div className="moa-stat-card">
          <div className="moa-stat-label"><Plug size={13} /> Providers</div>
          <div className="moa-stat-value">{providerIds.length}</div>
        </div>
        <div className="moa-stat-card">
          <div className="moa-stat-label"><DollarSign size={13} /> Est. Cost / Call</div>
          <div className="moa-stat-value">
            {cost.totalCost === 0 ? '~$0.00' : `~$${cost.totalCost.toFixed(2)}`}
            <small style={{ display: 'block', color: 'var(--text-muted)', fontSize: 10 }}>
              {cost.details.filter(d => d.isFree).length} free / {cost.details.length} total
            </small>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="moa-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`moa-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Configuration */}
      {activeTab === 'config' && (
        <>
          {/* Reference Models */}
          <div className="moa-section">
            <h3 className="moa-section-title">
              <Brain size={16} /> Reference Models
              <span className="moa-section-desc">Generate diverse initial responses in parallel</span>
            </h3>
            <div className="moa-model-list">
              {refModels.map((entry, i) => {
                const m = getModelName(entry)
                const p = getProviderId(entry)
                const provCfg = provs[p]
                const apiKeySet = provCfg?.api_key_set
                return (
                  <div key={i} className="moa-model-item">
                    <div className="moa-model-info">
                      <span className={`moa-cost-badge ${isFreeModel(m) ? 'free' : 'paid'}`}>
                        {isFreeModel(m) ? 'FREE' : 'PAID'}
                      </span>
                      <span className="moa-model-name">{m}</span>
                      <span
                        className="moa-provider-tag"
                        style={{
                          background: `${getProviderColor(p)}20`,
                          color: getProviderColor(p),
                          borderColor: `${getProviderColor(p)}40`,
                        }}
                      >
                        {provCfg?.name || p}
                      </span>
                      {!apiKeySet && (
                        <span className="moa-key-warning" title="API key not configured">
                          <AlertTriangle size={11} />
                        </span>
                      )}
                    </div>
                    {editing && (
                      <div className="moa-model-actions">
                        <select
                          className="form-input moa-provider-select"
                          value={p}
                          onChange={e => updateRefModelProvider(i, e.target.value)}
                        >
                          <option value="openrouter">OpenRouter</option>
                          {providerIds.filter(id => id !== 'openrouter').map(id => (
                            <option key={id} value={id}>{provs[id]?.name || id}</option>
                          ))}
                        </select>
                        <button
                          className="btn btn-sm"
                          onClick={() => removeReferenceModel(i)}
                          title="Remove model"
                          style={{ color: 'var(--danger, #e55)' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {editing && (
              <div className="moa-add-model">
                <input
                  className="form-input"
                  placeholder="e.g. deepseek-r1"
                  value={newModel}
                  onChange={e => setNewModel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addReferenceModel()}
                />
                <select
                  className="form-input moa-provider-select"
                  value={newModelProvider}
                  onChange={e => setNewModelProvider(e.target.value)}
                >
                  <option value="openrouter">OpenRouter</option>
                  {providerIds.filter(id => id !== 'openrouter').map(id => (
                    <option key={id} value={id}>{provs[id]?.name || id}</option>
                  ))}
                </select>
                <button className="btn btn-primary btn-sm" onClick={addReferenceModel} disabled={!newModel.trim()}>
                  <Plus size={14} /> Add
                </button>
              </div>
            )}
          </div>

          {/* Aggregator Configuration */}
          <div className="moa-section">
            <h3 className="moa-section-title">
              <Cpu size={16} /> Aggregator Model
              <span className="moa-section-desc">Synthesizes reference responses into final output</span>
            </h3>
            <div className="moa-fields">
              <div className="moa-field">
                <label>Model</label>
                {editing ? (
                  <input
                    className="form-input"
                    value={cfg.aggregator_model || ''}
                    onChange={e => updateField('aggregator_model', e.target.value)}
                  />
                ) : (
                  <span className="moa-field-value">{cfg.aggregator_model}</span>
                )}
              </div>
              <div className="moa-field">
                <label>Provider</label>
                {editing ? (
                  <select
                    className="form-input"
                    value={cfg.aggregator_provider || 'openrouter'}
                    onChange={e => updateField('aggregator_provider', e.target.value)}
                  >
                    <option value="openrouter">OpenRouter</option>
                    <option value="custom">Z.AI (Custom)</option>
                  </select>
                ) : (
                  <span className="moa-field-value">
                    <span className={`moa-provider-badge ${cfg.aggregator_provider}`}>
                      {cfg.aggregator_provider === 'custom' ? 'Z.AI (Custom)' : 'OpenRouter'}
                    </span>
                  </span>
                )}
                {editing && (
                  <span className="moa-field-hint">
                    {cfg.aggregator_provider === 'custom'
                      ? 'Uses Z.AI directly. Model name should be plain (e.g. "glm-5")'
                      : 'Routes through OpenRouter. Use full model path (e.g. "z-ai/glm-5")'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="moa-section">
            <h3
              className="moa-section-title clickable"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <Settings size={16} /> Advanced Settings
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </h3>
            {showAdvanced && (
              <div className="moa-fields">
                <div className="moa-field">
                  <label>
                    <Thermometer size={13} style={{ marginRight: 4 }} />
                    Reference Temperature
                  </label>
                  {editing ? (
                    <div className="moa-slider-row">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={cfg.reference_temperature ?? 0.6}
                        onChange={e => updateField('reference_temperature', parseFloat(e.target.value))}
                      />
                      <span className="moa-slider-value">{cfg.reference_temperature ?? 0.6}</span>
                    </div>
                  ) : (
                    <span className="moa-field-value">{cfg.reference_temperature ?? 0.6}</span>
                  )}
                  <span className="moa-field-hint">Higher = more diverse responses (0.0-2.0)</span>
                </div>

                <div className="moa-field">
                  <label>
                    <Thermometer size={13} style={{ marginRight: 4 }} />
                    Aggregator Temperature
                  </label>
                  {editing ? (
                    <div className="moa-slider-row">
                      <input
                        type="range"
                        min="0"
                        max="2"
                        step="0.1"
                        value={cfg.aggregator_temperature ?? 0.4}
                        onChange={e => updateField('aggregator_temperature', parseFloat(e.target.value))}
                      />
                      <span className="moa-slider-value">{cfg.aggregator_temperature ?? 0.4}</span>
                    </div>
                  ) : (
                    <span className="moa-field-value">{cfg.aggregator_temperature ?? 0.4}</span>
                  )}
                  <span className="moa-field-hint">Lower = more focused synthesis (0.0-2.0)</span>
                </div>

                <div className="moa-field">
                  <label>
                    <Shield size={13} style={{ marginRight: 4 }} />
                    Min Successful References
                  </label>
                  {editing ? (
                    <div className="moa-slider-row">
                      <input
                        type="number"
                        className="form-input"
                        min="1"
                        max={refModels.length || 1}
                        value={cfg.min_successful_references ?? 1}
                        onChange={e => updateField('min_successful_references', parseInt(e.target.value) || 1)}
                        style={{ width: 80 }}
                      />
                      <span className="moa-slider-value">
                        / {refModels.length} models
                      </span>
                    </div>
                  ) : (
                    <span className="moa-field-value">
                      {cfg.min_successful_references ?? 1} / {refModels.length} models
                    </span>
                  )}
                  <span className="moa-field-hint">
                    Minimum successful reference models needed before aggregation
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* TAB 2: Providers */}
      {activeTab === 'providers' && (
        <>
          <div className="moa-section">
            <div className="moa-providers-header">
              <h3 className="moa-section-title" style={{ marginBottom: 0 }}>
                <Plug size={16} /> MOA Providers
                <span className="moa-section-desc">OpenAI-compatible endpoints for reference models</span>
              </h3>
              {editing && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddProvider(true)}>
                  <Plus size={14} /> Add Provider
                </button>
              )}
            </div>
          </div>

          {/* Add Provider Form */}
          {editing && showAddProvider && (
            <div className="moa-section moa-add-provider-form">
              <h3 className="moa-section-title"><Plus size={16} /> New Provider</h3>
              <div className="moa-fields">
                <div className="moa-field">
                  <label>Provider ID</label>
                  <input
                    className="form-input"
                    placeholder="e.g. nvidia"
                    value={newProviderId}
                    onChange={e => setNewProviderId(e.target.value)}
                  />
                  <span className="moa-field-hint">Unique identifier (lowercase, used in config)</span>
                </div>
                <div className="moa-field">
                  <label>Name</label>
                  <input
                    className="form-input"
                    placeholder="e.g. NVIDIA NIM"
                    value={newProvider.name}
                    onChange={e => setNewProvider({ ...newProvider, name: e.target.value })}
                  />
                </div>
                <div className="moa-field">
                  <label>Base URL</label>
                  <input
                    className="form-input"
                    placeholder="e.g. https://integrate.api.nvidia.com/v1"
                    value={newProvider.base_url}
                    onChange={e => setNewProvider({ ...newProvider, base_url: e.target.value })}
                  />
                </div>
                <div className="moa-field">
                  <label>API Key Env Var</label>
                  <input
                    className="form-input"
                    placeholder="e.g. NVIDIA_API_KEY"
                    value={newProvider.api_key_env}
                    onChange={e => setNewProvider({ ...newProvider, api_key_env: e.target.value })}
                  />
                </div>
                <div className="moa-field">
                  <label>Description</label>
                  <input
                    className="form-input"
                    placeholder="e.g. Free tier with credits"
                    value={newProvider.description}
                    onChange={e => setNewProvider({ ...newProvider, description: e.target.value })}
                  />
                </div>
                <div className="moa-field">
                  <label>Models (one per line)</label>
                  <textarea
                    className="form-input"
                    placeholder="deepseek-r1&#10;meta/llama-4-scout-17b-16e-instruct"
                    value={newProvider.models}
                    onChange={e => setNewProvider({ ...newProvider, models: e.target.value })}
                    rows={3}
                    style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12 }}
                  />
                </div>
                <div className="moa-add-provider-actions">
                  <button className="btn btn-primary btn-sm" onClick={addProvider} disabled={!newProviderId.trim() || !newProvider.base_url.trim()}>
                    <Plus size={14} /> Add
                  </button>
                  <button className="btn btn-sm" onClick={() => { setShowAddProvider(false); setNewProvider({ ...EMPTY_PROVIDER }); setNewProviderId('') }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Provider Cards */}
          <div className="moa-providers-grid">
            {providerIds.map(pid => {
              const p = provs[pid]
              const apiKeySet = p.api_key_set
              const testRes = testResults[pid]
              const isTesting = testingProvider === pid

              let statusClass = 'unknown'
              let statusText = 'Not tested'
              if (!apiKeySet) {
                statusClass = 'missing'
                statusText = 'API key missing'
              } else if (testRes) {
                statusClass = testRes.status === 'ok' ? 'ok' : 'error'
                statusText = testRes.status === 'ok'
                  ? `OK (${testRes.latency_ms}ms)`
                  : testRes.error?.substring(0, 60)
              } else {
                statusClass = 'configured'
                statusText = 'Key set'
              }

              return (
                <div key={pid} className="moa-provider-card">
                  <div className="moa-provider-card-header">
                    <div className="moa-provider-card-name">
                      <span
                        className="moa-provider-dot"
                        style={{ background: getProviderColor(pid) }}
                      />
                      <span>{p.name || pid}</span>
                      <span className="moa-provider-card-id">{pid}</span>
                    </div>
                    <span className={`moa-status-indicator ${statusClass}`}>
                      <span className="moa-status-dot" />
                      {statusText}
                    </span>
                  </div>

                  {p.description && (
                    <p className="moa-provider-card-desc">{p.description}</p>
                  )}

                  <div className="moa-provider-card-details">
                    <div className="moa-provider-detail">
                      <span className="moa-detail-label">Base URL</span>
                      <span className="moa-detail-value">{p.base_url}</span>
                    </div>
                    <div className="moa-provider-detail">
                      <span className="moa-detail-label">API Key</span>
                      <span className="moa-detail-value">
                        <code>{p.api_key_env}</code>
                        <span className={`moa-key-status ${apiKeySet ? 'set' : 'missing'}`}>
                          {apiKeySet ? 'configured' : 'not set'}
                        </span>
                      </span>
                    </div>
                    <div className="moa-provider-detail">
                      <span className="moa-detail-label">Type</span>
                      <span className="moa-detail-value">{p.type || 'openai-compatible'}</span>
                    </div>
                    {p.models && p.models.length > 0 && (
                      <div className="moa-provider-detail">
                        <span className="moa-detail-label">Models ({p.models.length})</span>
                        <div className="moa-model-tags">
                          {p.models.map((m, i) => (
                            <span key={i} className="moa-model-tag">{m}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="moa-provider-card-actions">
                    <button
                      className="btn btn-sm"
                      onClick={() => handleTestProvider(pid)}
                      disabled={isTesting || !apiKeySet}
                    >
                      {isTesting ? <RefreshCw size={13} className="spin" /> : <Activity size={13} />}
                      {isTesting ? 'Testing...' : 'Test'}
                    </button>
                    {editing && (
                      <button
                        className="btn btn-sm"
                        onClick={() => removeProvider(pid)}
                        style={{ color: 'var(--danger, #e55)' }}
                      >
                        <Trash2 size={13} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {providerIds.length === 0 && !showAddProvider && (
            <div className="moa-empty-state">
              <Plug size={32} />
              <p>No providers configured yet.</p>
              <p className="moa-empty-hint">
                Add providers to use models from different OpenAI-compatible APIs.
              </p>
              {editing && (
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddProvider(true)}>
                  <Plus size={14} /> Add Provider
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 3: Costs */}
      {activeTab === 'costs' && (
        <div className="moa-section">
          <h3 className="moa-section-title">
            <CreditCard size={16} /> Cost Estimation
            <span className="moa-section-desc">Estimated cost per MOA call</span>
          </h3>

          <div className="moa-cost-summary">
            <div className="moa-cost-total">
              <span className="moa-cost-total-label">Estimated Total / Call</span>
              <span className="moa-cost-total-value">
                {cost.totalCost === 0 ? '~$0.00' : `~$${cost.totalCost.toFixed(2)}`}
              </span>
            </div>
            <div className="moa-cost-breakdown">
              <div className="moa-cost-row moa-cost-row-header">
                <span>Model</span>
                <span>Provider</span>
                <span>Type</span>
                <span>Est. Cost</span>
              </div>
              {cost.details.map((d, i) => (
                <div key={i} className="moa-cost-row">
                  <span className="moa-cost-model">{d.model}</span>
                  <span>
                    <span
                      className="moa-provider-tag"
                      style={{
                        background: `${getProviderColor(d.provider)}20`,
                        color: getProviderColor(d.provider),
                        borderColor: `${getProviderColor(d.provider)}40`,
                      }}
                    >
                      {provs[d.provider]?.name || d.provider}
                    </span>
                  </span>
                  <span>
                    <span className={`moa-cost-type ${d.isFree ? 'free' : 'paid'}`}>
                      {d.isFree ? 'Gratuit' : 'Payant'}
                    </span>
                  </span>
                  <span className="moa-cost-value">
                    {d.cost === 0 ? '$0' : `$${d.cost.toFixed(3)}`}
                  </span>
                </div>
              ))}
              <div className="moa-cost-row moa-cost-row-footer">
                <span>Aggregator: {cfg.aggregator_model}</span>
                <span>
                  <span className="moa-provider-tag" style={{
                    background: `${getProviderColor(cfg.aggregator_provider)}20`,
                    color: getProviderColor(cfg.aggregator_provider),
                    borderColor: `${getProviderColor(cfg.aggregator_provider)}40`,
                  }}>
                    {cfg.aggregator_provider === 'custom' ? 'Z.AI (Custom)' : 'OpenRouter'}
                  </span>
                </span>
                <span>
                  <span className="moa-cost-type free">Plan coding</span>
                </span>
                <span className="moa-cost-value">$0</span>
              </div>
            </div>
          </div>

          <div className="moa-info-banner" style={{ marginTop: 16 }}>
            <Info size={14} />
            <span>
              Cost estimates are approximate and based on free-tier quotas. Actual costs depend on
              token usage, model pricing, and provider rate limits. All listed providers offer
              free tiers.
            </span>
          </div>
        </div>
      )}

      {/* Info banner */}
      {activeTab === 'config' && (
        <div className="moa-info-banner">
          <Info size={14} />
          <span>
            MoA uses a 2-layer architecture: reference models generate diverse responses in parallel,
            then the aggregator synthesizes them into a single high-quality response.
            Changes require Hermes restart to take effect in active sessions.
          </span>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <Check size={16} />}
          {toast.type === 'error' && <X size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
