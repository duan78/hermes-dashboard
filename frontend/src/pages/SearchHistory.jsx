import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, Trash2, Clock, TrendingUp, BarChart3, X, AlertTriangle } from 'lucide-react'
import { api } from '../api'
import './SearchHistory.css'

const BACKEND_COLORS = {
  brave: 'sh-backend-brave',
  tavily: 'sh-backend-tavily',
  combined: 'sh-backend-combined',
  exa: 'sh-backend-exa',
  parallel: 'sh-backend-parallel',
  firecrawl: 'sh-backend-firecrawl',
  linkup: 'sh-backend-linkup',
  agent_reach: 'sh-backend-agent_reach',
}

function BackendBadge({ backend }) {
  const cls = BACKEND_COLORS[backend] || 'sh-backend-default'
  return <span className={`sh-backend-badge ${cls}`} title={`Provider: ${backend}`}>{backend}</span>
}

function formatDate(ts) {
  if (!ts) return ''
  const d = new Date(ts + 'Z')
  return d.toLocaleDateString('en-US', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function SearchHistory() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [perPage] = useState(50)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterBackend, setFilterBackend] = useState('')
  const [filterQuery, setFilterQuery] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [pageStats, setPageStats] = useState(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = { page, per_page: perPage }
      if (filterBackend) params.backend = filterBackend
      if (filterQuery) params.query = filterQuery
      const data = await api.getSearchHistory(params)
      setItems(data.items || [])
      setTotal(data.total || 0)
      setPageStats(data.stats || null)
    } catch {
      // DB might not exist yet — show empty state
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, perPage, filterBackend, filterQuery])

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.getSearchHistoryStats()
      setStats(data)
    } catch {
      setStats(null)
    }
  }, [])

  useEffect(() => {
    fetchData()
    fetchStats()
  }, [fetchData, fetchStats])

  function handleRefresh() {
    fetchData()
    fetchStats()
  }

  function handleResetFilters() {
    setFilterBackend('')
    setFilterQuery('')
    setPage(1)
  }

  async function handleDeleteAll() {
    setDeleting(true)
    try {
      await api.deleteSearchHistory({})
      setShowConfirm(false)
      setPage(1)
      fetchData()
      fetchStats()
    } catch {
      // ignore
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.ceil(total / perPage)

  // Build the list of available backends from stats
  const availableBackends = (stats?.by_backend || []).map(b => b.name)

  return (
    <div className="page-container">
      {/* Header */}
      <div className="sh-header">
        <div className="sh-header-left">
          <h2>
            <Search size={20} />
            Search History
          </h2>
          <span className="sh-badge" title="Total searches">
            {stats?.total_searches ?? total}
          </span>
        </div>
        <div className="sh-header-actions">
          <button className="sh-btn sh-btn-ghost" onClick={handleRefresh} title="Refresh data">
            <RefreshCw size={15} />
            Refresh
          </button>
          <button
            className="sh-btn sh-btn-danger"
            onClick={() => setShowConfirm(true)}
            title="Clear all search history"
            disabled={total === 0}
          >
            <Trash2 size={15} />
            Clear All
          </button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="sh-stats-row">
          <div className="sh-stat-card" title="Searches performed today">
            <div className="sh-stat-icon"><Clock size={20} /></div>
            <div>
              <div className="sh-stat-value">{stats.searches_today ?? 0}</div>
              <div className="sh-stat-label">Searches today</div>
            </div>
          </div>
          <div className="sh-stat-card" title="Searches this week (last 7 days)">
            <div className="sh-stat-icon"><TrendingUp size={20} /></div>
            <div>
              <div className="sh-stat-value">{stats.searches_this_week ?? 0}</div>
              <div className="sh-stat-label">Searches this week</div>
            </div>
          </div>
          <div className="sh-stat-card" title="Average results per search">
            <div className="sh-stat-icon"><BarChart3 size={20} /></div>
            <div>
              <div className="sh-stat-value">{stats.avg_results ?? 0}</div>
              <div className="sh-stat-label">Avg results/search</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="sh-filters">
        <input
          type="text"
          placeholder="Filter by query..."
          value={filterQuery}
          onChange={e => { setFilterQuery(e.target.value); setPage(1) }}
          title="Search past queries"
        />
        <select
          value={filterBackend}
          onChange={e => { setFilterBackend(e.target.value); setPage(1) }}
          title="Filter by provider/backend"
        >
          <option value="">All providers</option>
          {availableBackends.map(b => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        {(filterBackend || filterQuery) && (
          <button className="sh-btn sh-btn-ghost" onClick={handleResetFilters} title="Reset filters">
            <X size={14} />
            Reset
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Loading...</div>
      ) : items.length === 0 ? (
        <div className="sh-empty">
          <Search size={40} />
          <p>No searches recorded</p>
          <p className="sh-empty-hint">
            Searches performed by the Hermes agent will appear here automatically.
          </p>
        </div>
      ) : (
        <>
          <div className="sh-table-wrap">
            <table className="sh-table">
              <thead>
                <tr>
                  <th>Date/Time</th>
                  <th>Query</th>
                  <th>Backend</th>
                  <th>Results</th>
                  <th>Time (ms)</th>
                  <th>Top URLs</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(item.timestamp)}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.query}>
                      {item.query}
                    </td>
                    <td><BackendBadge backend={item.backend} /></td>
                    <td>{item.results_count ?? 0}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {item.elapsed_ms != null ? Math.round(item.elapsed_ms) : '—'}
                    </td>
                    <td>
                      <div className="sh-url-list">
                        {(item.top_urls || []).slice(0, 3).map((url, i) => (
                          <a
                            key={i}
                            className="sh-url-badge"
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={url}
                          >
                            {url.replace(/^https?:\/\//, '').split('/')[0]}
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="sh-pagination">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                title="Previous page"
              >
                Previous
              </button>
              <span>
                Page {page} / {totalPages} — {total} {total === 1 ? 'entry' : 'entries'}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                title="Next page"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Provider stats */}
      {stats && stats.by_backend && stats.by_backend.length > 0 && (
        <div className="sh-provider-stats">
          <h3>
            <BarChart3 size={16} />
            Distribution by provider
          </h3>
          {stats.by_backend.map(b => {
            const pct = stats.total_searches > 0 ? (b.count / stats.total_searches * 100) : 0
            const barClass = BACKEND_COLORS[b.name] ? b.name : 'default'
            return (
              <div className="sh-provider-row" key={b.name} title={`${b.name}: ${b.count} recherches (${pct.toFixed(1)}%)`}>
                <span className="sh-provider-name">{b.name}</span>
                <div className="sh-provider-bar-bg">
                  <div
                    className={`sh-provider-bar-fill ${barClass}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="sh-provider-info">
                  {b.count} ({pct.toFixed(1)}%)
                </span>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm delete modal */}
      {showConfirm && (
        <div className="sh-modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="sh-modal" onClick={e => e.stopPropagation()}>
            <h3>
              <AlertTriangle size={18} style={{ verticalAlign: 'middle', marginRight: 6, color: '#ef4444' }} />
              Confirmer la suppression
            </h3>
            <p>
              Are you sure you want to clear all search history? This action is irreversible.
            </p>
            <div className="sh-modal-actions">
              <button className="sh-btn sh-btn-ghost" onClick={() => setShowConfirm(false)} disabled={deleting}>
                Cancel
              </button>
              <button className="sh-btn sh-btn-danger" onClick={handleDeleteAll} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
