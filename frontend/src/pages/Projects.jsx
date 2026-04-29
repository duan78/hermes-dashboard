import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Search, Scan, ExternalLink, Trash2, Edit3, X, GitBranch, MessageSquare, ClipboardList, Tag, ChevronRight, Clock, Check, Play, Loader2, Pencil, ArrowRight } from 'lucide-react'
import { api } from '../api'
import { useToast } from '../contexts/ToastContext'
import ConfirmModal from '../components/ConfirmModal'
import Tooltip from '../components/Tooltip'
import TagSelector from '../components/TagSelector'
import './projects.css'

const TYPE_COLORS = {
  webapp: '#3b82f6',
  library: '#22c55e',
  infra: '#f97316',
  seo: '#a855f7',
  research: '#06b6d4',
  automation: '#eab308',
  other: '#6b7280',
}

const STATUS_COLORS = {
  active: '#22c55e',
  paused: '#eab308',
  archived: '#6b7280',
}

const BACKLOG_STATUS_COLORS = {
  'pending': '#6b7280',
  'blocked': '#ef4444',
  'waiting-human': '#f59e0b',
  'in-progress': '#3b82f6',
  'done': '#22c55e',
}

const TYPES = ['webapp', 'library', 'infra', 'seo', 'research', 'automation', 'other']
const STATUSES = ['active', 'paused', 'archived']

const EMPTY_FORM = {
  name: '',
  type: 'other',
  description: '',
  github_repo: '',
  keywords: '',
  status: 'active',
  tags: [],
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function relativeDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now - d
    const diffDays = Math.floor(diffMs / 86400000)
    if (diffDays === 0) return "Aujourd'hui"
    if (diffDays === 1) return 'Hier'
    if (diffDays < 30) return 'Il y a ' + diffDays + 'j'
    if (diffDays < 365) return 'Il y a ' + Math.floor(diffDays / 30) + ' mois'
    return 'Il y a ' + Math.floor(diffDays / 365) + ' an' + (Math.floor(diffDays / 365) > 1 ? 's' : '')
  } catch {
    return dateStr
  }
}

