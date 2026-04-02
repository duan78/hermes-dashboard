import { useState, useEffect } from 'react'
import { Cpu, RefreshCw, SwitchCamera } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

export default function Models() {
  const [model, setModel] = useState(null)
  const [available, setAvailable] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [switchModel, setSwitchModel] = useState('')
  const [switchProvider, setSwitchProvider] = useState('')

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
    </div>
  )
}
