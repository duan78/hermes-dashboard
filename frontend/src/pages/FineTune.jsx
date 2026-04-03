import { useState, useEffect, useCallback } from 'react'
import {
  Mic, RefreshCw, Search, Play, Pause, Edit3, Save, Trash2, X, Check,
  Calendar, Clock, FileText, BarChart3, AlertTriangle, ChevronLeft, ChevronRight
} from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './fine-tune.css'

function formatDuration(sec) {
  if (!sec) return '0s'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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

function AudioPlayer({ date, baseName }) {
  const [playing, setPlaying] = useState(false)
  const src = `/api/fine-tune/audio/${date}/${baseName}`

  const toggle = () => {
    const audio = document.getElementById(`audio-${baseName}`)
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
  }

  return (
    <div className="ft-audio-player">
      <audio id={`audio-${baseName}`} src={src} preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <button className="ft-play-btn" onClick={toggle}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <span className="ft-audio-label">Audio</span>
    </div>
  )
}

function PairCard({ pair, onEdit, onDelete, showToast }) {
  const [editing, setEditing] = useState(false)
  const [transcript, setTranscript] = useState(pair.transcript)
  const [original] = useState(pair.transcript)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const modified = transcript !== original

  const handleSave = async () => {
    try {
      setSaving(true)
      await api.fineTuneUpdatePair(pair.base_name, transcript)
      setEditing(false)
      showToast('Transcript updated')
      if (onEdit) onEdit(pair.base_name, transcript)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setTranscript(original)
    setEditing(false)
  }

  const handleDelete = async () => {
    try {
      await api.fineTuneDeletePair(pair.base_name)
      showToast('Pair deleted')
      if (onDelete) onDelete(pair.base_name)
    } catch (e) {
      showToast(e.message, 'error')
    }
    setConfirmDelete(false)
  }

  return (
    <div className={`ft-pair-card ${modified && editing ? 'ft-pair-modified' : ''}`}>
      <div className="ft-pair-header">
        <div className="ft-pair-meta">
          <span className="ft-badge ft-badge-date">
            <Calendar size={11} /> {pair.date}
          </span>
          <span className="ft-badge ft-badge-duration">
            <Clock size={11} /> {formatDuration(pair.estimated_duration_sec)}
          </span>
          <span className="ft-badge ft-badge-length">
            <FileText size={11} /> {pair.transcript_length} chars
          </span>
        </div>
        <div className="ft-pair-actions">
          {!editing ? (
            <button className="btn btn-sm" onClick={() => setEditing(true)}>
              <Edit3 size={13} /> Edit
            </button>
          ) : (
            <>
              <button className="btn btn-sm" onClick={handleCancel} disabled={saving}>
                <X size={13} />
              </button>
              <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving || !modified}>
                <Save size={13} /> {saving ? '...' : 'Save'}
              </button>
            </>
          )}
          <button className="btn btn-sm" onClick={() => setConfirmDelete(true)} style={{ color: 'var(--text-muted)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="ft-pair-body">
        <AudioPlayer date={pair.date} baseName={pair.base_name} />
        {editing ? (
          <textarea
            className="ft-transcript-editor"
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            autoFocus
          />
        ) : (
          <div className="ft-transcript-view">{transcript || <span className="ft-empty">No transcript</span>}</div>
        )}
      </div>

      {editing && modified && (
        <div className="ft-modified-bar">Unsaved changes</div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message={`Delete pair "${pair.base_name}"? This will remove both audio and transcript files.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  )
}

export default function FineTune() {
  const [stats, setStats] = useState(null)
  const [pairs, setPairs] = useState([])
  const [dates, setDates] = useState([])
  const [selectedDate, setSelectedDate] = useState('')
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState(null)
  const LIMIT = 50

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }, [])

  const loadStats = useCallback(async () => {
    try {
      const data = await api.fineTuneStats()
      setStats(data)
      setDates(data.dates || [])
    } catch (e) {
      console.error('Stats error:', e)
    }
  }, [])

  const loadPairs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.fineTunePairs(selectedDate || undefined, LIMIT, offset)
      setPairs(data.pairs || [])
      setTotal(data.total || 0)
      if (data.dates && data.dates.length > 0 && dates.length === 0) {
        setDates(data.dates)
      }
    } catch (e) {
      console.error('Pairs error:', e)
      setPairs([])
    } finally {
      setLoading(false)
    }
  }, [selectedDate, offset, dates.length])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadPairs() }, [loadPairs])

  // Reset offset when date or search changes
  useEffect(() => { setOffset(0) }, [selectedDate])

  const handleEdit = (baseName, newTranscript) => {
    setPairs(prev => prev.map(p => p.base_name === baseName ? { ...p, transcript: newTranscript } : p))
  }

  const handleDelete = (baseName) => {
    setPairs(prev => prev.filter(p => p.base_name !== baseName))
    setTotal(prev => prev - 1)
    loadStats()
  }

  const filteredPairs = search
    ? pairs.filter(p => p.transcript.toLowerCase().includes(search.toLowerCase()))
    : pairs

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1

  if (loading && !stats) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Mic size={28} />
        Fine-Tune
        <Tooltip text="Collection of voice + transcription pairs for ASR fine-tuning. Listen to audio, edit transcripts, and manage training data." />
        <button className="btn btn-sm" onClick={() => { loadStats(); loadPairs() }} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="ft-stats-bar">
          <div className="ft-stat-card">
            <div className="ft-stat-label">
              <FileText size={13} /> Total Pairs
            </div>
            <div className="ft-stat-value">{stats.total_pairs}</div>
          </div>
          <div className="ft-stat-card">
            <div className="ft-stat-label">
              <Clock size={13} /> Total Duration
            </div>
            <div className="ft-stat-value">{formatDuration(stats.total_duration_sec)}</div>
          </div>
          <div className="ft-stat-card">
            <div className="ft-stat-label">
              <BarChart3 size={13} /> Audio Size
            </div>
            <div className="ft-stat-value">{stats.total_audio_size_mb} <small>MB</small></div>
          </div>
          <div className="ft-stat-card">
            <div className="ft-stat-label">
              <Calendar size={13} /> Days
            </div>
            <div className="ft-stat-value">{(stats.dates || []).length}</div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="ft-controls">
        <div className="ft-controls-left">
          <select
            className="ft-date-select"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
          >
            <option value="">All dates</option>
            {dates.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <div className="ft-search-box">
            <Search size={14} />
            <input
              className="form-input"
              placeholder="Search transcripts..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>
        <span className="ft-result-count">
          {filteredPairs.length} of {total} pairs
        </span>
      </div>

      {/* Pairs list */}
      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="ft-pairs-list">
          {filteredPairs.map(pair => (
            <PairCard
              key={pair.base_name}
              pair={pair}
              onEdit={handleEdit}
              onDelete={handleDelete}
              showToast={showToast}
            />
          ))}
          {filteredPairs.length === 0 && (
            <div className="ft-empty-state">
              <Mic size={48} />
              <p>No fine-tune pairs found</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ft-pagination">
          <button
            className="btn btn-sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="ft-page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="btn btn-sm"
            disabled={offset + LIMIT >= total}
            onClick={() => setOffset(offset + LIMIT)}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === 'success' && <Check size={16} />}
          {toast.type === 'error' && <X size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}
