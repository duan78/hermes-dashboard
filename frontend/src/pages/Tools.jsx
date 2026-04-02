import { useState, useEffect } from 'react'
import { Wrench, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../api'

export default function Tools() {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listTools()
      setOutput(data.output || '')
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Parse the tools output
  const lines = output.split('\n')
  const toolEntries = []
  let currentPlatform = 'cli'

  for (const line of lines) {
    const platMatch = line.match(/Built-in toolsets \((\w+)\)/)
    if (platMatch) currentPlatform = platMatch[1]

    const match = line.match(/([✓✗])\s+(enabled|disabled)\s+(\w+)\s+(.+)/)
    if (match) {
      toolEntries.push({
        enabled: match[1] === '✓',
        name: match[3],
        description: match[4].trim(),
        platform: currentPlatform,
      })
    }
  }

  return (
    <div>
      <div className="page-title">
        <Wrench size={28} />
        Tools
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      {toolEntries.length > 0 ? (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Description</th>
                <th>Platform</th>
              </tr>
            </thead>
            <tbody>
              {toolEntries.map((tool, i) => (
                <tr key={i}>
                  <td>
                    <span className={`badge ${tool.enabled ? 'badge-success' : 'badge-error'}`}>
                      {tool.enabled ? <CheckCircle size={12} /> : <XCircle size={12} />}
                      {tool.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tool.name}</td>
                  <td>{tool.description}</td>
                  <td><span className="badge badge-info">{tool.platform}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : loading ? (
        <div className="spinner" />
      ) : (
        <div className="card">
          <pre>{output}</pre>
        </div>
      )}
    </div>
  )
}
