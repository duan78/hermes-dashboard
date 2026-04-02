import { useState, useEffect } from 'react'
import { Brain, Save, RefreshCw, FileText } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

export default function MemorySoul() {
  const [tab, setTab] = useState('soul')
  const [soulContent, setSoulContent] = useState('')
  const [memoryContent, setMemoryContent] = useState('')
  const [memoryFiles, setMemoryFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [soul, memory, files] = await Promise.all([
        api.getSoul(),
        api.getMemory(),
        api.listMemoryFiles(),
      ])
      setSoulContent(soul.content || '')
      setMemoryContent(memory.content || '')
      setMemoryFiles(files.files || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const saveSoul = async () => {
    try {
      await api.saveSoul(soulContent)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
  }

  const saveMemory = async () => {
    try {
      await api.saveMemory(memoryContent)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
  }

  const saveFile = async () => {
    if (!selectedFile) return
    try {
      await api.saveMemoryFile(selectedFile.name, fileContent)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e) { setError(e.message) }
  }

  const openFile = async (file) => {
    try {
      const data = await api.getMemoryFile(file.name)
      setSelectedFile(file)
      setFileContent(data.content || '')
    } catch (e) { setError(e.message) }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Brain size={28} />
        Memory & SOUL
        <Tooltip text="Manage the agent's persistent memory and personality. SOUL.md defines the core behavior and values. MEMORY.md stores learned facts across sessions. Memory files provide additional specialized context." />
        {saved && <span className="badge badge-success">Saved!</span>}
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'soul' ? 'active' : ''}`} onClick={() => setTab('soul')}>
          SOUL.md <Tooltip text="The core personality file that defines how Hermes behaves: its values, communication style, behavioral guidelines, and ethical boundaries. This is injected into every conversation as the system prompt foundation." />
        </button>
        <button className={`tab ${tab === 'memory' ? 'active' : ''}`} onClick={() => setTab('memory')}>
          MEMORY.md <Tooltip text="Persistent memory file that carries context across conversations. Contains notes, facts, and patterns the agent has learned over time. Automatically updated during conversations when memory is enabled." />
        </button>
        <button className={`tab ${tab === 'files' ? 'active' : ''}`} onClick={() => setTab('files')}>
          Memory Files <Tooltip text="Additional memory files in ~/.hermes/memories/ that provide specialized context: documentation, skill-specific notes, user preferences, and other reference material the agent can draw upon." />
        </button>
      </div>

      {tab === 'soul' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={saveSoul}><Save size={14} /> Save SOUL.md</button>
          </div>
          <textarea
            className="code-editor"
            value={soulContent}
            onChange={e => setSoulContent(e.target.value)}
            style={{ minHeight: 500 }}
            spellCheck={false}
          />
        </div>
      )}

      {tab === 'memory' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button className="btn btn-primary" onClick={saveMemory}><Save size={14} /> Save MEMORY.md</button>
          </div>
          <textarea
            className="code-editor"
            value={memoryContent}
            onChange={e => setMemoryContent(e.target.value)}
            style={{ minHeight: 500 }}
            spellCheck={false}
          />
        </div>
      )}

      {tab === 'files' && (
        <div>
          {!selectedFile ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name <Tooltip text="Filename of the memory file stored in ~/.hermes/memories/. The agent reads these files to gain additional context during conversations." /></th>
                    <th>Size <Tooltip text="File size in kilobytes. Larger files provide more context but consume more tokens when injected into the conversation." /></th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {memoryFiles.map(f => (
                    <tr key={f.name}>
                      <td style={{ fontWeight: 500 }}><FileText size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />{f.name}</td>
                      <td>{(f.size / 1024).toFixed(1)} KB</td>
                      <td><button className="btn btn-sm" onClick={() => openFile(f)}>Edit</button></td>
                    </tr>
                  ))}
                  {memoryFiles.length === 0 && (
                    <tr><td colSpan={3} className="empty-state">No memory files</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <button className="btn btn-sm" onClick={() => setSelectedFile(null)}>Back to files</button>
                <button className="btn btn-primary" onClick={saveFile}><Save size={14} /> Save {selectedFile.name}</button>
              </div>
              <textarea
                className="code-editor"
                value={fileContent}
                onChange={e => setFileContent(e.target.value)}
                spellCheck={false}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
