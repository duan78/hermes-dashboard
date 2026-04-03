import { useState, useEffect, useCallback, useRef } from 'react'
import { Network, RefreshCw, Plus, Trash2, Zap, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './mcp-servers.css'

function ConfirmModal({ title, message, onConfirm, onCancel, loading }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn btn-sm" onClick={onCancel} style={{ padding: '2px 8px' }}><X size={16} /></button>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>{message}</p>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 size={14} className="spin" /> : null} Remove
          </button>
        </div>
      </div>
    </div>
  )
}

export default function McpServers() {
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const feedbackTimer = useRef(null)

  // Add form
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('stdio')
  const [formCommand, setFormCommand] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formArgs, setFormArgs] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  // Actions
  const [testLoading, setTestLoading] = useState({})
  const [removeTarget, setRemoveTarget] = useState(null)
  const [removeLoading, setRemoveLoading] = useState(false)

  // Expanded
  const [expanded, setExpanded] = useState(new Set())

  const showFeedback = (msg, type) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current)
    setFeedback({ message: msg, type })
    feedbackTimer.current = setTimeout(() => setFeedback(null), 4000)
  }

  const loadServers = useCallback(async () => {
    try {
      const data = await api.mcpList()
      setServers(data.servers || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadServers() }, [loadServers])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!formName.trim()) return
    setFormLoading(true)
    try {
      const body = { name: formName.trim(), type: formType }
      if (formType === 'stdio') {
        body.command = formCommand
        if (formArgs.trim()) body.args = formArgs.trim().split(/\s+/)
      } else {
        body.url = formUrl
      }
      await api.mcpAdd(body)
      showFeedback(`Server "${formName.trim()}" added`, 'success')
      setFormName(''); setFormCommand(''); setFormUrl(''); setFormArgs('')
      setShowForm(false)
      loadServers()
    } catch (e) {
      showFeedback(`Failed to add: ${e.message}`, 'error')
    } finally {
      setFormLoading(false)
    }
  }

  const handleTest = async (name) => {
    setTestLoading(prev => ({ ...prev, [name]: true }))
    try {
      const result = await api.mcpTest(name)
      showFeedback(result.success !== false
        ? `Server "${name}" connection successful`
        : `Server "${name}" test failed: ${result.error || 'Unknown error'}`,
        result.success !== false ? 'success' : 'error'
      )
    } catch (e) {
      showFeedback(`Test failed: ${e.message}`, 'error')
    } finally {
      setTestLoading(prev => ({ ...prev, [name]: false }))
    }
  }

  const handleRemove = async () => {
    setRemoveLoading(true)
    try {
      await api.mcpRemove(removeTarget)
      showFeedback(`Server "${removeTarget}" removed`, 'success')
      setRemoveTarget(null)
      loadServers()
    } catch (e) {
      showFeedback(`Remove failed: ${e.message}`, 'error')
    } finally {
      setRemoveLoading(false)
    }
  }

  const toggleExpand = (name) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (loading) return <div className="spinner" />

  return (
    <div>
      <div className="page-title">
        <Network size={28} />
        MCP Servers
        <Tooltip text="Manage Model Context Protocol servers. Add MCP servers to extend Hermes with external tools and data sources." />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-sm btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} /> Add Server
          </button>
          <button className="btn btn-sm" onClick={loadServers}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {feedback && (
        <div className={`action-feedback ${feedback.type}`}>
          {feedback.message}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Add MCP Server</span>
            <button className="btn btn-sm" onClick={() => setShowForm(false)}><X size={14} /></button>
          </div>
          <form className="mcp-form" onSubmit={handleAdd}>
            <div className="mcp-form-row">
              <label className="mcp-label">Name</label>
              <input type="text" className="form-input" placeholder="my-server" value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div className="mcp-form-row">
              <label className="mcp-label">Type</label>
              <select className="form-select" value={formType} onChange={e => setFormType(e.target.value)}>
                <option value="stdio">stdio</option>
                <option value="sse">sse</option>
                <option value="streamable-http">streamable-http</option>
              </select>
            </div>
            {formType === 'stdio' ? (
              <>
                <div className="mcp-form-row">
                  <label className="mcp-label">Command</label>
                  <input type="text" className="form-input" placeholder="npx -y @modelcontextprotocol/server-filesystem" value={formCommand} onChange={e => setFormCommand(e.target.value)} />
                </div>
                <div className="mcp-form-row">
                  <label className="mcp-label">Args <span style={{ fontWeight: 400, fontSize: 11 }}>(space-separated, optional)</span></label>
                  <input type="text" className="form-input" placeholder="/path/to/dir" value={formArgs} onChange={e => setFormArgs(e.target.value)} />
                </div>
              </>
            ) : (
              <div className="mcp-form-row">
                <label className="mcp-label">URL</label>
                <input type="text" className="form-input" placeholder="http://localhost:3000/mcp" value={formUrl} onChange={e => setFormUrl(e.target.value)} />
              </div>
            )}
            <div className="mcp-form-actions">
              <button className="btn btn-primary" type="submit" disabled={formLoading || !formName.trim()}>
                {formLoading ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                Add Server
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Server list */}
      {servers.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <Network size={48} style={{ opacity: 0.3 }} />
            <p>No MCP servers configured</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              Add an MCP server to extend Hermes with external tools.
            </p>
          </div>
        </div>
      ) : (
        <div className="mcp-grid">
          {servers.map(s => (
            <div key={s.name} className="mcp-card">
              <div className="mcp-card-header">
                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flex: 1 }} onClick={() => toggleExpand(s.name)}>
                  {expanded.has(s.name) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <div className="mcp-server-name">{s.name}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="mcp-type-badge">{s.type}</span>
                  <span className="mcp-transport-badge">{s.transport}</span>
                </div>
              </div>

              {expanded.has(s.name) && s.tools && s.tools.length > 0 && (
                <div className="mcp-tools-section">
                  <div className="mcp-tools-title">Available Tools ({s.tools.length})</div>
                  <div className="mcp-tools-list">
                    {s.tools.map((tool, i) => (
                      <span key={i} className="mcp-tool-tag">{typeof tool === 'string' ? tool : tool.name}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mcp-card-actions">
                <Tooltip text="Test server connectivity">
                  <button className="btn btn-sm" onClick={() => handleTest(s.name)} disabled={!!testLoading[s.name]}>
                    {testLoading[s.name] ? <Loader2 size={14} className="spin" /> : <Zap size={14} />}
                    Test
                  </button>
                </Tooltip>
                <Tooltip text="Remove server">
                  <button className="btn btn-sm btn-danger-icon" onClick={() => setRemoveTarget(s.name)}>
                    <Trash2 size={14} /> Remove
                  </button>
                </Tooltip>
              </div>
            </div>
          ))}
        </div>
      )}

      {removeTarget && (
        <ConfirmModal
          title="Remove Server"
          message={`Are you sure you want to remove the MCP server "${removeTarget}"?`}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
          loading={removeLoading}
        />
      )}
    </div>
  )
}
