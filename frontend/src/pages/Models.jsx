import { useState, useEffect } from 'react'
import { Cpu, RefreshCw, SwitchCamera } from 'lucide-react'
import { api } from '../api'

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
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Current Model */}
      <div className="card">
        <div className="card-header"><span className="card-title">Current Model</span></div>
        <div className="grid grid-3">
          <div className="stat-card">
            <div className="stat-label">Model</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{model?.model || 'N/A'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Provider</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{model?.provider || 'N/A'}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Max Turns</div>
            <div className="stat-value">{model?.max_turns || 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Switch Model */}
      <div className="card">
        <div className="card-header"><span className="card-title"><SwitchCamera size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Switch Model</span></div>
        <div className="grid grid-2">
          <div className="form-group">
            <label className="form-label">Model Name</label>
            <input className="form-input" placeholder="e.g. gpt-4o" value={switchModel}
              onChange={e => setSwitchModel(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Provider (optional)</label>
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
            <span className="card-title">Available Models ({available.length})</span>
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
