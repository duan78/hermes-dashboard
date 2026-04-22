import { useState, useEffect } from 'react'
import { Cpu, RefreshCw, SwitchCamera, BookOpen, ArrowUpDown, Search } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

const CAPABILITY_COLORS = {
  tool_call: { bg: '#dbeafe', color: '#1d4ed8' },
  reasoning: { bg: '#fce7f3', color: '#be185d' },
  vision: { bg: '#dcfce7', color: '#15803d' },
  streaming: { bg: '#f3e8ff', color: '#7c3aed' },
  image_output: { bg: '#fef3c7', color: '#b45309' },
  audio_input: { bg: '#e0f2fe', color: '#0369a1' },
  audio_output: { bg: '#ecfdf5', color: '#047857' },
}

function formatContextLength(val) {
  if (val == null) return 'N/A'
  return val.toLocaleString() + ' tokens'
}

function formatCost(val) {
  if (val == null) return 'N/A'
  return '$' + Number(val).toFixed(2)
}

function ModelCatalogTab() {
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [source, setSource] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.getModelCatalog()
      setCatalog(data.models || [])
      setSource(data.source || '')
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await api.refreshModelCache()
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setRefreshing(false)
    }
  }

  const toggleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  const filtered = catalog.filter(m => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (m.name || '').toLowerCase().includes(q) ||
      (m.id || '').toLowerCase().includes(q) ||
      (m.provider || '').toLowerCase().includes(q) ||
      (m.family || '').toLowerCase().includes(q) ||
      (m.capabilities || []).some(c => c.toLowerCase().includes(q))
    )
  })

  const sorted = [...filtered].sort((a, b) => {
    let va, vb
    switch (sortField) {
      case 'name': va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase(); break
      case 'provider': va = (a.provider || '').toLowerCase(); vb = (b.provider || '').toLowerCase(); break
      case 'context_length': va = a.context_length || 0; vb = b.context_length || 0; break
      case 'input_cost': va = a.input_cost_per_1m ?? Infinity; vb = b.input_cost_per_1m ?? Infinity; break
      case 'output_cost': va = a.output_cost_per_1m ?? Infinity; vb = b.output_cost_per_1m ?? Infinity; break
      default: va = (a.name || '').toLowerCase(); vb = (b.name || '').toLowerCase()
    }
    if (va < vb) return sortDir === 'asc' ? -1 : 1
    if (va > vb) return sortDir === 'asc' ? 1 : -1
    return 0
  })

  const SortHeader = ({ field, children }) => (
    <th
      style={{ padding: '10px 12px', textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      onClick={() => toggleSort(field)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {children}
        {sortField === field && (
          <ArrowUpDown size={12} style={{ transform: sortDir === 'desc' ? 'rotate(180deg)' : 'none' }} />
        )}
      </span>
    </th>
  )

  if (loading) return <div className="spinner" />

  return (
    <div>
      {error && <div className="error-box">{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-info" style={{ fontSize: 11 }}>
            {catalog.length} models from {source === 'cache' ? 'models.dev cache' : 'hardcoded fallback'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              className="form-input"
              placeholder="Search models, providers, capabilities..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ fontSize: 12, paddingLeft: 28, width: 280 }}
            />
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh Cache'}
            <Tooltip text="Fetch the latest model metadata from models.dev. This updates pricing, context lengths, and capability information for all known models." />
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-secondary)' }}>
              <SortHeader field="name">
                Model Name
                <Tooltip text="The display name of the AI model. Click to sort alphabetically." />
              </SortHeader>
              <SortHeader field="provider">
                Provider
                <Tooltip text="The API provider or platform that serves this model. Determines the endpoint URL, authentication, and pricing." />
              </SortHeader>
              <SortHeader field="context_length">
                Context Length
                <Tooltip text="Maximum number of tokens the model can process in a single conversation. Larger context allows longer conversations and more complex tasks. 1K = 1,000 tokens, roughly 750 words." />
              </SortHeader>
              <SortHeader field="input_cost">
                Input Cost/1M
                <Tooltip text="Price per 1 million input tokens sent to the model. This is the cost for sending text (prompts, context, tool results) to the model." />
              </SortHeader>
              <SortHeader field="output_cost">
                Output Cost/1M
                <Tooltip text="Price per 1 million output tokens generated by the model. Output tokens are typically more expensive than input tokens." />
              </SortHeader>
              <th style={{ padding: '10px 12px', textAlign: 'left' }}>
                Capabilities
                <Tooltip text="Features supported by this model. tool_call = function/tool calling, reasoning = chain-of-thought, vision = image analysis, streaming = real-time output." />
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, 200).map((m, i) => (
              <tr key={m.id + '-' + i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{m.id}</div>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{m.provider}</span>
                </td>
                <td style={{ padding: '8px 12px', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                  {formatContextLength(m.context_length)}
                </td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  {formatCost(m.input_cost_per_1m)}
                </td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  {formatCost(m.output_cost_per_1m)}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(m.capabilities || []).map(cap => {
                      const colors = CAPABILITY_COLORS[cap] || { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' }
                      return (
                        <span
                          key={cap}
                          style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: colors.bg, color: colors.color, fontWeight: 500,
                          }}
                        >
                          {cap}
                        </span>
                      )
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          {searchQuery ? `No models match "${searchQuery}"` : 'No models in catalog. Try refreshing the cache.'}
        </div>
      )}

      {sorted.length > 200 && (
        <div style={{ padding: '8px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
          Showing first 200 of {sorted.length} models. Use search to narrow results.
        </div>
      )}
    </div>
  )
}

export default function Models() {
  const [model, setModel] = useState(null)
  const [available, setAvailable] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [switchModel, setSwitchModel] = useState('')
  const [switchProvider, setSwitchProvider] = useState('')
  const [activeTab, setActiveTab] = useState('current')

  const load = async () => {
    try {
      setLoading(true)
      const [m, a] = await Promise.all([api.getCurrentModel(), api.getAvailableModels()])
      setModel(m)
      setAvailable(a.models || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const doSwitch = async () => {
    if (!switchModel) return
    try {
      await api.switchModel(switchModel, switchProvider)
      load()
      setSwitchModel('')
      setSwitchProvider('')
    } catch (e) { setError(e.message) }
  }

  const tabs = [
    { id: 'current', label: 'Current Model', icon: Cpu },
    { id: 'catalog', label: 'Model Catalog', icon: BookOpen },
  ]

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Cpu size={28} />
        Models
        <Tooltip text="View and manage the AI models used by Hermes. Switch between models for different capabilities, costs, and latency. The current model is used for all new conversations." />
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 20px', fontSize: 13, fontWeight: isActive ? 600 : 400,
                border: 'none', borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent', color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                cursor: 'pointer', marginBottom: -2, transition: 'all 0.15s',
              }}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Current Model Tab */}
      {activeTab === 'current' && (
        <>
          {/* Current Model */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                Current Model
                <Tooltip text="The AI model currently active for all conversations. This is the model specified in your config.yaml under model.default. Changing it here updates the running configuration immediately." />
              </span>
            </div>
            <div className="grid grid-3">
              <div className="stat-card">
                <div className="stat-label">
                  Model
                  <Tooltip text="The model identifier (e.g., gpt-4o, claude-sonnet-4, glm-5-turbo). This determines the AI's capabilities, context window, and cost per token." />
                </div>
                <div className="stat-value" style={{ fontSize: 18 }}>{model?.model || 'N/A'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Provider
                  <Tooltip text="The API provider serving the model. Determines the endpoint URL and authentication. 'auto' detects from model name. Use 'custom' for self-hosted or proxy endpoints." />
                </div>
                <div className="stat-value" style={{ fontSize: 18 }}>{model?.provider || 'N/A'}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Max Turns
                  <Tooltip text="Maximum tool-calling iterations per conversation turn. More turns allow complex multi-step tasks but cost more tokens. Configurable in Configuration > Agent." />
                </div>
                <div className="stat-value">{model?.max_turns || 'N/A'}</div>
              </div>
            </div>
          </div>

          {/* Switch Model */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <SwitchCamera size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
                Switch Model
                <Tooltip text="Change the active model for all new conversations. This updates config.yaml and takes effect immediately. Existing sessions keep their original model." />
              </span>
            </div>
            <div className="grid grid-2">
              <div className="form-group">
                <label className="form-label">
                  Model Name
                  <Tooltip text='Enter the model identifier. Examples: "gpt-4o", "anthropic/claude-sonnet-4", "google/gemini-3-flash", "mistral/mistral-large". Or click a model badge from the available list below.' />
                </label>
                <input className="form-input" placeholder="e.g. gpt-4o" value={switchModel}
                  onChange={e => setSwitchModel(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Provider (optional)
                  <Tooltip text='Override the provider for this model. If omitted, auto-detection is used based on the model name prefix (e.g., "gpt-" = openai, "claude-" = anthropic). Use this for custom/proxy endpoints.' />
                </label>
                <input className="form-input" placeholder="e.g. openrouter" value={switchProvider}
                  onChange={e => setSwitchProvider(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={doSwitch} disabled={!switchModel}>
              <SwitchCamera size={14} /> Switch
            </button>
          </div>

          {/* Available Models */}
          {available.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  Available Models ({available.length})
                  <Tooltip text="All models accessible with your current API keys and providers. Click any model badge to auto-fill it in the Switch Model form above." />
                </span>
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {available.slice(0, 200).map(m => (
                    <span key={m} className="badge badge-info" style={{ cursor: 'pointer' }}
                      onClick={() => setSwitchModel(m)}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Model Catalog Tab */}
      {activeTab === 'catalog' && <ModelCatalogTab />}
    </div>
  )
}
