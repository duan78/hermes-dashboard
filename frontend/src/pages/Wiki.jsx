import { useState, useEffect, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText, Search, X, RefreshCw, BookOpen, Clock, Tag, FolderOpen,
  Database, ChevronDown, ChevronRight, File, Archive, Edit3, Save, Plus
} from 'lucide-react'
import { formatSize, formatDate } from '../utils/format'
import { api } from '../api'

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

function authHeaders() {
  const token = localStorage.getItem('hermes_token') || ''
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
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

function parseFrontmatter(content) {
  if (!content || !content.startsWith('---')) return { frontmatter: null, body: content }
  const fmEnd = content.indexOf('---', 3)
  if (fmEnd < 0) return { frontmatter: null, body: content }
  const fmRaw = content.slice(3, fmEnd).trim()
  const fm = {}
  let listKey = null
  for (const line of fmRaw.split('\n')) {
    if (line.startsWith('  - ') && listKey) {
      fm[listKey] = fm[listKey] || []
      fm[listKey].push(line.slice(4).trim())
    } else if (line.includes(':')) {
      const idx = line.indexOf(':')
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim()
      if (val === '[]') { fm[key] = []; listKey = key; continue }
      listKey = null
      // Parse simple values
      if (val.startsWith('[') && val.endsWith(']')) {
        fm[key] = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      } else if (val.match(/^-?\d+(\.\d+)?$/)) {
        fm[key] = parseFloat(val)
      } else {
        fm[key] = val
      }
    } else {
      listKey = null
    }
  }
  const body = content.slice(fmEnd + 3).trim()
  return { frontmatter: fm, body }
}

function ConfidenceBar({ value }) {
  const pct = Math.min(100, Math.max(0, (value || 0) * 100))
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', minWidth: 70 }}>Confidence</span>
      <div style={{ flex: 1, maxWidth: 160, height: 8, background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: pct + '%', height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '0.78rem', color, fontWeight: 600 }}>{(value || 0).toFixed(2)}</span>
    </div>
  )
}

function WikilinkRenderer({ href, children, onNavigate }) {
  if (href && href.startsWith('[[') && href.endsWith(']]')) {
    const linkName = href.slice(2, -2)
    return (
      <span
        className="wiki-wikilink"
        onClick={() => onNavigate && onNavigate(linkName)}
        title={`Navigate to: ${linkName}`}
      >
        {linkName}
      </span>
    )
  }
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
}

