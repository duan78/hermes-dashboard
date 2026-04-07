import { createContext, useContext, useState, useCallback, useRef } from 'react'

const ToastContext = createContext(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, message, type }])
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, duration)
    }
    return id
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message, type, duration) => addToast(message, type, duration), [addToast])
  toast.success = (msg, dur) => addToast(msg, 'success', dur)
  toast.error = (msg, dur) => addToast(msg, 'error', dur)
  toast.warning = (msg, dur) => addToast(msg, 'warning', dur)
  toast.info = (msg, dur) => addToast(msg, 'info', dur)

  return (
    <ToastContext.Provider value={{ toast, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  )
}

const ICONS = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
}

function ToastContainer({ toasts, onRemove }) {
  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      maxWidth: 380,
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 500,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            animation: 'toast-in 0.25s ease-out',
            cursor: 'default',
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>{ICONS[t.type] || ''}</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => onRemove(t.id)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              opacity: 0.6,
              cursor: 'pointer',
              padding: 0,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            {'\u00D7'}
          </button>
        </div>
      ))}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .toast-success { background: #065f46; color: #d1fae5; border: 1px solid #10b981; }
        .toast-error { background: #7f1d1d; color: #fecaca; border: 1px solid #ef4444; }
        .toast-warning { background: #78350f; color: #fef3c7; border: 1px solid #f59e0b; }
        .toast-info { background: #1e3a5f; color: #bfdbfe; border: 1px solid #3b82f6; }
      `}</style>
    </div>
  )
}
