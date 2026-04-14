import { useState, useEffect, useCallback, useRef } from 'react'
import { HardDrive, RefreshCw, Plus, Trash2, Download, RotateCcw, Loader2, CheckCircle, GitBranch, Upload, ExternalLink } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import './backup.css'

export default function BackupRestore() {
  const [backups, setBackups] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  // Actions
  const [createLoading, setCreateLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState({})
  const [confirmAction, setConfirmAction] = useState(null) // { type, filename }

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

  const handleCreate = async () => {
    setCreateLoading(true)
    try {
      const result = await api.backupCreate()
      showFeedback(
        `Backup created: ${result.filename} (${(result.size_bytes / 1024 / 1024).toFixed(2)} MB)`,
        'success'
      )
      loadData()
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
    const url = `/api/backup/download?filename=${encodeURIComponent(filename)}&token=${encodeURIComponent(token)}`
    window.open(url, '_blank')
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
            <Tooltip text="Create a full backup of Hermes configuration, memory, and data." />
          </span>
        </div>
        <div className="backup-create-section">
          <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: 0 }}>
            Create a complete snapshot of your current Hermes configuration and data.
          </p>
          <button className="btn btn-backup-create" onClick={handleCreate} disabled={createLoading}>
            {createLoading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Create Backup
          </button>
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
                    {b.created_at && <span className="backup-date">{b.created_at}</span>}
                  </div>
                </div>
                <div className="backup-actions">
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
    </div>
  )
}
