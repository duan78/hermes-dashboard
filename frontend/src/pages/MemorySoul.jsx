import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Save, RefreshCw, FileText, FilePlus, Trash2, Edit3, X, Folder, AlertTriangle, Check,
  Search, Database, Plus, Zap, BarChart3, Calendar, Hash
} from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './memory.css'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function sourceClass(source) {
  if (!source) return 'source-unknown'
  const s = source.toLowerCase()
  if (s.includes('conversation')) return 'source-conversation'
  if (s.includes('manual')) return 'source-manual'
  if (s.includes('memory_tool')) return 'source-memory_tool'
  if (s.includes('auto_capture')) return 'source-auto_capture'
  if (s.includes('test')) return 'source-test'
  return 'source-unknown'
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon"><AlertTriangle size={24} /></div>
        <p className="confirm-msg">{message}</p>
        <div className="confirm-actions">
          <button className="btn" onClick={onCancel}><X size={14} /> Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}><Trash2 size={14} /> Delete</button>
        </div>
      </div>
    </div>
  )
}

// ── Vector Memory Tab ──
function VectorMemoryTab({ showToast }) {
  const [stats, setStats] = useState(null)
  const [memories, setMemories] = useState([])
  const [usage, setUsage] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [sourceFilter, setSourceFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newText, setNewText] = useState('')
  const [newSource, setNewSource] = useState('manual')
  const [deleting, setDeleting] = useState(null)

  const loadStats = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([
        api.vectorMemoryStats(),
        api.vectorMemoryUsage(),
      ])
      setStats(s)
      setUsage(u)
    } catch (e) {
      console.error('Vector stats error:', e)
    }
  }, [])

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.vectorMemoryList(50, sourceFilter)
      setMemories(data.memories || [])
    } catch (e) {
      console.error('Vector list error:', e)
      setMemories([])
    } finally {
      setLoading(false)
    }
  }, [sourceFilter])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadMemories() }, [loadMemories])

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    try {
      setSearching(true)
      setSearchResults(null)
      const data = await api.vectorMemorySearch(searchQuery, 10)
      setSearchResults(data.results || [])
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleClearSearch = () => {
    setSearchQuery('')
    setSearchResults(null)
  }

  const handleStore = async () => {
    if (!newText.trim()) return
    try {
      await api.vectorMemoryStore(newText, newSource)
      showToast('Memory stored successfully')
      setNewText('')
      setShowAddForm(false)
      loadStats()
      loadMemories()
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleting) return
    try {
      await api.vectorMemoryDelete(deleting)
      showToast('Memory deleted')
      setDeleting(null)
      loadStats()
      loadMemories()
      if (searchResults) {
        setSearchResults(searchResults.filter(r => r.id !== deleting))
      }
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const displayMemories = searchResults || memories

  if (loading && !stats) return <div className="spinner" />

  return (
    <div>
      {/* Stats bar */}
      {stats && (
        <div className="vector-stats-bar">
          <div className="vector-stat-card">
            <div className="vector-stat-label">
              <Database size={13} /> Total Memories
            </div>
            <div className="vector-stat-value">
              <span className="vector-status-indicator">
                <span className={`vector-status-dot ${stats.total_memories > 0 ? 'active' : 'inactive'}`} />
              </span>
              {stats.total_memories}
            </div>
          </div>
          <div className="vector-stat-card">
            <div className="vector-stat-label">
              <BarChart3 size={13} /> DB Size
            </div>
            <div className="vector-stat-value">
              {stats.db_size_mb.toFixed(2)} <small>MB</small>
            </div>
          </div>
          <div className="vector-stat-card">
            <div className="vector-stat-label">
              <Hash size={13} /> Sources
            </div>
            <div className="vector-stat-value">
              {Object.entries(stats.sources || {}).map(([src, count]) => (
                <span key={src} style={{ marginRight: 8 }}>
                  <span className={`vector-source-badge ${sourceClass(src)}`}>{src}: {count}</span>
                </span>
              ))}
              {(!stats.sources || Object.keys(stats.sources).length === 0) && '—'}
            </div>
          </div>
          <div className="vector-stat-card">
            <div className="vector-stat-label">
              <Zap size={13} /> Mistral Embeddings (est.)
            </div>
            <div className="vector-stat-value">
              {usage ? `${usage.estimated_embed_calls} <small>calls / ~${usage.estimated_tokens.toLocaleString()} tokens</small>` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="vector-search-bar">
        <input
          className="form-input"
          placeholder="Semantic search in vector memory..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-primary" onClick={handleSearch} disabled={searching}>
          <Search size={14} /> {searching ? 'Searching...' : 'Search'}
        </button>
        {searchResults && (
          <button className="btn" onClick={handleClearSearch}>
            <X size={14} /> Clear
          </button>
        )}
        <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          <Plus size={14} /> Add
        </button>
        <button className="btn btn-sm" onClick={() => { loadStats(); loadMemories() }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="vector-add-form">
          <textarea
            placeholder="Enter memory text to store..."
            value={newText}
            onChange={e => setNewText(e.target.value)}
            autoFocus
          />
          <div className="vector-add-row">
            <select value={newSource} onChange={e => setNewSource(e.target.value)}>
              <option value="manual">manual</option>
              <option value="conversation">conversation</option>
              <option value="memory_tool">memory_tool</option>
              <option value="test">test</option>
            </select>
            <button className="btn btn-primary" onClick={handleStore} disabled={!newText.trim()}>
              <Check size={14} /> Store
            </button>
            <button className="btn" onClick={() => { setShowAddForm(false); setNewText('') }}>
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      )}

      {/* Source filter */}
      <div className="vector-filter-bar">
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Filter:</span>
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)}>
          <option value="all">All sources</option>
          <option value="conversation">conversation</option>
          <option value="manual">manual</option>
          <option value="memory_tool">memory_tool</option>
          <option value="auto_capture">auto_capture</option>
          <option value="test">test</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {displayMemories.length} result{displayMemories.length !== 1 ? 's' : ''}
          {searchResults && ' (search)'}
        </span>
      </div>

      {/* Memory list */}
      <div className="vector-memory-list">
        {displayMemories.map(m => (
          <div key={m.id} className="vector-memory-item">
            <div className="vector-memory-header">
              <div className="vector-memory-meta">
                <span className={`vector-source-badge ${sourceClass(m.source)}`}>
                  {m.source || 'unknown'}
                </span>
                {m.score !== undefined && m.score !== null && (
                  <span className="vector-score">
                    {(m.score * 100).toFixed(1)}%
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calendar size={11} /> {formatDate(m.created_at)}
                </span>
              </div>
              <button
                className="btn btn-sm"
                onClick={() => setDeleting(m.id)}
                title="Delete memory"
                style={{ color: 'var(--text-muted)' }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            <div className="vector-memory-text">
              {m.text && m.text.length > 300 ? m.text.slice(0, 300) + '...' : (m.text || '—')}
            </div>
            {m.session_id && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Session: {m.session_id.slice(0, 16)}...
              </div>
            )}
          </div>
        ))}
        {displayMemories.length === 0 && (
          <div className="vector-empty-state">
            <Database size={48} />
            <p>{searchResults ? 'No results found for this query' : 'No vector memories stored yet'}</p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Memories are automatically captured from conversations, or you can add them manually.
            </p>
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleting && (
        <ConfirmDialog
          message="Are you sure you want to delete this vector memory? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

// ── Main Page ──
export default function MemorySoul() {
  const [activeTab, setActiveTab] = useState('files')
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [contentLoading, setContentLoading] = useState(false)

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadFiles = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.listAllFiles()
      setFiles(data.files || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFiles() }, [loadFiles])

  useEffect(() => {
    if (files.length > 0 && !selected) {
      const soul = files.find(f => f.name === 'SOUL.md')
      if (soul) openFile(soul)
    }
  }, [files])

  const openFile = async (file) => {
    try {
      setContentLoading(true)
      setEditing(false)
      setSelected(file)
      const data = await api.readFile(file.path)
      setContent(data.content || '')
      setOriginalContent(data.content || '')
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setContentLoading(false)
    }
  }

  const handleSave = async () => {
    if (!selected) return
    try {
      setSaving(true)
      await api.saveFile(selected.path, content)
      setOriginalContent(content)
      setEditing(false)
      showToast('File saved successfully')
      loadFiles()
    } catch (e) {
      setError(e.message)
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setContent(originalContent)
    setEditing(false)
    showToast('Changes discarded', 'info')
  }

  const handleCreate = async () => {
    const name = newFileName.trim()
    if (!name) return
    try {
      const result = await api.createFile(name)
      showToast(`Created ${result.name}`)
      setNewFileName('')
      setShowCreate(false)
      await loadFiles()
      const newFile = { name: result.name, path: result.path, size: result.size, modified: result.modified }
      openFile(newFile)
    } catch (e) {
      setError(e.message)
      showToast(e.message, 'error')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.deleteFile(deleteTarget.path)
      showToast(`Deleted ${deleteTarget.name}`)
      setDeleteTarget(null)
      if (selected && selected.path === deleteTarget.path) {
        setSelected(null)
        setContent('')
        setOriginalContent('')
        setEditing(false)
      }
      loadFiles()
    } catch (e) {
      setError(e.message)
      showToast(e.message, 'error')
    }
  }

  const hasUnsaved = content !== originalContent

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Brain size={28} />
        Memory & SOUL
        <Tooltip text="Manage the agent's persistent memory and personality files. SOUL.md defines core behavior. Other .md files provide additional context." />
        <button className="btn btn-sm" onClick={loadFiles} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {/* Tab navigation */}
      <div className="memory-tabs">
        <button
          className={`memory-tab ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => setActiveTab('files')}
        >
          <FileText size={15} /> MD Files
        </button>
        <button
          className={`memory-tab ${activeTab === 'vector' ? 'active' : ''}`}
          onClick={() => setActiveTab('vector')}
        >
          <Database size={15} /> Vector Memory
        </button>
      </div>

      {/* Tab content */}
      {activeTab === 'vector' ? (
        <VectorMemoryTab showToast={showToast} />
      ) : (
        <div className="memory-layout">
          {/* File sidebar */}
          <div className="memory-sidebar">
            <div className="memory-sidebar-header">
              <Folder size={16} />
              <span>Files</span>
              <button className="btn btn-sm btn-primary" onClick={() => setShowCreate(true)} style={{ marginLeft: 'auto' }}>
                <FilePlus size={14} /> New
              </button>
            </div>

            {showCreate && (
              <div className="memory-create-row">
                <input
                  className="form-input"
                  placeholder="filename.md"
                  value={newFileName}
                  onChange={e => setNewFileName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
                <button className="btn btn-sm btn-primary" onClick={handleCreate}>
                  <Check size={14} />
                </button>
                <button className="btn btn-sm" onClick={() => { setShowCreate(false); setNewFileName('') }}>
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="memory-file-list">
              {files.map(f => (
                <div
                  key={f.path}
                  className={`memory-file-item ${selected && selected.path === f.path ? 'active' : ''}`}
                  onClick={() => openFile(f)}
                >
                  <div className="memory-file-icon">
                    <FileText size={15} />
                  </div>
                  <div className="memory-file-info">
                    <div className="memory-file-name">{f.name}</div>
                    <div className="memory-file-meta">
                      {formatSize(f.size)} · {formatDate(f.modified)}
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm memory-delete-btn ${f.name === 'SOUL.md' ? 'disabled' : ''}`}
                    onClick={e => { e.stopPropagation(); f.name !== 'SOUL.md' && setDeleteTarget(f) }}
                    title={f.name === 'SOUL.md' ? 'Cannot delete SOUL.md' : 'Delete file'}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              {files.length === 0 && (
                <div className="empty-state" style={{ padding: '24px 12px' }}>No memory files found</div>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="memory-content">
            {selected ? (
              <>
                <div className="memory-file-header">
                  <div className="memory-file-header-left">
                    <FileText size={18} />
                    <div>
                      <div className="memory-file-header-name">
                        {selected.path}
                        {selected.name === 'SOUL.md' && (
                          <span className="badge badge-warning memory-soul-badge">
                            <AlertTriangle size={11} /> Agent Identity
                          </span>
                        )}
                      </div>
                      <div className="memory-file-header-meta">
                        {formatSize(selected.size)} · Modified {formatDate(selected.modified)}
                      </div>
                    </div>
                  </div>
                  <div className="memory-file-header-actions">
                    {!editing ? (
                      <button className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>
                        <Edit3 size={14} /> Edit
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm" onClick={handleCancel} disabled={saving}>
                          <X size={14} /> Cancel
                        </button>
                        <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !hasUnsaved}>
                          <Save size={14} /> {saving ? 'Saving...' : 'Save'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {selected.name === 'SOUL.md' && editing && (
                  <div className="memory-soul-warning">
                    <AlertTriangle size={16} />
                    <span>You are editing <strong>SOUL.md</strong> — the agent's core identity and personality file. Changes take effect on the next conversation.</span>
                  </div>
                )}

                {hasUnsaved && (
                  <div className="memory-unsaved-bar">
                    Unsaved changes
                  </div>
                )}

                {contentLoading ? (
                  <div className="spinner" />
                ) : editing ? (
                  <textarea
                    className="code-editor memory-editor"
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    spellCheck={false}
                    autoFocus
                  />
                ) : (
                  <pre className="memory-viewer">{content || <span className="memory-empty-content">Empty file</span>}</pre>
                )}
              </>
            ) : (
              <div className="memory-empty-state">
                <Brain size={48} />
                <p>Select a file from the sidebar to view its contents</p>
                <p className="memory-empty-hint">SOUL.md defines the agent's personality. Memory files provide additional context for conversations.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDialog
          message={`Are you sure you want to delete "${deleteTarget.name}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <Check size={16} />}
          {toast.type === 'error' && <X size={16} />}
          {toast.type === 'info' && <RefreshCw size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
