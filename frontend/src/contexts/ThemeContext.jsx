import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'

const ThemeContext = createContext()

const THEME_MODES = ['dark', 'light', 'auto']

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function getInitialTheme() {
  const stored = localStorage.getItem('hermes_theme')
  if (stored && THEME_MODES.includes(stored)) return stored
  return 'dark'
}

function resolveTheme(mode) {
  if (mode === 'auto') return getSystemTheme()
  return mode
}

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getInitialTheme)
  const [theme, setTheme] = useState(() => resolveTheme(getInitialTheme()))

  useEffect(() => {
    const resolved = resolveTheme(mode)
    setTheme(resolved)
    document.documentElement.setAttribute('data-theme', resolved)
    localStorage.setItem('hermes_theme', mode)
  }, [mode])

  // Listen to OS preference changes when in auto mode
  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = (e) => {
      const resolved = e.matches ? 'light' : 'dark'
      setTheme(resolved)
      document.documentElement.setAttribute('data-theme', resolved)
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [mode])

  const cycle = useCallback(() => {
    setMode(prev => {
      const idx = THEME_MODES.indexOf(prev)
      return THEME_MODES[(idx + 1) % THEME_MODES.length]
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, mode, cycle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeToggle() {
  const { theme, mode, cycle } = useTheme()
  const icon = mode === 'dark' ? <Sun size={16} /> : mode === 'light' ? <Moon size={16} /> : <Monitor size={16} />
  const label = mode === 'dark' ? 'Mode Clair' : mode === 'light' ? 'Mode Auto' : 'Mode Sombre'
  return (
    <button
      className="sidebar-link theme-toggle"
      onClick={cycle}
      title={`Thème actuel: ${theme} — cliquez pour changer`}
    >
      {icon}
      {label}
    </button>
  )
}
