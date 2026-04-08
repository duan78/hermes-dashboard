import { useState, useEffect, useCallback, useRef } from 'react'
import { Users, RefreshCw, Plus, Trash2, Edit3, Check, Loader2, X, Star } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import './profiles.css'

export default function Profiles() {
  const [profiles, setProfiles] = useState([])
  const [active, setActive] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  // Create form
  const [newName, setNewName] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  // Rename
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [renameLoading, setRenameLoading] = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const loadData = useCallback(async () => {
    try {
      const data = await api.profilesList()
      setProfiles(data.profiles || [])
      setActive(data.active || '')
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    setCreateLoading(true)
    try {
      await api.profilesCreate(newName.trim())
      showFeedback(`Profile "${newName.trim()}" created`, 'success')
      setNewName('')
      loadData()
    } catch (e) {
      showFeedback(`Create failed: ${e.message}`, 'error')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleUse = async (name) => {
    try {
      await api.profilesUse(name)
      showFeedback(`Switched to profile "${name}"`, 'success')
      loadData()
    } catch (e) {
      showFeedback(`Switch failed: ${e.message}`, 'error')
    }
  }

  const handleRename = async () => {
    if (!renameValue.trim()) return
    setRenameLoading(true)
    try {
      await api.profilesRename(renameTarget, renameValue.trim())
      showFeedback(`Profile renamed to "${renameValue.trim()}"`, 'success')
      setRenameTarget(null); setRenameValue('')
      loadData()
    } catch (e) {
      showFeedback(`Rename failed: ${e.message}`, 'error')
    } finally {
      setRenameLoading(false)
    }
  }

  const handleDelete = async () => {
    setDeleteLoading(true)
    try {
      await api.profilesDelete(deleteTarget)
      showFeedback(`Profile "${deleteTarget}" deleted`, 'success')
      setDeleteTarget(null)
      loadData()
    } catch (e) {
      showFeedback(`Delete failed: ${e.message}`, 'error')
    } finally {
      setDeleteLoading(false)
    }
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Users size={28} />
        Profiles
        <Tooltip text="Manage Hermes configuration profiles. Each profile has its own settings, memory, and configuration. Switch between profiles to use different setups." />
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

      {/* Create form */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            Create Profile
            <Tooltip text="Create a new configuration profile. You can switch to it after creation." />
          </span>
        </div>
        <form className="profile-create-form" onSubmit={handleCreate}>
          <input
            type="text"
            className="form-input"
            placeholder="Profile name"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            style={{ flex: 1 }}
            aria-label="Profile name"
          />
          <button className="btn btn-primary" type="submit" disabled={createLoading || !newName.trim()}>
            {createLoading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
            Create
          </button>
        </form>
      </div>

      {/* Profile list */}
      <div className="profile-grid">
        {profiles.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Users size={48} style={{ opacity: 0.3 }} />
              <p>No profiles found</p>
            </div>
          </div>
        ) : (
          profiles.map(p => {
            const isActive = p.name === active || p.is_default
            return (
              <div key={p.name} className={`profile-card ${isActive ? 'active' : ''}`}>
                <div className="profile-card-header">
                  <div className="profile-name">
                    {isActive && <Star size={16} style={{ color: 'var(--success)', fill: 'var(--success)' }} />}
                    {p.name}
                  </div>
                  {isActive && <span className="profile-active-badge">Active</span>}
                </div>
                {p.path && (
                  <div className="profile-path">
                    <code>{p.path}</code>
                  </div>
                )}
                {renameTarget === p.name ? (
                  <div className="profile-rename-form">
                    <input
                      type="text"
                      className="form-input"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleRename()}
                      placeholder="New name"
                      aria-label="New profile name"
                      autoFocus
                    />
                    <button className="btn btn-sm" onClick={handleRename} disabled={renameLoading}>
                      {renameLoading ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                    </button>
                    <button className="btn btn-sm" onClick={() => { setRenameTarget(null); setRenameValue('') }}>
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="profile-actions">
                    {!isActive && (
                      <Tooltip text="Switch to this profile">
                        <button className="btn btn-sm btn-profile-use" onClick={() => handleUse(p.name)}>
                          <Check size={14} /> Use
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip text="Rename profile">
                      <button className="btn btn-sm" onClick={() => { setRenameTarget(p.name); setRenameValue(p.name) }}>
                        <Edit3 size={14} /> Rename
                      </button>
                    </Tooltip>
                    <Tooltip text="Delete profile">
                      <button className="btn btn-sm btn-danger-icon" onClick={() => setDeleteTarget(p.name)} disabled={isActive}>
                        <Trash2 size={14} />
                      </button>
                    </Tooltip>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {deleteTarget && (
        <ConfirmModal
          title="Delete Profile"
          message={`Are you sure you want to delete the profile "${deleteTarget}"? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
          confirmLabel="Delete"
        />
      )}
    </div>
  )
}
