import { useState, useEffect, useCallback } from 'react'
import {
  Puzzle, Search, RefreshCw, X, FileText, Folder, Tag, ChevronRight,
  ExternalLink, Trash2, Package, Filter, Download, Loader2, CheckCircle,
  Globe, ChevronLeft, Shield
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

// ── Source badge colors ──

const SOURCE_COLORS = {
  official: { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: 'Official' },
  github: { bg: 'rgba(99,102,241,0.15)', color: '#6366f1', label: 'GitHub' },
  lobehub: { bg: 'rgba(244,114,182,0.15)', color: '#f472b6', label: 'LobeHub' },
  'skills-sh': { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', label: 'Skills.sh' },
  'claude-marketplace': { bg: 'rgba(168,85,247,0.15)', color: '#a855f7', label: 'Claude' },
  clawhub: { bg: 'rgba(249,115,22,0.15)', color: '#f97316', label: 'ClawHub' },
  'well-known': { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'Well-Known' },
  community: { bg: 'rgba(107,114,128,0.15)', color: '#6b7280', label: 'Community' },
}

function getSourceStyle(source) {
  const s = (source || '').toLowerCase()
  return SOURCE_COLORS[s] || { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)', label: source || 'unknown' }
}

// ── Installed Skill Card ──

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

// ── Registry Skill Card ──

function RegistrySkillCard({ skill, onClick, isInstalled }) {
  const desc = skill.description || 'No description'
  const srcStyle = getSourceStyle(skill.source)
  return (
    <button className="sh-card" onClick={() => onClick(skill)}>
      <div className="sh-card-header">
        <span className="sh-card-icon"><Globe size={18} /></span>
        <span className="sh-card-name" style={{ fontSize: 14 }}>{skill.name}</span>
        {isInstalled && (
          <span className="sh-badge" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981', marginLeft: 'auto', fontSize: 10 }}>
            <CheckCircle size={10} /> Installed
          </span>
        )}
      </div>
      <div className="sh-card-desc">{desc.slice(0, 100)}{desc.length > 100 ? '...' : ''}</div>
      <div className="sh-card-footer">
        <span className="sh-source-badge" style={{ background: srcStyle.bg, color: srcStyle.color }}>
          {srcStyle.label}
        </span>
        {skill.trust && (
          <span className="sh-trust-badge">
            <Shield size={11} /> {skill.trust}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Detail Drawer (installed skills) ──

function SkillDrawer({ skill, onClose, isInstalled, onInstall, installing, installResult }) {
  if (!skill) return null

  const content = skill.skill_md || ''
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

// ── Registry Inspect Drawer ──

function RegistryInspectDrawer({ skill, inspectOutput, onClose, isInstalled, onInstall, installing, installResult, loadingInspect }) {
  if (!skill) return null
  const srcStyle = getSourceStyle(skill.source)
  const identifier = skill.identifier || skill.name

  return (
    <div className="sh-overlay" onClick={onClose}>
      <div className="sh-drawer" onClick={e => e.stopPropagation()}>
        <div className="sh-drawer-header">
          <div>
            <h2 className="sh-drawer-title">{skill.name}</h2>
            <div className="sh-drawer-meta">
              <span className="sh-source-badge" style={{ background: srcStyle.bg, color: srcStyle.color }}>
                {srcStyle.label}
              </span>
              {skill.trust && (
                <span className="sh-trust-badge">
                  <Shield size={12} /> {skill.trust}
                </span>
              )}
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
                onClick={() => onInstall(identifier)}
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
              <span style={{ color: 'var(--success)', fontSize: 12 }}>Installed!</span>
            )}
            <button className="sh-drawer-close" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        {skill.description && (
          <div className="sh-drawer-desc">{skill.description}</div>
        )}

        <div className="sh-drawer-section">
          <h3 className="sh-section-title">
            <FileText size={14} /> Skill Preview
          </h3>
          {loadingInspect ? (
            <div className="spinner" style={{ margin: '20px auto' }} />
          ) : inspectOutput ? (
            <pre className="sh-inspect-output">{inspectOutput}</pre>
          ) : (
            <p className="sh-empty">No preview available.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Pagination ──

function Pagination({ page, totalPages, onPageChange }) {
  if (totalPages <= 1) return null
  return (
    <div className="sh-pagination">
      <button
        className="btn btn-sm"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <span className="sh-pagination-info">
        Page {page} / {totalPages}
      </span>
      <button
        className="btn btn-sm"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  )
}

// ── Main Page ──

export default function SkillsHub() {
  const [activeTab, setActiveTab] = useState('installed')

  // Installed skills state
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

  // Registry state
  const [regLoading, setRegLoading] = useState(false)
  const [regError, setRegError] = useState(null)
  const [regSkills, setRegSkills] = useState([])
  const [regTotal, setRegTotal] = useState(0)
  const [regPage, setRegPage] = useState(1)
  const [regTotalPages, setRegTotalPages] = useState(1)
  const [regSource, setRegSource] = useState('all')
  const [regQuery, setRegQuery] = useState('')
  const [regSourceStats, setRegSourceStats] = useState({})
  const [regSelected, setRegSelected] = useState(null)
  const [regInspectOutput, setRegInspectOutput] = useState('')
  const [regInspectLoading, setRegInspectLoading] = useState(false)
  const [regSearchTimer, setRegSearchTimer] = useState(null)

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

  const loadRegistry = useCallback(async (page, source, query) => {
    try {
      setRegLoading(true)
      setRegError(null)
      const result = await api.browseRegistry(page, 20, source, query)
      setRegSkills(result.skills || [])
      setRegTotal(result.total || 0)
      setRegPage(result.page || 1)
      setRegTotalPages(result.total_pages || 1)
      setRegSourceStats(result.source_stats || {})
      if (result.error) {
        setRegError(result.error)
      }
    } catch (e) {
      setRegError(e.message)
      setRegSkills([])
    } finally {
      setRegLoading(false)
    }
  }, [])

  // Load registry when tab switches to browse
  useEffect(() => {
    if (activeTab === 'browse') {
      loadRegistry(regPage, regSource, regQuery)
    }
  }, [activeTab, regPage, regSource]) // intentionally not regQuery — handled by timer

  // Search debounce for registry
  const handleRegSearch = (val) => {
    setRegQuery(val)
    setRegPage(1)
    if (regSearchTimer) clearTimeout(regSearchTimer)
    if (!val) {
      loadRegistry(1, regSource, '')
      return
    }
    setRegSearchTimer(setTimeout(() => {
      loadRegistry(1, regSource, val)
    }, 500))
  }

  const handleRegSourceChange = (src) => {
    setRegSource(src)
    setRegPage(1)
  }

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
      // Also refresh detailed list
      load()
    } catch (e) {
      setInstallResult(`error: ${e.message}`)
    } finally {
      setInstalling(false)
    }
  }

  const openRegistrySkill = async (skill) => {
    setRegSelected(skill)
    setRegInspectOutput('')
    setRegInspectLoading(true)
    setInstallResult(null)
    try {
      const identifier = skill.identifier || skill.name
      const result = await api.inspectRegistrySkill(identifier)
      setRegInspectOutput(result.output || '')
    } catch (e) {
      setRegInspectOutput(`Error: ${e.message}`)
    } finally {
      setRegInspectLoading(false)
    }
  }

  // Filter installed skills
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

  const sortedCats = Object.entries(data.categories || {}).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div>
      <div className="page-title">
        <Puzzle size={28} />
        Skills Hub
        <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
          {activeTab === 'installed' ? `(${data.total} installed)` : `(${regTotal} available)`}
        </span>
        <button className="btn btn-sm" onClick={activeTab === 'installed' ? load : () => loadRegistry(regPage, regSource, regQuery)} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="sh-tabs">
        <button
          className={`sh-tab ${activeTab === 'installed' ? 'active' : ''}`}
          onClick={() => setActiveTab('installed')}
        >
          <Puzzle size={15} /> Installed
        </button>
        <button
          className={`sh-tab ${activeTab === 'browse' ? 'active' : ''}`}
          onClick={() => setActiveTab('browse')}
        >
          <Globe size={15} /> Browse Online
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* ═══════════ INSTALLED TAB ═══════════ */}
      {activeTab === 'installed' && (
        <>
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
              <p>{data.total === 0 ? 'No skills installed. Browse the Online tab to find and install skills.' : 'No skills match your search'}</p>
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
        </>
      )}

      {/* ═══════════ BROWSE ONLINE TAB ═══════════ */}
      {activeTab === 'browse' && (
        <>
          {regError && <div className="error-box">{regError}</div>}

          {/* Source stats bar */}
          {Object.keys(regSourceStats).length > 0 && (
            <div className="sh-stats">
              {Object.entries(regSourceStats).map(([src, count]) => {
                if (count === 0) return null
                const style = getSourceStyle(src)
                return (
                  <div
                    key={src}
                    className={`sh-stat clickable ${regSource === src ? 'active' : ''}`}
                    onClick={() => handleRegSourceChange(regSource === src ? 'all' : src)}
                    style={regSource === src ? { borderColor: style.color } : {}}
                  >
                    <span className="sh-stat-val" style={{ color: style.color }}>{count}</span>
                    <span className="sh-stat-label">{style.label}</span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Search + Source filter */}
          <div className="sh-toolbar">
            <div className="sh-search">
              <Search size={15} />
              <input
                className="sh-search-input"
                placeholder="Search online skills..."
                value={regQuery}
                onChange={e => handleRegSearch(e.target.value)}
              />
              {regQuery && (
                <button className="sh-search-clear" onClick={() => handleRegSearch('')}>
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              className="sh-select"
              value={regSource}
              onChange={e => handleRegSourceChange(e.target.value)}
            >
              <option value="all">All Sources</option>
              <option value="official">Official</option>
              <option value="github">GitHub</option>
              <option value="lobehub">LobeHub</option>
              <option value="skills-sh">Skills.sh</option>
              <option value="claude-marketplace">Claude Marketplace</option>
            </select>
          </div>

          {/* Pagination (top) */}
          <Pagination page={regPage} totalPages={regTotalPages} onPageChange={setRegPage} />

          {/* Registry skills grid */}
          {regLoading ? (
            <div className="spinner" />
          ) : regSkills.length === 0 ? (
            <div className="empty-state">
              <Globe size={40} />
              <p>{regQuery ? 'No skills match your search' : 'No skills found for this source'}</p>
            </div>
          ) : (
            <div className="sh-grid">
              {regSkills.map((skill, idx) => (
                <RegistrySkillCard
                  key={skill.name + '-' + idx}
                  skill={skill}
                  onClick={openRegistrySkill}
                  isInstalled={installedSkills.includes(skill.name)}
                />
              ))}
            </div>
          )}

          {/* Pagination (bottom) */}
          <Pagination page={regPage} totalPages={regTotalPages} onPageChange={setRegPage} />
        </>
      )}

      {/* Installed skill detail drawer */}
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

      {/* Registry inspect drawer */}
      {regSelected && (
        <RegistryInspectDrawer
          skill={regSelected}
          inspectOutput={regInspectOutput}
          onClose={() => { setRegSelected(null); setRegInspectOutput('') }}
          isInstalled={installedSkills.includes(regSelected.name)}
          onInstall={handleInstall}
          installing={installing}
          installResult={installResult}
          loadingInspect={regInspectLoading}
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
