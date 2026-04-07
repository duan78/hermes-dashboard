import { useState, useEffect, lazy, Suspense } from 'react'
import { Routes, Route, NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Settings, MessageSquare, MessageCircle, FolderOpen, Terminal, Puzzle, Wrench, BookOpen,
  Clock, Brain, Cpu, Radio, BarChart3, Menu, X, Key, Mic, Activity, Stethoscope, Webhook,
  Shield, Network, UserCheck, Users, HardDrive, Bot, Layers, FileText
} from 'lucide-react'
import { ThemeToggle } from './contexts/ThemeContext'
import { api } from './api'

// Eager imports — most frequently accessed / shell pages
import Overview from './pages/Overview'
import Config from './pages/Config'
import Sessions from './pages/Sessions'
import MemorySoul from './pages/MemorySoul'

// Lazy imports — all other pages (23)
const Tools = lazy(() => import('./pages/Tools'))
const Skills = lazy(() => import('./pages/Skills'))
const CronJobs = lazy(() => import('./pages/CronJobs'))
const Models = lazy(() => import('./pages/Models'))
const Platforms = lazy(() => import('./pages/Platforms'))
const ApiKeys = lazy(() => import('./pages/ApiKeys'))
const Insights = lazy(() => import('./pages/Insights'))
const Chat = lazy(() => import('./pages/Chat'))
const Files = lazy(() => import('./pages/Files'))
const TerminalPage = lazy(() => import('./pages/TerminalPage'))
const SkillsHub = lazy(() => import('./pages/SkillsHub'))
const FineTune = lazy(() => import('./pages/FineTune'))
const GatewayControl = lazy(() => import('./pages/GatewayControl'))
const Diagnostics = lazy(() => import('./pages/Diagnostics'))
const WebhooksPage = lazy(() => import('./pages/Webhooks'))
const EnvVarsPage = lazy(() => import('./pages/EnvVars'))
const PluginsPage = lazy(() => import('./pages/Plugins'))
const McpServersPage = lazy(() => import('./pages/McpServers'))
const AuthPairingPage = lazy(() => import('./pages/AuthPairing'))
const ProfilesPage = lazy(() => import('./pages/Profiles'))
const BackupRestorePage = lazy(() => import('./pages/BackupRestore'))
const ClaudeCodePage = lazy(() => import('./pages/ClaudeCode'))
const WikiPage = lazy(() => import('./pages/Wiki'))
const MoaConfig = lazy(() => import('./pages/MoaConfig'))

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
  { to: '/wiki', icon: FileText, label: 'Wiki' },
  { to: '/models', icon: Cpu, label: 'Models' },
  { to: '/platforms', icon: Radio, label: 'Platforms' },
  { to: '/api-keys', icon: Key, label: 'API Keys' },
  { to: '/moa', icon: Layers, label: 'MOA', feature: 'moa' },
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

function Spinner() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '60vh', color: 'var(--text-secondary, #94a3b8)'
    }}>
      <div style={{
        width: 32, height: 32, border: '3px solid var(--border, rgba(255,255,255,0.1))',
        borderTopColor: 'var(--accent, #8b5cf6)', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

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
    // Check if MOA toolset is enabled
    api.getConfigSections().then(sections => {
      const toolsets = sections?.toolsets || []
      if (toolsets.includes('moa')) {
        setFeatures(prev => ({ ...prev, moa: true }))
      }
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
        <Suspense fallback={<Spinner />}>
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
            <Route path="/wiki" element={<WikiPage />} />
            <Route path="/moa" element={<MoaConfig />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default App
