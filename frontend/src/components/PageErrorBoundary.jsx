import React from 'react'

class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error(`PageErrorBoundary [${this.props.pageName || 'unknown'}]:`, error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '50vh', padding: '2rem',
          color: 'var(--text-primary, #e2e8f0)'
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 style={{ fontSize: '1.25rem', color: '#f87171', marginBottom: '0.5rem', margin: 0 }}>
            This page encountered an error
          </h2>
          {this.props.pageName && (
            <p style={{ color: 'var(--text-secondary, #94a3b8)', marginBottom: '0.25rem', fontSize: '0.875rem' }}>
              Page: {this.props.pageName}
            </p>
          )}
          <p style={{
            color: 'var(--text-muted, #cbd5e1)', fontFamily: 'monospace', fontSize: '0.8rem',
            background: 'var(--bg-tertiary, rgba(0,0,0,0.3))', padding: '0.6rem 0.8rem',
            borderRadius: '0.375rem', maxWidth: 600, overflow: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: '0.5rem 0 1.25rem'
          }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '0.45rem 1.25rem', background: 'rgba(255,255,255,0.1)',
                color: 'var(--text-primary, #e2e8f0)', border: '1px solid var(--border, rgba(255,255,255,0.1))',
                borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              Try again
            </button>
            <button
              onClick={() => window.location.hash = '#/'}
              style={{
                padding: '0.45rem 1.25rem', background: 'var(--accent, #3b82f6)', color: 'white',
                border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.85rem'
              }}
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/**
 * HOC that wraps a page component with a PageErrorBoundary.
 * Usage: element={withErrorBoundary(MyPage, 'My Page')}
 */
export function withErrorBoundary(Component, pageName) {
  return function BoundedPage(props) {
    return (
      <PageErrorBoundary pageName={pageName}>
        <Component {...props} />
      </PageErrorBoundary>
    )
  }
}

export default PageErrorBoundary
