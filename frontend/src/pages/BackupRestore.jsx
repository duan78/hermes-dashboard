import { useState, useEffect, useCallback, useRef } from 'react'
import { HardDrive, RefreshCw, Plus, Trash2, Download, RotateCcw, Loader2, CheckCircle, GitBranch, Upload, ExternalLink, Search, X } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import './backup.css'

const CATEGORY_META = {
  core: { label: 'Core', color: '#10b981', desc: 'SOUL.md, config, backlog, cron, dashboard configs' },
  shell: { label: 'Shell', color: '#f59e0b', desc: '.bashrc, .gitconfig, .profile' },
  scripts: { label: 'Scripts', color: '#3b82f6', desc: '~/.hermes/scripts/ (all scripts)' },
  skills: { label: 'Skills', color: '#8b5cf6', desc: '~/.hermes/skills/ (700+ files)' },
  wiki: { label: 'Wiki', color: '#ec4899', desc: '~/wiki/ (knowledge base)' },
  system: { label: 'System', color: '#6366f1', desc: 'crontab, systemd, nginx, hosts' },
  secrets: { label: 'Secrets', color: '#ef4444', desc: 'GPG-encrypted .env, auth, SSH, gcloud' },
  claude_code: { label: 'Claude Code', color: '#06b6d4', desc: '.claude/CLAUDE.md, .claude/RTK.md' },
  daily_memories: { label: 'Daily Memories', color: '#14b8a6', desc: 'Last 30 daily memory files' },
  manifests: { label: 'Manifests', color: '#84cc16', desc: 'npm-globals, env-vars, project-repos, packages' },
  docs: { label: 'Docs', color: '#a3a3a3', desc: 'RESTORE.md, install.sh, restore.sh' },
}

