import { useState, useEffect, useCallback } from 'react'
import { Brain, Save, RefreshCw, FileText, FilePlus, Trash2, Edit3, X, Folder, AlertTriangle, Check } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './memory.css'

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = new Date(ts * 1000)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
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

export default function MemorySoul() {
  const [files, setFiles] = useState([])
  const [selected, setSelected] = useState(null)       // file object from list
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

  // Auto-select SOUL.md on first load
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
      loadFiles() // refresh file list for updated sizes/timestamps
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
      // Auto-open the new file
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
              {/* File header */}
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

              {/* SOUL.md warning */}
              {selected.name === 'SOUL.md' && editing && (
                <div className="memory-soul-warning">
                  <AlertTriangle size={16} />
                  <span>You are editing <strong>SOUL.md</strong> — the agent's core identity and personality file. Changes take effect on the next conversation.</span>
                </div>
              )}

              {/* Unsaved changes indicator */}
              {hasUnsaved && (
                <div className="memory-unsaved-bar">
                  Unsaved changes
                </div>
              )}

              {/* Editor / viewer */}
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
