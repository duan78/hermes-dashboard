/**
 * Shared empty state placeholder.
 *
 * Props:
 *  - icon (ReactNode, optional): lucide icon element
 *  - title (string, optional): heading text
 *  - message (string): description text
 *  - action (ReactNode, optional): action button/link
 */
export default function EmptyState({ icon, title, message, action }) {
  return (
    <div className="empty-state-wrap">
      {icon && <div className="empty-state-icon">{icon}</div>}
      {title && <h3 className="empty-state-title">{title}</h3>}
      <p className="empty-state-msg">{message}</p>
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  )
}
