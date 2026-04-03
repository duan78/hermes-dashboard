import { useState, useEffect } from 'react'
import { Wrench, RefreshCw, CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'

export default function Tools() {
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [platformFilter, setPlatformFilter] = useState('')
  const [collapsedPlatforms, setCollapsedPlatforms] = useState({})
  const [togglingTools, setTogglingTools] = useState({})

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

  const platforms = [...new Set(toolEntries.map(t => t.platform))]
  const filtered = platformFilter
    ? toolEntries.filter(t => t.platform === platformFilter)
    : toolEntries

  // Group by platform
  const grouped = {}
  for (const tool of filtered) {
    if (!grouped[tool.platform]) grouped[tool.platform] = []
    grouped[tool.platform].push(tool)
  }

  const togglePlatform = (plat) => {
    setCollapsedPlatforms(prev => ({ ...prev, [plat]: !prev[plat] }))
  }

  const handleToggle = async (toolName, platform, currentlyEnabled) => {
    const key = `${platform}:${toolName}`
    setTogglingTools(prev => ({ ...prev, [key]: true }))
    try {
      if (currentlyEnabled) {
        await api.disableTool(toolName, platform)
      } else {
        await api.enableTool(toolName, platform)
      }
      await load()
    } catch (e) {
      setError(e.message)
    } finally {
      setTogglingTools(prev => {
        const next = { ...prev }
        delete next[key]
        return next
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

      {/* Platform filter tabs */}
      {toolEntries.length > 0 && (
        <div className="tabs" style={{ marginBottom: 16 }}>
          <button
            className={`tab ${!platformFilter ? 'active' : ''}`}
            onClick={() => setPlatformFilter('')}
          >
            All ({toolEntries.length})
          </button>
          {platforms.map(plat => {
            const count = toolEntries.filter(t => t.platform === plat).length
            return (
              <button
                key={plat}
                className={`tab ${platformFilter === plat ? 'active' : ''}`}
                onClick={() => setPlatformFilter(plat)}
              >
                {plat} ({count})
              </button>
            )
          })}
        </div>
      )}

      {toolEntries.length > 0 ? (
        Object.entries(grouped).map(([platform, tools]) => (
          <div key={platform} style={{ marginBottom: 16 }}>
            <button
              className="card"
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                cursor: 'pointer', width: '100%', marginBottom: 0,
                borderBottomLeftRadius: collapsedPlatforms[platform] ? undefined : 0,
                borderBottomRightRadius: collapsedPlatforms[platform] ? undefined : 0,
              }}
              onClick={() => togglePlatform(platform)}
            >
              {collapsedPlatforms[platform] ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
              <span style={{ fontWeight: 600, fontSize: 15, textTransform: 'capitalize' }}>{platform}</span>
              <span className="badge badge-info">{tools.length} tools</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {tools.filter(t => t.enabled).length} enabled
              </span>
            </button>
            {!collapsedPlatforms[platform] && (
              <div className="table-container" style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>
                        Toggle
                        <Tooltip text="Enable or disable this tool. When enabled, the AI agent can use it. When disabled, the tool is hidden from the agent." />
                      </th>
                      <th>Name <Tooltip text="The tool's identifier used in function calls. This is the exact name the AI references when invoking a tool." /></th>
                      <th>Description <Tooltip text="What the tool does and when the agent uses it. This description is provided to the AI model so it knows when to call each tool." /></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((tool) => {
                      const toggleKey = `${platform}:${tool.name}`
                      const isToggling = !!togglingTools[toggleKey]
                      return (
                        <tr key={tool.name}>
                          <td>
                            <button
                              className={`btn btn-sm ${tool.enabled ? 'btn-primary' : ''}`}
                              style={{ minWidth: 80, justifyContent: 'center' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleToggle(tool.name, platform, tool.enabled)
                              }}
                              disabled={isToggling}
                              title={tool.enabled
                                ? 'Click to disable this tool — the agent will no longer be able to use it'
                                : 'Click to enable this tool — the agent will be able to use it'}
                            >
                              {isToggling ? (
                                <Loader2 size={14} className="spin" />
                              ) : tool.enabled ? (
                                <><ToggleRight size={14} /> On</>
                              ) : (
                                <><ToggleLeft size={14} /> Off</>
                              )}
                            </button>
                          </td>
                          <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{tool.name}</td>
                          <td>{tool.description}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
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
