import { useState, useEffect, useCallback } from 'react'
import { Key, Eye, EyeOff, Trash2, Edit3, Save, Search, ExternalLink, RefreshCw, Shield, Cpu, Radio, CheckCircle, XCircle, Zap } from 'lucide-react'
import { api } from '../api'
import { useToast } from '../contexts/ToastContext'
import Tooltip from '../components/Tooltip'

const CATEGORY_META = {
  Provider: { icon: Cpu, color: '#6366f1', description: 'LLM provider API keys and endpoints' },
  Tools: { icon: Shield, color: '#10b981', description: 'Tool and integration API keys' },
  Platforms: { icon: Radio, color: '#f59e0b', description: 'Messaging platform bot tokens and config' },
}

// Keys that have a test configuration in the backend
const TESTABLE_KEYS = new Set([
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GLM_API_KEY', 'ZAI_API_KEY',
  'OPENROUTER_API_KEY', 'NVIDIA_API_KEY', 'CEREBRAS_API_KEY', 'GOOGLE_API_KEY',
  'MISTRAL_API_KEY', 'GROQ_API_KEY', 'DEEPSEEK_API_KEY', 'COHERE_API_KEY',
  'TOGETHER_API_KEY', 'ELEVENLABS_API_KEY', 'HASS_TOKEN',
])

