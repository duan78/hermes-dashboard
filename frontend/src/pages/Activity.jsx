import { useQuery } from '@tanstack/react-query'
import { Activity, FolderKanban, ClipboardList, FileText, Tag, Cpu } from 'lucide-react'
import { api } from '../api'

const ENTITY_ICONS = {
  project: FolderKanban,
  backlog: ClipboardList,
  wiki: FileText,
  tag: Tag,
  system: Cpu,
}

const ACTION_LABELS = {
  'project.created': 'Projet cr\u00e9\u00e9',
  'project.updated': 'Projet modifi\u00e9',
  'project.deleted': 'Projet supprim\u00e9',
  'backlog.created': 'T\u00e2che cr\u00e9\u00e9e',
  'backlog.updated': 'T\u00e2che modifi\u00e9e',
  'backlog.status_changed': 'Statut chang\u00e9',
  'backlog.deleted': 'T\u00e2che supprim\u00e9e',
  'wiki.created': 'Page wiki cr\u00e9\u00e9e',
  'wiki.updated': 'Page wiki modifi\u00e9e',
}

export default function ActivityPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => api.getActivity({ limit: 100 }),
  })

  const entries = data?.entries || []

  return (
    <div>
      <h1 className="page-title"><Activity size={24} /> Activit\u00e9 R\u00e9cente</h1>

      {isLoading && <div className="spinner" />}

      {!isLoading && entries.length === 0 && (
        <div className="empty-state">
          <Activity size={48} />
          <p>Aucune activit\u00e9 enregistr\u00e9e</p>
        </div>
      )}

      <div className="activity-timeline">
        {entries.map(entry => {
          const Icon = ENTITY_ICONS[entry.entity_type] || Activity
          const actionLabel = ACTION_LABELS[entry.action] || entry.action
          const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString('fr-FR') : ''
          return (
            <div key={entry.id} className="activity-entry">
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

      <style>{`
        .activity-timeline { display: flex; flex-direction: column; gap: 0; }
        .activity-entry {
          display: flex; gap: 12px; padding: 12px 0;
          border-bottom: 1px solid var(--border);
        }
        .activity-entry:last-child { border-bottom: none; }
        .activity-entry-icon {
          width: 32px; height: 32px; border-radius: 50%;
          background: var(--accent-bg); color: var(--accent);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .activity-entry-content { flex: 1; min-width: 0; }
        .activity-entry-header {
          display: flex; align-items: center; justify-content: space-between;
        }
        .activity-entry-action {
          font-size: 13px; font-weight: 500; color: var(--text-primary);
        }
        .activity-entry-time {
          font-size: 11px; color: var(--text-muted);
        }
        .activity-entry-name {
          font-size: 12px; color: var(--text-secondary); margin-top: 2px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .activity-entry-actor {
          font-size: 11px; color: var(--text-muted);
        }
      `}</style>
    </div>
  )
}
