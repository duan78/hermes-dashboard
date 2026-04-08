import { useState, useEffect } from 'react'
import { BookOpen, Search, Trash2, Eye, RefreshCw, Download, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [browseResults, setBrowseResults] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [filter, setFilter] = useState('')
  const [installing, setInstalling] = useState({})
  const [installResult, setInstallResult] = useState({})
  const [confirmModal, setConfirmModal] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listSkills()
      setSkills(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const browse = async () => {
    try {
      const data = await api.browseSkills(searchQuery)
      setBrowseResults(data.output || '')
    } catch (e) {
      setError(e.message)
    }
  }

  const inspect = async (name) => {
    try {
      const data = await api.inspectSkill(name)
      setSelectedSkill(data)
    } catch (e) {
      setError(e.message)
    }
  }

  const uninstall = (name) => {
    setConfirmModal({
      message: `Uninstall skill "${name}"?`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await api.uninstallSkill(name)
          load()
        } catch (e) {
          setError(e.message)
        }
      }
    })
  }

  const installSkill = async (name) => {
    setInstalling(prev => ({ ...prev, [name]: true }))
    setInstallResult(prev => ({ ...prev, [name]: null }))
    try {
      await api.installSkill(name)
      setInstallResult(prev => ({ ...prev, [name]: 'success' }))
      load()
      setTimeout(() => {
        setInstallResult(prev => ({ ...prev, [name]: null }))
      }, 3000)
    } catch (e) {
      setInstallResult(prev => ({ ...prev, [name]: `error: ${e.message}` }))
    } finally {
      setInstalling(prev => ({ ...prev, [name]: false }))
    }
  }

  // Parse browse results into structured entries
  const parseBrowseResults = (text) => {
    if (!text) return []
    const lines = text.split('\n').filter(l => l.trim())
    const entries = []
    for (const line of lines) {
      // Try to match common patterns: "  skill_name  - description" or numbered lists
      const match = line.match(/^\s*(?:\d+[\.\)]\s*)?(\w[\w\-]*)\s*[-–—:]\s*(.+)/)
      if (match) {
        entries.push({ name: match[1].trim(), description: match[2].trim() })
        continue
      }
      // Also match bullet points
      const bulletMatch = line.match(/^\s*[*\-•]\s*(\w[\w\-]*)(?:\s*[-–—:]\s*(.+))?/)
      if (bulletMatch) {
        entries.push({ name: bulletMatch[1].trim(), description: bulletMatch[2]?.trim() || '' })
        continue
      }
      // Match lines that are just a skill name (single word, no spaces)
      const simpleMatch = line.match(/^\s*(\w[\w\-]{2,})\s*$/)
      if (simpleMatch) {
        entries.push({ name: simpleMatch[1].trim(), description: '' })
      }
    }
    return entries
  }

  const installedNames = new Set(skills.map(s => s.name))
  const browseEntries = parseBrowseResults(browseResults)

  const categories = [...new Set(skills.map(s => s.category).filter(Boolean))]
  const filtered = skills.filter(s =>
    (!filter || s.category === filter) &&
    (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  if (selectedSkill) {
    return (
      <div>
        <div className="page-title">
          <BookOpen size={28} />
          Skill: {selectedSkill.name}
          <button className="btn btn-sm" onClick={() => setSelectedSkill(null)} style={{ marginLeft: 'auto' }}>Back</button>
        </div>
        {selectedSkill.skill_md && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                SKILL.md
                <Tooltip text="The skill's documentation file that defines its purpose, usage instructions, and examples. This content is loaded into the AI's context when the skill is activated." />
              </span>
            </div>
            <pre style={{ maxHeight: 500 }}>{selectedSkill.skill_md}</pre>
          </div>
        )}
        {selectedSkill.files && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                Files
                <Tooltip text="All files that make up this skill: prompt templates, scripts, configuration, and documentation. Stored in ~/.hermes/skills/." />
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedSkill.files.map((f, i) => (
                <span key={i} className="badge badge-info">{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {confirmModal && <ConfirmModal title="Confirm" message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} confirmLabel="Uninstall" />}
      <div className="page-title">
        <BookOpen size={28} />
        Skills ({skills.length})
        <Tooltip text="Installed skills that extend Hermes capabilities. Skills can provide specialized knowledge, custom workflows, or domain-specific tools. Install from the registry or create your own." />
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Filters */}
      <div className="search-bar">
        <input
          className="form-input"
          placeholder="Search skills..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search skills"
        />
        <select className="form-select" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label="Filter by category">
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn" onClick={browse}><Search size={14} /> Browse Online</button>
      </div>

      {browseResults && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">
              Browse Results
              <Tooltip text="Skills available in the online registry. Click Install to add them to your Hermes instance." />
            </span>
            <button className="btn btn-sm" onClick={() => { setBrowseResults(''); setInstallResult({}) }}>Close</button>
          </div>
          {browseEntries.length > 0 ? (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Skill Name</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {browseEntries.map(entry => {
                    const isInstalled = installedNames.has(entry.name)
                    const isInstalling = !!installing[entry.name]
                    const result = installResult[entry.name]
                    return (
                      <tr key={entry.name}>
                        <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{entry.name}</td>
                        <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {entry.description || '-'}
                        </td>
                        <td>
                          {isInstalled ? (
                            <span className="badge badge-success"><CheckCircle size={12} /> Installed</span>
                          ) : result === 'success' ? (
                            <span className="badge badge-success"><CheckCircle size={12} /> Just installed</span>
                          ) : result?.startsWith('error') ? (
                            <span className="badge badge-error"><XCircle size={12} /> Failed</span>
                          ) : null}
                        </td>
                        <td>
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => installSkill(entry.name)}
                            disabled={isInstalling || isInstalled}
                          >
                            {isInstalling ? (
                              <><Loader2 size={12} className="spin" /> Installing</>
                            ) : isInstalled ? (
                              <><CheckCircle size={12} /> Installed</>
                            ) : (
                              <><Download size={12} /> Install</>
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <pre style={{ maxHeight: 300 }}>{browseResults}</pre>
          )}
        </div>
      )}

      {loading ? <div className="spinner" /> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name <Tooltip text="The skill's display name and unique identifier. Click Inspect to view the full skill documentation and files." /></th>
                <th>Category <Tooltip text="Classification of the skill's domain: coding, productivity, communication, automation, etc. Use the filter dropdown to show only specific categories." /></th>
                <th>Source <Tooltip text="Where the skill was installed from. 'builtin' comes with Hermes. 'registry' was installed from the online skill hub. 'local' was created manually." /></th>
                <th>Description <Tooltip text="Brief summary of what the skill does and when it's useful." /></th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(skill => (
                <tr key={skill.name}>
                  <td style={{ fontWeight: 600 }}>{skill.name}</td>
                  <td><span className="badge badge-info">{skill.category || '-'}</span></td>
                  <td><span className="badge badge-warning">{skill.source}</span></td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {skill.description || '-'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => inspect(skill.name)}>
                        <Eye size={12} /> Inspect
                      </button>
                      {skill.source !== 'builtin' && (
                        <button className="btn btn-sm btn-danger" onClick={() => uninstall(skill.name)} aria-label="Uninstall skill">
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="empty-state">No skills found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
