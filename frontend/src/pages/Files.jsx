import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen, FileText, Folder, ChevronRight, ChevronDown,
  RefreshCw, Save, X, Edit3, File, ArrowLeft, Home, Trash2, Plus, Check
} from 'lucide-react'
import { api } from '../api'
import { formatSize, formatDate } from '../utils/format'
import ConfirmModal from '../components/ConfirmModal'
import './files.css'

const SYNTAX_MAP = {
  '.py': 'python', '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript',
  '.tsx': 'typescript', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown', '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
  '.toml': 'toml', '.ini': 'ini', '.cfg': 'ini', '.env': 'env',
  '.txt': 'text', '.log': 'log', '.csv': 'csv', '.html': 'html',
  '.css': 'css', '.sql': 'sql', '.xml': 'xml', '.rs': 'rust',
  '.go': 'go', '.java': 'java', '.c': 'c', '.cpp': 'cpp',
}

function getSyntaxClass(ext) {
  const lang = SYNTAX_MAP[ext] || 'text'
  return `syntax-${lang}`
}

// ── Directory Tree Item ──

function TreeItem({ entry, selected, onSelect, depth }) {
  const [expanded, setExpanded] = useState(false)
  const [children, setChildren] = useState([])
  const [loaded, setLoaded] = useState(false)
  const isDir = entry.is_dir
  const isSelected = selected === entry.path

  const loadChildren = useCallback(async () => {
    if (!isDir || !expanded) return
    if (loaded) return
    try {
      const data = await api.listFiles(entry.path)
      setChildren(data.entries || [])
      setLoaded(true)
    } catch {
      // ignore
    }
  }, [entry.path, isDir, expanded, loaded])

  useEffect(() => {
    if (expanded && !loaded) loadChildren()
  }, [expanded, loaded, loadChildren])

  const handleClick = () => {
    if (isDir) {
      setExpanded(v => !v)
    }
    onSelect(entry.path, isDir)
  }

  return (
    <div className="tree-item">
      <button
        className={`tree-item-btn ${isSelected ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
      >
        {isDir ? (
          expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
        ) : (
          <span style={{ width: 14 }} />
        )}
        {isDir ? (
          expanded ? <FolderOpen size={14} className="tree-icon-folder" /> : <Folder size={14} className="tree-icon-folder" />
        ) : (
          <FileText size={14} className="tree-icon-file" />
        )}
        <span className="tree-item-name">{entry.name}</span>
      </button>
      {isDir && expanded && loaded && (
        <div className="tree-children">
          {children.map(child => (
            <TreeItem
              key={child.path}
              entry={child}
              selected={selected}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
          {children.length === 0 && (
            <div className="tree-empty" style={{ paddingLeft: 8 + (depth + 1) * 16 }}>
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Breadcrumb ──

function Breadcrumb({ path, onNavigate }) {
  const parts = path ? path.split('/').filter(Boolean) : []

  return (
    <div className="breadcrumb">
      <button className="breadcrumb-item" onClick={() => onNavigate('')}>
        <Home size={13} />
        <span>~/.hermes</span>
      </button>
      {parts.map((part, i) => {
        const subPath = parts.slice(0, i + 1).join('/')
        return (
          <span key={subPath} className="breadcrumb-seg">
            <ChevronRight size={12} />
            <button className="breadcrumb-item" onClick={() => onNavigate(subPath)}>
              {part}
            </button>
          </span>
        )
      })}
    </div>
  )
}

// ── File Content Viewer / Editor ──

function FileViewer({ fileData, onSaved, onDelete }) {
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [confirmModal, setConfirmModal] = useState(null)

  useEffect(() => {
    setEditing(false)
    setContent('')
    setSaveMsg('')
  }, [fileData?.path])

  if (!fileData) return null

  const syntaxClass = getSyntaxClass(fileData.extension)
  const lines = (fileData.content || '').split('\n')

  const startEdit = () => {
    setContent(fileData.content || '')
    setEditing(true)
    setSaveMsg('')
  }

  const cancelEdit = () => {
    setEditing(false)
    setSaveMsg('')
  }

  const saveFile = async () => {
    setSaving(true)
    setSaveMsg('')
    try {
      await api.writeFile(fileData.path, content)
      setEditing(false)
      setSaveMsg('Saved')
      if (onSaved) onSaved()
      setTimeout(() => setSaveMsg(''), 3000)
    } catch (e) {
      setSaveMsg(`Error: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    setConfirmModal({
      message: `Delete file "${fileData.name}"? This cannot be undone.`,
      onConfirm: () => {
        setConfirmModal(null)
        onDelete(fileData.path)
      }
    })
  }

  return (
    <div className="file-viewer">
      <div className="file-viewer-header">
        <div className="file-meta">
          <span className="file-name">{fileData.name}</span>
          <span className="file-info">{formatSize(fileData.size)}</span>
          <span className="file-info">{formatDate(fileData.modified)}</span>
          <span className="file-ext-badge">{fileData.extension || 'text'}</span>
        </div>
        <div className="file-actions">
          {saveMsg && (
            <span className={`file-save-msg ${saveMsg.startsWith('Error') ? 'error' : 'success'}`}>
              {saveMsg}
            </span>
          )}
          <button className="btn btn-sm btn-danger" onClick={handleDelete} title="Delete this file" aria-label="Delete file">
            <Trash2 size={13} />
          </button>
          {editing ? (
            <>
              <button className="btn btn-sm btn-primary" onClick={saveFile} disabled={saving}>
                {saving ? 'Saving...' : <><Save size={13} /> Save</>}
              </button>
              <button className="btn btn-sm" onClick={cancelEdit}>
                <X size={13} /> Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-sm" onClick={startEdit}>
              <Edit3 size={13} /> Edit
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <textarea
          className="file-editor"
          value={content}
          onChange={e => setContent(e.target.value)}
          spellCheck={false}
          aria-label="File content editor"
        />
      ) : (
        <div className={`file-content ${syntaxClass}`}>
          <table className="line-numbers">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="line-num">{i + 1}</td>
                  <td className="line-text"><pre>{line}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {confirmModal && (
        <ConfirmModal
          title="Delete File"
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}

// ── Main Files Page ──

export default function Files() {
  const [tree, setTree] = useState({ directories: [], root_files: [] })
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [fileData, setFileData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [creating, setCreating] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [confirmModal, setConfirmModal] = useState(null)

  const loadTree = useCallback(async () => {
    try {
      const data = await api.getFileTree()
      setTree(data)
    } catch {}
  }, [])

  const loadDirectory = useCallback(async (path) => {
    setLoading(true)
    setError(null)
    setFileData(null)
    try {
      const data = await api.listFiles(path)
      setEntries(data.entries || [])
      setCurrentPath(path)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadFile = useCallback(async (path) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.readFile(path)
      setFileData(data)
      setCurrentPath(path)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadTree() }, [loadTree])
  useEffect(() => { loadDirectory('') }, [loadDirectory])

  const handleSelect = (path, isDir) => {
    if (isDir) {
      loadDirectory(path)
      setSelectedFile(null)
    } else {
      loadFile(path)
      setSelectedFile(path)
    }
  }

  const handleNavigate = (path) => {
    if (!path) {
      loadDirectory('')
    } else {
      loadDirectory(path)
    }
  }

  const handleRefresh = () => {
    loadTree()
    if (fileData) {
      loadFile(fileData.path)
    } else {
      loadDirectory(currentPath)
    }
  }

  const handleDeleteFile = async (path) => {
    try {
      await api.deleteFile(path)
      setFileData(null)
      setSelectedFile(null)
      loadTree()
      loadDirectory(currentPath)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDeleteSelected = () => {
    if (!selectedFile) return
    const name = selectedFile.split('/').pop()
    setConfirmModal({
      message: `Delete "${name}"? This cannot be undone.`,
      onConfirm: () => {
        setConfirmModal(null)
        handleDeleteFile(selectedFile)
      }
    })
  }

  const handleCreateFile = async () => {
    const name = newFileName.trim()
    if (!name) return
    setCreating(true)
    try {
      const path = currentPath ? `${currentPath}/${name}` : name
      await api.writeFile(path, '')
      setShowNewFile(false)
      setNewFileName('')
      loadTree()
      loadDirectory(currentPath)
    } catch (e) {
      setError(e.message)
    } finally {
      setCreating(false)
    }
  }

  const handleNewFileKeyDown = (e) => {
    if (e.key === 'Enter') handleCreateFile()
    if (e.key === 'Escape') { setShowNewFile(false); setNewFileName('') }
  }

  return (
    <div>
      <div className="page-title">
        <FolderOpen size={28} />
        File Explorer
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setShowNewFile(true)}>
            <Plus size={14} /> New File
          </button>
          <button className="btn btn-sm btn-danger" onClick={handleDeleteSelected} disabled={!selectedFile} title={selectedFile ? `Delete ${selectedFile.split('/').pop()}` : 'Select a file to delete'} aria-label="Delete selected file">
            <Trash2 size={14} />
          </button>
          <button className="btn btn-sm" onClick={handleRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="files-layout">
        {/* Sidebar: directory tree */}
        <div className="files-sidebar">
          <div className="files-sidebar-title">~/.hermes</div>
          <div className="files-tree">
            {tree.directories.map(d => (
              <TreeItem
                key={d.path}
                entry={d}
                selected={currentPath}
                onSelect={handleSelect}
                depth={0}
              />
            ))}
            {tree.directories.length > 0 && tree.root_files.length > 0 && (
              <div className="tree-separator" />
            )}
            {tree.root_files.map(f => (
              <TreeItem
                key={f.path}
                entry={f}
                selected={currentPath}
                onSelect={handleSelect}
                depth={0}
              />
            ))}
          </div>
        </div>

        {/* Main panel */}
        <div className="files-main">
          <Breadcrumb path={fileData ? fileData.path : currentPath} onNavigate={handleNavigate} />

          {loading && <div className="spinner" />}

          {!loading && fileData ? (
            <FileViewer fileData={fileData} onSaved={() => loadFile(fileData.path)} onDelete={handleDeleteFile} />
          ) : !loading ? (
            <div className="files-list">
              {currentPath && (
                <button
                  className="files-list-item back"
                  onClick={() => {
                    const parent = currentPath.split('/').slice(0, -1).join('/')
                    loadDirectory(parent)
                  }}
                >
                  <ArrowLeft size={14} />
                  <span>..</span>
                </button>
              )}
              {/* New file inline input */}
              {showNewFile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px' }}>
                  <FileText size={16} className="files-list-icon" />
                  <input
                    className="form-input"
                    style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
                    placeholder="filename.ext"
                    value={newFileName}
                    onChange={e => setNewFileName(e.target.value)}
                    onKeyDown={handleNewFileKeyDown}
                    autoFocus
                    aria-label="New file name"
                  />
                  <button className="btn btn-sm btn-primary" onClick={handleCreateFile} disabled={creating || !newFileName.trim()} aria-label="Create file">
                    {creating ? '...' : <Check size={13} />}
                  </button>
                  <button className="btn btn-sm" onClick={() => { setShowNewFile(false); setNewFileName('') }} aria-label="Cancel new file">
                    <X size={13} />
                  </button>
                </div>
              )}
              {entries.length === 0 && !currentPath && !showNewFile && (
                <div className="empty-state">No files found</div>
              )}
              {entries.map(entry => (
                <button
                  key={entry.path}
                  className={`files-list-item ${selectedFile === entry.path ? 'active' : ''}`}
                  onClick={() => handleSelect(entry.path, entry.is_dir)}
                >
                  {entry.is_dir ? (
                    <Folder size={16} className="files-list-icon dir" />
                  ) : (
                    <FileText size={16} className="files-list-icon" />
                  )}
                  <span className="files-list-name">{entry.name}</span>
                  {!entry.is_dir && (
                    <span className="files-list-size">{formatSize(entry.size)}</span>
                  )}
                  <span className="files-list-date">{formatDate(entry.modified)}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {confirmModal && (
        <ConfirmModal
          title="Delete File"
          message={confirmModal.message}
          onConfirm={confirmModal.onConfirm}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </div>
  )
}
