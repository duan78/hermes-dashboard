import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', minHeight: '100vh', padding: '2rem',
          background: 'var(--bg-primary, #0f172a)', color: 'var(--text-primary, #e2e8f0)', fontFamily: 'sans-serif'
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h1 style={{ fontSize: '1.5rem', color: '#f87171', marginBottom: '0.5rem', margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '0.75rem', textAlign: 'center', maxWidth: 420 }}>
            An unexpected error occurred in the application.
          </p>
          <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', fontFamily: 'monospace', fontSize: '0.875rem', background: 'rgba(0,0,0,0.3)', padding: '0.75rem 1rem', borderRadius: '0.5rem', maxWidth: 600, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '0.5rem 1.5rem', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem'
              }}
            >
              Try again
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '0.5rem 1.5rem', background: '#3b82f6', color: 'white',
                border: 'none', borderRadius: '0.375rem', cursor: 'pointer', fontSize: '0.875rem'
              }}
            >
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
