import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export default function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const navigate = useNavigate()

  const { data: results } = useQuery({
    queryKey: ['global-search', query],
    queryFn: () => api.globalSearch(query),
    enabled: query.length >= 2,
    staleTime: 5000,
  })

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleResultClick(route) {
    navigate(route)
    setQuery('')
    setOpen(false)
  }

  const hasResults = results && results.total > 0

  return (
    <div className="global-search" ref={ref}>
      <div className="global-search-input-wrap">
        <Search size={16} className="search-icon" />
        <input
          className="form-input global-search-input"
          placeholder="Rechercher... (Ctrl+K)"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => query.length >= 2 && setOpen(true)}
        />
        {query && (
          <button className="search-clear-btn" onClick={() => { setQuery(''); setOpen(false) }}>
            <X size={14} />
          </button>
        )}
      </div>

      {open && query.length >= 2 && (
        <div className="global-search-dropdown">
          {!hasResults && <div className="global-search-empty">Aucun r\u00e9sultat pour "{query}"</div>}
          {results?.results?.projects?.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Projets</div>
              {results.results.projects.map(p => (
                <div key={p.id} className="global-search-item" onClick={() => handleResultClick(p.route)}>
                  <span className="global-search-item-name">{p.name}</span>
                  <span className="global-search-item-meta">{p.status}</span>
                </div>
              ))}
            </div>
          )}
          {results?.results?.backlog?.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Backlog</div>
              {results.results.backlog.map(b => (
                <div key={b.id} className="global-search-item" onClick={() => handleResultClick(b.route)}>
                  <span className="global-search-item-name">{b.title}</span>
                  <span className="global-search-item-meta">{b.status}</span>
                </div>
              ))}
            </div>
          )}
          {results?.results?.wiki?.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Wiki</div>
              {results.results.wiki.map(w => (
                <div key={w.id} className="global-search-item" onClick={() => handleResultClick(w.route)}>
                  <span className="global-search-item-name">{w.name}</span>
                  <span className="global-search-item-meta">{w.type}</span>
                </div>
              ))}
            </div>
          )}
          {results?.results?.sessions?.length > 0 && (
            <div className="global-search-group">
              <div className="global-search-group-label">Sessions</div>
              {results.results.sessions.map(s => (
                <div key={s.id} className="global-search-item" onClick={() => handleResultClick(s.route)}>
                  <span className="global-search-item-name">{s.name}</span>
                  {s.preview && <span className="global-search-item-meta">{s.preview.slice(0, 60)}...</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <style>{`
        .global-search { position: relative; }
        .global-search-input-wrap { position: relative; width: 240px; }
        .global-search-input {
          padding-left: 32px !important; padding-right: 28px !important;
          font-size: 13px !important; height: 34px;
        }
        .global-search-dropdown {
          position: absolute; top: 100%; left: 0; right: 0;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          z-index: 200; max-height: 400px; overflow-y: auto; margin-top: 4px;
        }
        .global-search-empty {
          padding: 16px; text-align: center; color: var(--text-muted); font-size: 13px;
        }
        .global-search-group-label {
          padding: 8px 12px 4px; font-size: 11px; font-weight: 600;
          color: var(--text-muted); text-transform: uppercase;
        }
        .global-search-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 12px; cursor: pointer; transition: background 0.1s;
        }
        .global-search-item:hover { background: var(--bg-hover); }
        .global-search-item-name {
          font-size: 13px; color: var(--text-primary);
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;
        }
        .global-search-item-meta {
          font-size: 11px; color: var(--text-muted); margin-left: 8px; flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
