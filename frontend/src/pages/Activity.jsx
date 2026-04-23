import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, FolderKanban, ClipboardList, FileText, Tag, Cpu } from 'lucide-react'
import { api } from '../api'
import './activity.css'

const ENTITY_ICONS = {
  project: FolderKanban,
  backlog: ClipboardList,
  wiki: FileText,
  tag: Tag,
  system: Cpu,
}

const ENTITY_ROUTES = {
  project: '/projects',
  backlog: '/backlog',
  wiki: '/wiki',
}

const ACTION_LABELS = {
  'project.created': 'Projet créé',
  'project.updated': 'Projet modifié',
  'project.deleted': 'Projet supprimé',
  'backlog.created': 'Tâche créée',
  'backlog.updated': 'Tâche modifiée',
  'backlog.status_changed': 'Statut changé',
  'backlog.deleted': 'Tâche supprimée',
  'wiki.created': 'Page wiki créée',
  'wiki.updated': 'Page wiki modifiée',
}

export default function ActivityPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.getActivity({ limit: 100 }),
  })

  const entries = data?.entries || []

  return (
    <div>
      <h1 className="page-title"><Activity size={24} /> Activité Récente</h1>

      {isLoading && <div className="spinner" />}

      {!isLoading && entries.length === 0 && (
        <div className="empty-state">
          <Activity size={48} />
          <p>Aucune activité enregistrée</p>
        </div>
      )}

      <div className="activity-timeline">
        {entries.map(entry => {
          const Icon = ENTITY_ICONS[entry.entity_type] || Activity
          const actionLabel = ACTION_LABELS[entry.action] || entry.action
          const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString('fr-FR') : ''
          const route = ENTITY_ROUTES[entry.entity_type]
          return (
            <div key={entry.id} className="activity-entry" style={route ? { cursor: 'pointer' } : {}} onClick={route ? () => navigate(route) : undefined}>
              <div className="activity-entry-icon">
                <Icon size={16} />
              </div>
              <div className="activity-entry-content">
                <div className="activity-entry-header">
                  <span className="activity-entry-action">{actionLabel}</span>
                  <span className="activity-entry-time">{time}</span>
                </div>
                {entry.entity_name && (
                  <div className="activity-entry-name">{entry.entity_name}</div>
                )}
                {entry.actor && entry.actor !== 'system' && (
                  <span className="activity-entry-actor">par {entry.actor}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
