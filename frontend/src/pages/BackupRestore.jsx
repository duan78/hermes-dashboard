import { useState, useEffect, useCallback, useRef } from 'react'
import { HardDrive, RefreshCw, Plus, Trash2, Download, RotateCcw, Loader2, CheckCircle } from 'lucide-react'
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
