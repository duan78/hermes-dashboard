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

      {/* Hourly Activity Heatmap */}
      {data.hourly_activity && data.hourly_activity.some(v => v > 0) && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Activity by Hour
              <Tooltip text="Heatmap showing message activity per hour of the day (0-23). Taller bars indicate busier hours. Helps identify when the agent is most active." />
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80, padding: '0 4px' }}>
            {data.hourly_activity.map((count, i) => {
              const max = Math.max(...data.hourly_activity, 1)
              const h = Math.max((count / max) * 70, 2)
              const isHot = count > max * 0.6
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>{count || ''}</div>
                  <div style={{
                    background: isHot ? 'var(--accent)' : count > 0 ? 'var(--info)' : 'var(--border)',
                    height: h,
                    borderRadius: 2,
                    transition: 'height 0.2s',
                    opacity: count > 0 ? 1 : 0.3,
                  }} />
                  <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>{i}h</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top Skills */}
      {data.top_skills && data.top_skills.length > 0 && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              Top 10 Skills Used
              <Tooltip text="Most frequently invoked tools/skills by the AI agent. Shows which capabilities are most relied upon." />
            </span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Skill <Tooltip text="Tool or skill identifier name." /></th>
                  <th>Calls <Tooltip text="Number of times this skill was invoked." /></th>
                  <th>Usage <Tooltip text="Relative usage compared to other skills." /></th>
                </tr>
              </thead>
              <tbody>
                {data.top_skills.map((s, i) => {
                  const maxCalls = Math.max(...data.top_skills.map(x => x.count))
                  const pct = maxCalls > 0 ? (s.count / maxCalls) * 100 : 0
                  return (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{s.skill}</td>
                      <td>{s.count}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ background: 'var(--bg-tertiary)', borderRadius: 4, height: 6, flex: 1, overflow: 'hidden' }}>
                            <div style={{ background: 'var(--accent)', height: '100%', width: `${pct}%`, borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 40 }}>{pct.toFixed(0)}%</span>
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

      {/* Avg Response Time */}
      {data.avg_response_seconds > 0 && (
        <div className="grid grid-2" style={{ marginBottom: 0 }}>
          <div className="stat-card">
            <div className="stat-label">
              Avg Response Time
              <Tooltip text="Average time between a user message and the AI response. Calculated from all sessions in the selected period." />
            </div>
            <div className="stat-value">{data.avg_response_seconds}s</div>
            <div className="stat-detail">Average first-response latency</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">
              Messages by Platform
              <Tooltip text="Total messages sent/received broken down by communication platform." />
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
              {Object.entries(data.platform_messages || {}).map(([p, c]) => (
                <span key={p} className="badge badge-info" style={{ fontSize: 11 }}>{p}: {c}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tokens by Day */}
      {data.tokens_by_day && Object.keys(data.tokens_by_day).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <span className="card-title">
              Tokens by Day
              <Tooltip text="Daily token consumption over the selected period. Shows trends in usage volume." />
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64, padding: '0 4px' }}>
            {Object.entries(data.tokens_by_day)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([day, tokens]) => {
                const allTokens = Object.values(data.tokens_by_day)
                const max = Math.max(...allTokens, 1)
                const h = Math.max((tokens / max) * 56, 2)
                return (
                  <div key={day} style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}>
                      {tokens > 1000 ? `${(tokens / 1000).toFixed(1)}k` : tokens}
                    </div>
                    <div style={{
                      background: 'var(--success)',
                      height: h,
                      borderRadius: 2,
                      opacity: tokens > 0 ? 0.7 : 0.3,
                    }} />
                    <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
                      {day.slice(5)}
                    </div>
                  </div>
                )
              })}
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
