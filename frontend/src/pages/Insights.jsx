import { useState, useEffect } from 'react'
import { BarChart3, RefreshCw } from 'lucide-react'
import { api } from '../api'
import Tooltip from '../components/Tooltip'
import './insights.css'

export default function Insights() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(7)

  const load = async () => {
    try {
      setLoading(true)
      const d = await api.getInsights(days)
      setData(d)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  if (loading) return <div className="spinner" />
  if (error) return <div className="error-box">{error}</div>
  if (!data) return null

  return (
    <div>
      <div className="page-title">
        <BarChart3 size={28} />
        Insights
        <Tooltip text="Usage analytics and activity patterns across all sessions. Shows model usage, platform distribution, tool call frequency, activity timeline, and notable sessions for the selected period." />
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

      {/* Period info */}
      {data.period && (
        <div className="insights-period">{data.period}</div>
      )}

      {/* Overview stat cards */}
      {Object.keys(data.overview).length > 0 && (
        <div className="grid grid-4" style={{ marginBottom: 20 }}>
          {Object.entries(data.overview).map(([key, value]) => (
            <div key={key} className="stat-card">
              <div className="stat-label">
                {key}
                <Tooltip text={`Aggregated metric for the selected ${days}-day period. Computed from all session data across all platforms.`} />
              </div>
              <div className="stat-value">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Models Used */}
      {data.models.length > 0 && (() => {
        const maxTokens = Math.max(...data.models.map(m => {
          const t = parseFloat(String(m.tokens).replace(/,/g, '')) || 0
          return t
        }))
        return (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                Tokens by Model
                <Tooltip text="Visual breakdown of token consumption per model. Bar length represents relative token usage. Use this to identify which models consume the most resources." />
              </span>
            </div>
            <div className="token-charts">
              {data.models.map((m, i) => {
                const tokens = parseFloat(String(m.tokens).replace(/,/g, '')) || 0
                const pct = maxTokens > 0 ? (tokens / maxTokens) * 100 : 0
                return (
                  <div key={i} className="token-chart-row">
                    <div className="token-chart-label">
                      <span className="mono-sm">{m.model}</span>
                      <span className="token-chart-meta">{m.sessions} sessions</span>
                    </div>
                    <div className="token-chart-bar-bg">
                      <div className="token-chart-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="token-chart-values">
                      <span className="token-chart-tokens">{m.tokens}</span>
                      <span className="token-chart-cost">{m.cost}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Platforms */}
      {data.platforms.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Platforms
              <Tooltip text="Usage breakdown by communication platform (CLI, Telegram, Discord, etc.). Shows which platforms are most active and their resource consumption." />
            </span>
          </div>
          <div className="platform-charts">
            {data.platforms.map((p, i) => {
              const maxSessions = Math.max(...data.platforms.map(x => parseInt(x.sessions) || 0))
              const sessions = parseInt(p.sessions) || 0
              const pct = maxSessions > 0 ? (sessions / maxSessions) * 100 : 0
              return (
                <div key={i} className="platform-chart-row">
                  <span className="badge badge-info" style={{ minWidth: 80, justifyContent: 'center' }}>{p.platform}</span>
                  <div className="token-chart-bar-bg">
                    <div className="platform-chart-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="token-chart-tokens">{p.sessions} sess / {p.messages} msg</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Cost Breakdown */}
      {data.models.length > 0 && data.models.some(m => m.cost && m.cost !== 'N/A') && (() => {
        const costs = data.models
          .map(m => ({ model: m.model, cost: parseFloat(String(m.cost).replace(/[$,]/g, '')) || 0 }))
          .filter(c => c.cost > 0)
        const maxCost = Math.max(...costs.map(c => c.cost))
        if (costs.length === 0) return null
        return (
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                Cost Breakdown
                <Tooltip text="Estimated cost per model for the selected period. Based on published per-token pricing. Useful for budgeting and cost optimization." />
              </span>
            </div>
            <div className="cost-breakdown">
              {costs.map((c, i) => (
                <div key={i} className="cost-row">
                  <div className="cost-row-label">
                    <span className="cost-row-model">{c.model}</span>
                  </div>
                  <div className="cost-row-bar-bg">
                    <div className="cost-row-bar-fill" style={{ width: maxCost > 0 ? `${(c.cost / maxCost) * 100}%` : '0%' }} />
                  </div>
                  <span className="cost-row-value">${c.cost.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )
      })()}

      {/* Top Tools */}
      {data.tools.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Top Tools
              <Tooltip text="Most frequently used tools by the AI agent. Shows how often each tool was called and its relative usage percentage. Helps understand the agent's behavior patterns." />
            </span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Tool <Tooltip text="The tool's identifier name. Each tool provides a specific capability to the AI agent." /></th>
                  <th>Calls <Tooltip text="Total number of times this tool was invoked during the period." /></th>
                  <th>Usage <Tooltip text="Percentage of all tool calls attributed to this tool. The bar visually shows the relative frequency." /></th>
                </tr>
              </thead>
              <tbody>
                {data.tools.map((t, i) => {
                  const pct = parseFloat(t.percent) || 0
                  return (
                    <tr key={i}>
                      <td className="mono-sm">{t.tool}</td>
                      <td>{t.calls}</td>
                      <td>
                        <div className="progress-row">
                          <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="progress-label">{t.percent}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activity Patterns */}
      {Object.keys(data.activity.days).length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Activity
              <Tooltip text="Activity pattern by day of the week. The vertical bars show relative message volume per day. Helps identify peak usage days and plan accordingly." />
            </span>
          </div>
          <div className="activity-chart">
            {Object.entries(data.activity.days).map(([day, count]) => {
              const max = Math.max(...Object.values(data.activity.days))
              return (
                <div key={day} className="activity-bar-col">
                  <div className="activity-bar-count">{count}</div>
                  <div className="activity-bar-track">
                    <div
                      className="activity-bar-fill"
                      style={{ height: max > 0 ? `${(count / max) * 100}%` : '0%' }}
                    />
                  </div>
                  <div className="activity-bar-label">{day}</div>
                </div>
              )
            })}
          </div>
          <div className="activity-meta">
            {data.activity.peak_hours && (
              <span>
                Peak hours: {data.activity.peak_hours}
                <Tooltip text="Hours of the day with the highest message volume. Times are in your configured timezone." />
              </span>
            )}
            {data.activity.active_days > 0 && (
              <span>
                Active days: {data.activity.active_days}
                <Tooltip text="Number of days with at least one message exchanged during the selected period." />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Notable Sessions */}
      {data.notable.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Notable Sessions
              <Tooltip text="Sessions that stand out: longest conversation, most messages, highest token usage, most tool calls. These represent edge cases and peak usage patterns." />
            </span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Metric <Tooltip text="What makes this session notable: longest duration, most messages exchanged, most tokens consumed, or most tool calls made." /></th>
                  <th>Value <Tooltip text="The measured value for this metric (duration, count, or cost)." /></th>
                  <th>Detail <Tooltip text="Additional context: which model was used, the session ID, and when it occurred." /></th>
                </tr>
              </thead>
              <tbody>
                {data.notable.map((s, i) => (
                  <tr key={i}>
                    <td className="fw-600">{s.label}</td>
                    <td className="mono-sm">{s.value}</td>
                    <td className="mono-xs text-muted">{s.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Raw Output fallback */}
      {data.raw && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Raw Output
              <Tooltip text="Unparsed CLI output from 'hermes insights'. Shown when structured parsing doesn't capture all the data. Useful for debugging the parser." />
            </span>
          </div>
          <pre className="raw-output">{data.raw}</pre>
        </div>
      )}
    </div>
  )
}
