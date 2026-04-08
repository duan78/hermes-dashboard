import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Mic, RefreshCw, Search, Play, Pause, Edit3, Save, Trash2, X, Check,
  Calendar, Clock, FileText, BarChart3, ChevronLeft, ChevronRight,
  ShieldCheck, AlertCircle, ToggleLeft, ToggleRight, Bot, ChevronDown, ChevronUp,
  Sparkles, Loader
} from 'lucide-react'
import { api } from '../api'
import { formatSize } from '../utils/format'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'
import './fine-tune.css'

function formatDuration(sec) {
  if (!sec) return '0s'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function AudioPlayer({ date, baseName }) {
  const [playing, setPlaying] = useState(false)
  const src = `/api/fine-tune/audio/${date}/${baseName}`
  const uid = `audio-cv-${date}-${baseName}`

  const toggle = () => {
    const audio = document.getElementById(uid)
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
  }

  return (
    <div className="ft-audio-player">
      <audio id={uid} src={src} preload="metadata"
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
        <ConfirmModal
          title="Confirm"
          message={`Delete pair "${pair.base_name}"? This will remove both audio and transcript files.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
          confirmLabel="Delete"
        />
      )}
    </div>
  )
}

// ── Similarity score color ──
function scoreColor(score) {
  if (score >= 0.95) return '#34d399'
  if (score >= 0.80) return '#fbbf24'
  return '#f87171'
}

function SimilarityBar({ label, score }) {
  if (score == null) return null
  const color = scoreColor(score)
  return (
    <div className="cv-sim-row">
      <span className="cv-sim-label">{label}</span>
      <div className="cv-sim-bar-track">
        <div className="cv-sim-bar-fill" style={{ width: `${score * 100}%`, background: color }} />
      </div>
      <span className="cv-sim-value" style={{ color }}>{(score * 100).toFixed(1)}%</span>
    </div>
  )
}

function TranscriptColumn({ label, text, score }) {
  const color = score != null ? scoreColor(score) : 'var(--text-primary)'
  return (
    <div className="cv-transcript-col" style={{ borderTopColor: color }}>
      <div className="cv-transcript-header">
        <span className="cv-transcript-title" style={{ color }}>{label}</span>
        {score != null && <span className="cv-transcript-score" style={{ color }}>{(score * 100).toFixed(1)}%</span>}
      </div>
      <div className="cv-transcript-text">{text || <span className="ft-empty">N/A</span>}</div>
    </div>
  )
}

function CrossValCard({ pair, index, onStatusChange, onReviewDone, showToast }) {
  const [toggling, setToggling] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [showReasoning, setShowReasoning] = useState(false)
  const [localReview, setLocalReview] = useState(pair.ai_review || null)
  const sims = pair.similarities || {}
  const aiReview = localReview

  const handleToggle = async () => {
    const newStatus = pair.status === 'validated' ? 'needs_review' : 'validated'
    try {
      setToggling(true)
      await api.crossvalUpdateStatus(index, newStatus)
      showToast(`Marked as ${newStatus}`)
      if (onStatusChange) onStatusChange(index, newStatus)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setToggling(false)
    }
  }

  const handleReview = async () => {
    try {
      setReviewing(true)
      const data = await api.crossvalReview(index)
      setLocalReview(data.ai_review)
      showToast('AI review complete')
      if (onReviewDone) onReviewDone(index, data.ai_review)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      setReviewing(false)
    }
  }

  const handleAccept = async () => {
    try {
      await api.crossvalUpdateStatus(index, 'validated')
      showToast('Accepted — marked as validated')
      if (onStatusChange) onStatusChange(index, 'validated')
    } catch (e) {
      showToast(e.message, 'error')
    }
  }

  const isValidated = pair.status === 'validated'

  return (
    <div className="cv-pair-card">
      <div className="cv-pair-header">
        <div className="cv-pair-meta">
          <AudioPlayer date={pair.date} baseName={pair.base_name} />
          <span className="ft-badge ft-badge-date"><Calendar size={11} />{pair.date}</span>
          <span className="ft-badge ft-badge-length"><FileText size={11} />{pair.base_name}</span>
        </div>
        <div className="cv-pair-actions">
          <span className={`cv-status-badge ${isValidated ? 'cv-status-validated' : 'cv-status-review'}`}>
            {isValidated ? <><ShieldCheck size={12} /> Validated</> : <><AlertCircle size={12} /> Needs Review</>}
          </span>
          <button className="btn btn-sm" onClick={handleToggle} disabled={toggling} title="Toggle status">
            {isValidated ? <ToggleRight size={16} style={{ color: '#34d399' }} /> : <ToggleLeft size={16} style={{ color: '#fbbf24' }} />}
          </button>
        </div>
      </div>

      <div className="cv-transcripts-row cv-transcripts-row-dynamic">
        <TranscriptColumn label="Voxtral" text={pair.voxtral} score={sims.voxtral_groq_turbo} />
        <TranscriptColumn label="Groq Turbo" text={pair.groq_turbo} score={sims.voxtral_groq_turbo} />
        <TranscriptColumn label="Groq Full" text={pair.groq_full} score={sims.voxtral_groq_full} />
        {pair.deepgram && (
          <TranscriptColumn label="Deepgram" text={pair.deepgram} score={sims.deepgram_voxtral} />
        )}
        {pair.assemblyai && (
          <TranscriptColumn label="AssemblyAI" text={pair.assemblyai} score={sims.assemblyai_voxtral} />
        )}
        {pair.nvidia && (
          <TranscriptColumn label="NVIDIA" text={pair.nvidia} score={sims.nvidia_voxtral} />
        )}
      </div>

      <div className="cv-sim-section">
        <SimilarityBar label="Voxtral / Turbo" score={sims.voxtral_groq_turbo} />
        <SimilarityBar label="Voxtral / Full" score={sims.voxtral_groq_full} />
        <SimilarityBar label="Turbo / Full" score={sims.groq_turbo_groq_full} />
        {pair.deepgram && (
          <>
            <SimilarityBar label="Deepgram / Voxtral" score={sims.deepgram_voxtral} />
            <SimilarityBar label="Deepgram / Turbo" score={sims.deepgram_groq_turbo} />
            <SimilarityBar label="Deepgram / Full" score={sims.deepgram_groq_full} />
          </>
        )}
        {pair.assemblyai && (
          <>
            <SimilarityBar label="AssemblyAI / Voxtral" score={sims.assemblyai_voxtral} />
            <SimilarityBar label="AssemblyAI / Turbo" score={sims.assemblyai_groq_turbo} />
            <SimilarityBar label="AssemblyAI / Full" score={sims.assemblyai_groq_full} />
          </>
        )}
        {pair.nvidia && (
          <>
            <SimilarityBar label="NVIDIA / Voxtral" score={sims.nvidia_voxtral} />
            <SimilarityBar label="NVIDIA / Turbo" score={sims.nvidia_groq_turbo} />
            <SimilarityBar label="NVIDIA / Full" score={sims.nvidia_groq_full} />
          </>
        )}
      </div>

      {/* AI Review section */}
      {!isValidated && (
        <div className="cv-ai-section">
          {aiReview ? (
            <div className="cv-ai-result">
              <div className="cv-ai-header">
                <span className="cv-ai-badge"><Bot size={12} /> AI Recommendation</span>
                <span className="cv-ai-provider">{aiReview.chosen_provider}</span>
                {aiReview.providers_used && (
                  <span className="cv-ai-providers-count" title={aiReview.providers_used.join(', ')}>
                    {aiReview.providers_used.length} providers
                  </span>
                )}
              </div>
              {aiReview.consensus_providers && aiReview.consensus_providers.length > 0 && (
                <div className="cv-ai-consensus">
                  <span className="cv-ai-consensus-label">Consensus:</span>
                  {aiReview.consensus_providers.map(p => (
                    <span key={p} className="cv-ai-consensus-tag">{p}</span>
                  ))}
                </div>
              )}
              <div className="cv-ai-transcript">{aiReview.best_transcript}</div>
              <div className="cv-ai-meta">
                <div className="cv-ai-confidence">
                  <span className="cv-ai-confidence-label">Confidence</span>
                  <div className="cv-ai-bar-track">
                    <div className="cv-ai-bar-fill" style={{ width: `${(aiReview.confidence || 0) * 100}%` }} />
                  </div>
                  <span className="cv-ai-confidence-value">{((aiReview.confidence || 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="cv-ai-actions">
                  <button className="btn btn-sm" onClick={() => setShowReasoning(!showReasoning)}>
                    {showReasoning ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    Reasoning
                  </button>
                  {!isValidated && (
                    <button className="btn btn-sm btn-primary" onClick={handleAccept}>
                      <Check size={13} /> Accept
                    </button>
                  )}
                </div>
              </div>
              {showReasoning && (
                <div className="cv-ai-reasoning">{aiReview.reasoning}</div>
              )}
            </div>
          ) : (
            <button className="btn btn-sm cv-ai-review-btn" onClick={handleReview} disabled={reviewing}>
              {reviewing ? <><Loader size={13} className="spin" /> Reviewing...</> : <><Sparkles size={13} /> AI Review</>}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Histogram ──
function ScoreHistogram({ distribution }) {
  if (!distribution) return null
  const entries = Object.entries(distribution)
  const maxCount = Math.max(...entries.map(([, v]) => v), 1)

  return (
    <div className="cv-histogram">
      <div className="cv-histogram-title">Similarity Score Distribution</div>
      <div className="cv-histogram-chart">
        {entries.map(([range, count]) => {
          const midScore = parseFloat(range.split('-')[0]) + 0.05
          const color = scoreColor(midScore)
          const heightPct = (count / maxCount) * 100
          return (
            <div key={range} className="cv-hist-bar-wrapper">
              <span className="cv-hist-count">{count}</span>
              <div className="cv-hist-bar" style={{ height: `${heightPct}%`, background: color }} title={`${range}: ${count}`} />
              <span className="cv-hist-label">{range.split('-')[0]}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Cross-Validation Tab ──
function CrossValidationTab({ showToast }) {
  const [stats, setStats] = useState(null)
  const [pairs, setPairs] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [minScore, setMinScore] = useState(0)
  const [sortBy, setSortBy] = useState('score')
  const [offset, setOffset] = useState(0)
  const [batchProgress, setBatchProgress] = useState(null)
  const [recomputing, setRecomputing] = useState(false)
  const abortRef = useRef(null)
  const recomputeRef = useRef(null)
  const LIMIT = 50

  const loadStats = useCallback(async () => {
    try {
      const data = await api.crossvalStats()
      setStats(data)
    } catch (e) {
      console.error('Crossval stats error:', e)
    }
  }, [])

  const loadPairs = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.crossvalPairs({
        status: statusFilter || undefined,
        minScore,
        sort: sortBy,
        limit: LIMIT,
        offset,
      })
      setPairs(data.pairs || [])
      setTotal(data.total || 0)
    } catch (e) {
      console.error('Crossval pairs error:', e)
      setPairs([])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, minScore, sortBy, offset])

  useEffect(() => { loadStats() }, [loadStats])
  useEffect(() => { loadPairs() }, [loadPairs])
  useEffect(() => { setOffset(0) }, [statusFilter, minScore, sortBy])

  const handleStatusChange = (index, newStatus) => {
    setPairs(prev => prev.map(p => p.index === index ? { ...p, status: newStatus } : p))
    loadStats()
  }

  const handleReviewDone = (index, aiReview) => {
    setPairs(prev => prev.map(p => p.index === index ? { ...p, ai_review: aiReview } : p))
  }

  const handleBatchReview = async () => {
    const ac = new AbortController()
    abortRef.current = ac
    setBatchProgress({ reviewed: 0, errors: 0, total: 0, done: false })

    try {
      const token = localStorage.getItem('hermes_token') || ''
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const resp = await fetch(api.crossvalReviewBatchUrl(), {
        method: 'POST',
        headers,
        signal: ac.signal,
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'start') {
              setBatchProgress(prev => ({ ...prev, total: evt.total }))
            } else if (evt.type === 'progress') {
              setBatchProgress(prev => ({ ...prev, reviewed: evt.reviewed, errors: evt.errors }))
            } else if (evt.type === 'done') {
              setBatchProgress({ reviewed: evt.reviewed, errors: evt.errors, total: evt.total, done: true })
              loadStats()
              loadPairs()
            }
          } catch {}
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        showToast(e.message, 'error')
      }
      setBatchProgress(null)
    }
  }

  const handleCancelBatch = () => {
    if (abortRef.current) abortRef.current.abort()
    setBatchProgress(null)
  }

  const handleRecompute = async () => {
    const ac = new AbortController()
    recomputeRef.current = ac
    setRecomputing(true)
    setBatchProgress({ reviewed: 0, errors: 0, total: 0, done: false })

    try {
      const token = localStorage.getItem('hermes_token') || ''
      const headers = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`

      const resp = await fetch(`${API_BASE}/fine-tune/crossval/review-recompute`, {
        method: 'POST',
        headers,
        signal: ac.signal,
      })

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6))
            if (evt.type === 'start') {
              setBatchProgress(prev => ({ ...prev, total: evt.total }))
            } else if (evt.type === 'progress') {
              setBatchProgress(prev => ({ ...prev, reviewed: evt.reviewed, errors: evt.errors }))
            } else if (evt.type === 'done') {
              setBatchProgress({ reviewed: evt.reviewed, errors: evt.errors, total: evt.total, done: true })
              loadStats()
              loadPairs()
            }
          } catch {}
        }
      }
    } catch (e) {
      if (e.name !== 'AbortError') {
        showToast(e.message, 'error')
      }
      setBatchProgress(null)
    } finally {
      setRecomputing(false)
    }
  }

  const totalPages = Math.ceil(total / LIMIT)
  const currentPage = Math.floor(offset / LIMIT) + 1
  const needsReviewCount = stats?.needs_review || 0

  return (
    <div>
      {/* Stats */}
      {stats && (
        <>
          <div className="ft-stats-bar">
            <div className="ft-stat-card">
              <div className="ft-stat-label"><FileText size={13} /> Total Pairs</div>
              <div className="ft-stat-value">{stats.total}</div>
            </div>
            <div className="ft-stat-card">
              <div className="ft-stat-label"><ShieldCheck size={13} /> Validated</div>
              <div className="ft-stat-value" style={{ color: '#34d399' }}>{stats.validated}</div>
              {stats.validated_duration_sec > 0 && (
                <div className="ft-stat-sub" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <Clock size={10} /> {formatDuration(stats.validated_duration_sec)}
                </div>
              )}
            </div>
            <div className="ft-stat-card">
              <div className="ft-stat-label"><AlertCircle size={13} /> Needs Review</div>
              <div className="ft-stat-value" style={{ color: '#fbbf24' }}>{stats.needs_review}</div>
              {stats.needs_review_duration_sec > 0 && (
                <div className="ft-stat-sub" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                  <Clock size={10} /> {formatDuration(stats.needs_review_duration_sec)}
                </div>
              )}
            </div>
            <div className="ft-stat-card">
              <div className="ft-stat-label"><BarChart3 size={13} /> Avg Similarity</div>
              <div className="ft-stat-value">{(stats.avg_min_similarity * 100).toFixed(1)}%</div>
            </div>
            {stats.providers && (
              <div className="ft-stat-card">
                <div className="ft-stat-label"><Bot size={13} /> Providers</div>
                <div className="ft-stat-value" style={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                  {Object.entries(stats.providers).map(([k, v]) => (
                    <span key={k} style={{ marginRight: '0.5rem' }}>{k}: {v}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ScoreHistogram distribution={stats.score_distribution} />
        </>
      )}

      {/* Filters */}
      <div className="ft-controls">
        <div className="ft-controls-left">
          <select className="ft-date-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="validated">Validated</option>
            <option value="needs_review">Needs Review</option>
          </select>
          <select className="ft-date-select" value={minScore} onChange={e => setMinScore(parseFloat(e.target.value))}>
            <option value={0}>Any score</option>
            <option value={0.5}>Min 0.50</option>
            <option value={0.6}>Min 0.60</option>
            <option value={0.7}>Min 0.70</option>
            <option value={0.8}>Min 0.80</option>
            <option value={0.9}>Min 0.90</option>
            <option value={0.95}>Min 0.95</option>
          </select>
          <select className="ft-date-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="score">Sort by Score</option>
            <option value="date">Sort by Date</option>
          </select>
          {needsReviewCount > 0 && !batchProgress && (
            <button className="btn btn-sm btn-primary" onClick={handleBatchReview}>
              <Sparkles size={13} /> AI Review All ({needsReviewCount})
            </button>
          )}
          {!batchProgress && (
            <button className="btn btn-sm" onClick={handleRecompute} disabled={recomputing} title="Re-run AI review on entries that have new providers since last review">
              {recomputing ? <><Loader size={13} className="spin" /> Recomputing...</> : <><RefreshCw size={13} /> Recompute Reviews</>}
            </button>
          )}
          {batchProgress && !batchProgress.done && (
            <button className="btn btn-sm" onClick={handleCancelBatch}>
              <X size={13} /> Cancel
            </button>
          )}
        </div>
        <span className="ft-result-count">
          {batchProgress ? `${batchProgress.reviewed}/${batchProgress.total || '?'} reviewed` : `${total} pairs`}
        </span>
      </div>

      {/* Batch progress bar */}
      {batchProgress && (
        <div className="cv-batch-progress">
          <div className="cv-batch-bar-track">
            <div className="cv-batch-bar-fill"
              style={{ width: batchProgress.total ? `${(batchProgress.reviewed / batchProgress.total) * 100}%` : '0%' }}
            />
          </div>
          {batchProgress.done && (
            <span className="cv-batch-done">Done: {batchProgress.reviewed} reviewed, {batchProgress.errors} errors</span>
          )}
        </div>
      )}

      {/* Pairs list */}
      {loading ? (
        <div className="spinner" />
      ) : (
        <div className="cv-pairs-list">
          {pairs.map((pair) => (
            <CrossValCard
              key={`${pair.date}-${pair.base_name}`}
              pair={pair}
              index={pair.index}
              onStatusChange={handleStatusChange}
              onReviewDone={handleReviewDone}
              showToast={showToast}
            />
          ))}
          {pairs.length === 0 && (
            <div className="ft-empty-state">
              <BarChart3 size={48} />
              <p>No cross-validation results found</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="ft-pagination">
          <button className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>
            <ChevronLeft size={14} /> Previous
          </button>
          <span className="ft-page-info">Page {currentPage} of {totalPages}</span>
          <button className="btn btn-sm" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Fine-Tune Page ──
export default function FineTune() {
  const [activeTab, setActiveTab] = useState('pairs')
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
  useEffect(() => { if (activeTab === 'pairs') loadPairs() }, [loadPairs, activeTab])

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

  if (loading && !stats && activeTab === 'pairs') return <div className="spinner" />

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

      {/* Tabs */}
      <div className="ft-tabs">
        <button className={`ft-tab ${activeTab === 'pairs' ? 'ft-tab-active' : ''}`} onClick={() => setActiveTab('pairs')}>
          <FileText size={14} /> Pairs
        </button>
        <button className={`ft-tab ${activeTab === 'crossval' ? 'ft-tab-active' : ''}`} onClick={() => setActiveTab('crossval')}>
          <BarChart3 size={14} /> Cross-Validation
        </button>
      </div>

      {activeTab === 'pairs' && (
        <>
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
                  aria-label="Search transcripts"
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
        </>
      )}

      {activeTab === 'crossval' && (
        <CrossValidationTab showToast={showToast} />
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
