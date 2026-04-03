import { useState, useEffect, useCallback } from 'react'
import {
  Puzzle, Search, RefreshCw, X, FileText, Folder, Tag, ChevronRight,
  ExternalLink, Trash2, Package, Filter, Download, Loader2, CheckCircle
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import './skills-hub.css'

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Skill Card ──

function SkillCard({ skill, onClick, installed }) {
  const desc = skill.description || 'No description available'
  return (
    <button className="sh-card" onClick={() => onClick(skill.name)}>
      <div className="sh-card-header">
        <span className="sh-card-icon"><Puzzle size={18} /></span>
        <span className="sh-card-name">{skill.display_name || skill.name}</span>
        {installed && (
          <span className="sh-badge" style={{ background: 'rgba(16,185,129,0.15)', color: 'var(--success)', marginLeft: 'auto', fontSize: 10 }}>
            <CheckCircle size={10} /> installed
          </span>
        )}
      </div>
      <div className="sh-card-desc">{desc.slice(0, 120)}{desc.length > 120 ? '...' : ''}</div>
      <div className="sh-card-footer">
        {skill.category ? (
          <span className="sh-badge">{skill.category}</span>
        ) : (
          <span className="sh-badge muted">uncategorized</span>
        )}
        <span className="sh-card-files">
          <FileText size={11} /> {skill.files_count || 0}
        </span>
      </div>
    </button>
  )
}

// ── Detail Drawer ──

function SkillDrawer({ skill, onClose, isInstalled, onInstall, installing, installResult }) {
  if (!skill) return null

  const content = skill.skill_md || ''
  // Strip frontmatter for display
  const displayContent = content.startsWith('---')
    ? content.slice(content.indexOf('---', 3) + 3).trim()
    : content

  const skillName = skill.name

  return (
    <div className="sh-overlay" onClick={onClose}>
      <div className="sh-drawer" onClick={e => e.stopPropagation()}>
        <div className="sh-drawer-header">
          <div>
            <h2 className="sh-drawer-title">{skill.display_name || skill.name}</h2>
            <div className="sh-drawer-meta">
              {skill.category && <span className="sh-badge">{skill.category}</span>}
              <span className="sh-drawer-filecount">
                <Package size={13} /> {skill.files_count} files
              </span>
              {skill.version && (
                <span className="sh-drawer-filecount">v{skill.version}</span>
              )}
              <span className="sh-badge muted">{skill.source}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isInstalled ? (
              <span className="badge badge-success" style={{ fontSize: 13, padding: '6px 14px' }}>
                <CheckCircle size={14} /> Installed
              </span>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => onInstall(skillName)}
                disabled={installing}
              >
                {installing ? (
                  <><Loader2 size={14} className="spin" /> Installing...</>
                ) : (
                  <><Download size={14} /> Install</>
                )}
              </button>
            )}
            {installResult === 'success' && !isInstalled && (
              <span style={{ color: 'var(--success)', fontSize: 12 }}>Installed! Refreshing...</span>
            )}
            <button className="sh-drawer-close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {skill.description && (
          <div className="sh-drawer-desc">{skill.description}</div>
        )}

        {skill.tags && skill.tags.length > 0 && (
          <div className="sh-drawer-tags">
            <Tag size={13} />
            {skill.tags.map((t, i) => (
              <span key={i} className="sh-tag">{typeof t === 'string' ? t : t.name || JSON.stringify(t)}</span>
            ))}
          </div>
        )}

        {/* Markdown content */}
        {displayContent ? (
          <div className="sh-drawer-section">
            <h3 className="sh-section-title">Documentation</h3>
            <div className="sh-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          </div>
        ) : (
          <div className="sh-drawer-section">
            <p className="sh-empty">No SKILL.md documentation available.</p>
          </div>
        )}

        {/* File tree */}
        {skill.file_tree && Object.keys(skill.file_tree).length > 0 && (
          <div className="sh-drawer-section">
            <h3 className="sh-section-title">
              <Folder size={14} /> Files
            </h3>
            <div className="sh-file-tree">
              {Object.entries(skill.file_tree).map(([dir, files]) => (
                <div key={dir} className="sh-file-group">
                  <div className="sh-file-group-header">
                    <Folder size={13} /> {dir}/
                  </div>
                  {files.map(f => (
                    <div key={f.path} className="sh-file-item">
                      <FileText size={12} />
                      <span className="sh-file-name">{f.name}</span>
                      <span className="sh-file-size">{formatSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ──

export default function SkillsHub() {
  const [data, setData] = useState({ skills: [], categories: {}, total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installResult, setInstallResult] = useState(null)
  const [installedSkills, setInstalledSkills] = useState([])

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [d, installed] = await Promise.all([api.listSkillsDetailed(), api.listSkills()])
      setData(d)
      setInstalledSkills(Array.isArray(installed) ? installed.map(s => s.name) : [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openSkill = async (name) => {
    setDetailLoading(true)
    setInstallResult(null)
    try {
      const detail = await api.skillDetail(name)
      setSelectedSkill(detail)
    } catch (e) {
      setError(e.message)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleInstall = async (name) => {
    setInstalling(true)
    setInstallResult(null)
    try {
      await api.installSkill(name)
      setInstallResult('success')
      // Refresh installed skills list
      const installed = await api.listSkills()
      setInstalledSkills(Array.isArray(installed) ? installed.map(s => s.name) : [])
    } catch (e) {
      setInstallResult(`error: ${e.message}`)
    } finally {
      setInstalling(false)
    }
  }

  // Filter skills
  const filtered = data.skills.filter(s => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q) ||
      (s.display_name || '').toLowerCase().includes(q) ||
      (s.tags || []).some(t => (typeof t === 'string' ? t : '').toLowerCase().includes(q))
    const matchesCat = !categoryFilter || s.category === categoryFilter
    return matchesSearch && matchesCat
  })

  // Sort categories alphabetically
  const sortedCats = Object.entries(data.categories || {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <div className="page-title">
        <Puzzle size={28} />
        Skills Hub
        <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
          ({data.total} skills)
        </span>
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Stats bar */}
      <div className="sh-stats">
        <div className="sh-stat">
          <span className="sh-stat-val">{data.total}</span>
          <span className="sh-stat-label">Total Skills</span>
        </div>
        {sortedCats.map(([cat, count]) => (
          <div
            key={cat}
            className={`sh-stat clickable ${categoryFilter === cat ? 'active' : ''}`}
            onClick={() => setCategoryFilter(categoryFilter === cat ? '' : cat)}
          >
            <span className="sh-stat-val">{count}</span>
            <span className="sh-stat-label">{cat}</span>
          </div>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="sh-toolbar">
        <div className="sh-search">
          <Search size={15} />
          <input
            className="sh-search-input"
            placeholder="Search skills by name, description, or tags..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className="sh-search-clear" onClick={() => setSearch('')}>
              <X size={14} />
            </button>
          )}
        </div>
        {categoryFilter && (
          <button className="btn btn-sm" onClick={() => setCategoryFilter('')}>
            <Filter size={12} /> Clear filter: {categoryFilter}
          </button>
        )}
      </div>

      {/* Skills Grid */}
      {loading ? (
        <div className="spinner" />
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Puzzle size={40} />
          <p>{data.total === 0 ? 'No skills installed' : 'No skills match your search'}</p>
        </div>
      ) : (
        <div className="sh-grid">
          {filtered.map(skill => (
            <SkillCard
              key={skill.name}
              skill={skill}
              onClick={openSkill}
              installed={installedSkills.includes(skill.name)}
            />
          ))}
        </div>
      )}

      {/* Detail Drawer */}
      {selectedSkill && (
        <SkillDrawer
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          isInstalled={installedSkills.includes(selectedSkill.name)}
          onInstall={handleInstall}
          installing={installing}
          installResult={installResult}
        />
      )}

      {/* Loading overlay for detail */}
      {detailLoading && (
        <div className="sh-overlay" onClick={() => setDetailLoading(false)}>
          <div className="spinner" />
        </div>
      )}
    </div>
  )
}