export default function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedProject, setSelectedProject] = useState(null)
  const [projectSessions, setProjectSessions] = useState([])
  const [projectBacklog, setProjectBacklog] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetectModal, setShowDetectModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [detectCandidates, setDetectCandidates] = useState([])
  const [selectedCandidates, setSelectedCandidates] = useState({})
  const [deleteTarget, setDeleteTarget] = useState(null)

  // Drawer states
  const [sessionDrawer, setSessionDrawer] = useState(null)
  const [sessionMessages, setSessionMessages] = useState([])
  const [sessionLoading, setSessionLoading] = useState(false)
  const [backlogDrawer, setBacklogDrawer] = useState(null)

  const { toast } = useToast()
  const detailCacheRef = useRef({})
  const [mobileShowDetail, setMobileShowDetail] = useState(false)

  const loadProjects = useCallback(function () {
    setLoading(true)
    var params = {}
    if (typeFilter) params.type = typeFilter
    if (statusFilter) params.status = statusFilter
    if (search) params.search = search

    api.fetchProjects(params)
      .then(function (data) {
        setProjects(data.items || [])
      })
      .catch(function (err) {
        toast('Erreur chargement projets: ' + err.message, 'error')
      })
      .finally(function () {
        setLoading(false)
      })
  }, [typeFilter, statusFilter, search, toast])

  useEffect(function () {
    loadProjects()
  }, [loadProjects])

  var filteredProjects = useMemo(function () {
    return projects
  }, [projects])

  var loadProjectDetail = useCallback(function (project) {
    setSelectedProject(project)
    setMobileShowDetail(true)

    // Check cache first
    var cached = detailCacheRef.current[project.id]
    if (cached) {
      setProjectSessions(cached.sessions)
      setProjectBacklog(cached.backlog)
      setDetailLoading(false)
      return
    }

    setDetailLoading(true)
    Promise.all([
      api.fetchProjectSessions(project.id).catch(function () { return { sessions: [] } }),
      api.fetchProjectBacklog(project.id).catch(function () { return { items: [] } }),
    ]).then(function (results) {
      var sessions = results[0].sessions || []
      var backlog = results[1].items || []
      setProjectSessions(sessions)
      setProjectBacklog(backlog)
      detailCacheRef.current[project.id] = { sessions: sessions, backlog: backlog }
    }).finally(function () {
      setDetailLoading(false)
    })
  }, [])

  // Create / Edit
  function openCreateModal() {
    setFormData(EMPTY_FORM)
    setEditingProject(null)
    setShowCreateModal(true)
  }

  function openEditModal(project) {
    setFormData({
      name: project.name || '',
      type: project.type || 'other',
      description: project.description || '',
      github_repo: project.github_repo || '',
      keywords: (project.keywords || []).join(', '),
      status: project.status || 'active',
      tags: project.tags || [],
    })
    setEditingProject(project)
    setShowCreateModal(true)
  }

  function closeModal() {
    setShowCreateModal(false)
    setEditingProject(null)
    setFormData(EMPTY_FORM)
    setSaving(false)
  }

  function handleFormChange(field, value) {
    setFormData(function (prev) {
      var next = {}
      for (var k in prev) next[k] = prev[k]
      next[field] = value
      return next
    })
  }

  function handleSave() {
    if (!formData.name.trim()) {
      toast('Le nom est requis', 'error')
      return
    }
    setSaving(true)

    var keywords = formData.keywords
      .split(',')
      .map(function (k) { return k.trim() })
      .filter(Boolean)

    var payload = {
      name: formData.name.trim(),
      type: formData.type,
      description: formData.description,
      github_repo: formData.github_repo.trim(),
      keywords: keywords,
      status: formData.status,
      tags: formData.tags || [],
    }

    var promise = editingProject
      ? api.updateProject(editingProject.id, payload)
      : api.createProject(payload)

    promise
      .then(function () {
        toast(editingProject ? 'Projet mis à jour' : 'Projet créé', 'success')
        closeModal()
        loadProjects()
      })
      .catch(function (err) {
        toast('Erreur: ' + err.message, 'error')
      })
      .finally(function () {
        setSaving(false)
      })
  }

  // Delete
  function handleDelete() {
    if (!deleteTarget) return
    api.deleteProject(deleteTarget.id)
      .then(function () {
        toast('Projet supprimé', 'success')
        if (selectedProject && selectedProject.id === deleteTarget.id) {
          setSelectedProject(null)
        }
        setDeleteTarget(null)
        loadProjects()
      })
      .catch(function (err) {
        toast('Erreur suppression: ' + err.message, 'error')
      })
  }

  // Auto-detect
  function openDetectModal() {
    setDetectCandidates([])
    setSelectedCandidates({})
    setShowDetectModal(true)
  }

  function runDetection() {
    setDetecting(true)
    api.autoDetectProjects()
      .then(function (data) {
        setDetectCandidates(data.candidates || [])
        var sel = {}
        ;(data.candidates || []).forEach(function (c) {
          if (c.confidence >= 0.5) sel[c.id] = true
        })
        setSelectedCandidates(sel)
      })
      .catch(function (err) {
        toast('Erreur détection: ' + err.message, 'error')
      })
      .finally(function () {
        setDetecting(false)
      })
  }

  function toggleCandidate(id) {
    setSelectedCandidates(function (prev) {
      var next = {}
      for (var k in prev) next[k] = prev[k]
      next[id] = !prev[id]
      return next
    })
  }

  function createSelectedCandidates() {
    var toCreate = detectCandidates.filter(function (c) { return selectedCandidates[c.id] })
    if (toCreate.length === 0) {
      toast('Aucun projet sélectionné', 'error')
      return
    }
    setSaving(true)
    Promise.all(toCreate.map(function (c) {
      return api.createProject({
        name: c.name,
        type: c.type || 'other',
        description: c.description || '',
        github_repo: c.github_repo || '',
        keywords: c.keywords || [],
        status: 'active',
      })
    }))
      .then(function () {
        toast(toCreate.length + ' projet(s) créé(s)', 'success')
        setShowDetectModal(false)
        loadProjects()
      })
      .catch(function (err) {
        toast('Erreur: ' + err.message, 'error')
      })
      .finally(function () {
        setSaving(false)
      })
  }

  // Session drawer
  function openSessionDrawer(session) {
    setSessionDrawer(session)
    setSessionMessages([])
    setSessionLoading(true)
    if (session.id || session.session_id) {
      var sid = session.id || session.session_id
      api.getSession(sid)
        .then(function (data) {
          setSessionMessages(data.messages || data.transcript || [])
        })
        .catch(function () {
          setSessionMessages([])
        })
        .finally(function () {
          setSessionLoading(false)
        })
    } else {
      setSessionLoading(false)
    }
  }

  function closeSessionDrawer() {
    setSessionDrawer(null)
    setSessionMessages([])
  }

  // Backlog drawer
  function openBacklogDrawer(item) {
    setBacklogDrawer(item)
  }

  function closeBacklogDrawer() {
    setBacklogDrawer(null)
  }

  function handleBacklogMarkDone(item) {
    api.patchBacklogStatus(item.id, 'done')
      .then(function () {
        toast('Marked as done', 'success')
        // Refresh backlog
        if (selectedProject) {
          delete detailCacheRef.current[selectedProject.id]
          loadProjectDetail(selectedProject)
        }
        closeBacklogDrawer()
      })
      .catch(function (err) {
        toast.error('Failed: ' + err.message)
      })
  }

  function handleBacklogLaunch(item) {
    api.runBacklogItem(item.id)
      .then(function () {
        toast('Claude Code lancé pour : ' + item.title, 'success')
      })
      .catch(function (err) {
        toast('Erreur au lancement : ' + (err.message || 'inconnu'), 'error')
      })
  }

  // Compute summary stats
  var summaryStats = useMemo(function () {
    if (!projectBacklog || projectBacklog.length === 0) {
      return { total: 0, done: 0, inProgress: 0, pending: 0, blocked: 0, pct: 0 }
    }
    var done = 0, inProgress = 0, pending = 0, blocked = 0
    projectBacklog.forEach(function (item) {
      if (item.status === 'done') done++
      else if (item.status === 'in-progress') inProgress++
      else if (item.status === 'blocked' || item.status === 'waiting-human') blocked++
      else pending++
    })
    var total = projectBacklog.length
    return {
      total: total,
      done: done,
      inProgress: inProgress,
      pending: pending,
      blocked: blocked,
      pct: total > 0 ? Math.round((done / total) * 100) : 0,
    }
  }, [projectBacklog])

  var lastActivity = useMemo(function () {
    var dates = []
    if (projectSessions.length > 0 && projectSessions[0].date) {
      dates.push(new Date(projectSessions[0].date))
    }
    if (projectBacklog.length > 0) {
      projectBacklog.forEach(function (b) {
        if (b.updated) dates.push(new Date(b.updated))
        else if (b.created) dates.push(new Date(b.created))
      })
    }
    if (dates.length === 0) return null
    return new Date(Math.max.apply(null, dates))
  }, [projectSessions, projectBacklog])

  var selectedCount = Object.values(selectedCandidates).filter(Boolean).length

  return (
    <div className="projects-page">
      {/* Header */}
      <div className="projects-header">
        <div className="page-title">
          <FolderKanban size={28} />
          Projets
          <Tooltip text="Gestion et suivi de vos projets. Organisez vos travaux par type, suivez les sessions et tâches backlog associées." />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tooltip text="Scanner les sessions, backlog et repos GitHub pour détecter automatiquement des projets">
            <button className="btn btn-sm" onClick={openDetectModal}>
              <Scan size={14} /> Détecter
            </button>
          </Tooltip>
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={14} /> Nouveau projet
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="projects-filters">
        <div className="projects-search-wrap">
          <Search size={14} className="projects-search-icon" />
          <input
            className="projects-search-input"
            type="text"
            placeholder="Rechercher un projet..."
            value={search}
            onChange={function (e) { setSearch(e.target.value) }}
          />
        </div>
        <select className="projects-filter-select" value={typeFilter} onChange={function (e) { setTypeFilter(e.target.value) }}>
          <option value="">Tous les types</option>
          {TYPES.map(function (t) { return <option key={t} value={t}>{t}</option> })}
        </select>
        <select className="projects-filter-select" value={statusFilter} onChange={function (e) { setStatusFilter(e.target.value) }}>
          <option value="">Tous les statuts</option>
          {STATUSES.map(function (s) { return <option key={s} value={s}>{s}</option> })}
        </select>
        {(typeFilter || statusFilter || search) && (
          <button className="btn btn-sm" onClick={function () { setSearch(''); setTypeFilter(''); setStatusFilter('') }}>
            <X size={14} /> Réinitialiser
          </button>
        )}
        <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>
          {filteredProjects.length} projet{filteredProjects.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Main content: sidebar + detail panel */}
      <div className="projects-layout">
        {/* Mobile project selector (hidden on desktop) */}
        <div className="projects-mobile-select">
          <select
            className="projects-filter-select"
            value={selectedProject ? selectedProject.id : ''}
            onChange={function (e) {
              var p = filteredProjects.find(function (pr) { return pr.id === e.target.value })
              if (p) loadProjectDetail(p)
            }}
          >
            <option value="">Sélectionnez un projet...</option>
            {filteredProjects.map(function (p) {
              return <option key={p.id} value={p.id}>{p.name}</option>
            })}
          </select>
        </div>

        {/* Sidebar */}
        <div className="projects-sidebar">
          {loading ? (
            <div className="projects-loading">
              <div className="spinner" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="projects-empty">
              <FolderKanban size={32} />
              <p>Aucun projet</p>
            </div>
          ) : (
            <div className="projects-sidebar-list">
              {filteredProjects.map(function (project) {
                return (
                  <div
                    className={'projects-sidebar-item' + (selectedProject && selectedProject.id === project.id ? ' projects-sidebar-item-active' : '')}
                    key={project.id}
                    onClick={function () { loadProjectDetail(project) }}
                  >
                    <div className="projects-sidebar-item-header">
                      <span className="projects-sidebar-item-name">{project.name}</span>
                      <span className="projects-badge projects-badge-small" style={{
                        backgroundColor: (TYPE_COLORS[project.type] || '#6b7280') + '20',
                        color: TYPE_COLORS[project.type] || '#6b7280',
                        borderColor: (TYPE_COLORS[project.type] || '#6b7280') + '40',
                      }}>
                        {project.type}
                      </span>
                    </div>
                    <div className="projects-sidebar-item-meta">
                      <span><MessageSquare size={11} /> {project.session_count || 0}</span>
                      <span><ClipboardList size={11} /> {project.backlog_count || 0}</span>
                      {project.last_activity && (
                        <span className="projects-sidebar-item-date">{relativeDate(project.last_activity)}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div className="projects-detail">
          {!selectedProject ? (
            <div className="projects-detail-empty">
              <FolderKanban size={48} />
              <p>Sélectionnez un projet</p>
            </div>
          ) : detailLoading ? (
            <div className="projects-loading"><div className="spinner" /></div>
          ) : (
            <>
              {/* Detail header */}
              <div className="projects-detail-header">
                <div>
                  <h2 className="projects-detail-title">{selectedProject.name}</h2>
                  <div className="projects-card-badges" style={{ marginTop: 8 }}>
                    <Tooltip text={"Type: " + selectedProject.type}>
                      <span className="projects-badge" style={{
                        backgroundColor: (TYPE_COLORS[selectedProject.type] || '#6b7280') + '20',
                        color: TYPE_COLORS[selectedProject.type] || '#6b7280',
                        borderColor: (TYPE_COLORS[selectedProject.type] || '#6b7280') + '40',
                      }}>
                        {selectedProject.type}
                      </span>
                    </Tooltip>
                    <Tooltip text={"Statut: " + selectedProject.status}>
                      <span className="projects-badge" style={{
                        backgroundColor: (STATUS_COLORS[selectedProject.status] || '#6b7280') + '20',
                        color: STATUS_COLORS[selectedProject.status] || '#6b7280',
                        borderColor: (STATUS_COLORS[selectedProject.status] || '#6b7280') + '40',
                      }}>
                        {selectedProject.status}
                      </span>
                    </Tooltip>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Tooltip text="Modifier ce projet">
                    <button className="projects-btn" onClick={function () { openEditModal(selectedProject) }}>
                      <Edit3 size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip text="Supprimer ce projet">
                    <button className="projects-btn projects-btn-danger" onClick={function () { setDeleteTarget(selectedProject) }}>
                      <Trash2 size={14} />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* ── Dashboard Summary ── */}
              <div className="projects-summary">
                <div className="projects-summary-progress">
                  <div className="projects-summary-progress-label">
                    <span>Progression</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{summaryStats.pct}%</span>
                  </div>
                  <div className="projects-summary-progress-bar">
                    <div className="projects-summary-progress-fill" style={{ width: summaryStats.pct + '%' }} />
                  </div>
                </div>
                <div className="projects-summary-stats">
                  <div className="projects-summary-stat" style={{ color: '#22c55e' }}>
                    <span className="projects-summary-stat-value">{summaryStats.done}</span>
                    <span className="projects-summary-stat-label">Done</span>
                  </div>
                  <div className="projects-summary-stat" style={{ color: '#3b82f6' }}>
                    <span className="projects-summary-stat-value">{summaryStats.inProgress}</span>
                    <span className="projects-summary-stat-label">En cours</span>
                  </div>
                  <div className="projects-summary-stat" style={{ color: '#6b7280' }}>
                    <span className="projects-summary-stat-value">{summaryStats.pending}</span>
                    <span className="projects-summary-stat-label">Pending</span>
                  </div>
                  <div className="projects-summary-stat" style={{ color: '#ef4444' }}>
                    <span className="projects-summary-stat-value">{summaryStats.blocked}</span>
                    <span className="projects-summary-stat-label">Bloqués</span>
                  </div>
                </div>
                <div className="projects-summary-meta">
                  {lastActivity && (
                    <span><Clock size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />Dernière activité: {relativeDate(lastActivity.toISOString())}</span>
                  )}
                  {selectedProject.created && (
                    <span>Créé {relativeDate(selectedProject.created)}</span>
                  )}
                </div>
              </div>

              {/* Description */}
              {selectedProject.description && (
                <div className="projects-detail-section">
                  <h4>Description</h4>
                  <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                    {selectedProject.description}
                  </p>
                </div>
              )}

              {/* Info row: GitHub + Status */}
              {(selectedProject.github_repo || selectedProject.status) && (
                <div className="projects-detail-section">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                    {selectedProject.github_repo && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}>
                        <GitBranch size={14} style={{ color: 'var(--text-muted)' }} />
                        <a
                          href={'https://github.com/' + selectedProject.github_repo}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {selectedProject.github_repo}
                          <ExternalLink size={12} />
                        </a>
                      </span>
                    )}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)' }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        backgroundColor: STATUS_COLORS[selectedProject.status] || '#6b7280',
                        display: 'inline-block',
                      }} />
                      {selectedProject.status}
                    </span>
                  </div>
                </div>
              )}

              {/* Keywords */}
              {selectedProject.keywords && selectedProject.keywords.length > 0 && (
                <div className="projects-detail-section">
                  <h4><Tag size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Mots-clés</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedProject.keywords.map(function (kw, i) {
                      return <span key={i} className="projects-keyword-tag">{kw}</span>
                    })}
                  </div>
                </div>
              )}

              {/* Sessions - Clickable */}
              <div className="projects-detail-section">
                <h4><MessageSquare size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Sessions liées ({projectSessions.length}){' '}
                  <button onClick={function() { navigate('/sessions') }} className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}>View All</button>
                </h4>
                {projectSessions.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>Aucune session trouvée</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {projectSessions.slice(0, 20).map(function (s, i) {
                      return (
                        <div
                          key={i}
                          className="projects-detail-session-item projects-clickable-item"
                          onClick={function () { openSessionDrawer(s) }}
                        >
                          <div style={{ flex: 1 }}>
                            <div className="projects-detail-session-date">
                              {s.date ? formatDate(s.date) : ''}{s.date && s.platform ? ' · ' : ''}{s.platform || ''}
                            </div>
                            <div className="projects-detail-session-preview">
                              {s.name || s.filename}
                              {s.preview ? ' — ' + s.preview : ''}
                            </div>
                          </div>
                          <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Backlog - Clickable */}
              <div className="projects-detail-section">
                <h4><ClipboardList size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Tâches backlog ({projectBacklog.length}){' '}
                <button onClick={function() { navigate('/backlog') }} className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}>View All</button>
              </h4>
                {projectBacklog.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>Aucune tâche backlog liée</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {projectBacklog.map(function (item) {
                      var stColor = BACKLOG_STATUS_COLORS[item.status] || '#6b7280'
                      var prColor = '#6b7280'
                      if (item.priority === 'haute') prColor = '#ef4444'
                      else if (item.priority === 'basse') prColor = '#22c55e'
                      else if (item.priority === 'normale') prColor = '#3b82f6'

                      return (
                        <div
                          key={item.id}
                          className="projects-detail-backlog-item projects-clickable-item"
                          onClick={function () { openBacklogDrawer(item) }}
                        >
                          <span style={{
                            width: 8, height: 8, borderRadius: '50%',
                            backgroundColor: stColor, flexShrink: 0, display: 'inline-block',
                          }} />
                          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{item.title}</span>
                          <span className="projects-backlog-badge" style={{ backgroundColor: stColor + '20', color: stColor }}>{item.status}</span>
                          {item.priority && <span className="projects-backlog-badge" style={{ backgroundColor: prColor + '20', color: prColor }}>{item.priority}</span>}
                          <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Meta footer */}
              <div className="projects-detail-meta">
                <span>Créé: {formatDate(selectedProject.created)}</span>
                <span>Modifié: {formatDate(selectedProject.updated)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Session Drawer */}
      {sessionDrawer && (
        <div className="drawer-overlay" onClick={closeSessionDrawer}>
          <div className="drawer-panel" onClick={function (e) { e.stopPropagation() }}>
            <div className="drawer-header">
              <h3 className="drawer-title">Session</h3>
              <button className="drawer-close-btn" onClick={closeSessionDrawer}><X size={18} /></button>
            </div>
            <div className="drawer-body">
              <div className="drawer-section">
                <div className="drawer-dates">
                  <div className="drawer-date-row">
                    <span className="drawer-date-label">Date</span>
                    <span className="drawer-date-value">{sessionDrawer.date ? formatDate(sessionDrawer.date) : 'N/A'}</span>
                  </div>
                  <div className="drawer-date-row">
                    <span className="drawer-date-label">Platform</span>
                    <span className="drawer-date-value">{sessionDrawer.platform || 'N/A'}</span>
                  </div>
                  {sessionMessages.length > 0 && (
                    <div className="drawer-date-row">
                      <span className="drawer-date-label">Messages</span>
                      <span className="drawer-date-value">{sessionMessages.length}</span>
                    </div>
                  )}
                </div>
              </div>
              {(sessionDrawer.name || sessionDrawer.filename) && (
                <div className="drawer-section">
                  <h4 className="drawer-section-title">Nom</h4>
                  <div className="drawer-description">{sessionDrawer.name || sessionDrawer.filename}</div>
                </div>
              )}
              {sessionDrawer.preview && (
                <div className="drawer-section">
                  <h4 className="drawer-section-title">Preview</h4>
                  <div className="drawer-description">{sessionDrawer.preview}</div>
                </div>
              )}
              {sessionLoading ? (
                <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" /></div>
              ) : sessionMessages.length > 0 ? (
                <div className="drawer-section">
                  <h4 className="drawer-section-title">Messages ({Math.min(sessionMessages.length, 20)} / {sessionMessages.length})</h4>
                  <div className="projects-session-messages">
                    {sessionMessages.slice(0, 20).map(function (msg, i) {
                      var role = msg.role || msg.type || 'unknown'
                      var content = msg.content || msg.text || msg.message || JSON.stringify(msg)
                      if (typeof content !== 'string') content = JSON.stringify(content)
                      if (content.length > 500) content = content.substring(0, 500) + '...'
                      return (
                        <div key={i} className={'projects-session-msg projects-session-msg-' + role}>
                          <span className="projects-session-msg-role">{role}</span>
                          <span className="projects-session-msg-content">{content}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="drawer-section">
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic' }}>Aucun message disponible</p>
                </div>
              )}
            </div>
            <div className="drawer-actions">
              <button className="btn btn-sm" onClick={function () { navigate('/sessions') }}>
                <ArrowRight size={14} /> Voir toutes les sessions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backlog Drawer */}
      {backlogDrawer && (
        <div className="drawer-overlay" onClick={closeBacklogDrawer}>
          <div className="drawer-panel" onClick={function (e) { e.stopPropagation() }}>
            <div className="drawer-header">
              <h3 className="drawer-title">{backlogDrawer.title}</h3>
              <button className="drawer-close-btn" onClick={closeBacklogDrawer}><X size={18} /></button>
            </div>
            <div className="drawer-body">
              {/* Badges */}
              <div className="drawer-badges">
                <span className="projects-backlog-badge" style={{ backgroundColor: (BACKLOG_STATUS_COLORS[backlogDrawer.status] || '#6b7280') + '20', color: BACKLOG_STATUS_COLORS[backlogDrawer.status] || '#6b7280', padding: '3px 10px', fontSize: 12 }}>
                  {backlogDrawer.status}
                </span>
                {backlogDrawer.priority && (
                  <span className="projects-backlog-badge" style={{ backgroundColor: (backlogDrawer.priority === 'haute' ? '#ef4444' : backlogDrawer.priority === 'basse' ? '#22c55e' : '#3b82f6') + '20', color: backlogDrawer.priority === 'haute' ? '#ef4444' : backlogDrawer.priority === 'basse' ? '#22c55e' : '#3b82f6', padding: '3px 10px', fontSize: 12 }}>
                    {backlogDrawer.priority}
                  </span>
                )}
                {backlogDrawer.category && (
                  <span className="projects-backlog-badge" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', padding: '3px 10px', fontSize: 12 }}>
                    {backlogDrawer.category}
                  </span>
                )}
              </div>

              {/* Description */}
              {backlogDrawer.description && (
                <div className="drawer-section">
                  <h4 className="drawer-section-title">Description</h4>
                  <div className="drawer-description">{backlogDrawer.description}</div>
                </div>
              )}

              {/* Tags */}
              {backlogDrawer.tags && backlogDrawer.tags.length > 0 && (
                <div className="drawer-section">
                  <h4 className="drawer-section-title"><Tag size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Tags</h4>
                  <div className="drawer-tags">
                    {backlogDrawer.tags.map(function (tag, i) {
                      return <span key={i} className="drawer-tag-badge">{tag}</span>
                    })}
                  </div>
                </div>
              )}

              {/* Blocked reason */}
              {backlogDrawer.blocked_reason && (
                <div className="drawer-section">
                  <h4 className="drawer-section-title">Raison du blocage</h4>
                  <div className="drawer-blocked-reason">{backlogDrawer.blocked_reason}</div>
                </div>
              )}

              {/* Dates */}
              <div className="drawer-section">
                <h4 className="drawer-section-title"><Clock size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Dates</h4>
                <div className="drawer-dates">
                  <div className="drawer-date-row">
                    <span className="drawer-date-label">Créé</span>
                    <span className="drawer-date-value">{formatDate(backlogDrawer.created)}</span>
                  </div>
                  {backlogDrawer.done_date && (
                    <div className="drawer-date-row">
                      <span className="drawer-date-label">Terminé</span>
                      <span className="drawer-date-value">{formatDate(backlogDrawer.done_date)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="drawer-actions">
              {backlogDrawer.status !== 'done' && (
                <button className="btn btn-sm" style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }} onClick={function () { handleBacklogMarkDone(backlogDrawer) }}>
                  <Check size={14} /> Mark Done
                </button>
              )}
              {backlogDrawer.status !== 'done' && backlogDrawer.status !== 'waiting-human' && (
                <button className="btn btn-sm" style={{ color: '#22c55e', borderColor: 'rgba(34,197,94,0.3)' }} onClick={function () { handleBacklogLaunch(backlogDrawer) }}>
                  <Play size={14} /> Launch Claude Code
                </button>
              )}
              <button className="btn btn-sm" onClick={function () { navigate('/backlog') }}>
                <ArrowRight size={14} /> View in Backlog
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <div className="projects-modal-overlay" onClick={closeModal}>
          <div className="projects-modal" onClick={function (e) { e.stopPropagation() }}>
            <div className="projects-modal-header">
              <h3>{editingProject ? 'Modifier le projet' : 'Nouveau projet'}</h3>
              <button className="btn btn-sm" onClick={closeModal}><X size={16} /></button>
            </div>
            <div className="projects-form-group">
              <label className="form-label">Nom *</label>
              <input
                className="form-input"
                value={formData.name}
                onChange={function (e) { handleFormChange('name', e.target.value) }}
                placeholder="Nom du projet"
                autoFocus
              />
            </div>
            <div className="projects-form-row">
              <div className="projects-form-group">
                <label className="form-label">Type</label>
                <select className="form-input" value={formData.type} onChange={function (e) { handleFormChange('type', e.target.value) }}>
                  {TYPES.map(function (t) { return <option key={t} value={t}>{t}</option> })}
                </select>
              </div>
              <div className="projects-form-group">
                <label className="form-label">Statut</label>
                <select className="form-input" value={formData.status} onChange={function (e) { handleFormChange('status', e.target.value) }}>
                  {STATUSES.map(function (s) { return <option key={s} value={s}>{s}</option> })}
                </select>
              </div>
            </div>
            <div className="projects-form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={formData.description}
                onChange={function (e) { handleFormChange('description', e.target.value) }}
                placeholder="Description du projet..."
                rows={3}
              />
            </div>
            <div className="projects-form-group">
              <label className="form-label">Repo GitHub</label>
              <input
                className="form-input"
                value={formData.github_repo}
                onChange={function (e) { handleFormChange('github_repo', e.target.value) }}
                placeholder="owner/repo"
              />
            </div>
            <div className="projects-form-group">
              <label className="form-label">Mots-clés (séparés par des virgules)</label>
              <input
                className="form-input"
                value={formData.keywords}
                onChange={function (e) { handleFormChange('keywords', e.target.value) }}
                placeholder="mot1, mot2, mot3"
              />
            </div>
            <div className="projects-form-group">
              <label className="form-label">Tags</label>
              <TagSelector
                selected={formData.tags || []}
                onChange={function (tags) { handleFormChange('tags', tags) }}
              />
            </div>
            <div className="projects-form-actions">
              <button className="btn" onClick={closeModal} disabled={saving}>Annuler</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !formData.name.trim()}>
                {saving ? 'Enregistrement...' : (editingProject ? 'Mettre à jour' : 'Créer')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-detect Modal */}
      {showDetectModal && (
        <div className="projects-modal-overlay" onClick={function () { setShowDetectModal(false) }}>
          <div className="projects-modal" onClick={function (e) { e.stopPropagation() }}>
            <div className="projects-modal-header">
              <h3>Détection automatique</h3>
              <button className="btn btn-sm" onClick={function () { setShowDetectModal(false) }}><X size={16} /></button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              Scanner les sessions, backlog, mémoire et repos GitHub pour détecter des projets existants.
            </p>
            {detectCandidates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button className="btn btn-primary" onClick={runDetection} disabled={detecting}>
                  {detecting ? 'Analyse en cours...' : <><Scan size={14} /> Lancer la détection</>}
                </button>
              </div>
            ) : (
              <>
                <div className="projects-detect-list">
                  {detectCandidates.map(function (c) {
                    var typeColor = TYPE_COLORS[c.type] || '#6b7280'
                    return (
                      <div key={c.id} className={'projects-detect-item' + (selectedCandidates[c.id] ? ' projects-detect-selected' : '')}>
                        <label className="projects-detect-label">
                          <input
                            type="checkbox"
                            checked={!!selectedCandidates[c.id]}
                            onChange={function () { toggleCandidate(c.id) }}
                          />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{c.description}</div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 4, alignItems: 'center' }}>
                              <span className="projects-badge" style={{
                                backgroundColor: typeColor + '20', color: typeColor,
                                borderColor: typeColor + '40', fontSize: 10,
                              }}>
                                {c.type}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Confiance: {Math.round(c.confidence * 100)}%
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                Source: {c.source}
                              </span>
                            </div>
                          </div>
                        </label>
                      </div>
                    )
                  })}
                </div>
                <div className="projects-form-actions">
                  <button className="btn" onClick={function () { setShowDetectModal(false) }}>Annuler</button>
                  <button className="btn btn-primary" onClick={createSelectedCandidates} disabled={saving || selectedCount === 0}>
                    {saving ? 'Création...' : 'Créer ' + selectedCount + ' projet(s) sélectionné(s)'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <ConfirmModal
          title="Supprimer le projet"
          message={'Supprimer "' + (deleteTarget.name || deleteTarget.id) + '" ? Cette action est irréversible.'}
          onConfirm={handleDelete}
          onCancel={function () { setDeleteTarget(null) }}
          danger={true}
          confirmLabel="Supprimer"
        />
      )}
    </div>
  )
}
