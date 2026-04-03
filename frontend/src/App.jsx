import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Settings, MessageSquare, MessageCircle, FolderOpen, Terminal, Puzzle, Wrench, BookOpen,
  Clock, Brain, Cpu, Radio, BarChart3, Menu, X, Key
} from 'lucide-react'
import { ThemeToggle } from './contexts/ThemeContext'
import Overview from './pages/Overview'
import Config from './pages/Config'
import Sessions from './pages/Sessions'
import Tools from './pages/Tools'
import Skills from './pages/Skills'
import CronJobs from './pages/CronJobs'
import MemorySoul from './pages/MemorySoul'
import Models from './pages/Models'
import Platforms from './pages/Platforms'
import ApiKeys from './pages/ApiKeys'
import Insights from './pages/Insights'
import Chat from './pages/Chat'
import Files from './pages/Files'
import TerminalPage from './pages/TerminalPage'
import SkillsHub from './pages/SkillsHub'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/config', icon: Settings, label: 'Configuration' },
  { to: '/sessions', icon: MessageSquare, label: 'Sessions' },
  { to: '/files', icon: FolderOpen, label: 'Files' },
  { to: '/terminal', icon: Terminal, label: 'Terminal' },
  { to: '/tools', icon: Wrench, label: 'Tools' },
  { to: '/skills', icon: BookOpen, label: 'Skills' },
  { to: '/skills-hub', icon: Puzzle, label: 'Skills Hub' },
  { to: '/cron', icon: Clock, label: 'Cron Jobs' },
  { to: '/memory', icon: Brain, label: 'Memory & SOUL' },
  { to: '/models', icon: Cpu, label: 'Models' },
  { to: '/platforms', icon: Radio, label: 'Platforms' },
  { to: '/api-keys', icon: Key, label: 'API Keys' },
  { to: '/insights', icon: BarChart3, label: 'Insights' },
]

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location])

  return (
    <div className="app-layout">
      <button className="mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Cpu size={22} />
          Hermes Dashboard
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ThemeToggle />
        </div>
      </aside>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/chat/:id" element={<Chat />} />
          <Route path="/config" element={<Config />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/sessions/:id" element={<Sessions />} />
          <Route path="/files" element={<Files />} />
          <Route path="/terminal" element={<TerminalPage />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/skills-hub" element={<SkillsHub />} />
          <Route path="/cron" element={<CronJobs />} />
          <Route path="/memory" element={<MemorySoul />} />
          <Route path="/models" element={<Models />} />
          <Route path="/platforms" element={<Platforms />} />
          <Route path="/api-keys" element={<ApiKeys />} />
          <Route path="/insights" element={<Insights />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
