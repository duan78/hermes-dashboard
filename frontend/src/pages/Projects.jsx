import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { FolderKanban, Plus, Search, Scan, ExternalLink, Trash2, Edit3, X, GitBranch, MessageSquare, ClipboardList, Tag, RefreshCw } from 'lucide-react'
import { api } from '../api'
import { useToast } from '../contexts/ToastContext'
import ConfirmModal from '../components/ConfirmModal'
import Tooltip from '../components/Tooltip'
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

const TYPES = ['webapp', 'library', 'infra', 'seo', 'research', 'automation', 'other']
const STATUSES = ['active', 'paused', 'archived']

const EMPTY_FORM = {
  name: '',
  type: 'other',
  description: '',
  github_repo: '',
  keywords: '',
  status: 'active',
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
    if (diffDays < 30) return `Il y a ${diffDays}j`
    if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`
    return `Il y a ${Math.floor(diffDays / 365)} an${Math.floor(diffDays / 365) > 1 ? 's' : ''}`
  } catch {
    return dateStr
  }
}

export default function Projects() {
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

  const { toast } = useToast()

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
    setDetailLoading(true)
    Promise.all([
      api.fetchProjectSessions(project.id).catch(function () { return { sessions: [] } }),
      api.fetchProjectBacklog(project.id).catch(function () { return { items: [] } }),
    ]).then(function (results) {
      setProjectSessions(results[0].sessions || [])
      setProjectBacklog(results[1].items || [])
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

      {/* Main content: grid + detail drawer */}
      <div className="projects-layout">
        <div className="projects-grid-wrap">
          {loading ? (
            <div className="projects-loading">
              <div className="spinner" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="projects-empty">
              <FolderKanban size={48} />
              <p>Aucun projet trouvé</p>
              {(typeFilter || statusFilter || search) && (
                <button className="btn btn-sm" onClick={function () { setSearch(''); setTypeFilter(''); setStatusFilter('') }}>
                  Effacer les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="projects-grid">
              {filteredProjects.map(function (project) {
                var typeColor = TYPE_COLORS[project.type] || '#6b7280'
                var statusColor = STATUS_COLORS[project.status] || '#6b7280'
                var isSelected = selectedProject && selectedProject.id === project.id

                return (
                  <div
                    className={'projects-card' + (isSelected ? ' projects-card-selected' : '')}
                    key={project.id}
                    onClick={function () { loadProjectDetail(project) }}
                  >
                    <div className="projects-card-header">
                      <h3 className="projects-card-title">{project.name}</h3>
                      <div className="projects-card-badges">
                        <Tooltip text={"Type: " + project.type}>
                          <span className="projects-badge" style={{ backgroundColor: typeColor + '20', color: typeColor, borderColor: typeColor + '40' }}>
                            {project.type}
                          </span>
                        </Tooltip>
                        <Tooltip text={"Statut: " + project.status}>
                          <span className="projects-badge" style={{ backgroundColor: statusColor + '20', color: statusColor, borderColor: statusColor + '40' }}>
                            {project.status}
                          </span>
                        </Tooltip>
                      </div>
                    </div>

                    {project.description && (
                      <div className="projects-card-desc">{project.description}</div>
                    )}

                    {project.github_repo && (
                      <div className="projects-card-github">
                        <GitBranch size={12} />
                        <a
                          href={'https://github.com/' + project.github_repo}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={function (e) { e.stopPropagation() }}
                        >
                          {project.github_repo}
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    )}

                    <div className="projects-card-stats">
                      <span>
                        <MessageSquare size={12} /> {project.session_count || 0} sessions
                      </span>
                      <span>
                        <ClipboardList size={12} /> {project.backlog_count || 0} tâches
                      </span>
                      {project.last_activity && (
                        <span className="projects-card-date">
                          {relativeDate(project.last_activity)}
                        </span>
                      )}
                    </div>

                    <div className="projects-card-actions">
                      <Tooltip text="Modifier ce projet">
                        <button className="projects-btn" onClick={function (e) { e.stopPropagation(); openEditModal(project) }}>
                          <Edit3 size={14} />
                        </button>
                      </Tooltip>
                      <Tooltip text="Supprimer ce projet">
                        <button className="projects-btn projects-btn-danger" onClick={function (e) { e.stopPropagation(); setDeleteTarget(project) }}>
                          <Trash2 size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail drawer */}
        {selectedProject && (
          <div className="projects-drawer">
            <div className="projects-drawer-header">
              <div>
                <h2 className="projects-drawer-title">{selectedProject.name}</h2>
                <div className="projects-card-badges" style={{ marginTop: 6 }}>
                  <span className="projects-badge" style={{
                    backgroundColor: (TYPE_COLORS[selectedProject.type] || '#6b7280') + '20',
                    color: TYPE_COLORS[selectedProject.type] || '#6b7280',
                    borderColor: (TYPE_COLORS[selectedProject.type] || '#6b7280') + '40',
                  }}>
                    {selectedProject.type}
                  </span>
                  <span className="projects-badge" style={{
                    backgroundColor: (STATUS_COLORS[selectedProject.status] || '#6b7280') + '20',
                    color: STATUS_COLORS[selectedProject.status] || '#6b7280',
                    borderColor: (STATUS_COLORS[selectedProject.status] || '#6b7280') + '40',
                  }}>
                    {selectedProject.status}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <Tooltip text="Modifier">
                  <button className="projects-btn" onClick={function () { openEditModal(selectedProject) }}>
                    <Edit3 size={14} />
                  </button>
                </Tooltip>
                <Tooltip text="Supprimer">
                  <button className="projects-btn projects-btn-danger" onClick={function () { setDeleteTarget(selectedProject) }}>
                    <Trash2 size={14} />
                  </button>
                </Tooltip>
                <Tooltip text="Fermer le panneau">
                  <button className="projects-btn" onClick={function () { setSelectedProject(null) }}>
                    <X size={14} />
                  </button>
                </Tooltip>
              </div>
            </div>

            {detailLoading ? (
              <div className="projects-loading"><div className="spinner" /></div>
            ) : (
              <div className="projects-drawer-body">
                {selectedProject.description && (
                  <div className="projects-drawer-section">
                    <h4>Description</h4>
                    <p>{selectedProject.description}</p>
                  </div>
                )}

                {selectedProject.github_repo && (
                  <div className="projects-drawer-section">
                    <h4>GitHub</h4>
                    <a
                      className="projects-drawer-link"
                      href={'https://github.com/' + selectedProject.github_repo}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <GitBranch size={14} />
                      {selectedProject.github_repo}
                      <ExternalLink size={12} />
                    </a>
                  </div>
                )}

                {selectedProject.keywords && selectedProject.keywords.length > 0 && (
                  <div className="projects-drawer-section">
                    <h4><Tag size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Mots-clés</h4>
                    <div className="projects-drawer-keywords">
                      {selectedProject.keywords.map(function (kw, i) {
                        return <span key={i} className="projects-keyword-tag">{kw}</span>
                      })}
                    </div>
                  </div>
                )}

                <div className="projects-drawer-section">
                  <h4><MessageSquare size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Sessions liées ({projectSessions.length})</h4>
                  {projectSessions.length === 0 ? (
                    <p className="projects-drawer-empty">Aucune session trouvée</p>
                  ) : (
                    <div className="projects-drawer-list">
                      {projectSessions.slice(0, 20).map(function (s, i) {
                        return (
                          <div key={i} className="projects-drawer-list-item">
                            <div className="projects-drawer-list-item-title">{s.name || s.filename}</div>
                            <div className="projects-drawer-list-item-meta">
                              {s.platform && <span>{s.platform}</span>}
                              {s.date && <span>{formatDate(s.date)}</span>}
                            </div>
                            {s.preview && <div className="projects-drawer-list-item-preview">{s.preview}</div>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="projects-drawer-section">
                  <h4><ClipboardList size={14} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Tâches backlog ({projectBacklog.length})</h4>
                  {projectBacklog.length === 0 ? (
                    <p className="projects-drawer-empty">Aucune tâche backlog liée</p>
                  ) : (
                    <div className="projects-drawer-list">
                      {projectBacklog.map(function (item) {
                        var statusColor = '#6b7280'
                        if (item.status === 'done') statusColor = '#22c55e'
                        else if (item.status === 'in-progress') statusColor = '#3b82f6'
                        else if (item.status === 'blocked') statusColor = '#ef4444'
                        else if (item.status === 'waiting-human') statusColor = '#f59e0b'

                        return (
                          <div key={item.id} className="projects-drawer-list-item">
                            <div className="projects-drawer-list-item-title">{item.title}</div>
                            <div className="projects-drawer-list-item-meta">
                              <span style={{ color: statusColor }}>{item.status}</span>
                              {item.priority && <span>{item.priority}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="projects-drawer-section projects-drawer-meta">
                  <span>Créé: {formatDate(selectedProject.created)}</span>
                  <span>Modifié: {formatDate(selectedProject.updated)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
