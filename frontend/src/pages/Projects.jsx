import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, Search, Scan, ExternalLink, Trash2, Edit3, X, GitBranch, MessageSquare, ClipboardList, Tag, ChevronRight, Clock, Check, Play, Loader2, Pencil, ArrowRight, FileText, Link2, BookOpen, Save, Activity } from 'lucide-react'
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

  // Wiki states
  const [projectWiki, setProjectWiki] = useState([])
  const [wikiDrawer, setWikiDrawer] = useState(null)
  const [wikiContent, setWikiContent] = useState('')
  const [wikiEditing, setWikiEditing] = useState(false)
  const [wikiSaving, setWikiSaving] = useState(false)
  const [wikiLoading, setWikiLoading] = useState(false)
  const [newWikiPageName, setNewWikiPageName] = useState('')
  const [showNewWikiPage, setShowNewWikiPage] = useState(false)

  // Links states
  const [projectLinks, setProjectLinks] = useState([])
  const [showAddLink, setShowAddLink] = useState(false)
  const [linkForm, setLinkForm] = useState({ title: '', url: '', category: 'other' })
  const [linkSaving, setLinkSaving] = useState(false)

  // Cross-references
  const [crossRefs, setCrossRefs] = useState(null)

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

    // Reset wiki/links/xref state
    setWikiDrawer(null)
    setWikiEditing(false)
    setShowNewWikiPage(false)

    // Check cache first
    var cached = detailCacheRef.current[project.id]
    if (cached) {
      setProjectSessions(cached.sessions)
      setProjectBacklog(cached.backlog)
      setProjectWiki(cached.wiki || [])
      setProjectLinks(cached.links || [])
      setCrossRefs(cached.xref || null)
      setDetailLoading(false)
      return
    }

    setDetailLoading(true)
    Promise.all([
      api.fetchProjectSessions(project.id).catch(function () { return { sessions: [] } }),
      api.fetchProjectBacklog(project.id).catch(function () { return { items: [] } }),
      api.projectWikiPages(project.id).catch(function () { return { pages: [] } }),
      api.projectLinks(project.id).catch(function () { return { links: [] } }),
      api.crossReferences('project', project.id).catch(function () { return null }),
    ]).then(function (results) {
      var sessions = results[0].sessions || []
      var backlog = results[1].items || []
      var wiki = results[2].pages || []
      var links = results[3].links || []
      var xref = results[4]
      setProjectSessions(sessions)
      setProjectBacklog(backlog)
      setProjectWiki(wiki)
      setProjectLinks(links)
      setCrossRefs(xref)
      detailCacheRef.current[project.id] = { sessions: sessions, backlog: backlog, wiki: wiki, links: links, xref: xref }
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
        toast(editingProject ? 'Project updated' : 'Project created', 'success')
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
        toast('Project deleted', 'success')
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
        toast('Detection error: ' + err.message, 'error')
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
      toast('No project selected', 'error')
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
        toast(toCreate.length + ' project(s) created', 'success')
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
        toast('Claude Code started for: ' + item.title, 'success')
      })
      .catch(function (err) {
        toast('Erreur au lancement : ' + (err.message || 'inconnu'), 'error')
      })
  }

  // Wiki handlers
  function openWikiPage(page) {
    setWikiLoading(true)
    setWikiDrawer(page)
    setWikiEditing(false)
    api.projectWikiPage(selectedProject.id, page.name)
      .then(function (data) {
        setWikiContent(data.content || '')
      })
      .catch(function () {
        setWikiContent('')
      })
      .finally(function () {
        setWikiLoading(false)
      })
  }

  function closeWikiDrawer() {
    setWikiDrawer(null)
    setWikiContent('')
    setWikiEditing(false)
  }

  function handleWikiSave() {
    if (!wikiDrawer) return
    setWikiSaving(true)
    api.projectWikiSave(selectedProject.id, wikiDrawer.name, wikiContent)
      .then(function () {
        toast('Wiki page saved', 'success')
        setWikiEditing(false)
        delete detailCacheRef.current[selectedProject.id]
      })
      .catch(function (err) {
        toast('Erreur sauvegarde: ' + err.message, 'error')
      })
      .finally(function () {
        setWikiSaving(false)
      })
  }

  function handleWikiInit() {
    api.projectWikiInit(selectedProject.id)
      .then(function (data) {
        toast(data.created.length + ' page(s) created', 'success')
        delete detailCacheRef.current[selectedProject.id]
        loadProjectDetail(selectedProject)
      })
      .catch(function (err) {
        toast('Erreur initialisation: ' + err.message, 'error')
      })
  }

  function handleWikiDelete(pageName) {
    api.projectWikiDelete(selectedProject.id, pageName)
      .then(function () {
        toast('Page deleted', 'success')
        closeWikiDrawer()
        delete detailCacheRef.current[selectedProject.id]
        loadProjectDetail(selectedProject)
      })
      .catch(function (err) {
        toast('Erreur suppression: ' + err.message, 'error')
      })
  }

  function handleNewWikiPage() {
    if (!newWikiPageName.trim()) return
    var slug = newWikiPageName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'
    var content = '---\ntitle: ' + newWikiPageName + '\ntags: []\ncreated: ' + new Date().toISOString().split('T')[0] + '\nupdated: ' + new Date().toISOString().split('T')[0] + '\nproject_id: true\n---\n\n# ' + newWikiPageName + '\n\n'
    api.projectWikiSave(selectedProject.id, slug, content)
      .then(function () {
        toast('Page created', 'success')
        setNewWikiPageName('')
        setShowNewWikiPage(false)
        delete detailCacheRef.current[selectedProject.id]
        loadProjectDetail(selectedProject)
      })
      .catch(function (err) {
        toast('Creation error: ' + err.message, 'error')
      })
  }

  // Link handlers
  function handleAddLink() {
    if (!linkForm.title.trim() || !linkForm.url.trim()) {
      toast('Titre et URL requis', 'error')
      return
    }
    setLinkSaving(true)
    api.projectAddLink(selectedProject.id, linkForm)
      .then(function () {
        toast('Link added', 'success')
        setLinkForm({ title: '', url: '', category: 'other' })
        setShowAddLink(false)
        delete detailCacheRef.current[selectedProject.id]
        loadProjectDetail(selectedProject)
      })
      .catch(function (err) {
        toast('Erreur: ' + err.message, 'error')
      })
      .finally(function () {
        setLinkSaving(false)
      })
  }

  function handleDeleteLink(linkId) {
    api.projectDeleteLink(selectedProject.id, linkId)
      .then(function () {
        toast('Link removed', 'success')
        delete detailCacheRef.current[selectedProject.id]
        loadProjectDetail(selectedProject)
      })
      .catch(function (err) {
        toast('Erreur: ' + err.message, 'error')
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
          Projects
          <Tooltip text="Manage and track your projects. Organize work by type, track sessions and backlog tasks." />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Tooltip text="Scan sessions, backlog, and GitHub repos to automatically detect projects">
            <button className="btn btn-sm" onClick={openDetectModal}>
              <Scan size={14} /> Detect
            </button>
          </Tooltip>
          <button className="btn btn-primary" onClick={openCreateModal}>
            <Plus size={14} /> New Project
          </button>
        </div>
      </div>
      <div className="nav-pills" style={{ marginBottom: 12 }}>
        <span className="nav-pill" onClick={function () { navigate('/wiki') }}><BookOpen size={12} /> Wiki</span>
        <span className="nav-pill" onClick={function () { navigate('/activity') }}><Activity size={12} /> Activity</span>
        <span className="nav-pill" onClick={function () { navigate('/sessions') }}><MessageSquare size={12} /> Sessions</span>
        <span className="nav-pill" onClick={function () { navigate('/backlog') }}><ClipboardList size={12} /> Backlog</span>
      </div>

      {/* Filters */}
      <div className="projects-filters">
        <div className="projects-search-wrap">
          <Search size={14} className="projects-search-icon" />
          <input
            className="projects-search-input"
            type="text"
            placeholder="Search projects..."
            value={search}
            onChange={function (e) { setSearch(e.target.value) }}
          />
        </div>
        <select className="projects-filter-select" value={typeFilter} onChange={function (e) { setTypeFilter(e.target.value) }}>
          <option value="">All types</option>
          {TYPES.map(function (t) { return <option key={t} value={t}>{t}</option> })}
        </select>
        <select className="projects-filter-select" value={statusFilter} onChange={function (e) { setStatusFilter(e.target.value) }}>
          <option value="">All statuses</option>
          {STATUSES.map(function (s) { return <option key={s} value={s}>{s}</option> })}
        </select>
        {(typeFilter || statusFilter || search) && (
          <button className="btn btn-sm" onClick={function () { setSearch(''); setTypeFilter(''); setStatusFilter('') }}>
            <X size={14} /> Reset
          </button>
        )}
        <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 13 }}>
          {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
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
            <option value="">Select a project...</option>
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
              <p>No projects yet</p>
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
              <p>Select a project</p>
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
                    <span className="projects-summary-stat-label">Blocked</span>
                  </div>
                </div>
                <div className="projects-summary-meta">
                  {lastActivity && (
                    <span><Clock size={12} style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }} />Last activity: {relativeDate(lastActivity.toISOString())}</span>
                  )}
                  {selectedProject.created && (
                    <span>Created {relativeDate(selectedProject.created)}</span>
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
                  <h4><Tag size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Keywords</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {selectedProject.keywords.map(function (kw, i) {
                      return <span key={i} className="projects-keyword-tag">{kw}</span>
                    })}
                  </div>
                </div>
              )}

              {/* Sessions - Clickable */}
              <div className="projects-detail-section">
                <h4><MessageSquare size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Related Sessions ({projectSessions.length}){' '}
                  <button onClick={function() { navigate('/sessions') }} className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}>View All</button>
                </h4>
                {projectSessions.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>No sessions found</p>
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
                <h4><ClipboardList size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Backlog Tasks ({projectBacklog.length}){' '}
                <button onClick={function() { navigate('/backlog') }} className="btn btn-sm" style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}>Tout voir</button>
              </h4>
                {projectBacklog.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>No backlog tasks linked</p>
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

              {/* Wiki section */}
              <div className="projects-detail-section">
                <h4><BookOpen size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Wiki du projet ({projectWiki.length})</h4>
                {projectWiki.length === 0 ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>Aucune page wiki</p>
                    <button className="btn btn-sm" onClick={handleWikiInit} style={{ fontSize: 11, padding: '2px 8px' }}>
                      Initialiser le wiki
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {projectWiki.map(function (page) {
                      return (
                        <div
                          key={page.name}
                          className="projects-detail-session-item projects-clickable-item"
                          onClick={function () { openWikiPage(page) }}
                        >
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 13, color: 'var(--text-primary)' }}>{page.title}</span>
                            {page.updated && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>{page.updated}</span>}
                          </div>
                          <ChevronRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        </div>
                      )
                    })}
                    <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                      {showNewWikiPage ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                          <input
                            className="form-input"
                            style={{ fontSize: 12, padding: '4px 8px', flex: 1 }}
                            placeholder="Nom de la page..."
                            value={newWikiPageName}
                            onChange={function (e) { setNewWikiPageName(e.target.value) }}
                            onKeyDown={function (e) { if (e.key === 'Enter') handleNewWikiPage() }}
                            autoFocus
                          />
                          <button className="btn btn-sm" onClick={handleNewWikiPage} style={{ fontSize: 11, padding: '2px 8px' }}>Create</button>
                          <button className="btn btn-sm" onClick={function () { setShowNewWikiPage(false); setNewWikiPageName('') }} style={{ fontSize: 11, padding: '2px 8px' }}>Annuler</button>
                        </div>
                      ) : (
                        <button className="btn btn-sm" onClick={function () { setShowNewWikiPage(true) }} style={{ fontSize: 11, padding: '2px 8px' }}>
                          <Plus size={12} /> Nouvelle page
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Links section */}
              <div className="projects-detail-section">
                <h4><Link2 size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Liens ({projectLinks.length})</h4>
                {projectLinks.length === 0 && !showAddLink ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: 13, fontStyle: 'italic', margin: 0 }}>Aucun lien</p>
                    <button className="btn btn-sm" onClick={function () { setShowAddLink(true) }} style={{ fontSize: 11, padding: '2px 8px' }}>
                      <Plus size={12} /> Ajouter
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {projectLinks.map(function (link) {
                      var catIcon = link.category === 'github' ? <GitBranch size={13} />
                        : link.category === 'docs' ? <FileText size={13} />
                        : <ExternalLink size={13} />
                      return (
                        <div key={link.id} className="projects-detail-session-item" style={{ padding: '6px 8px' }}>
                          <a href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13 }}>
                            {catIcon}
                            {link.title}
                            <ExternalLink size={11} style={{ color: 'var(--text-muted)' }} />
                          </a>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{link.category}</span>
                          <button className="projects-btn projects-btn-danger" onClick={function () { handleDeleteLink(link.id) }} style={{ padding: '2px 4px', marginLeft: 4 }}>
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )
                    })}
                    {showAddLink ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                        <input className="form-input" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="Titre" value={linkForm.title} onChange={function (e) { setLinkForm(function (p) { return { ...p, title: e.target.value } }) }} />
                        <input className="form-input" style={{ fontSize: 12, padding: '4px 8px' }} placeholder="https://..." value={linkForm.url} onChange={function (e) { setLinkForm(function (p) { return { ...p, url: e.target.value } }) }} />
                        <select className="form-input" style={{ fontSize: 12, padding: '4px 8px' }} value={linkForm.category} onChange={function (e) { setLinkForm(function (p) { return { ...p, category: e.target.value } }) }}>
                          <option value="github">GitHub</option>
                          <option value="docs">Documentation</option>
                          <option value="other">Autre</option>
                        </select>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" onClick={handleAddLink} disabled={linkSaving} style={{ fontSize: 11, padding: '4px 12px' }}>
                            {linkSaving ? 'Enregistrement...' : 'Ajouter'}
                          </button>
                          <button className="btn btn-sm" onClick={function () { setShowAddLink(false); setLinkForm({ title: '', url: '', category: 'other' }) }} style={{ fontSize: 11, padding: '4px 12px' }}>Annuler</button>
                        </div>
                      </div>
                    ) : (
                      <button className="btn btn-sm" onClick={function () { setShowAddLink(true) }} style={{ fontSize: 11, padding: '2px 8px', marginTop: 2 }}>
                        <Plus size={12} /> Ajouter un lien
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Cross-references / Related */}
              {crossRefs && (crossRefs.wiki_pages.length > 0 || crossRefs.links.length > 0) && (
                <div className="projects-detail-section">
                  <h4><FolderKanban size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Related Entities</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {crossRefs.wiki_pages.map(function (wp) {
                      return (
                        <div key={wp.id} className="projects-detail-session-item" style={{ padding: '4px 8px' }}>
                          <BookOpen size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 13 }}>{wp.title}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>wiki</span>
                        </div>
                      )
                    })}
                    {crossRefs.links.map(function (l) {
                      return (
                        <div key={l.id} className="projects-detail-session-item" style={{ padding: '4px 8px' }}>
                          <Link2 size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                          <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none' }}>{l.title}</a>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.category}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Meta footer */}
              <div className="projects-detail-meta">
                <span>Created: {formatDate(selectedProject.created)}</span>
                <span>Modified: {formatDate(selectedProject.updated)}</span>
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
              <button
                className="btn btn-sm"
                style={{ color: '#a78bfa', borderColor: 'rgba(139,92,246,0.3)' }}
                onClick={function () { closeSessionDrawer(); navigate('/sessions/' + sessionDrawer.id) }}
              >
                <ExternalLink size={14} /> Ouvrir la session
                <Tooltip text="Open this session in detailed view with all messages" />
              </button>
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
                    <span className="drawer-date-label">Created</span>
                    <span className="drawer-date-value">{formatDate(backlogDrawer.created)}</span>
                  </div>
                  {backlogDrawer.done_date && (
                    <div className="drawer-date-row">
                      <span className="drawer-date-label">Completed</span>
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

      {/* Wiki Drawer */}
      {wikiDrawer && (
        <div className="drawer-overlay" onClick={closeWikiDrawer}>
          <div className="drawer-panel" onClick={function (e) { e.stopPropagation() }}>
            <div className="drawer-header">
              <h3 className="drawer-title">{wikiDrawer.title || wikiDrawer.name}</h3>
              <button className="drawer-close-btn" onClick={closeWikiDrawer}><X size={18} /></button>
            </div>
            <div className="drawer-body">
              {wikiLoading ? (
                <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" /></div>
              ) : wikiEditing ? (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <textarea
                    className="form-textarea"
                    style={{ flex: 1, minHeight: 400, fontSize: 13, fontFamily: 'monospace' }}
                    value={wikiContent}
                    onChange={function (e) { setWikiContent(e.target.value) }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary btn-sm" onClick={handleWikiSave} disabled={wikiSaving}>
                      <Save size={14} /> {wikiSaving ? 'Sauvegarde...' : 'Sauvegarder'}
                    </button>
                    <button className="btn btn-sm" onClick={function () { setWikiEditing(false) }}>Annuler</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-primary)', maxHeight: '60vh', overflow: 'auto', padding: '4px 0' }}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {wikiContent.replace(/^---[\s\S]*?---\n*/, '')}
                  </ReactMarkdown>
                </div>
              )}
            </div>
            <div className="drawer-actions">
              {!wikiEditing && (
                <button className="btn btn-sm" onClick={function () { setWikiEditing(true) }}>
                  <Edit3 size={14} /> Modifier
                </button>
              )}
              <button className="btn btn-sm projects-btn-danger" onClick={function () { handleWikiDelete(wikiDrawer.name) }}>
                <Trash2 size={14} /> Supprimer
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
              <label className="form-label">Keywords (comma-separated)</label>
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
                {saving ? 'Saving...' : (editingProject ? 'Update' : 'Create')}
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
              <h3>Auto-detection</h3>
              <button className="btn btn-sm" onClick={function () { setShowDetectModal(false) }}><X size={16} /></button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
              Scan sessions, backlog, memory, and GitHub repos to detect existing projects.
            </p>
            {detectCandidates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <button className="btn btn-primary" onClick={runDetection} disabled={detecting}>
                  {detecting ? 'Analyzing...' : <><Scan size={14} /> Run detection</>}
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
                    {saving ? 'Creating...' : 'Create ' + selectedCount + ' selected project(s)'}
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
          message={'Delete "' + (deleteTarget.name || deleteTarget.id) + '"? This action is irreversible.'}
          onConfirm={handleDelete}
          onCancel={function () { setDeleteTarget(null) }}
          danger={true}
          confirmLabel="Supprimer"
        />
      )}
    </div>
  )
}
