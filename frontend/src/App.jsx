import { useState, useEffect } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Settings, MessageSquare, MessageCircle, FolderOpen, Terminal, Puzzle, Wrench, BookOpen,
  Clock, Brain, Cpu, Radio, BarChart3, Menu, X, Key, Mic, Activity, Stethoscope, Webhook,
  Shield, Network, UserCheck, Users, HardDrive, Bot
} from 'lucide-react'
import { ThemeToggle } from './contexts/ThemeContext'
import { api } from './api'
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
import FineTune from './pages/FineTune'
import GatewayControl from './pages/GatewayControl'
import Diagnostics from './pages/Diagnostics'
import WebhooksPage from './pages/Webhooks'
import EnvVarsPage from './pages/EnvVars'
import PluginsPage from './pages/Plugins'
import McpServersPage from './pages/McpServers'
import AuthPairingPage from './pages/AuthPairing'
import ProfilesPage from './pages/Profiles'
import BackupRestorePage from './pages/BackupRestore'
import ClaudeCodePage from './pages/ClaudeCode'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/gateway', icon: Activity, label: 'Gateway' },
  { to: '/claude-code', icon: Bot, label: 'Claude Code' },
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
  { to: '/fine-tune', icon: Mic, label: 'Fine-Tune', feature: 'fineTune' },
  { to: '/insights', icon: BarChart3, label: 'Insights' },
  { to: '/diagnostics', icon: Stethoscope, label: 'Diagnostics' },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
  { to: '/env-vars', icon: Shield, label: 'Environment' },
  { to: '/plugins', icon: Puzzle, label: 'Plugins' },
  { to: '/mcp', icon: Network, label: 'MCP Servers' },
  { to: '/auth-pairing', icon: UserCheck, label: 'Auth & Pairing' },
  { to: '/profiles', icon: Users, label: 'Profiles' },
  { to: '/backup', icon: HardDrive, label: 'Backup' },
]

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [features, setFeatures] = useState({})
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location])

  useEffect(() => {
    api.fineTuneAvailable().then(data => {
      if (data.available) setFeatures(prev => ({ ...prev, fineTune: true }))
    }).catch(() => {})
  }, [])

  const visibleNavItems = NAV_ITEMS.filter(item => !item.feature || features[item.feature])

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
          {visibleNavItems.map(item => (
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
          <Route path="/gateway" element={<GatewayControl />} />
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
          <Route path="/fine-tune" element={<FineTune />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/diagnostics" element={<Diagnostics />} />
          <Route path="/webhooks" element={<WebhooksPage />} />
          <Route path="/env-vars" element={<EnvVarsPage />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/mcp" element={<McpServersPage />} />
          <Route path="/auth-pairing" element={<AuthPairingPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          <Route path="/backup" element={<BackupRestorePage />} />
          <Route path="/claude-code" element={<ClaudeCodePage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
