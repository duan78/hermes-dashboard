import { Link } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      textAlign: 'center',
      padding: 40,
    }}>
      <div style={{
        fontSize: 120,
        fontWeight: 800,
        color: 'var(--accent, #8b5cf6)',
        lineHeight: 1,
        marginBottom: 16,
        opacity: 0.3,
      }}>
        404
      </div>
      <h2 style={{
        fontSize: 20,
        fontWeight: 600,
        color: 'var(--text-primary, #e2e8f0)',
        margin: '0 0 8px',
      }}>
        Page not found
      </h2>
      <p style={{
        color: 'var(--text-secondary, #94a3b8)',
        fontSize: 14,
        margin: '0 0 24px',
        maxWidth: 400,
      }}>
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          className="btn"
          onClick={() => window.history.back()}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <ArrowLeft size={14} /> Go Back
        </button>
        <Link
          to="/"
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
        >
          <Home size={14} /> Overview
        </Link>
      </div>
    </div>
  )
}
