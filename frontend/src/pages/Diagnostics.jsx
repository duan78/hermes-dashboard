import { useState } from 'react'
import { Stethoscope, Play, Zap, ChevronDown, ChevronRight, Loader2, CheckCircle, AlertTriangle, XCircle } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './diagnostics.css'

const STATUS_ICON = {
  pass: <CheckCircle size={16} style={{ color: 'var(--success)' }} />,
  warn: <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />,
  fail: <XCircle size={16} style={{ color: 'var(--error)' }} />,
}

export default function Diagnostics() {
  const [checks, setChecks] = useState([])
  const [summary, setSummary] = useState(null)
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [showRaw, setShowRaw] = useState(false)
  const [mode, setMode] = useState(null) // 'quick' | 'full'

  const runQuick = async () => {
    setMode('quick')
    setLoading(true)
    setError(null)
    try {
      const data = await api.quickDiagnostics()
      setChecks(data.checks || [])
      setSummary(data.summary || null)
      setRaw('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const runFull = async () => {
    setMode('full')
    setLoading(true)
    setError(null)
    try {
      const data = await api.runDiagnostics()
      setChecks(data.checks || [])
      setSummary(data.summary || null)
      setRaw(data.raw || '')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // Group checks by category
  const grouped = checks.reduce((acc, c) => {
    const cat = c.category || 'General'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(c)
    return acc
  }, {})

  return (
    <div>
      <div className="page-title">
        <Stethoscope size={28} />
        Diagnostics
        <Tooltip text="Run health checks on your Hermes installation. Quick Check runs fast local tests. Full Diagnostics runs the complete hermes doctor command to verify Python, packages, config, auth, and directories." />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={runQuick} disabled={loading}>
            {loading && mode === 'quick' ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
            Quick Check
          </button>
          <button className="btn btn-sm" onClick={runFull} disabled={loading}>
            {loading && mode === 'full' ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
            Run Full Diagnostics
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading && <div className="spinner" />}

      {!loading && summary && (
        <>
          {/* Summary */}
          <div className="diag-summary">
            <div className="diag-summary-item" style={{ background: 'rgba(16,185,129,0.12)', color: 'var(--success)' }}>
              <CheckCircle size={16} /> {summary.pass} Passed
            </div>
            <div className="diag-summary-item" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
              <AlertTriangle size={16} /> {summary.warn} Warnings
            </div>
            <div className="diag-summary-item" style={{ background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }}>
              <XCircle size={16} /> {summary.fail} Failures
            </div>
          </div>

          {/* Checks grouped by category */}
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="card">
              <div className="card-header">
                <span className="card-title">{category}</span>
              </div>
              {items.map((check, i) => (
                <div key={i} className="diag-check">
                  {STATUS_ICON[check.status]}
                  <div style={{ flex: 1 }}>
                    <div className="diag-check-name">{check.name}</div>
                    <div className="diag-check-message">{check.message}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}

          {/* Raw output */}
          {raw && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  Raw Output
                  <Tooltip text="Unparsed output from hermes doctor. Useful for debugging if the parser missed something." />
                </span>
                <button className="btn btn-sm" onClick={() => setShowRaw(!showRaw)}>
                  {showRaw ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  {showRaw ? 'Hide' : 'Show'}
                </button>
              </div>
              {showRaw && (
                <pre className="diag-raw-output">{raw}</pre>
              )}
            </div>
          )}
        </>
      )}

      {!loading && !summary && (
        <div className="card">
          <div className="empty-state">
            <Stethoscope size={48} style={{ opacity: 0.3 }} />
            <p>Run a diagnostic check to see the health of your Hermes installation.</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Quick Check verifies basic connectivity and file presence. Full Diagnostics runs the complete hermes doctor suite.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
