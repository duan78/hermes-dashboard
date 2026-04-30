import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, FolderKanban, ClipboardList, FileText, Tag, Cpu, MessageSquare } from 'lucide-react'
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
  'project.created': 'Project created',
  'project.updated': 'Project updated',
  'project.deleted': 'Project deleted',
  'backlog.created': 'Task created',
  'backlog.updated': 'Task updated',
  'backlog.status_changed': 'Status changed',
  'backlog.deleted': 'Task deleted',
  'wiki.created': 'Wiki page created',
  'wiki.updated': 'Wiki page updated',
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
      <h1 className="page-title"><Activity size={24} /> Recent Activity</h1>
      <div className="nav-pills" style={{ marginBottom: 16 }}>
        <span className="nav-pill" onClick={() => navigate('/projects')}><FolderKanban size={12} /> Projects</span>
        <span className="nav-pill" onClick={() => navigate('/backlog')}><ClipboardList size={12} /> Backlog</span>
        <span className="nav-pill" onClick={() => navigate('/wiki')}><FileText size={12} /> Wiki</span>
        <span className="nav-pill" onClick={() => navigate('/sessions')}><MessageSquare size={12} /> Sessions</span>
      </div>

      {isLoading && <div className="spinner" />}

      {!isLoading && entries.length === 0 && (
        <div className="empty-state">
          <Activity size={48} />
          <p>No activity recorded</p>
        </div>
      )}

      <div className="activity-timeline">
        {entries.map(entry => {
          const Icon = ENTITY_ICONS[entry.entity_type] || Activity
          const actionLabel = ACTION_LABELS[entry.action] || entry.action
          const time = entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-US') : ''
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
                  <span className="activity-entry-actor">by {entry.actor}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
