import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, X, Trash2, CheckCheck } from 'lucide-react'
import { api } from '../api'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const qc = useQueryClient()

  const { data: stats } = useQuery({
    queryKey: ['notification-stats'],
    queryFn: () => api.getNotificationStats(),
    refetchInterval: 30000,
  })

  const { data: notifs } = useQuery({
    queryKey: ['notifications', { status: 'unread' }],
    queryFn: () => api.getNotifications({ status: 'unread', limit: 20 }),
    enabled: open,
  })

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const unread = stats?.unread || 0

  async function markRead(id) {
    await api.patchNotification(id, { status: 'read' })
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notification-stats'] })
  }

  async function markAllRead() {
    await api.bulkNotifications('mark_read')
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notification-stats'] })
  }

  async function dismiss(id) {
    await api.patchNotification(id, { status: 'dismissed' })
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notification-stats'] })
  }

  async function executeAction(notifId, actionId) {
    await api.patchNotification(notifId, { action_id: actionId })
    qc.invalidateQueries({ queryKey: ['notifications'] })
    qc.invalidateQueries({ queryKey: ['notification-stats'] })
  }

  const typeIcon = {
    action_required: '!',
    info: 'i',
    success: '\u2713',
    warning: '\u26A0',
    error: '\u2717',
  }

  return (
    <div className="notif-bell-container" ref={ref}>
      <button className="notif-bell-btn" onClick={() => setOpen(!open)} title="Notifications">
        <Bell size={18} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span>Notifications</span>
            {unread > 0 && (
              <button className="btn btn-sm" onClick={markAllRead} title="Tout marquer comme lu">
                <CheckCheck size={14} /> Tout lire
              </button>
            )}
          </div>
          <div className="notif-dropdown-list">
            {(!notifs?.items || notifs.items.length === 0) && (
              <div className="notif-empty">Aucune notification non lue</div>
            )}
            {notifs?.items?.map(n => (
              <div key={n.id} className={`notif-item notif-type-${n.type}`}>
                <div className="notif-item-header">
                  <span className="notif-type-badge">{typeIcon[n.type] || 'i'}</span>
                  <span className="notif-item-title">{n.title}</span>
                  <div className="notif-item-actions-top">
                    <button className="notif-icon-btn" onClick={() => markRead(n.id)} title="Marquer comme lu"><Check size={14} /></button>
                    <button className="notif-icon-btn" onClick={() => dismiss(n.id)} title="Ignorer"><X size={14} /></button>
                  </div>
                </div>
                {n.description && <div className="notif-item-desc">{n.description}</div>}
                {n.actions?.length > 0 && (
                  <div className="notif-item-btns">
                    {n.actions.map(a => (
                      <button
                        key={a.id}
                        className={`btn btn-sm ${a.style === 'primary' ? 'btn-primary' : ''}`}
                        onClick={() => executeAction(n.id, a.id)}
                      >
                        {a.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .notif-bell-container { position: relative; }
        .notif-bell-btn {
          background: none; border: none; color: var(--text-secondary);
          cursor: pointer; padding: 4px; position: relative; display: flex;
          align-items: center; justify-content: center;
        }
        .notif-bell-btn:hover { color: var(--text-primary); }
        .notif-badge {
          position: absolute; top: -4px; right: -6px;
          background: var(--error); color: white;
          font-size: 10px; font-weight: 700;
          min-width: 16px; height: 16px;
          border-radius: 8px; display: flex;
          align-items: center; justify-content: center;
          padding: 0 4px;
        }
        .notif-dropdown {
          position: absolute; top: 100%; right: 0;
          width: 380px; max-width: 90vw;
          background: var(--bg-secondary);
          border: 1px solid var(--border);
          border-radius: var(--radius-lg);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          z-index: 500; overflow: hidden;
        }
        .notif-dropdown-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; border-bottom: 1px solid var(--border);
          font-weight: 600; font-size: 14px;
        }
        .notif-dropdown-list {
          max-height: 400px; overflow-y: auto;
        }
        .notif-empty {
          padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;
        }
        .notif-item {
          padding: 12px 16px; border-bottom: 1px solid var(--border);
        }
        .notif-item:last-child { border-bottom: none; }
        .notif-item-header {
          display: flex; align-items: flex-start; gap: 8px;
        }
        .notif-type-badge {
          flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700;
          background: var(--accent-bg); color: var(--accent);
        }
        .notif-type-error .notif-type-badge { background: rgba(239,68,68,0.15); color: var(--error); }
        .notif-type-success .notif-type-badge { background: rgba(16,185,129,0.15); color: var(--success); }
        .notif-type-warning .notif-type-badge { background: rgba(245,158,11,0.15); color: var(--warning); }
        .notif-item-title {
          flex: 1; font-size: 13px; font-weight: 500; color: var(--text-primary);
          line-height: 1.3;
        }
        .notif-item-actions-top {
          display: flex; gap: 4px; flex-shrink: 0;
        }
        .notif-icon-btn {
          background: none; border: none; color: var(--text-muted);
          cursor: pointer; padding: 2px; display: flex; align-items: center;
        }
        .notif-icon-btn:hover { color: var(--text-primary); }
        .notif-item-desc {
          margin-top: 4px; padding-left: 28px;
          font-size: 12px; color: var(--text-secondary); line-height: 1.4;
        }
        .notif-item-btns {
          display: flex; gap: 6px; margin-top: 8px; padding-left: 28px;
        }
      `}</style>
    </div>
  )
}
