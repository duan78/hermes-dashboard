import { useState, useEffect } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { api } from '../api'

export default function Insights() {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(7)

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.getInsights(days)
      setOutput(data.output || '')
      setError(data.error || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  return (
    <div>
      <div className="page-title">
        <BarChart3 size={28} />
        Insights
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-select" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 'auto' }}>
            <option value={1}>1 day</option>
            <option value={7}>7 days</option>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
          </select>
          <button className="btn btn-sm" onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {loading ? <div className="spinner" /> : (
        <div className="card">
          <pre style={{ whiteSpace: 'pre-wrap' }}>{output}</pre>
        </div>
      )}
    </div>
  )
}
