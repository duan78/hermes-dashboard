import { useState, useEffect } from 'react'
import { Settings, Save, RotateCw, AlertTriangle } from 'lucide-react'
import { api } from '../api'

export default function Config() {
  const [rawYaml, setRawYaml] = useState('')
  const [sections, setSections] = useState(null)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [tab, setTab] = useState('editor')

  const load = async () => {
    try {
      setLoading(true)
      const [cfg, sec] = await Promise.all([api.getConfig(), api.getConfigSections()])
      setRawYaml(cfg.raw_yaml || '')
      setSections(sec)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    try {
      await api.saveConfig(rawYaml)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Settings size={28} />
        Configuration
        <button className="btn btn-primary" onClick={save} style={{ marginLeft: 'auto' }}>
          <Save size={14} /> {saved ? 'Saved!' : 'Save'}
        </button>
      </div>

      {error && <div className="error-box"><AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />{error}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'editor' ? 'active' : ''}`} onClick={() => setTab('editor')}>YAML Editor</button>
        <button className={`tab ${tab === 'sections' ? 'active' : ''}`} onClick={() => setTab('sections')}>Sections</button>
      </div>

      {tab === 'editor' && (
        <div className="card" style={{ padding: 0 }}>
          <textarea
            className="code-editor"
            value={rawYaml}
            onChange={e => setRawYaml(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      {tab === 'sections' && sections && (
        <div>
          {Object.entries(sections).map(([key, value]) => (
            <div key={key} className="card">
              <div className="card-header">
                <span className="card-title">{key}</span>
              </div>
              <pre style={{ margin: 0, fontSize: 12, maxHeight: 300 }}>{JSON.stringify(value, null, 2)}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
