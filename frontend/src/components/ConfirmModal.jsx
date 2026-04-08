import { useEffect, useRef } from 'react'
import { X, Loader2 } from 'lucide-react'

/**
 * Shared confirmation modal with focus trap and Escape key support.
 *
 * Props:
 *  - title (string, optional): modal heading
 *  - message (string): body text
 *  - onConfirm (function): called when confirm button is clicked
 *  - onCancel (function): called on cancel / overlay click / Escape
 *  - loading (bool, optional): shows spinner on confirm button
 *  - confirmLabel (string, optional, default "Confirm"): confirm button text
 *  - danger (bool, optional, default true): use danger styling on confirm
 */
export default function ConfirmModal({
  title = 'Confirm',
  message,
  onConfirm,
  onCancel,
  loading = false,
  confirmLabel = 'Confirm',
  danger = true,
}) {
  const confirmRef = useRef(null)
  const modalRef = useRef(null)

  // Focus trap + Escape
  useEffect(() => {
    const prev = document.activeElement
    confirmRef.current?.focus()

    function onKeyDown(e) {
      if (e.key === 'Escape') { onCancel(); return }
      // Basic focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (prev) prev.focus()
    }
  }, [onCancel])

  return (
    <div className="modal-overlay" onClick={onCancel} role="dialog" aria-modal="true">
      <div
        className="modal"
        ref={modalRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-sm" onClick={onCancel} style={{ padding: '2px 8px' }} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={loading}>Cancel</button>
          <button
            ref={confirmRef}
            className={`btn ${danger ? 'btn-danger' : ''}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <Loader2 size={14} className="spin" /> : null} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
