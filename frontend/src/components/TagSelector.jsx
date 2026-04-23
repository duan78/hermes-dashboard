import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Plus, Palette } from 'lucide-react'
import { api } from '../api'

const DEFAULT_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
]

export default function TagSelector({ value = [], onChange }) {
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('#8b5cf6')
  const ref = useRef(null)
  const qc = useQueryClient()

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: () => api.getTags(),
  })

  const tags = tagsData?.items || []

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function createAndAdd() {
    if (!newName.trim()) return
    try {
      const tag = await api.createTag({ name: newName.trim(), color: newColor })
      onChange([...value, tag.name])
      setNewName('')
      qc.invalidateQueries({ queryKey: ['tags'] })
    } catch (e) {
      // Tag may already exist, just add by name
      if (!value.includes(newName.trim())) {
        onChange([...value, newName.trim()])
      }
      setNewName('')
    }
  }

  function toggleTag(name) {
    if (value.includes(name)) {
      onChange(value.filter(t => t !== name))
    } else {
      onChange([...value, name])
    }
  }

  return (
    <div className="tag-selector" ref={ref}>
      <div className="tag-selector-values">
        {value.map(tag => {
          const tagObj = tags.find(t => t.name === tag)
          const color = tagObj?.color || '#8b5cf6'
          return (
            <span key={tag} className="tag-chip" style={{ background: color + '22', color, borderColor: color + '44' }}>
              {tag}
              <button className="tag-chip-remove" onClick={() => toggleTag(tag)}>
                <X size={12} />
              </button>
            </span>
          )
        })}
        <button className="tag-add-btn" onClick={() => setOpen(!open)}>
          <Plus size={14} /> Tag
        </button>
      </div>

      {open && (
        <div className="tag-dropdown">
          {tags.filter(t => !value.includes(t.name)).map(tag => (
            <button
              key={tag.id}
              className="tag-dropdown-item"
              onClick={() => toggleTag(tag.name)}
            >
              <span className="tag-color-dot" style={{ background: tag.color }} />
              {tag.name}
            </button>
          ))}

          <div className="tag-create-inline">
            <div className="tag-create-row">
              <input
                className="form-input"
                placeholder="Nouveau tag..."
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createAndAdd()}
              />
              <div className="tag-color-picker">
                {DEFAULT_COLORS.map(c => (
                  <button
                    key={c}
                    className={`tag-color-opt ${newColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setNewColor(c)}
                  />
                ))}
              </div>
            </div>
            {newName.trim() && (
              <button className="btn btn-sm btn-primary" onClick={createAndAdd} style={{ marginTop: 6 }}>
                Cr\u00e9er "{newName.trim()}"
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        .tag-selector { position: relative; }
        .tag-selector-values {
          display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
        }
        .tag-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 12px; font-size: 12px;
          font-weight: 500; border: 1px solid;
        }
        .tag-chip-remove {
          background: none; border: none; cursor: pointer;
          color: inherit; padding: 0; display: flex; opacity: 0.6;
        }
        .tag-chip-remove:hover { opacity: 1; }
        .tag-add-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 2px 8px; border-radius: 12px; font-size: 12px;
          background: var(--bg-tertiary); border: 1px dashed var(--border);
          color: var(--text-muted); cursor: pointer;
        }
        .tag-add-btn:hover { color: var(--accent); border-color: var(--accent); }
        .tag-dropdown {
          position: absolute; top: 100%; left: 0;
          width: 260px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius);
          box-shadow: 0 8px 24px rgba(0,0,0,0.3); z-index: 200;
          padding: 8px; margin-top: 4px;
        }
        .tag-dropdown-item {
          display: flex; align-items: center; gap: 8px;
          width: 100%; padding: 6px 8px; background: none;
          border: none; border-radius: 4px; cursor: pointer;
          color: var(--text-secondary); font-size: 13px; text-align: left;
        }
        .tag-dropdown-item:hover { background: var(--bg-hover); color: var(--text-primary); }
        .tag-color-dot {
          width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
        }
        .tag-create-inline {
          margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);
        }
        .tag-create-row { display: flex; flex-direction: column; gap: 6px; }
        .tag-create-row .form-input { padding: 6px 10px; font-size: 13px; }
        .tag-color-picker {
          display: flex; gap: 4px; flex-wrap: wrap;
        }
        .tag-color-opt {
          width: 20px; height: 20px; border-radius: 50%; border: 2px solid transparent;
          cursor: pointer; transition: border-color 0.1s;
        }
        .tag-color-opt:hover { border-color: var(--text-primary); }
        .tag-color-opt.active { border-color: white; }
      `}</style>
    </div>
  )
}
