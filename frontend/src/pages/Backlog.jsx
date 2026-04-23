import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Plus, Check, Pencil, Trash2, X, RefreshCw, Play, Loader2, Zap, ChevronDown, ChevronUp, ThumbsUp, ThumbsDown, Sparkles, FolderKanban } from 'lucide-react'
import { api } from '../api'
import { useToast } from '../contexts/ToastContext'
import ConfirmModal from '../components/ConfirmModal'
import Tooltip from '../components/Tooltip'
import TagSelector from '../components/TagSelector'
import './backlog.css'

const STATUS_COLORS = {
  'pending': '#6b7280',
  'blocked': '#ef4444',
  'waiting-human': '#f59e0b',
  'in-progress': '#3b82f6',
  'done': '#22c55e',
}

const PRIORITY_COLORS = {
  'haute': '#ef4444',
  'normale': '#3b82f6',
  'basse': '#22c55e',
}

const CATEGORIES = ['voice-cloning', 'fine-tune', 'infrastructure', 'dashboard', 'seo', 'devops', 'other']
const STATUSES = ['pending', 'blocked', 'waiting-human', 'in-progress', 'done']
const PRIORITIES = ['haute', 'normale', 'basse']

const EMPTY_FORM = {
  title: '',
  description: '',
  category: 'other',
  priority: 'normale',
  status: 'pending',
  blocked_reason: '',
  tags: [],
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    var d = new Date(dateStr)
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch (e) {
    return dateStr
  }
}

