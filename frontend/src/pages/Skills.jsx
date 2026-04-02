import { useState, useEffect } from 'react'
import { BookOpen, Search, Trash2, Eye, RefreshCw } from 'lucide-react'
import { api } from '../api'

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [browseResults, setBrowseResults] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [filter, setFilter] = useState('')

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

  const uninstall = async (name) => {
    if (!confirm(`Uninstall skill "${name}"?`)) return
    try {
      await api.uninstallSkill(name)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

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
            <div className="card-header"><span className="card-title">SKILL.md</span></div>
            <pre style={{ maxHeight: 500 }}>{selectedSkill.skill_md}</pre>
          </div>
        )}
        {selectedSkill.files && (
          <div className="card">
            <div className="card-header"><span className="card-title">Files</span></div>
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
      <div className="page-title">
        <BookOpen size={28} />
        Skills ({skills.length})
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
        />
        <select className="form-select" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button className="btn" onClick={browse}><Search size={14} /> Browse Online</button>
      </div>

      {browseResults && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Browse Results</span>
            <button className="btn btn-sm" onClick={() => setBrowseResults('')}>Close</button>
          </div>
          <pre style={{ maxHeight: 300 }}>{browseResults}</pre>
        </div>
      )}

      {loading ? <div className="spinner" /> : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Source</th>
                <th>Description</th>
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
                        <button className="btn btn-sm btn-danger" onClick={() => uninstall(skill.name)}>
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
