import { RefreshCw } from 'lucide-react'
import Tooltip from './Tooltip'

/**
 * Shared page header with icon, title, tooltip, and optional action buttons.
 *
 * Props:
 *  - icon (ReactNode): lucide icon element
 *  - title (string): page title
 *  - tooltip (string, optional): tooltip text
 *  - actions (ReactNode, optional): right-side action buttons
 *  - onRefresh (function, optional): refresh callback
 */
export default function PageHeader({ icon, title, tooltip, actions, onRefresh }) {
  return (
    <div className="page-title">
      {icon}
      {title}
      {tooltip && <Tooltip text={tooltip} />}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        {onRefresh && (
          <button className="btn btn-sm" onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        )}
        {actions}
      </div>
    </div>
  )
}