function CreatePageModal({ onClose, onCreate }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('entity')
  const [tags, setTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError('')
    try {
      const result = await api.wikiCreatePage(title.trim(), type, tags.split(',').map(t => t.trim()).filter(Boolean))
      onCreate(result)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    const handleEsc = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const typeOptions = [
    { value: 'entity', label: 'Entity', color: '#8b5cf6' },
    { value: 'concept', label: 'Concept', color: '#06b6d4' },
    { value: 'comparison', label: 'Comparison', color: '#f59e0b' },
    { value: 'query', label: 'Query', color: '#10b981' },
  ]

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wiki-create-modal" onClick={e => e.stopPropagation()}>
        <div className="wiki-create-modal-header">
          <h2 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Plus size={18} /> Create New Page
          </h2>
          <button className="btn" onClick={onClose} style={{ padding: '6px 10px' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="wiki-create-modal-body">
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Title</span>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Page title..."
              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 6, display: 'block' }}>Type</span>
            <div style={{ display: 'flex', gap: 8 }}>
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  style={{
                    padding: '8px 16px', borderRadius: 8, border: '2px solid', cursor: 'pointer',
                    background: type === opt.value ? opt.color + '22' : 'var(--bg-base)',
                    borderColor: type === opt.value ? opt.color : 'var(--border)',
                    color: type === opt.value ? opt.color : 'var(--text-secondary)',
                    fontWeight: type === opt.value ? 600 : 400, fontSize: '0.85rem',
                    transition: 'all 0.15s'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </label>
          <label style={{ display: 'block', marginBottom: 12 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>Tags (comma separated)</span>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder="tag1, tag2, tag3..."
              style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </label>
          {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn" onClick={handleSubmit} disabled={saving} style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
              {saving ? 'Creating...' : 'Create Page'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PageModal({ page, onClose, onNavigate }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  const pagePath = `${page.type}/${page.name}`

  const loadContent = useCallback(() => {
    setLoading(true)
    setContent(null)
    setEditing(false)
    setSaveError('')
    setSaveSuccess(false)
    fetch(`/api/wiki/page/${page.type}/${page.name}`, { headers: authHeaders() })
      .then(r => r.json())
      .then(data => { setContent(data.content); setLoading(false) })
      .catch(() => { setContent('Failed to load page.'); setLoading(false) })
  }, [page])

  useEffect(() => { loadContent() }, [loadContent])

  useEffect(() => {
    const handleEsc = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const handleEdit = () => {
    setEditContent(content)
    setEditing(true)
    setSaveError('')
    setSaveSuccess(false)
  }

  const handleCancelEdit = () => {
    setEditing(false)
    setSaveError('')
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError('')
    try {
      await api.wikiSavePage(pagePath, editContent)
      setContent(editContent)
      setEditing(false)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e) {
      setSaveError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const { frontmatter, body } = parseFrontmatter(content)

  // Pre-process body to convert [[wikilinks]] to markdown links
  const processedBody = body
    ? body.replace(/\[\[([^\]]+)\]\]/g, (match, linkName) => `[${linkName}]([[${linkName}]])`)
    : ''

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="wiki-page-modal" onClick={e => e.stopPropagation()} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <div className="wiki-page-modal-header">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{page.title}</h2>
              {!editing && !loading && (
                <button className="btn" onClick={handleEdit} style={{ padding: '4px 10px', fontSize: '0.78rem' }} title="Edit page">
                  <Edit3 size={13} /> Edit
                </button>
              )}
              {saveSuccess && (
                <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>✓ Saved</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="wiki-type-badge" style={{ background: TYPE_LABELS[page.type]?.color || '#666' }}>
                {TYPE_LABELS[page.type]?.label || page.type}
              </span>
              {page.tags?.map(t => (
                <span key={t} className="wiki-tag-badge" style={{ background: tagColor(t) + '22', color: tagColor(t), borderColor: tagColor(t) + '44' }}>
                  {t}
                </span>
              ))}
              {page.updated && (
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Updated: {page.updated}
                </span>
              )}
            </div>
          </div>
          <button className="btn" onClick={onClose} style={{ padding: '6px 10px' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Frontmatter metadata header */}
        {frontmatter && !editing && (
          <div className="wiki-frontmatter-header">
            {frontmatter.confidence != null && (
              <ConfidenceBar value={frontmatter.confidence} />
            )}
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: frontmatter.confidence != null ? 10 : 0 }}>
              {frontmatter.created && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                  Created: {frontmatter.created}
                </div>
              )}
              {frontmatter.updated && frontmatter.updated !== frontmatter.created && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Updated: {frontmatter.updated}
                </div>
              )}
              {frontmatter.type && (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Type: <span style={{ color: TYPE_LABELS[frontmatter.type + 's']?.color || 'var(--text-primary)', fontWeight: 500 }}>{frontmatter.type}</span>
                </div>
              )}
            </div>
            {frontmatter.sources?.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginRight: 8 }}>Sources:</span>
                {frontmatter.sources.map((s, i) => (
                  <span key={i} style={{ fontSize: '0.78rem', color: 'var(--accent)', marginRight: 8 }}>{s}</span>
                ))}
              </div>
            )}
            {(frontmatter.contradictions?.length > 0 || frontmatter.supersedes?.length > 0) && (
              <div style={{ marginTop: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {frontmatter.contradictions?.length > 0 && (
                  <div style={{ fontSize: '0.78rem' }}>
                    <span style={{ color: '#ef4444', fontWeight: 600, marginRight: 4 }}>Contradictions:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{frontmatter.contradictions.join(', ')}</span>
                  </div>
                )}
                {frontmatter.supersedes?.length > 0 && (
                  <div style={{ fontSize: '0.78rem' }}>
                    <span style={{ color: '#f59e0b', fontWeight: 600, marginRight: 4 }}>Supersedes:</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{frontmatter.supersedes.join(', ')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="wiki-page-modal-body">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: 'var(--text-secondary)' }}>
              <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
          ) : editing ? (
            <div className="wiki-edit-container">
              <textarea
                className="wiki-edit-textarea"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                spellCheck={false}
              />
              {saveError && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: 8 }}>{saveError}</div>
              )}
              <div className="wiki-edit-actions">
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  {editContent.length} chars · {(editContent.split('\n').length)} lines
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" onClick={handleCancelEdit}>Cancel</button>
                  <button className="btn" onClick={handleSave} disabled={saving} style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
                    <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="wiki-markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children }) => (
                    <WikilinkRenderer href={href} onNavigate={(name) => {
                      onClose()
                      if (onNavigate) onNavigate(name)
                    }}>
                      {children}
                    </WikilinkRenderer>
                  )
                }}
              >
                {processedBody}
              </ReactMarkdown>
            </div>
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
  const [showCreateModal, setShowCreateModal] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [s, p, l, src] = await Promise.all([
        fetch('/api/wiki/stats', { headers: authHeaders() }).then(r => r.json()),
        fetch('/api/wiki/pages', { headers: authHeaders() }).then(r => r.json()),
        fetch('/api/wiki/log?limit=20', { headers: authHeaders() }).then(r => r.json()),
        fetch('/api/wiki/sources', { headers: authHeaders() }).then(r => r.json()),
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

  const handleNavigate = (linkName) => {
    // Try to find a matching page by name or title
    const match = pages.find(p =>
      p.name.toLowerCase() === linkName.toLowerCase() ||
      p.title.toLowerCase() === linkName.toLowerCase()
    )
    if (match) {
      setSelectedPage(match)
    }
  }

  const handleCreatePage = (result) => {
    setShowCreateModal(false)
    loadAll() // Refresh the page list
    // Auto-open the created page
    setTimeout(() => {
      const newPage = {
        name: result.name,
        title: result.title,
        type: result.type,
        tags: [],
        size: result.size,
      }
      setSelectedPage(newPage)
    }, 500)
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: 'var(--text-secondary)' }}>
        <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (stats && !stats.exists) {
    return (
      <div className="wiki-container">
        <div className="wiki-header">
          <h1><FileText size={28} /> LLM Wiki</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Wiki directory not found at ~/wiki</p>
        </div>
      </div>
    )
  }

  return (
    <div className="wiki-container">
      <style>{`
        .wiki-container { max-width: 1200px; margin: 0 auto; padding: 24px; }
        .wiki-header { margin-bottom: 24px; }
        .wiki-header h1 { display: flex; align-items: center; gap: 12px; font-size: 1.5rem; color: var(--text-primary); margin: 0 0 8px; }
        .wiki-header p { color: var(--text-secondary); font-size: 0.9rem; margin: 0; }
        .wiki-stats-bar { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px; }
        .wiki-stat { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; }
        .wiki-stat-icon { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; }
        .wiki-stat-value { font-size: 1.25rem; font-weight: 700; color: var(--text-primary); }
        .wiki-stat-label { font-size: 0.75rem; color: var(--text-secondary); }
        .wiki-search { display: flex; gap: 12px; align-items: center; margin-bottom: 24px; }
        .wiki-search input { flex: 1; max-width: 400px; padding: 10px 14px 10px 38px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; color: var(--text-primary); font-size: 0.9rem; outline: none; }
        .wiki-search input:focus { border-color: var(--accent); }
        .wiki-search-icon { position: relative; left: 34px; color: var(--text-secondary); pointer-events: none; z-index: 1; }
        .wiki-section { margin-bottom: 28px; }
        .wiki-section-title { display: flex; align-items: center; gap: 8px; font-size: 1.1rem; color: var(--text-primary); margin: 0 0 14px; font-weight: 600; }
        .wiki-type-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .wiki-type-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
        .wiki-type-card-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; cursor: pointer; transition: background 0.15s; }
        .wiki-type-card-header:hover { background: var(--bg-hover); }
        .wiki-type-card-header-left { display: flex; align-items: center; gap: 10px; }
        .wiki-type-icon { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: white; }
        .wiki-type-name { font-weight: 600; color: var(--text-primary); font-size: 0.95rem; }
        .wiki-type-count { font-size: 0.8rem; color: var(--text-secondary); background: var(--bg-tertiary); padding: 2px 10px; border-radius: 20px; font-weight: 600; }
        .wiki-type-pages { border-top: 1px solid var(--border); max-height: 300px; overflow-y: auto; }
        .wiki-page-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.15s; gap: 12px; }
        .wiki-page-item:hover { background: var(--bg-hover); }
        .wiki-page-item:last-child { border-bottom: none; }
        .wiki-page-item-left { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }
        .wiki-page-item-title { color: var(--text-primary); font-size: 0.88rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wiki-page-item-tags { display: flex; gap: 4px; flex-wrap: wrap; }
        .wiki-page-item-meta { color: var(--text-secondary); font-size: 0.75rem; white-space: nowrap; }
        .wiki-tag-badge { font-size: 0.7rem; padding: 1px 8px; border-radius: 20px; border: 1px solid; font-weight: 500; }
        .wiki-type-badge { font-size: 0.75rem; padding: 2px 10px; border-radius: 6px; color: white; font-weight: 600; }
        .wiki-source-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 14px; }
        .wiki-source-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
        .wiki-source-card-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
        .wiki-source-icon { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: white; }
        .wiki-source-name { font-weight: 600; color: var(--text-primary); }
        .wiki-source-count { font-size: 0.8rem; color: var(--text-secondary); margin-left: auto; }
        .wiki-source-list { max-height: 200px; overflow-y: auto; }
        .wiki-source-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; font-size: 0.82rem; border-bottom: 1px solid var(--border); }
        .wiki-source-item:last-child { border-bottom: none; }
        .wiki-source-item-name { color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; margin-right: 8px; }
        .wiki-source-item-size { color: var(--text-secondary); font-size: 0.75rem; white-space: nowrap; }
        .wiki-log { background: var(--bg-card); border: 1px solid var(--border); border-radius: 12px; max-height: 400px; overflow-y: auto; }
        .wiki-log-entry { padding: 12px 16px; border-bottom: 1px solid var(--border); }
        .wiki-log-entry:last-child { border-bottom: none; }
        .wiki-log-header { font-weight: 600; color: var(--accent); font-size: 0.88rem; margin-bottom: 4px; }
        .wiki-log-detail { color: var(--text-secondary); font-size: 0.82rem; line-height: 1.5; }
        .wiki-tags-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .wiki-schema-tag { font-size: 0.82rem; padding: 6px 14px; border-radius: 8px; background: rgba(139, 92, 246, 0.12); color: #a78bfa; border: 1px solid rgba(139, 92, 246, 0.2); font-weight: 500; }
        .wiki-empty { color: var(--text-secondary); font-size: 0.85rem; padding: 20px; text-align: center; }
        .modal-overlay { position: fixed; inset: 0; background: var(--bg-overlay, rgba(0,0,0,0.7)); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 20px; backdrop-filter: blur(4px); }
        .wiki-page-modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 900px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
        .wiki-page-modal-header { display: flex; align-items: flex-start; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--border); }
        .wiki-page-modal-body { padding: 16px 24px 24px; overflow: hidden; display: flex; flex-direction: column; flex: 1; }
        .btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg-card); color: var(--text-primary); cursor: pointer; font-size: 0.85rem; transition: all 0.15s; }
        .btn:hover { background: var(--bg-hover); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Frontmatter header */
        .wiki-frontmatter-header { padding: 12px 24px; background: var(--bg-base); border-bottom: 1px solid var(--border); }

        /* Create modal */
        .wiki-create-modal { background: var(--bg-card); border: 1px solid var(--border); border-radius: 16px; width: 100%; max-width: 520px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); }
        .wiki-create-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 20px 24px 16px; border-bottom: 1px solid var(--border); }
        .wiki-create-modal-body { padding: 20px 24px; }

        /* Edit container */
        .wiki-edit-container { flex: 1; display: flex; flex-direction: column; gap: 8px; }
        .wiki-edit-textarea {
          width: 100%; min-height: 50vh; padding: 16px; background: var(--bg-base);
          border: 1px solid var(--border); border-radius: 8px; color: var(--text-primary);
          font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.85rem;
          line-height: 1.6; resize: vertical; outline: none; box-sizing: border-box;
        }
        .wiki-edit-textarea:focus { border-color: var(--accent); }
        .wiki-edit-actions { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }

        /* Markdown rendered content */
        .wiki-markdown { overflow-y: auto; max-height: 60vh; padding: 4px 0; }
        .wiki-markdown h1 { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); margin: 24px 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
        .wiki-markdown h1:first-child { margin-top: 0; }
        .wiki-markdown h2 { font-size: 1.3rem; font-weight: 600; color: var(--text-primary); margin: 20px 0 10px; }
        .wiki-markdown h3 { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin: 16px 0 8px; }
        .wiki-markdown h4, .wiki-markdown h5, .wiki-markdown h6 { font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 12px 0 6px; }
        .wiki-markdown p { line-height: 1.7; color: var(--text-primary); margin: 8px 0; font-size: 0.92rem; }
        .wiki-markdown ul, .wiki-markdown ol { padding-left: 24px; margin: 8px 0; line-height: 1.7; }
        .wiki-markdown li { color: var(--text-primary); margin: 4px 0; font-size: 0.92rem; }
        .wiki-markdown li::marker { color: var(--text-secondary); }
        .wiki-markdown code { background: var(--bg-base); border: 1px solid var(--border); padding: 2px 6px; border-radius: 4px; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.82rem; color: #e879f9; }
        .wiki-markdown pre { background: #0d1117; border: 1px solid #30363d; border-radius: 8px; padding: 14px 16px; overflow-x: auto; margin: 12px 0; }
        .wiki-markdown pre code { background: none; border: none; padding: 0; color: #e6edf3; font-size: 0.82rem; line-height: 1.6; }
        .wiki-markdown blockquote { border-left: 3px solid var(--accent); padding: 8px 16px; margin: 12px 0; background: rgba(139, 92, 246, 0.06); border-radius: 0 6px 6px 0; }
        .wiki-markdown blockquote p { color: var(--text-secondary); margin: 4px 0; }
        .wiki-markdown a { color: var(--accent); text-decoration: none; }
        .wiki-markdown a:hover { text-decoration: underline; }
        .wiki-markdown strong { color: var(--text-primary); font-weight: 600; }
        .wiki-markdown em { color: var(--text-secondary); }
        .wiki-markdown hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
        .wiki-markdown img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .wiki-markdown table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 0.88rem; }
        .wiki-markdown thead th { background: var(--bg-base); color: var(--text-primary); font-weight: 600; text-align: left; padding: 10px 12px; border: 1px solid var(--border); }
        .wiki-markdown tbody td { padding: 8px 12px; border: 1px solid var(--border); color: var(--text-primary); }
        .wiki-markdown tbody tr:nth-child(even) { background: var(--bg-base); }
        .wiki-markdown tbody tr:hover { background: var(--bg-hover); }
        .wiki-markdown input[type="checkbox"] { margin-right: 6px; accent-color: var(--accent); }
        .wiki-wikilink { color: var(--accent); cursor: pointer; text-decoration: none; border-bottom: 1px dashed var(--accent); }
        .wiki-wikilink:hover { color: #c084fc; border-bottom-color: #c084fc; }
      `}</style>

      {/* Header */}
      <div className="wiki-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1><FileText size={28} /> LLM Wiki</h1>
            <p>Knowledge base for entities, concepts, comparisons, and research sources</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={() => setShowCreateModal(true)} style={{ background: 'var(--accent)', color: '#fff', border: 'none' }}>
              <Plus size={14} /> New Page
            </button>
            <button className="btn" onClick={loadAll} title="Refresh">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
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
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
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
        <PageModal page={selectedPage} onClose={() => setSelectedPage(null)} onNavigate={handleNavigate} />
      )}

      {/* Create Page Modal */}
      {showCreateModal && (
        <CreatePageModal onClose={() => setShowCreateModal(false)} onCreate={handleCreatePage} />
      )}
    </div>
  )
}