export default function Backlog() {
  var navigate = useNavigate()
  var _useState = useState([])
  var items = _useState[0]
  var setItems = _useState[1]

  var _useState2 = useState({})
  var stats = _useState2[0]
  var setStats = _useState2[1]

  var _useState3 = useState(true)
  var loading = _useState3[0]
  var setLoading = _useState3[1]

  var _useState4 = useState('')
  var filterStatus = _useState4[0]
  var setFilterStatus = _useState4[1]

  var _useState5 = useState('')
  var filterCategory = _useState5[0]
  var setFilterCategory = _useState5[1]

  var _useState6 = useState('')
  var filterPriority = _useState6[0]
  var setFilterPriority = _useState6[1]

  var _useState7 = useState(false)
  var showForm = _useState7[0]
  var setShowForm = _useState7[1]

  var _useState8 = useState(null)
  var editItem = _useState8[0]
  var setEditItem = _useState8[1]

  var _useState9 = useState(null)
  var deleteTarget = _useState9[0]
  var setDeleteTarget = _useState9[1]

  var _useState10 = useState(EMPTY_FORM)
  var formData = _useState10[0]
  var setFormData = _useState10[1]

  var _useState11 = useState(false)
  var saving = _useState11[0]
  var setSaving = _useState11[1]

  var _useState12 = useState(null)
  var runningSessions = _useState12[0]
  var setRunningSessions = _useState12[1]

  var _useState13 = useState({})
  var launching = _useState13[0]
  var setLaunching = _useState13[1]

  var _useState14 = useState('')
  var filterSource = _useState14[0]
  var setFilterSource = _useState14[1]

  var _useState15 = useState([])
  var suggestions = _useState15[0]
  var setSuggestions = _useState15[1]

  var _useState16 = useState({})
  var intelStats = _useState16[0]
  var setIntelStats = _useState16[1]

  var _useState17 = useState(false)
  var showSuggestions = _useState17[0]
  var setShowSuggestions = _useState17[1]

  var _useState18 = useState({})
  var acceptingSuggestion = _useState18[0]
  var setAcceptingSuggestion = _useState18[1]

  var toast = useToast().toast

  function handleLaunch(item) {
    setLaunching(function (prev) { var next = {}; next[item.id] = true; return Object.assign({}, prev, next) })
    api.runBacklogItem(item.id)
      .then(function (data) {
        toast('Claude Code lancé pour : ' + item.title, 'success')
        setRunningSessions(function (prev) {
          var next = prev || {}
          next[item.id] = data.session
          return next
        })
        fetchItems()
        fetchStats()
      })
      .catch(function (err) {
        toast('Erreur au lancement : ' + (err.message || 'inconnu'), 'error')
      })
      .finally(function () {
        setLaunching(function (prev) { var next = {}; next[item.id] = false; return Object.assign({}, prev, next) })
      })
  }

  function checkSessions() {
    items.forEach(function (item) {
      if (item.status === 'in-progress' || runningSessions && runningSessions[item.id]) {
        api.getBacklogSession(item.id)
          .then(function (data) {
            setRunningSessions(function (prev) {
              var next = prev || {}
              if (data.running) {
                next[item.id] = data.session
              } else {
                delete next[item.id]
              }
              return Object.assign({}, next)
            })
          })
          .catch(function () {})
      }
    })
  }

  var fetchItems = useCallback(function () {
    setLoading(true)
    var params = []
    if (filterStatus) params.push('status=' + encodeURIComponent(filterStatus))
    if (filterCategory) params.push('category=' + encodeURIComponent(filterCategory))
    if (filterPriority) params.push('priority=' + encodeURIComponent(filterPriority))
    var qs = params.join('&')

    api.getBacklogItems(qs)
      .then(function (data) {
        var list = Array.isArray(data) ? data : (data.items || [])
        // Client-side source filter
        if (filterSource === 'autofeed') {
          list = list.filter(function (i) { return i.source === 'autofeed' || i.autofeed_source })
        } else if (filterSource === 'manual') {
          list = list.filter(function (i) { return i.source !== 'autofeed' && !i.autofeed_source })
        }
        setItems(list)
      })
      .catch(function (err) {
        toast.error('Failed to load items: ' + err.message)
      })
      .finally(function () {
        setLoading(false)
      })
  }, [filterStatus, filterCategory, filterPriority, filterSource, toast])

  var fetchStats = useCallback(function () {
    api.backlogStats()
      .then(function (data) {
        setStats(data)
      })
      .catch(function (err) {
        toast.error('Failed to load stats: ' + err.message)
      })
  }, [toast])

  var fetchSuggestions = useCallback(function () {
    api.getBacklogSuggestions()
      .then(function (data) {
        setSuggestions(data.suggestions || [])
      })
      .catch(function () {})
  }, [])

  var fetchIntelStats = useCallback(function () {
    api.getBacklogIntelligenceStatus()
      .then(function (data) {
        setIntelStats(data)
      })
      .catch(function () {})
  }, [])

  useEffect(function () {
    fetchItems()
    fetchStats()
    fetchSuggestions()
    fetchIntelStats()
  }, [fetchItems, fetchStats, fetchSuggestions, fetchIntelStats])

  function handleFormChange(field, value) {
    setFormData(function (prev) {
      var next = {}
      for (var k in prev) next[k] = prev[k]
      next[field] = value
      return next
    })
  }

  function openAddForm() {
    setFormData(EMPTY_FORM)
    setEditItem(null)
    setShowForm(true)
  }

  function openEditForm(item) {
    setFormData({
      title: item.title || '',
      description: item.description || '',
      category: item.category || 'other',
      priority: item.priority || 'normale',
      status: item.status || 'pending',
      blocked_reason: item.blocked_reason || '',
      tags: item.tags || [],
    })
    setEditItem(item)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditItem(null)
    setFormData(EMPTY_FORM)
    setSaving(false)
  }

  function handleSave() {
    if (!formData.title.trim()) {
      toast.error('Title is required')
      return
    }
    setSaving(true)

    if (editItem) {
      var updates = {}
      if (formData.title !== editItem.title) updates.title = formData.title
      if (formData.description !== editItem.description) updates.description = formData.description
      if (formData.category !== editItem.category) updates.category = formData.category
      if (formData.priority !== editItem.priority) updates.priority = formData.priority
      if (formData.status !== editItem.status) updates.status = formData.status
      var oldBlocked = editItem.blocked_reason || ''
      if (formData.blocked_reason !== oldBlocked) updates.blocked_reason = formData.blocked_reason
      var oldTags = JSON.stringify(editItem.tags || [])
      var newTags = JSON.stringify(formData.tags || [])
      if (oldTags !== newTags) updates.tags = formData.tags

      api.updateBacklogItem(editItem.id, updates)
        .then(function () {
          toast.success('Item updated')
          closeForm()
          fetchItems()
          fetchStats()
        })
        .catch(function (err) {
          toast.error('Failed to update: ' + err.message)
        })
        .finally(function () {
          setSaving(false)
        })
    } else {
      api.createBacklogItem(formData)
        .then(function () {
          toast.success('Item created')
          closeForm()
          fetchItems()
          fetchStats()
        })
        .catch(function (err) {
          toast.error('Failed to create: ' + err.message)
        })
        .finally(function () {
          setSaving(false)
        })
    }
  }

  function handleMarkDone(item) {
    if (item.status === 'done') return
    api.patchBacklogStatus(item.id, 'done')
      .then(function () {
        toast.success('Marked as done')
        fetchItems()
        fetchStats()
      })
      .catch(function (err) {
        toast.error('Failed: ' + err.message)
      })
  }

  function confirmDelete(item) {
    setDeleteTarget(item)
  }

  function handleDelete() {
    if (!deleteTarget) return
    api.deleteBacklogItem(deleteTarget.id)
      .then(function () {
        toast.success('Item deleted')
        setDeleteTarget(null)
        fetchItems()
        fetchStats()
      })
      .catch(function (err) {
        toast.error('Failed to delete: ' + err.message)
      })
  }

  function handleStatClick(status) {
    setFilterStatus(function (prev) { return prev === status ? '' : status })
  }

  function handleAcceptSuggestion(id) {
    setAcceptingSuggestion(function (prev) { var n = {}; n[id] = true; return Object.assign({}, prev, n) })
    api.acceptBacklogSuggestion(id)
      .then(function () {
        toast('Suggestion acceptée et ajoutée au backlog', 'success')
        fetchSuggestions()
        fetchItems()
        fetchStats()
        fetchIntelStats()
      })
      .catch(function (err) { toast('Erreur: ' + err.message, 'error') })
      .finally(function () {
        setAcceptingSuggestion(function (prev) { var n = {}; n[id] = false; return Object.assign({}, prev, n) })
      })
  }

  function handleRejectSuggestion(id) {
    api.rejectBacklogSuggestion(id)
      .then(function () {
        toast('Suggestion rejetée', 'success')
        fetchSuggestions()
        fetchIntelStats()
      })
      .catch(function (err) { toast('Erreur: ' + err.message, 'error') })
  }

  function resetFilters() {
    setFilterStatus('')
    setFilterCategory('')
    setFilterPriority('')
    setFilterSource('')
  }

  var byStatus = stats.by_status || {}
  var totalActive = (byStatus['pending'] || 0) + (byStatus['blocked'] || 0) + (byStatus['waiting-human'] || 0) + (byStatus['in-progress'] || 0)

  return (
    <div className="backlog-page">
      <div className="backlog-header">
        <div className="page-title">
          <ClipboardList size={28} />
          Backlog
          <Tooltip text="Task tracking system. Manage pending work, blocked items, and track progress across categories." />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={function () { navigate('/projects') }}>
            <FolderKanban size={14} /> Projects
          </button>
          <button className="btn btn-sm" onClick={function () { fetchItems(); fetchStats() }} disabled={loading}>
            <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
            Refresh
          </button>
          <button className="btn btn-primary" onClick={openAddForm}>
            <Plus size={14} /> Add Item
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="backlog-stats">
        <div className="backlog-stat-card" onClick={function () { handleStatClick('') }} style={{ cursor: 'pointer', opacity: !filterStatus ? 1 : 0.6 }}>
          <div className="backlog-stat-value">{stats.total || 0}</div>
          <div className="backlog-stat-label">Total</div>
        </div>
        <div className="backlog-stat-card" onClick={function () { handleStatClick('pending') }} style={{ cursor: 'pointer', opacity: filterStatus === 'pending' ? 1 : 0.7, borderTop: '3px solid ' + (STATUS_COLORS['pending']) }}>
          <div className="backlog-stat-value">{byStatus['pending'] || 0}</div>
          <div className="backlog-stat-label">Pending</div>
        </div>
        <div className="backlog-stat-card" onClick={function () { handleStatClick('blocked') }} style={{ cursor: 'pointer', opacity: filterStatus === 'blocked' ? 1 : 0.7, borderTop: '3px solid ' + (STATUS_COLORS['blocked']) }}>
          <div className="backlog-stat-value">{byStatus['blocked'] || 0}</div>
          <div className="backlog-stat-label">Blocked</div>
        </div>
        <div className="backlog-stat-card" onClick={function () { handleStatClick('waiting-human') }} style={{ cursor: 'pointer', opacity: filterStatus === 'waiting-human' ? 1 : 0.7, borderTop: '3px solid ' + (STATUS_COLORS['waiting-human']) }}>
          <div className="backlog-stat-value">{byStatus['waiting-human'] || 0}</div>
          <div className="backlog-stat-label">Waiting Human</div>
        </div>
        <div className="backlog-stat-card" onClick={function () { handleStatClick('in-progress') }} style={{ cursor: 'pointer', opacity: filterStatus === 'in-progress' ? 1 : 0.7, borderTop: '3px solid ' + (STATUS_COLORS['in-progress']) }}>
          <div className="backlog-stat-value">{byStatus['in-progress'] || 0}</div>
          <div className="backlog-stat-label">In Progress</div>
        </div>
        <div className="backlog-stat-card" onClick={function () { handleStatClick('done') }} style={{ cursor: 'pointer', opacity: filterStatus === 'done' ? 1 : 0.7, borderTop: '3px solid ' + (STATUS_COLORS['done']) }}>
          <div className="backlog-stat-value">{byStatus['done'] || 0}</div>
          <div className="backlog-stat-label">Done</div>
        </div>
      </div>

      {/* Filters */}
      <div className="backlog-filters">
        <select className="backlog-filter-select" value={filterStatus} onChange={function (e) { setFilterStatus(e.target.value) }}>
          <option value="">All Statuses</option>
          {STATUSES.map(function (s) { return <option key={s} value={s}>{s}</option> })}
        </select>
        <select className="backlog-filter-select" value={filterCategory} onChange={function (e) { setFilterCategory(e.target.value) }}>
          <option value="">All Categories</option>
          {CATEGORIES.map(function (c) { return <option key={c} value={c}>{c}</option> })}
        </select>
        <select className="backlog-filter-select" value={filterPriority} onChange={function (e) { setFilterPriority(e.target.value) }}>
          <option value="">All Priorities</option>
          {PRIORITIES.map(function (p) { return <option key={p} value={p}>{p}</option> })}
        </select>
        <select className="backlog-filter-select" value={filterSource} onChange={function (e) { setFilterSource(e.target.value) }}>
          <option value="">Toutes sources</option>
          <option value="autofeed">Auto-détectées</option>
          <option value="manual">Manuelles</option>
        </select>
        {(filterStatus || filterCategory || filterPriority || filterSource) && (
          <button className="btn btn-sm" onClick={resetFilters}>
            <X size={14} /> Reset
          </button>
        )}
        <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
          {!filterStatus && !filterCategory && !filterPriority && !filterSource && totalActive > 0 && (
            <span> &middot; {totalActive} active</span>
          )}
        </div>
      </div>

      {/* Intelligence Stats */}
      {intelStats.analysis_count > 0 && (
        <div className="backlog-intel-stats">
          <Zap size={14} />
          <span>{intelStats.accepted || 0} auto-détectées</span>
          <span className="backlog-intel-stat-sep">&middot;</span>
          <span>{suggestions.length} suggestions</span>
          <span className="backlog-intel-stat-sep">&middot;</span>
          <span>{intelStats.rejected || 0} rejetées</span>
          {intelStats.last_analysis && (
            <>
              <span className="backlog-intel-stat-sep">&middot;</span>
              <span>Dernière analyse: {new Date(intelStats.last_analysis).toLocaleTimeString()}</span>
            </>
          )}
        </div>
      )}

      {/* Suggestions Section */}
      {suggestions.length > 0 && (
        <div className="backlog-suggestions-section">
          <button className="backlog-suggestions-toggle" onClick={function () { setShowSuggestions(!showSuggestions) }}>
            <Sparkles size={16} />
            <span>{suggestions.length} suggestion{suggestions.length !== 1 ? 's' : ''} en attente</span>
            {showSuggestions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          {showSuggestions && (
            <div className="backlog-suggestions-list">
              {suggestions.map(function (s) {
                var conf = s.confidence || 0.4
                var confColor = conf >= 0.7 ? '#22c55e' : conf >= 0.5 ? '#f59e0b' : '#6b7280'
                return (
                  <div className="backlog-suggestion-card" key={s.id}>
                    <div className="backlog-suggestion-header">
                      <span className="backlog-suggestion-title">{s.title}</span>
                      <div className="backlog-suggestion-actions">
                        <button
                          className="backlog-btn backlog-btn-accept"
                          disabled={acceptingSuggestion && acceptingSuggestion[s.id]}
                          onClick={function () { handleAcceptSuggestion(s.id) }}
                          title="Accepter"
                        >
                          {acceptingSuggestion && acceptingSuggestion[s.id] ? <Loader2 size={14} /> : <ThumbsUp size={14} />}
                        </button>
                        <button className="backlog-btn backlog-btn-reject" onClick={function () { handleRejectSuggestion(s.id) }} title="Rejeter">
                          <ThumbsDown size={14} />
                        </button>
                      </div>
                    </div>
                    {s.description && <div className="backlog-suggestion-desc">{s.description.substring(0, 150)}</div>}
                    <div className="backlog-suggestion-meta">
                      <span className="backlog-source-badge">{s.source || 'unknown'}</span>
                      <span className="backlog-badge" style={{ backgroundColor: (PRIORITY_COLORS[s.priority] || '#3b82f6') + '20', color: PRIORITY_COLORS[s.priority] || '#3b82f6', fontSize: 11 }}>
                        {s.priority}
                      </span>
                      <span className="backlog-badge" style={{ fontSize: 11 }}>{s.category}</span>
                      <div className="backlog-confidence-bar" title={'Confiance: ' + Math.round(conf * 100) + '%'}>
                        <div className="backlog-confidence-fill" style={{ width: Math.round(conf * 100) + '%', background: confColor }} />
                      </div>
                      <span style={{ fontSize: 11, color: confColor }}>{Math.round(conf * 100)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Items list */}
      {loading ? (
        <div className="backlog-loading">
          <div className="spinner" />
        </div>
      ) : items.length === 0 ? (
        <div className="backlog-empty">
          <ClipboardList size={48} />
          <p>No backlog items found</p>
          {(filterStatus || filterCategory || filterPriority) && (
            <button className="btn btn-sm" onClick={resetFilters}>Clear filters</button>
          )}
        </div>
      ) : (
        <div className="backlog-list">
          {items.map(function (item) {
            var isDone = item.status === 'done'
            var statusColor = STATUS_COLORS[item.status] || '#6b7280'
            var priorityColor = PRIORITY_COLORS[item.priority] || '#3b82f6'
            var desc = item.description || ''
            if (desc.length > 200) desc = desc.substring(0, 200) + '...'

            return (
              <div className={'backlog-item' + (isDone ? ' backlog-item-done' : '')} key={item.id}>
                <div className="backlog-item-badges">
                  <span className="backlog-badge" style={{ backgroundColor: statusColor + '20', color: statusColor, borderColor: statusColor + '40' }}>
                    {item.status}
                  </span>
                  <span className="backlog-badge" style={{ backgroundColor: priorityColor + '20', color: priorityColor, borderColor: priorityColor + '40' }}>
                    {item.priority}
                  </span>
                  <span className="backlog-badge backlog-badge-category">
                    {item.category}
                  </span>
                  {(item.source === 'autofeed' || item.autofeed_source) && (
                    <Tooltip text={"Ajouté automatiquement par le système autofeed"}>
                      <span className="backlog-badge" style={{ backgroundColor: '#8b5cf620', color: '#8b5cf6', borderColor: '#8b5cf640', fontSize: 11 }}>
                        auto
                      </span>
                    </Tooltip>
                  )}
                </div>
                <div className="backlog-item-title">{item.title}</div>
                {desc && <div className="backlog-item-desc">{desc}</div>}
                {item.blocked_reason && (
                  <div className="backlog-item-blocked">
                    <span style={{ color: '#ef4444', fontWeight: 600 }}>Blocked: </span>
                    {item.blocked_reason}
                  </div>
                )}
                <div className="backlog-item-footer">
                  <span className="backlog-item-date">
                    {formatDate(item.created)}
                    {item.done_date && <span> &middot; Done {formatDate(item.done_date)}</span>}
                  </span>
                  <div className="backlog-item-actions">
                    {item.status !== 'done' && item.status !== 'waiting-human' && (
                      <Tooltip text={"Lancer Claude Code pour exécuter cette tâche automatiquement"}>
                        <button
                          className={"backlog-btn backlog-btn-launch" + (runningSessions && runningSessions[item.id] ? ' backlog-btn-launching' : '')}
                          disabled={launching && launching[item.id]}
                          onClick={function () { handleLaunch(item) }}
                        >
                          {launching && launching[item.id] ? <Loader2 size={14} /> : (runningSessions && runningSessions[item.id] ? <Loader2 size={14} className="spin" /> : <Play size={14} />)}
                        </button>
                      </Tooltip>
                    )}
                    {!isDone && (
                      <Tooltip text={"Marquer cette tâche comme terminée"}>
                        <button className="backlog-btn backlog-btn-done" onClick={function () { handleMarkDone(item) }}>
                          <Check size={14} />
                        </button>
                      </Tooltip>
                    )}
                    <button className="backlog-btn backlog-btn-edit" onClick={function () { openEditForm(item) }}>
                      <Pencil size={14} />
                    </button>
                    <button className="backlog-btn backlog-btn-delete" onClick={function () { confirmDelete(item) }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="backlog-modal-overlay" onClick={closeForm}>
          <div className="backlog-modal" onClick={function (e) { e.stopPropagation() }}>
            <div className="backlog-modal-header">
              <h3>{editItem ? 'Edit Item' : 'New Item'}</h3>
              <button className="btn btn-sm" onClick={closeForm}><X size={16} /></button>
            </div>
            <div className="backlog-form-group">
              <label className="form-label">Title *</label>
              <input className="form-input" value={formData.title} onChange={function (e) { handleFormChange('title', e.target.value) }} placeholder="Task title" autoFocus />
            </div>
            <div className="backlog-form-group">
              <label className="form-label">Description</label>
              <textarea className="form-textarea" value={formData.description} onChange={function (e) { handleFormChange('description', e.target.value) }} placeholder="Describe the task..." rows={3} />
            </div>
            <div className="backlog-form-row">
              <div className="backlog-form-group">
                <label className="form-label">Category</label>
                <select className="form-input" value={formData.category} onChange={function (e) { handleFormChange('category', e.target.value) }}>
                  {CATEGORIES.map(function (c) { return <option key={c} value={c}>{c}</option> })}
                </select>
              </div>
              <div className="backlog-form-group">
                <label className="form-label">Priority</label>
                <select className="form-input" value={formData.priority} onChange={function (e) { handleFormChange('priority', e.target.value) }}>
                  {PRIORITIES.map(function (p) { return <option key={p} value={p}>{p}</option> })}
                </select>
              </div>
              <div className="backlog-form-group">
                <label className="form-label">Status</label>
                <select className="form-input" value={formData.status} onChange={function (e) { handleFormChange('status', e.target.value) }}>
                  {STATUSES.map(function (s) { return <option key={s} value={s}>{s}</option> })}
                </select>
              </div>
            </div>
            <div className="backlog-form-group">
              <label className="form-label">Blocked Reason</label>
              <textarea className="form-textarea" value={formData.blocked_reason} onChange={function (e) { handleFormChange('blocked_reason', e.target.value) }} placeholder="Why is this blocked?" rows={2} />
            </div>
            <div className="backlog-form-group">
              <label className="form-label">Tags</label>
              <TagSelector
                selected={formData.tags || []}
                onChange={function (tags) { handleFormChange('tags', tags) }}
              />
            </div>
            <div className="backlog-form-actions">
              <button className="btn" onClick={closeForm} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formData.title.trim()}>
                {saving ? 'Saving...' : (editItem ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Item"
          message={'Are you sure you want to delete "' + (deleteTarget.title || deleteTarget.id) + '"? This cannot be undone.'}
          onConfirm={handleDelete}
          onCancel={function () { setDeleteTarget(null) }}
          danger={true}
          confirmLabel="Delete"
        />
      )}

      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}
