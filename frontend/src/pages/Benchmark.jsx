import { useState, useEffect, useCallback } from 'react'
import { Timer, Zap, Trophy, History, Play, Trash2, ChevronDown, ChevronUp, X, Loader2, RefreshCw, Star } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './Benchmark.css'

const PRESETS = [
  { label: 'TCP vs UDP', prompt: 'Explain the difference between TCP and UDP in 3 points.' },
  { label: 'Quicksort Python', prompt: 'Write a quicksort in Python with comments.' },
  { label: 'React vs Vue', prompt: 'Summarize the pros and cons of React vs Vue.js.' },
]

export default function Benchmark() {
  const [providers, setProviders] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedModels, setSelectedModels] = useState([])
  const [prompt, setPrompt] = useState(PRESETS[0].prompt)
  const [runs, setRuns] = useState(3)
  const [judgeEnabled, setJudgeEnabled] = useState(true)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [ranking, setRanking] = useState([])
  const [history, setHistory] = useState([])
  const [drawerResult, setDrawerResult] = useState(null)
  const [expandedProvider, setExpandedProvider] = useState(null)
  const [historyDetail, setHistoryDetail] = useState(null)

  const fetchProviders = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.benchmarkProviders()
      setProviders(data.providers || [])
      if (data.providers?.length > 0 && !expandedProvider) {
        setExpandedProvider(data.providers[0].name)
      }
    } catch (e) {
      console.error('Failed to fetch providers:', e)
    } finally {
      setLoading(false)
    }
  }, [expandedProvider])

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api.benchmarkHistory()
      setHistory(data.history || [])
    } catch (e) {
      console.error('Failed to fetch history:', e)
    }
  }, [])

  useEffect(() => {
    fetchProviders()
    fetchHistory()
  }, [fetchProviders, fetchHistory])

  const toggleModel = (provider, model) => {
    const key = `${provider}|${model}`
    setSelectedModels(prev =>
      prev.find(m => m.key === key)
        ? prev.filter(m => m.key !== key)
        : [...prev, { key, provider, model }]
    )
  }

  const isSelected = (provider, model) =>
    selectedModels.some(m => m.key === `${provider}|${model}`)

  const toggleProviderAll = (prov) => {
    const provModels = prov.models.map(m => ({
      key: `${prov.name}|${m.id}`,
      provider: prov.name,
      model: m.id,
    }))
    const allSelected = provModels.every(m => selectedModels.some(s => s.key === m.key))
    if (allSelected) {
      setSelectedModels(prev => prev.filter(m => m.provider !== prov.name))
    } else {
      setSelectedModels(prev => {
        const without = prev.filter(m => m.provider !== prov.name)
        return [...without, ...provModels]
      })
    }
  }

  const runBenchmark = async () => {
    if (selectedModels.length === 0 || !prompt.trim()) return
    setRunning(true)
    setResults(null)
    setRanking([])

    try {
      const provMap = {}
      providers.forEach(p => { provMap[p.name] = p })

      const models = selectedModels.map(m => {
        const prov = provMap[m.provider]
        return {
          provider: m.provider,
          model: m.model,
          base_url: prov?.base_url || '',
          api_key_env: prov?.api_key_env || '',
        }
      })

      const data = await api.benchmarkRun({ models, prompt, runs, judge_enabled: judgeEnabled })
      setResults(data.results || [])
      setRanking(data.ranking || [])
      fetchHistory()
    } catch (e) {
      console.error('Benchmark failed:', e)
      alert('Benchmark error: ' + e.message)
    } finally {
      setRunning(false)
    }
  }

  const loadHistoryDetail = async (filename) => {
    try {
      const data = await api.benchmarkHistoryDetail(filename)
      setHistoryDetail(data)
      setResults(data.results || [])
      setRanking(data.ranking || [])
      setPrompt(data.prompt || '')
      if (data.runs) setRuns(data.runs)
      if (data.judge_enabled !== undefined) setJudgeEnabled(data.judge_enabled)
    } catch (e) {
      console.error('Failed to load history:', e)
    }
  }

  const deleteHistoryItem = async (filename) => {
    try {
      await api.benchmarkDelete(filename)
      fetchHistory()
      if (historyDetail?.filename === filename) setHistoryDetail(null)
    } catch (e) {
      console.error('Failed to delete:', e)
    }
  }

  const bestInColumn = (field) => {
    if (!results || results.length === 0) return null
    const valid = results.filter(r => r[field] != null)
    if (valid.length === 0) return null
    if (field === 'avg_time' || field === 'min_time' || field === 'max_time') {
      return valid.reduce((a, b) => a[field] < b[field] ? a : b).model
    }
    if (field === 'composite_score' || field === 'quality_score') {
      return valid.reduce((a, b) => a[field] > b[field] ? a : b).model
    }
    return null
  }

  return (
    <div className="benchmark-page">
      <div className="page-title">
        <Timer size={28} />
        Benchmark
        <Tooltip text="Test and compare response times and quality of available LLMs" />
      </div>

      {/* ── Configuration ── */}
      <div className="bench-section">
        <h3 className="bench-section-title">
          <Zap size={16} />
          Configuration
        </h3>

        {/* Provider & model selection */}
        {loading ? (
          <div className="bench-loading"><Loader2 size={20} className="spin" /> Chargement des providers...</div>
        ) : providers.length === 0 ? (
          <div className="bench-empty">No providers configured. Check your API keys.</div>
        ) : (
          <div className="bench-providers">
            {providers.map(prov => (
              <div key={prov.name} className="bench-provider">
                <div className="bench-provider-header" onClick={() => setExpandedProvider(expandedProvider === prov.name ? null : prov.name)}>
                  <span className="bench-provider-name">{prov.name}</span>
                  <span className="badge badge-info" style={{ fontSize: 10 }}>{prov.models.length} models</span>
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); toggleProviderAll(prov) }} style={{ marginLeft: 8, padding: '2px 8px', fontSize: 10 }}>
                    {prov.models.every(m => isSelected(prov.name, m.id)) ? 'Deselect all' : 'Select all'}
                  </button>
                  {expandedProvider === prov.name ? <ChevronUp size={14} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={14} style={{ marginLeft: 'auto' }} />}
                </div>
                {expandedProvider === prov.name && (
                  <div className="bench-model-grid">
                    {prov.models.map(m => (
                      <label key={m.id} className={`bench-model-chip ${isSelected(prov.name, m.id) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={isSelected(prov.name, m.id)}
                          onChange={() => toggleModel(prov.name, m.id)}
                        />
                        <span className="bench-model-id">{m.id}</span>
                        {m.size && <span className="bench-model-size">({(m.size / 1e9).toFixed(1)}GB)</span>}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Prompt */}
        <div className="bench-prompt-area">
          <div className="bench-prompt-label">
            Prompt
            <div className="bench-presets">
              {PRESETS.map((p, i) => (
                <button key={i} className="btn btn-sm" onClick={() => setPrompt(p.prompt)} title={p.prompt}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="bench-textarea"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={3}
            placeholder="Entrez votre prompt de test..."
          />
        </div>

        {/* Controls */}
        <div className="bench-controls">
          <div className="bench-control-group">
            <Tooltip text="Number of calls per model to calculate average">
              <label className="bench-label">
                Runs
                <select value={runs} onChange={e => setRuns(Number(e.target.value))} className="bench-select">
                  <option value={1}>1</option>
                  <option value={3}>3</option>
                  <option value={5}>5</option>
                </select>
              </label>
            </Tooltip>
          </div>
          <div className="bench-control-group">
            <Tooltip text="Uses gemma4:31b as judge to score response quality">
              <label className="bench-checkbox-label">
                <input type="checkbox" checked={judgeEnabled} onChange={e => setJudgeEnabled(e.target.checked)} />
                Quality Scoring (LLM Judge)
              </label>
            </Tooltip>
          </div>
          <button
            className="btn btn-primary"
            onClick={runBenchmark}
            disabled={running || selectedModels.length === 0 || !prompt.trim()}
          >
            {running ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
            {running ? 'Running benchmark...' : `Run (${selectedModels.length} models)`}
          </button>
        </div>
      </div>

      {/* ── Results ── */}
      {results && results.length > 0 && (
        <div className="bench-section">
          <h3 className="bench-section-title">
            <Trophy size={16} />
            Results
            <span className="badge badge-success" style={{ fontSize: 10, marginLeft: 8 }}>
              70% speed + 30% quality
            </span>
          </h3>
          <div className="bench-table-wrap">
            <table className="bench-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Model</th>
                  <th>Provider</th>
                  {Array.from({ length: Math.max(runs, ...results.map(r => (r.times || []).length)) }, (_, i) => (
                    <th key={i}>Tps {i + 1}</th>
                  ))}
                  <th>Moy.</th>
                  <th>Min</th>
                  <th>Max</th>
                  {(judgeEnabled || results.some(r => r.quality_score != null)) && <th>Quality</th>}
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {results
                  .filter(r => r.avg_time != null)
                  .sort((a, b) => (b.composite_score || 0) - (a.composite_score || 0))
                  .map((r, idx) => {
                    const bestAvg = bestInColumn('avg_time')
                    const bestComposite = bestInColumn('composite_score')
                    const bestQuality = judgeEnabled ? bestInColumn('quality_score') : null
                    return (
                      <tr key={r.model + r.provider} className="bench-row" onClick={() => setDrawerResult(r)}>
                        <td className="bench-rank">
                          {idx === 0 ? <Trophy size={14} style={{ color: '#fbbf24' }} /> : idx + 1}
                        </td>
                        <td className="bench-model-cell">{r.model}</td>
                        <td className="bench-provider-cell">{r.provider}</td>
                        {r.times?.map((t, i) => (
                          <td key={i} className="bench-time">{t.toFixed(2)}s</td>
                        ))}
                        <td className={`bench-time ${bestAvg === r.model ? 'bench-best' : ''}`}>{r.avg_time?.toFixed(2)}s</td>
                        <td className="bench-time">{r.min_time?.toFixed(2)}s</td>
                        <td className="bench-time">{r.max_time?.toFixed(2)}s</td>
                        {judgeEnabled && (
                          <td className={`bench-quality ${bestQuality === r.model ? 'bench-best' : ''}`}>
                            {r.quality_score != null ? (
                              <span>{r.quality_score.toFixed(1)}/10</span>
                            ) : '—'}
                          </td>
                        )}
                        <td className={`bench-composite ${bestComposite === r.model ? 'bench-best' : ''}`}>
                          <span className={r.composite_score >= 8 ? 'bench-score-high' : ''}>
                            {r.composite_score?.toFixed(2) || '—'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                {results.filter(r => r.error).map(r => (
                  <tr key={r.model + r.provider} className="bench-row bench-error-row">
                    <td>—</td>
                    <td className="bench-model-cell">{r.model}</td>
                    <td className="bench-provider-cell">{r.provider}</td>
                    <td colSpan={8} className="bench-error-msg">{r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── History ── */}
      <div className="bench-section">
        <h3 className="bench-section-title">
          <History size={16} />
          Historique
          <Tooltip text="Last 20 benchmark runs">
            <span className="badge badge-info" style={{ fontSize: 10, marginLeft: 8 }}>{history.length}</span>
          </Tooltip>
        </h3>
        {history.length === 0 ? (
          <div className="bench-empty">Aucun benchmark dans l'historique.</div>
        ) : (
          <div className="bench-history-list">
            {history.map(h => (
              <div key={h.filename} className="bench-history-item" onClick={() => loadHistoryDetail(h.filename)}>
                <div className="bench-history-info">
                  <span className="bench-history-date">{h.timestamp?.replace('T', ' ').replace('Z', '')}</span>
                  <span className="bench-history-prompt">{h.prompt || '—'}</span>
                  <span className="bench-history-meta">{h.model_count} models, {h.runs} runs</span>
                </div>
                <div className="bench-history-actions">
                  {h.ranking?.[0] && (
                    <span className="bench-history-winner">
                      <Trophy size={12} style={{ color: '#fbbf24' }} />
                      {h.ranking[0].model}
                    </span>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={e => { e.stopPropagation(); deleteHistoryItem(h.filename) }}
                    title="Supprimer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Drawer ── */}
      {drawerResult && (
        <div className="bench-drawer-overlay" onClick={() => setDrawerResult(null)}>
          <div className="bench-drawer" onClick={e => e.stopPropagation()}>
            <div className="bench-drawer-header">
              <h3>{drawerResult.model}</h3>
              <span className="badge">{drawerResult.provider}</span>
              <button className="btn btn-sm" onClick={() => setDrawerResult(null)}><X size={16} /></button>
            </div>
            <div className="bench-drawer-body">
              <div className="bench-drawer-stats">
                <div className="bench-stat">
                  <span className="bench-stat-label">Temps moyen</span>
                  <span className="bench-stat-value">{drawerResult.avg_time?.toFixed(3)}s</span>
                </div>
                <div className="bench-stat">
                  <span className="bench-stat-label">Min / Max</span>
                  <span className="bench-stat-value">{drawerResult.min_time?.toFixed(3)}s / {drawerResult.max_time?.toFixed(3)}s</span>
                </div>
                <div className="bench-stat">
                  <span className="bench-stat-label">Std Dev</span>
                  <span className="bench-stat-value">{drawerResult.std_dev?.toFixed(3)}s</span>
                </div>
                {drawerResult.quality_score != null && (
                  <div className="bench-stat">
                    <span className="bench-stat-label">Quality</span>
                    <span className="bench-stat-value">{drawerResult.quality_score}/10</span>
                  </div>
                )}
                {drawerResult.composite_score != null && (
                  <div className="bench-stat bench-stat-highlight">
                    <span className="bench-stat-label">Score composite</span>
                    <span className="bench-stat-value">{drawerResult.composite_score}</span>
                  </div>
                )}
              </div>

              {drawerResult.quality_detail && (
                <div className="bench-quality-detail">
                  <h4>Quality Judge</h4>
                  <div className="bench-quality-bars">
                    {['precision', 'completude', 'clarte'].map(k => (
                      <div key={k} className="bench-quality-bar-row">
                        <span className="bench-quality-bar-label">{k}</span>
                        <div className="bench-quality-bar-bg">
                          <div className="bench-quality-bar-fill" style={{ width: `${(drawerResult.quality_detail[k] || 0) * 10}%` }} />
                        </div>
                        <span className="bench-quality-bar-val">{drawerResult.quality_detail[k]}/10</span>
                      </div>
                    ))}
                  </div>
                  {drawerResult.quality_detail.commentaire && (
                    <p className="bench-quality-comment">{drawerResult.quality_detail.commentaire}</p>
                  )}
                </div>
              )}

              <div className="bench-responses">
                <h4>Responses ({drawerResult.responses?.length || 0})</h4>
                {drawerResult.responses?.map((resp, i) => (
                  <div key={i} className="bench-response-block">
                    <span className="bench-response-run">Run {i + 1} — {drawerResult.times?.[i]?.toFixed(3)}s</span>
                    <pre className="bench-response-text">{resp}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