export default function ApiKeys() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [revealed, setRevealed] = useState({})
  const [editing, setEditing] = useState({})
  const [editValues, setEditValues] = useState({})
  const [newValues, setNewValues] = useState({})
  const [saving, setSaving] = useState({})
  const [deleting, setDeleting] = useState({})
  const [confirmDelete, setConfirmDelete] = useState(null)
  const { toast } = useToast()
  const [testing, setTesting] = useState({})
  const [testResults, setTestResults] = useState({})

  const handleTest = async (key) => {
    setTesting(prev => ({ ...prev, [key]: true }))
    setTestResults(prev => { const n = { ...prev }; delete n[key]; return n })
    try {
      const result = await api.testApiKey(key)
      setTestResults(prev => ({ ...prev, [key]: result }))
      // Auto-clear after 10 seconds
      setTimeout(() => {
        setTestResults(prev => { const n = { ...prev }; delete n[key]; return n })
      }, 10000)
    } catch (e) {
      setTestResults(prev => ({
        ...prev,
        [key]: { status: 'error', error: e.message },
      }))
      setTimeout(() => {
        setTestResults(prev => { const n = { ...prev }; delete n[key]; return n })
      }, 10000)
    } finally {
      setTesting(prev => ({ ...prev, [key]: false }))
    }
  }

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true)
      const result = await api.getApiKeys()
      setData(result)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { fetchKeys() }, [fetchKeys])

  const handleSave = async (key, value) => {
    setSaving(prev => ({ ...prev, [key]: true }))
    try {
      await api.setApiKey(key, value)
      toast.success(`${key} saved`)
      setEditing(prev => { const n = { ...prev }; delete n[key]; return n })
      setNewValues(prev => { const n = { ...prev }; delete n[key]; return n })
      await fetchKeys()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }

  const handleDelete = async (key) => {
    setDeleting(prev => ({ ...prev, [key]: true }))
    try {
      await api.deleteApiKey(key)
      toast.success(`${key} deleted`)
      setConfirmDelete(null)
      await fetchKeys()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setDeleting(prev => ({ ...prev, [key]: false }))
    }
  }

  const toggleReveal = (key) => {
    setRevealed(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const startEdit = (keyInfo) => {
    setEditing(prev => ({ ...prev, [keyInfo.key]: true }))
    setEditValues(prev => ({ ...prev, [keyInfo.key]: '' }))
  }

  const cancelEdit = (key) => {
    setEditing(prev => { const n = { ...prev }; delete n[key]; return n })
    setEditValues(prev => { const n = { ...prev }; delete n[key]; return n })
  }

  const filterKeys = (keys) => {
    if (!search) return keys
    const q = search.toLowerCase()
    return keys.filter(k =>
      k.key.toLowerCase().includes(q) ||
      k.label.toLowerCase().includes(q) ||
      k.description.toLowerCase().includes(q) ||
      k.subcategory.toLowerCase().includes(q)
    )
  }

  const counts = {
    total: data?.keys?.length || 0,
    set: data?.keys?.filter(k => k.is_set).length || 0,
    missing: data?.keys?.filter(k => !k.is_set).length || 0,
  }

  if (loading && !data) {
    return (
      <div className="page">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Key size={24} />
          <h1 style={{ margin: 0 }}>API Keys</h1>
        </div>
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: 12 }} />
          Loading API keys...
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Key size={24} />
          <div>
            <h1 style={{ margin: 0 }}>API Keys</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Manage all API keys and credentials used by Hermes Agent
            </p>
          </div>
        </div>
        <button className="btn" onClick={fetchKeys} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Refresh
          <Tooltip text="Reload all API keys and their status from the server." />
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{counts.total}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total Keys <Tooltip text="Total number of API keys and credentials tracked by the system across all categories." /></div>
        </div>
        <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#10b981' }}>{counts.set}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Configured <Tooltip text="Keys that have a value set in the environment. These are ready to use." /></div>
        </div>
        <div className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#ef4444' }}>{counts.missing}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Missing <Tooltip text="Keys that are required but not yet configured. Features depending on these keys may not work." /></div>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 24 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text"
          className="form-input"
          placeholder="Search keys by name, label, or description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', paddingLeft: 36, boxSizing: 'border-box' }}
          aria-label="Search API keys"
        />
        <Tooltip text="Filter API keys by name, label, or description. Useful for quickly finding a specific key." />
      </div>

      {/* Categories */}
      {data && search && !Object.entries(CATEGORY_META).some(([catName]) => {
        const categories = data.categories[catName]
        if (!categories) return false
        return Object.values(categories).some(keys => filterKeys(keys).length > 0)
      }) && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-muted)' }}>
          <Search size={32} style={{ marginBottom: 12, opacity: 0.4 }} />
          <p style={{ margin: 0 }}>No keys matching "{search}"</p>
        </div>
      )}
      {data && Object.entries(CATEGORY_META).map(([catName, meta]) => {
        const categories = data.categories[catName]
        if (!categories) return null

        // Filter subcategories
        const filteredSubs = {}
        let hasAny = false
        for (const [sub, keys] of Object.entries(categories)) {
          const filtered = filterKeys(keys)
          if (filtered.length > 0) {
            filteredSubs[sub] = filtered
            hasAny = true
          }
        }
        if (!hasAny) return null

        const CatIcon = meta.icon
        const catKeys = Object.values(filteredSubs).flat()
        const catSet = catKeys.filter(k => k.is_set).length

        return (
          <div key={catName} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <CatIcon size={20} style={{ color: meta.color }} />
              <h2 style={{ margin: 0, fontSize: 18 }}>{catName}</h2>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{meta.description}</span>
              <span className="badge" style={{ marginLeft: 'auto', fontSize: 11 }}>
                {catSet}/{catKeys.length} set
              </span>
            </div>

            {/* Subcategories */}
            {Object.entries(filteredSubs).map(([subName, subKeys]) => (
              <div key={subName} className="card" style={{ padding: 0, marginBottom: 12 }}>
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--border)',
                  fontWeight: 600,
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: 'var(--bg-secondary)',
                }}>
                  {subName}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>
                    {subKeys.filter(k => k.is_set).length}/{subKeys.length} configured
                  </span>
                </div>

                <div style={{ padding: '4px 0' }}>
                  {subKeys.map(keyInfo => (
                    <KeyRow
                      key={keyInfo.key}
                      info={keyInfo}
                      revealed={revealed[keyInfo.key]}
                      editing={editing[keyInfo.key]}
                      editValue={editValues[keyInfo.key] || ''}
                      newValue={newValues[keyInfo.key] || ''}
                      saving={saving[keyInfo.key]}
                      deleting={deleting[keyInfo.key]}
                      confirmDelete={confirmDelete === keyInfo.key}
                      testing={testing[keyInfo.key]}
                      testResult={testResults[keyInfo.key]}
                      canTest={TESTABLE_KEYS.has(keyInfo.key) || keyInfo.key.endsWith('_KEY') || keyInfo.key.endsWith('_TOKEN')}
                      onToggleReveal={() => toggleReveal(keyInfo.key)}
                      onStartEdit={() => startEdit(keyInfo)}
                      onCancelEdit={() => cancelEdit(keyInfo.key)}
                      onEditChange={v => setEditValues(prev => ({ ...prev, [keyInfo.key]: v }))}
                      onNewChange={v => setNewValues(prev => ({ ...prev, [keyInfo.key]: v }))}
                      onSave={v => handleSave(keyInfo.key, v)}
                      onDelete={() => handleDelete(keyInfo.key)}
                      onConfirmDelete={() => setConfirmDelete(keyInfo.key)}
                      onCancelDelete={() => setConfirmDelete(null)}
                      onTest={() => handleTest(keyInfo.key)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}

      {/* Toast handled by global provider */}
    </div>
  )
}

function KeyRow({
  info, revealed, editing, editValue, newValue, saving, deleting, confirmDelete,
  testing, testResult, canTest,
  onToggleReveal, onStartEdit, onCancelEdit, onEditChange, onNewChange,
  onSave, onDelete, onConfirmDelete, onCancelDelete, onTest,
}) {
  const isEditing = editing || !info.is_set

  return (
    <div style={{
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      borderBottom: '1px solid var(--border)',
      flexWrap: 'wrap',
    }}>
      {/* Key name + tooltip */}
      <div style={{ minWidth: 200, flex: '0 0 200px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{info.label}</span>
          <Tooltip text={info.description} iconSize={13} />
          {info.url && (
            <a href={info.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex' }}>
              <ExternalLink size={12} style={{ color: 'var(--text-muted)' }} />
            </a>
          )}
        </div>
        <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>{info.key}</code>
      </div>

      {/* Status badge */}
      <div>
        {info.is_set ? (
          <span className="badge badge-success">Set</span>
        ) : (
          <span className="badge badge-error">Missing</span>
        )}
      </div>

      {/* Value display / input */}
      <div style={{ flex: 1, minWidth: 200 }}>
        {info.is_set && !editing ? (
          /* Show masked/revealed value */
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <code style={{
              fontSize: 12,
              fontFamily: 'monospace',
              color: 'var(--text-secondary)',
              background: 'var(--bg-secondary)',
              padding: '4px 8px',
              borderRadius: 4,
              flex: 1,
            }}>
              {revealed ? info.value_preview : '••••••••••••'}
            </code>
            {info.is_password && (
              <button className="btn btn-sm" onClick={onToggleReveal} title={revealed ? 'Hide' : 'Reveal'} aria-label={revealed ? 'Hide value' : 'Reveal value'}>
                {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            )}
          </div>
        ) : (
          /* Input field */
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type={info.is_password ? 'password' : 'text'}
              className="form-input"
              placeholder={info.is_set ? 'Enter new value...' : `Enter ${info.label}...`}
              value={info.is_set ? editValue : newValue}
              onChange={e => info.is_set ? onEditChange(e.target.value) : onNewChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  const v = info.is_set ? editValue : newValue
                  if (v) onSave(v)
                }
                if (e.key === 'Escape') {
                  if (info.is_set) onCancelEdit()
                }
              }}
              style={{ flex: 1, boxSizing: 'border-box' }}
              autoFocus
            />
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
        {/* Test result badge */}
        {testResult && (
          testResult.status === 'ok' ? (
            <span className="badge badge-success" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <CheckCircle size={12} /> OK {testResult.latency_ms}ms
            </span>
          ) : (
            <Tooltip text={testResult.error || 'Unknown error'}>
              <span className="badge badge-error" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', cursor: 'help', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <XCircle size={12} /> {(testResult.error || 'Error').slice(0, 50)}
              </span>
            </Tooltip>
          )
        )}

        {/* Test button */}
        {canTest && (
          <button
            className="btn btn-sm"
            onClick={onTest}
            disabled={testing}
            title="Test connection"
            style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#8b5cf6' }}
          >
            {testing ? <RefreshCw size={14} className="spin" /> : <Zap size={14} />}
            {testing ? '' : 'Test'}
          </button>
        )}

        {info.is_set && !editing ? (
          <>
            <button className="btn btn-sm" onClick={onStartEdit} title="Edit" aria-label="Edit key">
              <Edit3 size={14} />
            </button>
            {!confirmDelete ? (
              <button className="btn btn-sm" onClick={onConfirmDelete} title="Delete" style={{ color: '#ef4444' }} aria-label="Delete key">
                <Trash2 size={14} />
              </button>
            ) : (
              <>
                <button
                  className="btn btn-sm"
                  onClick={onDelete}
                  disabled={deleting}
                  style={{ color: '#ef4444', fontSize: 11 }}
                >
                  {deleting ? '...' : 'Confirm'}
                </button>
                <button className="btn btn-sm" onClick={onCancelDelete} style={{ fontSize: 11 }}>
                  Cancel
                </button>
              </>
            )}
          </>
        ) : !info.is_set ? (
          <button
            className="btn btn-sm"
            onClick={() => onSave(newValue)}
            disabled={saving || !newValue}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <Save size={14} />
            {saving ? '...' : 'Save'}
          </button>
        ) : (
          <>
            <button
              className="btn btn-sm"
              onClick={() => onSave(editValue)}
              disabled={saving || !editValue}
              style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Save size={14} />
              {saving ? '...' : 'Update'}
            </button>
            <button className="btn btn-sm" onClick={onCancelEdit} style={{ fontSize: 11 }}>
              Cancel
            </button>
          </>
        )}

        {info.url && !info.is_set && (
          <a href={info.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm" title="Get this key">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
    </div>
  )
}
