import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ArrowRight, FolderKanban, ClipboardList, FileText, LayoutDashboard, Settings } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

const NAV_ACTIONS = [
  { id: 'nav-overview', label: 'Aller \u00e0 Overview', icon: LayoutDashboard, route: '/' },
  { id: 'nav-projects', label: 'Aller \u00e0 Projets', icon: FolderKanban, route: '/projects' },
  { id: 'nav-backlog', label: 'Aller \u00e0 Backlog', icon: ClipboardList, route: '/backlog' },
  { id: 'nav-wiki', label: 'Aller \u00e0 Wiki', icon: FileText, route: '/wiki' },
  { id: 'nav-settings', label: 'Aller \u00e0 Settings', icon: Settings, route: '/config' },
  { id: 'create-project', label: 'Cr\u00e9er un projet', icon: Plus, route: '/projects' },
  { id: 'create-task', label: 'Ajouter une t\u00e2che backlog', icon: Plus, route: '/backlog' },
  { id: 'create-wiki', label: 'Cr\u00e9er une page wiki', icon: Plus, route: '/wiki' },
]

export default function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  const { data: searchResults } = useQuery({
    queryKey: ['global-search', query],
    queryFn: () => api.globalSearch(query),
    enabled: query.length >= 2,
    staleTime: 5000,
  })

  const items = useMemo(() => {
    const result = []

    // Filter nav actions
    const filteredActions = NAV_ACTIONS.filter(a =>
      a.label.toLowerCase().includes(query.toLowerCase())
    )
    if (filteredActions.length > 0) {
      result.push({ group: 'Navigation & Actions', items: filteredActions })
    }

    // Add search results
    if (searchResults?.results) {
      const r = searchResults.results
      if (r.projects?.length > 0) result.push({ group: 'Projets', items: r.projects.map(p => ({ ...p, id: `p-${p.id}`, label: p.name, route: p.route })) })
      if (r.backlog?.length > 0) result.push({ group: 'Backlog', items: r.backlog.map(b => ({ ...b, id: `b-${b.id}`, label: b.title, route: b.route })) })
      if (r.wiki?.length > 0) result.push({ group: 'Wiki', items: r.wiki.map(w => ({ ...w, id: `w-${w.id}`, label: w.name, route: w.route })) })
      if (r.sessions?.length > 0) result.push({ group: 'Sessions', items: r.sessions.map(s => ({ ...s, id: `s-${s.id}`, label: s.name, route: s.route })) })
      if (r.skills?.length > 0) result.push({ group: 'Skills', items: r.skills.map(s => ({ ...s, id: `sk-${s.id}`, label: s.name, route: s.route })) })
    }

    return result
  }, [query, searchResults])

  const flatItems = useMemo(() =>
    items.flatMap(g => g.items), [items])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  useEffect(() => { setSelected(0) }, [query])

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(prev => Math.min(prev + 1, flatItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && flatItems[selected]) {
      e.preventDefault()
      navigate(flatItems[selected].route)
      onClose()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  let flatIdx = 0

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-wrap">
          <Search size={18} className="cmd-search-icon" />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder="Rechercher ou ex\u00e9cuter une action..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <kbd className="cmd-kbd">ESC</kbd>
        </div>
        <div className="cmd-results">
          {items.length === 0 && query.length >= 2 && (
            <div className="cmd-empty">Aucun r\u00e9sultat pour "{query}"</div>
          )}
          {items.length === 0 && query.length < 2 && (
            <div className="cmd-empty">Tapez pour rechercher...</div>
          )}
          {items.map(group => (
            <div key={group.group}>
              <div className="cmd-group-label">{group.group}</div>
              {group.items.map(item => {
                const idx = flatIdx++
                const isSelected = idx === selected
                return (
                  <div
                    key={item.id}
                    className={`cmd-item ${isSelected ? 'selected' : ''}`}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={() => { navigate(item.route); onClose() }}
                  >
                    <ArrowRight size={14} />
                    <span>{item.label}</span>
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .cmd-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5); z-index: 1000;
          display: flex; justify-content: center; padding-top: 15vh;
        }
        .cmd-palette {
          width: 560px; max-width: 90vw;
          background: var(--bg-secondary); border: 1px solid var(--border);
          border-radius: var(--radius-lg); box-shadow: 0 16px 48px rgba(0,0,0,0.4);
          overflow: hidden; max-height: 60vh; display: flex; flex-direction: column;
        }
        .cmd-input-wrap {
          display: flex; align-items: center; padding: 12px 16px;
          border-bottom: 1px solid var(--border); gap: 10px;
        }
        .cmd-search-icon { color: var(--text-muted); flex-shrink: 0; }
        .cmd-input {
          flex: 1; background: none; border: none; outline: none;
          color: var(--text-primary); font-size: 15px; font-family: var(--font-sans);
        }
        .cmd-input::placeholder { color: var(--text-muted); }
        .cmd-kbd {
          font-size: 11px; padding: 2px 6px; border-radius: 4px;
          background: var(--bg-tertiary); border: 1px solid var(--border);
          color: var(--text-muted); font-family: var(--font-mono);
        }
        .cmd-results {
          flex: 1; overflow-y: auto; padding: 4px 0;
        }
        .cmd-empty {
          padding: 20px; text-align: center; color: var(--text-muted); font-size: 13px;
        }
        .cmd-group-label {
          padding: 8px 16px 4px; font-size: 11px; font-weight: 600;
          color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;
        }
        .cmd-item {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 16px; cursor: pointer; font-size: 13px;
          color: var(--text-secondary); transition: all 0.1s;
        }
        .cmd-item:hover, .cmd-item.selected {
          background: var(--bg-hover); color: var(--text-primary);
        }
      `}</style>
    </div>
  )
}
