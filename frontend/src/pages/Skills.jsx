import { useState, useEffect } from 'react'
import { BookOpen, Search, Trash2, Eye, RefreshCw, Download, Loader2, CheckCircle, XCircle, Shield, FileText, AlertTriangle, ShieldCheck } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import ConfirmModal from '../components/ConfirmModal'

function SecurityTab() {
  const [scanResults, setScanResults] = useState(null)
  const [scanLoading, setScanLoading] = useState(false)
  const [auditEntries, setAuditEntries] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [quarantineItems, setQuarantineItems] = useState([])
  const [quarantineLoading, setQuarantineLoading] = useState(false)
  const [taps, setTaps] = useState([])
  const [tapsLoading, setTapsLoading] = useState(false)
  const [newTapUrl, setNewTapUrl] = useState('')
  const [feedback, setFeedback] = useState(null)

  const showFeedback = (msg, type) => {
    setFeedback({ message: msg, type })
    setTimeout(() => setFeedback(null), 4000)
  }

  const runScan = async () => {
    setScanLoading(true)
    try {
      const data = await api.skillsGuardScan()
      setScanResults(data.results || [])
      showFeedback(`Scan complete: ${data.total} skills checked`, 'success')
    } catch (e) {
      showFeedback('Scan failed: ' + e.message, 'error')
    } finally {
      setScanLoading(false)
    }
  }

  const loadAuditLog = async () => {
    setAuditLoading(true)
    try {
      const data = await api.skillsAuditLog()
      setAuditEntries(data.entries || [])
    } catch (e) {
      showFeedback('Failed to load audit log: ' + e.message, 'error')
    } finally {
      setAuditLoading(false)
    }
  }

  const loadQuarantine = async () => {
    setQuarantineLoading(true)
    try {
      const data = await api.skillsQuarantine()
      setQuarantineItems(data.items || [])
    } catch (e) {
      showFeedback('Failed to load quarantine: ' + e.message, 'error')
    } finally {
      setQuarantineLoading(false)
    }
  }

  const loadTaps = async () => {
    setTapsLoading(true)
    try {
      const data = await api.skillsTaps()
      setTaps(data.taps || [])
    } catch (e) {
      showFeedback('Failed to load taps: ' + e.message, 'error')
    } finally {
      setTapsLoading(false)
    }
  }

  const releaseQuarantine = async (name) => {
    try {
      await api.skillsQuarantineRelease(name)
      showFeedback(`Skill "${name}" released from quarantine`, 'success')
      loadQuarantine()
    } catch (e) {
      showFeedback('Release failed: ' + e.message, 'error')
    }
  }

  const deleteQuarantine = async (name) => {
    try {
      await api.skillsQuarantineDelete(name)
      showFeedback(`Quarantined skill "${name}" deleted`, 'success')
      loadQuarantine()
    } catch (e) {
      showFeedback('Delete failed: ' + e.message, 'error')
    }
  }

  const addTap = async () => {
    if (!newTapUrl.trim()) return
    try {
      const res = await api.skillsTapsAdd(newTapUrl.trim())
      if (res.success) {
        showFeedback(`Tap "${newTapUrl}" added`, 'success')
        setNewTapUrl('')
        loadTaps()
      } else {
        showFeedback(res.message || 'Failed to add tap', 'error')
      }
    } catch (e) {
      showFeedback('Failed to add tap: ' + e.message, 'error')
    }
  }

  const removeTap = async (url) => {
    try {
      const res = await api.skillsTapsRemove(url)
      if (res.success) {
        showFeedback(`Tap "${url}" removed`, 'success')
        loadTaps()
      } else {
        showFeedback(res.message || 'Failed to remove tap', 'error')
      }
    } catch (e) {
      showFeedback('Failed to remove tap: ' + e.message, 'error')
    }
  }

  useEffect(() => {
    loadAuditLog()
    loadQuarantine()
    loadTaps()
  }, [])

  const trustBadge = (level) => {
    const styles = {
      safe: { background: 'var(--success-bg, #d4edda)', color: 'var(--success, #155724)' },
      warning: { background: 'var(--warning-bg, #fff3cd)', color: 'var(--warning, #856404)' },
      danger: { background: 'var(--error-bg, #f8d7da)', color: 'var(--error, #721c24)' },
    }
    const icons = { safe: ShieldCheck, warning: AlertTriangle, danger: AlertTriangle }
    const Icon = icons[level] || Shield
    return (
      <span className="badge" style={{ ...styles[level] || styles.safe, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <Icon size={12} /> {level}
      </span>
    )
  }

  return (
    <div>
      {feedback && <div className={`action-feedback ${feedback.type}`}>{feedback.message}</div>}

      {/* Guard Scan Section */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <Shield size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Guard Scan
            <Tooltip text="Scans all installed skills for security concerns: unverified sources, executable scripts, quarantine status, and trust levels." />
          </span>
          <button className="btn btn-sm btn-primary" onClick={runScan} disabled={scanLoading}>
            {scanLoading ? <Loader2 size={14} className="spin" /> : <Shield size={14} />}
            Scan Skills
          </button>
        </div>
        {scanResults !== null && (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Skill Name <Tooltip text="The name of the scanned skill from the skills directory." /></th>
                  <th>Trust Level <Tooltip text="Safety assessment: safe (verified/builtin), warning (unverified scripts or low trust), danger (quarantined)." /></th>
                  <th>Source <Tooltip text="Where the skill originated: builtin, registry, local, or quarantine." /></th>
                  <th>Warnings <Tooltip text="Specific security concerns found during the scan, such as executable scripts or low trust metadata." /></th>
                </tr>
              </thead>
              <tbody>
                {scanResults.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{r.name}</td>
                    <td>{trustBadge(r.trust)}</td>
                    <td><span className="badge badge-info">{r.source}</span></td>
                    <td>
                      {r.warnings && r.warnings.length > 0
                        ? r.warnings.map((w, j) => <div key={j} style={{ color: 'var(--warning, #856404)', fontSize: 12 }}>{w}</div>)
                        : <span style={{ color: 'var(--text-muted)' }}>None</span>
                      }
                    </td>
                  </tr>
                ))}
                {scanResults.length === 0 && (
                  <tr><td colSpan={4} className="empty-state">No skills scanned yet. Click "Scan Skills" to start.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit Log Section */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <FileText size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Audit Log
            <Tooltip text=" chronological record of security-related actions on skills: installations, removals, quarantine events, and tap changes." />
          </span>
          <button className="btn btn-sm" onClick={loadAuditLog} disabled={auditLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        {auditLoading ? <div className="spinner" style={{ padding: 16 }} /> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Date <Tooltip text="Timestamp when the action occurred." /></th>
                  <th>Action <Tooltip text="The type of security action: install, uninstall, quarantine, release, add_tap, etc." /></th>
                  <th>Skill <Tooltip text="The skill name or resource the action was performed on." /></th>
                  <th>Source <Tooltip text="Where the action originated: dashboard, CLI, or quarantine system." /></th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.map((e, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.date || '-'}</td>
                    <td><span className="badge badge-info">{e.action}</span></td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{e.skill || '-'}</td>
                    <td>{e.source || '-'}</td>
                  </tr>
                ))}
                {auditEntries.length === 0 && (
                  <tr><td colSpan={4} className="empty-state">No audit log entries found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Quarantine Section */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <AlertTriangle size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Quarantine
            <Tooltip text="Skills that have been quarantined due to security concerns. You can release them back to the skills directory or permanently delete them." />
          </span>
          <button className="btn btn-sm" onClick={loadQuarantine} disabled={quarantineLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        {quarantineLoading ? <div className="spinner" style={{ padding: 16 }} /> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Skill Name <Tooltip text="Name of the quarantined skill." /></th>
                  <th>Reason <Tooltip text="Why the skill was quarantined, if available." /></th>
                  <th>Quarantined At <Tooltip text="When the skill was moved to quarantine." /></th>
                  <th>Actions <Tooltip text="Release restores the skill. Delete permanently removes it." /></th>
                </tr>
              </thead>
              <tbody>
                {quarantineItems.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{item.name}</td>
                    <td style={{ color: 'var(--warning, #856404)' }}>{item.reason || '-'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.quarantined_at || '-'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => releaseQuarantine(item.name)}>
                          <Download size={12} /> Release
                        </button>
                        <button className="btn btn-sm btn-danger-icon" onClick={() => deleteQuarantine(item.name)}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {quarantineItems.length === 0 && (
                  <tr><td colSpan={4} className="empty-state">No quarantined skills</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Taps Section */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">
            <ShieldCheck size={16} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            Taps (Sources)
            <Tooltip text="Configured skill source repositories. Add URLs to external skill registries to browse and install skills from additional sources." />
          </span>
          <button className="btn btn-sm" onClick={loadTaps} disabled={tapsLoading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div style={{ padding: '8px 16px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="form-input"
            placeholder="https://github.com/user/skill-repo"
            value={newTapUrl}
            onChange={e => setNewTapUrl(e.target.value)}
            aria-label="New tap URL"
            style={{ flex: 1 }}
          />
          <button className="btn btn-sm btn-primary" onClick={addTap} disabled={!newTapUrl.trim()}>
            Add Tap
          </button>
        </div>
        {tapsLoading ? <div className="spinner" style={{ padding: 16 }} /> : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Source URL <Tooltip text="The URL of the skill registry or repository." /></th>
                  <th>Actions <Tooltip text="Remove this source from the configured taps." /></th>
                </tr>
              </thead>
              <tbody>
                {taps.map((url, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{url}</td>
                    <td>
                      <button className="btn btn-sm btn-danger-icon" onClick={() => removeTap(url)}>
                        <Trash2 size={12} /> Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {taps.length === 0 && (
                  <tr><td colSpan={2} className="empty-state">No taps configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Skills() {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [browseResults, setBrowseResults] = useState('')
  const [selectedSkill, setSelectedSkill] = useState(null)
  const [filter, setFilter] = useState('')
  const [installing, setInstalling] = useState({})
  const [installResult, setInstallResult] = useState({})
  const [confirmModal, setConfirmModal] = useState(null)
  const [activeTab, setActiveTab] = useState('skills')

  const load = async () => {
    try {
      setLoading(true)
      const data = await api.listSkills()
      setSkills(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const browse = async () => {
    try {
      const data = await api.browseSkills(searchQuery)
      setBrowseResults(data.output || '')
    } catch (e) {
      setError(e.message)
    }
  }

  const inspect = async (name) => {
    try {
      const data = await api.inspectSkill(name)
      setSelectedSkill(data)
    } catch (e) {
      setError(e.message)
    }
  }

  const uninstall = (name) => {
    setConfirmModal({
      message: `Uninstall skill "${name}"?`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await api.uninstallSkill(name)
          load()
        } catch (e) {
          setError(e.message)
        }
      }
    })
  }

  const installSkill = async (name) => {
    setInstalling(prev => ({ ...prev, [name]: true }))
    setInstallResult(prev => ({ ...prev, [name]: null }))
    try {
      await api.installSkill(name)
      setInstallResult(prev => ({ ...prev, [name]: 'success' }))
      load()
      setTimeout(() => {
        setInstallResult(prev => ({ ...prev, [name]: null }))
      }, 3000)
    } catch (e) {
      setInstallResult(prev => ({ ...prev, [name]: `error: ${e.message}` }))
    } finally {
      setInstalling(prev => ({ ...prev, [name]: false }))
    }
  }

  // Parse browse results into structured entries
  const parseBrowseResults = (text) => {
    if (!text) return []
    const lines = text.split('\n').filter(l => l.trim())
    const entries = []
    for (const line of lines) {
      // Try to match common patterns: "  skill_name  - description" or numbered lists
      const match = line.match(/^\s*(?:\d+[\.\)]\s*)?(\w[\w\-]*)\s*[-\u2013\u2014:]\s*(.+)/)
      if (match) {
        entries.push({ name: match[1].trim(), description: match[2].trim() })
        continue
      }
      // Also match bullet points
      const bulletMatch = line.match(/^\s*[\*\-\u2022]\s*(\w[\w\-]*)(?:\s*[-\u2013\u2014:]\s*(.+))?/)
      if (bulletMatch) {
        entries.push({ name: bulletMatch[1].trim(), description: bulletMatch[2]?.trim() || '' })
        continue
      }
      // Match lines that are just a skill name (single word, no spaces)
      const simpleMatch = line.match(/^\s*(\w[\w\-]{2,})\s*$/)
      if (simpleMatch) {
        entries.push({ name: simpleMatch[1].trim(), description: '' })
      }
    }
    return entries
  }

  const installedNames = new Set(skills.map(s => s.name))
  const browseEntries = parseBrowseResults(browseResults)

  const categories = [...new Set(skills.map(s => s.category).filter(Boolean))]
  const filtered = skills.filter(s =>
    (!filter || s.category === filter) &&
    (!searchQuery || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  if (selectedSkill) {
    return (
      <div>
        <div className="page-title">
          <BookOpen size={28} />
          Skill: {selectedSkill.name}
          <button className="btn btn-sm" onClick={() => setSelectedSkill(null)} style={{ marginLeft: 'auto' }}>Back</button>
        </div>
        {selectedSkill.skill_md && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                SKILL.md
                <Tooltip text="The skill's documentation file that defines its purpose, usage instructions, and examples. This content is loaded into the AI's context when the skill is activated." />
              </span>
            </div>
            <pre style={{ maxHeight: 500 }}>{selectedSkill.skill_md}</pre>
          </div>
        )}
        {selectedSkill.files && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                Files
                <Tooltip text="All files that make up this skill: prompt templates, scripts, configuration, and documentation. Stored in ~/.hermes/skills/." />
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedSkill.files.map((f, i) => (
                <span key={i} className="badge badge-info">{f}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      {confirmModal && <ConfirmModal title="Confirm" message={confirmModal.message} onConfirm={confirmModal.onConfirm} onCancel={() => setConfirmModal(null)} confirmLabel="Uninstall" />}
      <div className="page-title">
        <BookOpen size={28} />
        Skills ({skills.length})
        <Tooltip text="Installed skills that extend Hermes capabilities. Skills can provide specialized knowledge, custom workflows, or domain-specific tools. Install from the registry or create your own." />
        <button className="btn btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid var(--border)' }}>
        <button
          className="btn btn-sm"
          onClick={() => setActiveTab('skills')}
          style={{
            borderRadius: 0,
            borderBottom: activeTab === 'skills' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -2,
            fontWeight: activeTab === 'skills' ? 700 : 400,
            color: activeTab === 'skills' ? 'var(--primary)' : 'var(--text-muted)',
            background: 'none',
          }}
        >
          <BookOpen size={14} /> Skills
          <Tooltip text="Browse and manage installed skills." />
        </button>
        <button
          className="btn btn-sm"
          onClick={() => setActiveTab('security')}
          style={{
            borderRadius: 0,
            borderBottom: activeTab === 'security' ? '2px solid var(--primary)' : '2px solid transparent',
            marginBottom: -2,
            fontWeight: activeTab === 'security' ? 700 : 400,
            color: activeTab === 'security' ? 'var(--primary)' : 'var(--text-muted)',
            background: 'none',
          }}
        >
          <Shield size={14} /> Security
          <Tooltip text="Security scanning, audit logs, quarantine management, and tap sources for skills." />
        </button>
      </div>

      {activeTab === 'security' ? <SecurityTab /> : (
        <>
          {error && <div className="error-box">{error}</div>}

          {/* Filters */}
          <div className="search-bar">
            <input
              className="form-input"
              placeholder="Search skills..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              aria-label="Search skills"
            />
            <select className="form-select" value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label="Filter by category">
              <option value="">All categories</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="btn" onClick={browse}><Search size={14} /> Browse Online</button>
          </div>

          {browseResults && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-header">
                <span className="card-title">
                  Browse Results
                  <Tooltip text="Skills available in the online registry. Click Install to add them to your Hermes instance." />
                </span>
                <button className="btn btn-sm" onClick={() => { setBrowseResults(''); setInstallResult({}) }}>Close</button>
              </div>
              {browseEntries.length > 0 ? (
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Skill Name</th>
                        <th>Description</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {browseEntries.map(entry => {
                        const isInstalled = installedNames.has(entry.name)
                        const isInstalling = !!installing[entry.name]
                        const result = installResult[entry.name]
                        return (
                          <tr key={entry.name}>
                            <td style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{entry.name}</td>
                            <td style={{ maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {entry.description || '-'}
                            </td>
                            <td>
                              {isInstalled ? (
                                <span className="badge badge-success"><CheckCircle size={12} /> Installed</span>
                              ) : result === 'success' ? (
                                <span className="badge badge-success"><CheckCircle size={12} /> Just installed</span>
                              ) : result?.startsWith('error') ? (
                                <span className="badge badge-error"><XCircle size={12} /> Failed</span>
                              ) : null}
                            </td>
                            <td>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => installSkill(entry.name)}
                                disabled={isInstalling || isInstalled}
                              >
                                {isInstalling ? (
                                  <><Loader2 size={12} className="spin" /> Installing</>
                                ) : isInstalled ? (
                                  <><CheckCircle size={12} /> Installed</>
                                ) : (
                                  <><Download size={12} /> Install</>
                                )}
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <pre style={{ maxHeight: 300 }}>{browseResults}</pre>
              )}
            </div>
          )}

          {loading ? <div className="spinner" /> : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name <Tooltip text="The skill's display name and unique identifier. Click Inspect to view the full skill documentation and files." /></th>
                    <th>Category <Tooltip text="Classification of the skill's domain: coding, productivity, communication, automation, etc. Use the filter dropdown to show only specific categories." /></th>
                    <th>Source <Tooltip text="Where the skill was installed from. 'builtin' comes with Hermes. 'registry' was installed from the online skill hub. 'local' was created manually." /></th>
                    <th>Description <Tooltip text="Brief summary of what the skill does and when it's useful." /></th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(skill => (
                    <tr key={skill.name}>
                      <td style={{ fontWeight: 600 }}>{skill.name}</td>
                      <td><span className="badge badge-info">{skill.category || '-'}</span></td>
                      <td><span className="badge badge-warning">{skill.source}</span></td>
                      <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {skill.description || '-'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => inspect(skill.name)}>
                            <Eye size={12} /> Inspect
                          </button>
                          {skill.source !== 'builtin' && (
                            <button className="btn btn-sm btn-danger" onClick={() => uninstall(skill.name)} aria-label="Uninstall skill">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="empty-state">No skills found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
