import { useState, useEffect } from 'react'
import { Wrench, RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

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
        <Tooltip text="All available tools the AI agent can use to interact with the world: execute code, browse the web, read/write files, manage memory, and more. Tools can be enabled or disabled per platform." />
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
                <th>Status <Tooltip text="Whether the tool is currently available for the AI to use. Disabled tools cannot be called even if the agent tries to use them." /></th>
                <th>Name <Tooltip text="The tool's identifier used in function calls. This is the exact name the AI references when invoking a tool." /></th>
                <th>Description <Tooltip text="What the tool does and when the agent uses it. This description is provided to the AI model so it knows when to call each tool." /></th>
                <th>Platform <Tooltip text="Which platform this tool is available on. Some tools are only available on certain platforms (e.g., browser tools may not work on CLI without a display)." /></th>
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