export default function BackupRestore() {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  // Create backup state
  const [createLoading, setCreateLoading] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState(Object.keys(CATEGORY_META))
  const [includeSecrets, setIncludeSecrets] = useState(true)
  const [description, setDescription] = useState('')

  // Actions
  const [actionLoading, setActionLoading] = useState({})
  const [confirmAction, setConfirmAction] = useState(null)

  // Inspect modal
  const [inspectData, setInspectData] = useState(null)
  const [inspectLoading, setInspectLoading] = useState(false)

  // GitHub Sync state
  const [ghStatus, setGhStatus] = useState(null)
  const [ghFiles, setGhFiles] = useState([])
  const [ghSyncLoading, setGhSyncLoading] = useState(false)
  const [ghStatusLoading, setGhStatusLoading] = useState(false)

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const loadData = useCallback(async () => {
    try {
      const data = await api.backupList()
      setBackups(data.backups || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const loadGhStatus = useCallback(async () => {
    setGhStatusLoading(true)
    try {
      const data = await api.githubConfigStatus()
      setGhStatus(data)
      if (data.connected) {
        try {
          const filesData = await api.githubConfigFiles()
          setGhFiles(filesData.files || [])
        } catch (e) {
          setGhFiles([])
        }
      }
    } catch (e) {
      setGhStatus({ connected: false, error: e.message })
    } finally {
      setGhStatusLoading(false)
    }
  }, [])

  useEffect(() => { loadGhStatus() }, [loadGhStatus])

  const toggleCategory = (cat) => {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  const selectAll = () => setSelectedCategories(Object.keys(CATEGORY_META))
  const deselectAll = () => setSelectedCategories([])

  const handleCreate = async () => {
    setCreateLoading(true)
    try {
      const result = await api.backupCreate({
        categories: selectedCategories.length === Object.keys(CATEGORY_META).length ? null : selectedCategories,
        include_secrets: includeSecrets,
        description,
      })
      if (result.success === false) {
        showFeedback(`Backup failed: ${result.error}`, 'error')
      } else {
        showFeedback(
          `Backup created: ${result.filename} (${(result.size_bytes / 1024 / 1024).toFixed(2)} MB, ${result.total_files} files)`,
          'success'
        )
        setDescription('')
        loadData()
      }
    } catch (e) {
      showFeedback(`Backup failed: ${e.message}`, 'error')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleRestore = async (filename) => {
    setActionLoading(prev => ({ ...prev, [filename]: true }))
    setConfirmAction(null)
    try {
      await api.backupRestore(filename)
      showFeedback(`Restored from "${filename}"`, 'success')
      loadData()
    } catch (e) {
      showFeedback(`Restore failed: ${e.message}`, 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [filename]: false }))
    }
  }

  const handleDelete = async (filename) => {
    setActionLoading(prev => ({ ...prev, [filename]: true }))
    setConfirmAction(null)
    try {
      await api.backupDelete(filename)
      showFeedback(`Backup "${filename}" deleted`, 'success')
      loadData()
    } catch (e) {
      showFeedback(`Delete failed: ${e.message}`, 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [filename]: false }))
    }
  }

  const handleDownload = (filename) => {
    const token = localStorage.getItem('hermes_token') || ''
    const url = `/api/backup/download/${encodeURIComponent(filename)}?token=${encodeURIComponent(token)}`
    window.open(url, '_blank')
  }

  const handleInspect = async (filename) => {
    setInspectLoading(true)
    try {
      const data = await api.backupInspect(filename)
      setInspectData(data)
    } catch (e) {
      showFeedback(`Inspect failed: ${e.message}`, 'error')
    } finally {
      setInspectLoading(false)
    }
  }

  const handleGhSync = async () => {
    setGhSyncLoading(true)
    try {
      const result = await api.githubConfigSync()
      if (result.success) {
        showFeedback(result.message, 'success')
        loadGhStatus()
      } else {
        showFeedback(`Sync failed: ${result.error}`, 'error')
      }
    } catch (e) {
      showFeedback(`Sync failed: ${e.message}`, 'error')
    } finally {
      setGhSyncLoading(false)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return '0 B'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    try {
      return new Date(dateStr).toLocaleString()
    } catch (e) {
      return dateStr
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <HardDrive size={28} />
        Backup & Restore
        <Tooltip text="Create backups of your Hermes data and configuration. Restore from a previous backup or download backups for safekeeping." />
        <button className="btn btn-sm" onClick={loadData} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {feedback && (
        <div className={`action-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {/* Create backup */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            Create Backup
            <Tooltip text="Select categories to include in the backup archive." />
          </span>
        </div>
        <div className="backup-create-section">
          <div style={{ flex: 1 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
              Select categories to include in the backup archive.
            </p>

            {/* Category toggles */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-sm" onClick={selectAll}>Select All</button>
              <button className="btn btn-sm" onClick={deselectAll}>Deselect All</button>
            </div>

            <div className="category-grid">
              {Object.entries(CATEGORY_META).map(([key, meta]) => (
                <label key={key} className={`category-checkbox ${selectedCategories.includes(key) ? 'selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(key)}
                    onChange={() => toggleCategory(key)}
                  />
                  <span className="category-badge" style={{ background: meta.color + '22', color: meta.color, borderColor: meta.color + '44' }}>
                    {meta.label}
                  </span>
                  <Tooltip text={meta.desc} />
                </label>
              ))}
            </div>

            {/* Secrets toggle */}
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={includeSecrets}
                  onChange={e => setIncludeSecrets(e.target.checked)}
                />
                Include encrypted secrets (GPG)
              </label>
            </div>

            {/* Description */}
            <input
              type="text"
              className="backup-description-input"
              placeholder="Optional description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
            />

            <button
              className="btn btn-backup-create"
              onClick={handleCreate}
              disabled={createLoading || selectedCategories.length === 0}
              style={{ marginTop: 12 }}
            >
              {createLoading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
              Create Backup ({selectedCategories.length} categories)
            </button>
          </div>
        </div>
      </div>

      {/* Backup list */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            Available Backups
            <Tooltip text="List of all backups. You can restore, download, or delete them." />
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{backups.length} backups</span>
        </div>
        {backups.length === 0 ? (
          <div className="empty-state" style={{ padding: 20 }}>
            <HardDrive size={48} style={{ opacity: 0.3 }} />
            <p>No backups available</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Create your first backup using the button above.
            </p>
          </div>
        ) : (
          <div className="backup-list">
            {backups.map(b => (
              <div key={b.filename} className="backup-row">
                <div className="backup-info">
                  <div className="backup-filename">
                    <HardDrive size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    <code>{b.filename}</code>
                  </div>
                  <div className="backup-meta">
                    <span className="backup-size">{b.size_mb?.toFixed(2) || '?'} MB</span>
                    {b.total_files != null && (
                      <span className="backup-file-count">{b.total_files} files</span>
                    )}
                    {b.created_at && <span className="backup-date">{formatDate(b.created_at)}</span>}
                  </div>
                  {b.description && (
                    <div className="backup-description">{b.description}</div>
                  )}
                  {/* Category badges */}
                  {b.stats && Object.keys(b.stats).length > 0 && (
                    <div className="backup-category-badges">
                      {Object.entries(b.stats).map(([cat, count]) => {
                        const meta = CATEGORY_META[cat]
                        return meta ? (
                          <span
                            key={cat}
                            className="backup-cat-badge"
                            style={{ background: meta.color + '22', color: meta.color, borderColor: meta.color + '44' }}
                            title={`${meta.label}: ${count} files`}
                          >
                            {meta.label} {count}
                          </span>
                        ) : null
                      })}
                    </div>
                  )}
                </div>
                <div className="backup-actions">
                  <Tooltip text="Inspect backup contents">
                    <button
                      className="btn btn-sm"
                      onClick={() => handleInspect(b.filename)}
                      disabled={inspectLoading}
                    >
                      {inspectLoading ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
                    </button>
                  </Tooltip>
                  <Tooltip text="Download backup file">
                    <button className="btn btn-sm" onClick={() => handleDownload(b.filename)}>
                      <Download size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip text="Restore from this backup">
                    <button
                      className="btn btn-sm btn-backup-restore"
                      onClick={() => setConfirmAction({ type: 'restore', filename: b.filename })}
                      disabled={!!actionLoading[b.filename]}
                    >
                      {actionLoading[b.filename] ? <Loader2 size={14} className="spin" /> : <RotateCcw size={14} />}
                      Restore
                    </button>
                  </Tooltip>
                  <Tooltip text="Delete backup">
                    <button className="btn btn-sm btn-danger-icon" onClick={() => setConfirmAction({ type: 'delete', filename: b.filename })}>
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* GitHub Config Sync */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <GitBranch size={16} style={{ marginRight: 6, color: 'var(--text-secondary)' }} />
            Hermes Config — GitHub Sync
            <Tooltip text="Sync your Hermes configuration to your private GitHub repository duan78/hermes-config for safekeeping and easy migration." />
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button className="btn btn-sm" onClick={loadGhStatus} disabled={ghStatusLoading}>
              {ghStatusLoading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
              Refresh Status
            </button>
            <button
              className="btn btn-sm btn-gh-sync"
              onClick={handleGhSync}
              disabled={ghSyncLoading || !ghStatus?.connected}
            >
              {ghSyncLoading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
              Sync to GitHub
            </button>
          </div>
        </div>

        <div className="github-sync-section">
          {!ghStatus ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
              {ghStatusLoading ? <Loader2 size={20} className="spin" /> : 'Loading GitHub status...'}
            </div>
          ) : !ghStatus.connected ? (
            <div className="github-status-disconnected">
              <GitBranch size={24} style={{ opacity: 0.4 }} />
              <div>
                <strong>Not Connected</strong>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
                  {ghStatus.error || 'Unable to connect to the GitHub repository.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="github-repo-status">
                <div className="github-status-item">
                  <span className="github-status-label">Repository</span>
                  <span className="github-status-value">
                    <a href="https://github.com/duan78/hermes-config" target="_blank" rel="noopener noreferrer" className="github-repo-link">
                      duan78/hermes-config <ExternalLink size={12} />
                    </a>
                  </span>
                </div>
                <div className="github-status-item">
                  <span className="github-status-label">Visibility</span>
                  <span className="github-status-value">
                    <span className={`badge ${ghStatus.isPrivate ? 'badge-private' : 'badge-public'}`}>
                      {ghStatus.isPrivate ? 'Private' : 'Public'}
                    </span>
                  </span>
                </div>
                <div className="github-status-item">
                  <span className="github-status-label">Branch</span>
                  <span className="github-status-value">{ghStatus.branch || 'N/A'}</span>
                </div>
                <div className="github-status-item">
                  <span className="github-status-label">Last Push</span>
                  <span className="github-status-value">{formatDate(ghStatus.pushedAt)}</span>
                </div>
                <div className="github-status-item">
                  <span className="github-status-label">Last Commit</span>
                  <span className="github-status-value">
                    {ghStatus.lastCommit ? (
                      <>
                        <code className="gh-commit-hash">{ghStatus.lastCommit}</code>
                        <span className="gh-commit-date">{formatDate(ghStatus.lastCommitDate)}</span>
                      </>
                    ) : 'N/A'}
                  </span>
                </div>
                <div className="github-status-item">
                  <span className="github-status-label">Files</span>
                  <span className="github-status-value">{ghStatus.fileCount ?? 'N/A'}</span>
                </div>
              </div>

              {ghFiles.length > 0 && (
                <div className="github-file-list">
                  <div className="github-files-header">Repository Files</div>
                  {ghFiles.map((f, i) => (
                    <div key={i} className="github-file-row">
                      <span className="github-file-name">{f.path || f.name}</span>
                      <span className="github-file-size">{formatSize(f.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm modal */}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'restore' ? 'Restore Backup' : 'Delete Backup'}
          message={
            confirmAction.type === 'restore'
              ? `Are you sure you want to restore from "${confirmAction.filename}"? This will overwrite your current configuration and data.`
              : `Are you sure you want to delete the backup "${confirmAction.filename}"? This cannot be undone.`
          }
          confirmLabel={confirmAction.type === 'restore' ? 'Restore' : 'Delete'}
          onConfirm={() => confirmAction.type === 'restore'
            ? handleRestore(confirmAction.filename)
            : handleDelete(confirmAction.filename)
          }
          onCancel={() => setConfirmAction(null)}
          loading={!!actionLoading[confirmAction.filename]}
        />
      )}

      {/* Inspect modal */}
      {inspectData && (
        <div className="modal-overlay" onClick={() => setInspectData(null)}>
          <div className="modal-content inspect-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Inspect: {inspectData.filename}</h3>
              <button className="btn btn-sm" onClick={() => setInspectData(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="modal-body">
              {inspectData.description && (
                <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '0 0 12px' }}>
                  {inspectData.description}
                </p>
              )}
              <div className="inspect-stats">
                <span>Total: {inspectData.total_files} files</span>
                <span>Size: {formatSize(inspectData.size_bytes)}</span>
              </div>
              {inspectData.stats && (
                <div className="inspect-category-badges">
                  {Object.entries(inspectData.stats).map(([cat, count]) => {
                    const meta = CATEGORY_META[cat]
                    return meta ? (
                      <span
                        key={cat}
                        className="backup-cat-badge"
                        style={{ background: meta.color + '22', color: meta.color, borderColor: meta.color + '44' }}
                      >
                        {meta.label}: {count}
                      </span>
                    ) : null
                  })}
                </div>
              )}
              <div className="inspect-file-list">
                <div className="inspect-files-header">Files</div>
                {inspectData.files?.map((f, i) => {
                  const meta = CATEGORY_META[f.category]
                  return (
                    <div key={i} className="inspect-file-row">
                      <span
                        className="inspect-file-cat"
                        style={{ background: meta ? meta.color + '22' : '#333', color: meta ? meta.color : '#999' }}
                      >
                        {meta ? meta.label : f.category}
                      </span>
                      <span className="inspect-file-path">{f.path}</span>
                      <span className="inspect-file-size">{formatSize(f.size)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
