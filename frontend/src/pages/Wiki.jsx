import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Search, X, RefreshCw, BookOpen, Clock, Tag, FolderOpen,
  Database, ChevronDown, ChevronRight, File, Archive
} from 'lucide-react'
import { formatSize, formatDate } from '../utils/format'

const TYPE_LABELS = {
  entities: { label: 'Entities', icon: Database, color: '#8b5cf6' },
  concepts: { label: 'Concepts', icon: BookOpen, color: '#06b6d4' },
  comparisons: { label: 'Comparisons', icon: FileText, color: '#f59e0b' },
  queries: { label: 'Queries', icon: Search, color: '#10b981' },
}

const SOURCE_LABELS = {
  articles: { label: 'Articles', icon: FileText, color: '#6366f1' },
  papers: { label: 'Papers', icon: FolderOpen, color: '#ec4899' },
  transcripts: { label: 'Transcripts', icon: File, color: '#14b8a6' },
}

const TAG_COLORS = [
  '#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#6366f1',
  '#f97316', '#14b8a6', '#a855f7', '#3b82f6', '#ef4444', '#84cc16',
]

function tagColor(tag) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length]
}

function PageModal({ page, onClose }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setContent(null)
    fetch(`/api/wiki/page/${page.type}/${page.name}`)
      .then(r => r.json())
      .then(data => { setContent(data.content); setLoading(false) })
      .catch(() => { setContent('Failed to load page.'); setLoading(false) })
  }, [page])

  useEffect(() => {
    const handleEsc = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wiki-page-modal" onClick={e => e.stopPropagation()} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="wiki-page-modal-header">
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary, #e2e8f0)' }}>{page.title}</h2>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="wiki-type-badge" style={{ background: TYPE_LABELS[page.type]?.color || '#666' }}>
                {TYPE_LABELS[page.type]?.label || page.type}
              </span>
              {page.tags?.map(t => (
                <span key={t} className="wiki-tag-badge" style={{ background: tagColor(t) + '22', color: tagColor(t), borderColor: tagColor(t) + '44' }}>
                  {t}
                </span>
              ))}
              {page.updated && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>
                  Updated: {page.updated}
                </span>
              )}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: '6px 10px' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="wiki-page-modal-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-secondary, #94a3b8)' }}>
              <div style={{ width: 24, height: 24, border: '2px solid var(--border, rgba(255,255,255,0.1))', borderTopColor: 'var(--accent, #8b5cf6)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : (
            <pre style={{
              margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace", fontSize: '0.85rem',
              lineHeight: 1.6, color: 'var(--text-primary, #e2e8f0)',
              background: 'var(--bg-base, #0a0a0f)', padding: 20, borderRadius: 8,
              border: '1px solid var(--border, rgba(255,255,255,0.06))',
              maxHeight: '65vh', overflow: 'auto'
            }}>
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Wiki() {
  const [stats, setStats] = useState(null)
  const [pages, setPages] = useState([])
  const [logEntries, setLogEntries] = useState([])
  const [sources, setSources] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedTypes, setExpandedTypes] = useState(new Set())
  const [selectedPage, setSelectedPage] = useState(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [s, p, l, src] = await Promise.all([
        fetch('/api/wiki/stats').then(r => r.json()),
        fetch('/api/wiki/pages').then(r => r.json()),
        fetch('/api/wiki/log?limit=20').then(r => r.json()),
        fetch('/api/wiki/sources').then(r => r.json()),
      ])
      setStats(s)
      setPages(p.pages || [])
      setLogEntries(l.entries || [])
      setSources(src)
    } catch (e) {
      console.error('Wiki load error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const toggleType = (type) => {
    setExpandedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const filteredPages = searchQuery
    ? pages.filter(p =>
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : pages

  const pagesByType = {}
  for (const p of filteredPages) {
    if (!pagesByType[p.type]) pagesByType[p.type] = []
    pagesByType[p.type].push(p)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary, #94a3b8)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border, rgba(255,255,255,0.1))', borderTopColor: 'var(--accent, #8b5cf6)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (stats && !stats.exists) {
    return (
      <div className="wiki-container">
        <div className="wiki-header">
          <h1><FileText size={28} /> LLM Wiki</h1>
          <p style={{ color: 'var(--text-secondary, #94a3b8)' }}>Wiki directory not found at ~/wiki</p>
        </div>
      </div>
    )
  }

  return (
    <div className="wiki-container">
      <style>{`
        .wiki-container { max-width: 1200px; margin: 0 auto; padding: 24px; }
        .wiki-header { margin-bottom: 24px; }
        .wiki-header h1 { display: flex; align-items: center; gap: 12px; font-size: 1.5rem; color: var(--text-primary, #e2e8f0); margin: 0 0 8px; }
        .wiki-header p { color: var(--text-secondary, #94a3b8); font-size: 0.9rem; margin: 0; }
        .wiki-stats-bar { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
        .wiki-stat { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-card, #111119); border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 10px; }
        .wiki-stat-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; }
        .wiki-stat-value { font-size: 1.25rem; font-weight: 700; color: var(--text-primary, #e2e8f0); }
        .wiki-stat-label { font-size: 0.75rem; color: var(--text-secondary, #94a3b8); }
        .wiki-search { display: flex; gap: 12px; align-items: center; margin-bottom: 24px; }
        .wiki-search input { flex: 1; max-width: 400px; padding: 10px 14px 10px 38px; background: var(--bg-card, #111119); border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 10px; color: var(--text-primary, #e2e8f0); font-size: 0.9rem; outline: none; }
        .wiki-search input:focus { border-color: var(--accent, #8b5cf6); }
        .wiki-search-icon { position: relative; left: 34px; color: var(--text-secondary, #94a3b8); pointer-events: none; z-index: 1; }
        .wiki-section { margin-bottom: 28px; }
        .wiki-section-title { display: flex; align-items: center; gap: 8px; font-size: 1.1rem; color: var(--text-primary, #e2e8f0); margin: 0 0 14px; font-weight: 600; }
        .wiki-type-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .wiki-type-card { background: var(--bg-card, #111119); border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 12px; overflow: hidden; }
        .wiki-type-card-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; cursor: pointer; transition: background 0.15s; }
        .wiki-type-card-header:hover { background: rgba(255,255,255,0.02); }
        .wiki-type-card-header-left { display: flex; align-items: center; gap: 10px; }
        .wiki-type-icon { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: white; }
        .wiki-type-name { font-weight: 600; color: var(--text-primary, #e2e8f0); font-size: 0.95rem; }
        .wiki-type-count { font-size: 0.8rem; color: var(--text-secondary, #94a3b8); background: rgba(255,255,255,0.05); padding: 2px 10px; border-radius: 20px; font-weight: 600; }
        .wiki-type-pages { border-top: 1px solid var(--border, rgba(255,255,255,0.04)); max-height: 300px; overflow-y: auto; }
        .wiki-page-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; cursor: pointer; border-bottom: 1px solid rgba(255,255,255,0.02); transition: background 0.15s; gap: 12px; }
        .wiki-page-item:hover { background: rgba(255,255,255,0.03); }
        .wiki-page-item:last-child { border-bottom: none; }
        .wiki-page-item-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .wiki-page-item-title { color: var(--text-primary, #e2e8f0); font-size: 0.88rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wiki-page-item-tags { display: flex; gap: 4px; flex-wrap: wrap; }
        .wiki-page-item-meta { color: var(--text-secondary, #94a3b8); font-size: 0.75rem; white-space: nowrap; }
        .wiki-tag-badge { font-size: 0.7rem; padding: 1px 8px; border-radius: 20px; border: 1px solid; font-weight: 500; }
        .wiki-type-badge { font-size: 0.75rem; padding: 2px 10px; border-radius: 6px; color: white; font-weight: 600; }
        .wiki-source-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .wiki-source-card { background: var(--bg-card, #111119); border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 12px; padding: 16px; }
        .wiki-source-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .wiki-source-icon { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: white; }
        .wiki-source-name { font-weight: 600; color: var(--text-primary, #e2e8f0); }
        .wiki-source-count { font-size: 0.8rem; color: var(--text-secondary, #94a3b8); margin-left: auto; }
        .wiki-source-list { max-height: 200px; overflow-y: auto; }
        .wiki-source-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; font-size: 0.82rem; border-bottom: 1px solid rgba(255,255,255,0.02); }
        .wiki-source-item:last-child { border-bottom: none; }
        .wiki-source-item-name { color: var(--text-primary, #e2e8f0); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; margin-right: 8px; }
        .wiki-source-item-size { color: var(--text-secondary, #94a3b8); font-size: 0.75rem; white-space: nowrap; }
        .wiki-log { background: var(--bg-card, #111119); border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 12px; max-height: 400px; overflow-y: auto; }
        .wiki-log-entry { padding: 12px 16px; border-bottom: 1px solid rgba(255,255,255,0.03); }
        .wiki-log-entry:last-child { border-bottom: none; }
        .wiki-log-header { font-weight: 600; color: var(--accent, #8b5cf6); font-size: 0.88rem; margin-bottom: 4px; }
        .wiki-log-detail { color: var(--text-secondary, #94a3b8); font-size: 0.82rem; line-height: 1.5; }
        .wiki-tags-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .wiki-schema-tag { font-size: 0.82rem; padding: 6px 14px; border-radius: 8px; background: rgba(139, 92, 246, 0.12); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.2); font-weight: 500; }
        .wiki-empty { color: var(--text-secondary, #94a3b8); font-size: 0.85rem; padding: 20px; text-align: center; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px); }
        .wiki-page-modal { background: var(--bg-card, #111119); border: 1px solid var(--border, rgba(255,255,255,0.06)); border-radius: 16px; width: 100%; max-width: 860px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
        .wiki-page-modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--border, rgba(255,255,255,0.06)); }
        .wiki-page-modal-body { padding: 16px 24px 24px; overflow: hidden; display: flex; flex-direction: column; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border, rgba(255,255,255,0.1)); background: var(--bg-card, #111119); color: var(--text-primary, #e2e8f0); cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
        .btn:hover { background: rgba(255,255,255,0.05); }
      `}</style>

      {/* Header */}
      <div className="wiki-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1><FileText size={28} /> LLM Wiki</h1>
            <p>Knowledge base for entities, concepts, comparisons, and research sources</p>
          </div>
          <button className="btn" onClick={loadAll} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        {stats && (
          <div className="wiki-stats-bar">
            <div className="wiki-stat">
              <div className="wiki-stat-icon" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                <Database size={16} />
              </div>
              <div>
                <div className="wiki-stat-value">{stats.total_pages}</div>
                <div className="wiki-stat-label">Pages</div>
              </div>
            </div>
            <div className="wiki-stat">
              <div className="wiki-stat-icon" style={{ background: 'rgba(6,182,212,0.15)', color: '#22d3ee' }}>
                <FolderOpen size={16} />
              </div>
              <div>
                <div className="wiki-stat-value">{stats.total_sources}</div>
                <div className="wiki-stat-label">Sources</div>
              </div>
            </div>
            <div className="wiki-stat">
              <div className="wiki-stat-icon" style={{ background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
                <Tag size={16} />
              </div>
              <div>
                <div className="wiki-stat-value">{stats.schema_tags?.length || 0}</div>
                <div className="wiki-stat-label">Tags</div>
              </div>
            </div>
            <div className="wiki-stat">
              <div className="wiki-stat-icon" style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                <Clock size={16} />
              </div>
              <div>
                <div className="wiki-stat-value">{stats.log_entries}</div>
                <div className="wiki-stat-label">Log Entries</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="wiki-search">
        <Search size={16} className="wiki-search-icon" />
        <input
          type="text"
          placeholder="Search pages by name or tag..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          aria-label="Search wiki pages"
        />
        {searchQuery && (
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary, #94a3b8)' }}>
            {filteredPages.length} result{filteredPages.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Knowledge Base */}
      <div className="wiki-section">
        <h2 className="wiki-section-title"><Database size={18} /> Knowledge Base</h2>
        {Object.keys(TYPE_LABELS).length > 0 ? (
          <div className="wiki-type-grid">
            {Object.entries(TYPE_LABELS).map(([type, cfg]) => {
              const typePages = pagesByType[type] || []
              const totalCount = stats?.by_type?.[type] || 0
              const isExpanded = expandedTypes.has(type)
              return (
                <div key={type} className="wiki-type-card">
                  <div className="wiki-type-card-header" onClick={() => toggleType(type)}>
                    <div className="wiki-type-card-header-left">
                      <div className="wiki-type-icon" style={{ background: cfg.color }}>
                        <cfg.icon size={16} />
                      </div>
                      <span className="wiki-type-name">{cfg.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span className="wiki-type-count">{totalCount}</span>
                      {isExpanded ? <ChevronDown size={16} color="var(--text-secondary)" /> : <ChevronRight size={16} color="var(--text-secondary)" />}
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="wiki-type-pages">
                      {typePages.length > 0 ? typePages.map(p => (
                        <div key={p.name} className="wiki-page-item" onClick={() => setSelectedPage(p)}>
                          <div className="wiki-page-item-left">
                            <div className="wiki-page-item-title">{p.title}</div>
                            {p.tags?.length > 0 && (
                              <div className="wiki-page-item-tags">
                                {p.tags.map(t => (
                                  <span key={t} className="wiki-tag-badge" style={{ background: tagColor(t) + '22', color: tagColor(t), borderColor: tagColor(t) + '44' }}>{t}</span>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="wiki-page-item-meta">
                            {formatSize(p.size)}
                            {p.updated && <span> · {p.updated}</span>}
                          </div>
                        </div>
                      )) : (
                        <div className="wiki-empty">No pages</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="wiki-empty">No page types found</div>
        )}
      </div>

      {/* Raw Sources */}
      <div className="wiki-section">
        <h2 className="wiki-section-title"><FolderOpen size={18} /> Raw Sources</h2>
        <div className="wiki-source-grid">
          {Object.entries(SOURCE_LABELS).map(([type, cfg]) => {
            const items = sources?.[type] || []
            return (
              <div key={type} className="wiki-source-card">
                <div className="wiki-source-card-header">
                  <div className="wiki-source-icon" style={{ background: cfg.color }}>
                    <cfg.icon size={16} />
                  </div>
                  <span className="wiki-source-name">{cfg.label}</span>
                  <span className="wiki-source-count">{items.length} file{items.length !== 1 ? 's' : ''}</span>
                </div>
                {items.length > 0 ? (
                  <div className="wiki-source-list">
                    {items.map((item, i) => (
                      <div key={i} className="wiki-source-item">
                        <span className="wiki-source-item-name" title={item.name}>{item.name}</span>
                        <span className="wiki-source-item-size">{formatSize(item.size)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="wiki-empty">No files</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Activity Log */}
      <div className="wiki-section">
        <h2 className="wiki-section-title"><Clock size={18} /> Activity Log</h2>
        <div className="wiki-log">
          {logEntries.length > 0 ? logEntries.map((entry, i) => (
            <div key={i} className="wiki-log-entry">
              <div className="wiki-log-header">{entry.header}</div>
              {entry.details?.map((d, j) => (
                <div key={j} className="wiki-log-detail">{d}</div>
              ))}
            </div>
          )) : (
            <div className="wiki-empty">No log entries</div>
          )}
        </div>
      </div>

      {/* Schema & Tags */}
      {stats?.schema_tags?.length > 0 && (
        <div className="wiki-section">
          <h2 className="wiki-section-title"><Tag size={18} /> Schema & Tags</h2>
          <div className="wiki-tags-grid">
            {stats.schema_tags.map((tag, i) => (
              <span key={i} className="wiki-schema-tag">{tag}</span>
            ))}
          </div>
        </div>
      )}

      {/* Page Modal */}
      {selectedPage && (
        <PageModal page={selectedPage} onClose={() => setSelectedPage(null)} />
      )}
    </div>
  )
}
