import { useState, useEffect, lazy, Suspense, useCallback } from 'react'
import { Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom'
import {
 LayoutDashboard, Settings, MessageSquare, MessageCircle, FolderOpen, Terminal, Puzzle, Wrench, BookOpen,
  Clock, Brain, Cpu, Radio, BarChart3, Menu, X, Key, Mic, Activity, Stethoscope, Webhook,
 Shield, Network, UserCheck, Users, HardDrive, Bot, Layers, FileText, ClipboardList,
 Search as SearchIcon, FolderKanban, Download, Timer,
 LogOut
} from 'lucide-react'
import { ThemeToggle } from './contexts/ThemeContext'
import { ToastProvider } from './contexts/ToastContext'
import { useWebSocket } from './hooks/useWebSocket'
import { api } from './api'
import { withErrorBoundary } from './components/PageErrorBoundary'
import NotificationBell from './components/NotificationBell'
import AutofeedIndicator from './components/AutofeedIndicator'
import CommandPalette from './components/CommandPalette'
import GlobalSearch from './components/GlobalSearch'
import './pages/auth.css'

// Eager imports — most frequently accessed / shell pages
import Overview from './pages/Overview'
import Config from './pages/Config'
import Sessions from './pages/Sessions'
import MemorySoul from './pages/MemorySoul'

// Auth pages (eager — needed before dashboard loads)
import Login from './pages/Login'
import Register from './pages/Register'

// Lazy imports — all other pages (25)
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
const Backlog = lazy(() => import('./pages/Backlog'))
const Projects = lazy(() => import('./pages/Projects'))
const UsersPage = lazy(() => import('./pages/Users'))
const NotFound = lazy(() => import('./pages/NotFound'))
const SearchHistory = lazy(() => import('./pages/SearchHistory'))
const ActivityPage = lazy(() => import('./pages/Activity'))
const Benchmark = lazy(() => import('./pages/Benchmark'))

// Page-level error boundaries — each page gets its own boundary
// so a crash in one page doesn't take down the entire dashboard
const BoundedOverview = withErrorBoundary(Overview, 'Overview')
const BoundedGateway = withErrorBoundary(GatewayControl, 'Gateway')
const BoundedChat = withErrorBoundary(Chat, 'Chat')
const BoundedConfig = withErrorBoundary(Config, 'Configuration')
const BoundedSessions = withErrorBoundary(Sessions, 'Sessions')
const BoundedFiles = withErrorBoundary(Files, 'Files')
const BoundedTerminal = withErrorBoundary(TerminalPage, 'Terminal')
const BoundedTools = withErrorBoundary(Tools, 'Tools')
const BoundedSkills = withErrorBoundary(Skills, 'Skills')
const BoundedSkillsHub = withErrorBoundary(SkillsHub, 'Skills Hub')
const BoundedCronJobs = withErrorBoundary(CronJobs, 'Cron Jobs')
const BoundedMemorySoul = withErrorBoundary(MemorySoul, 'Memory & SOUL')
const BoundedModels = withErrorBoundary(Models, 'Models')
const BoundedPlatforms = withErrorBoundary(Platforms, 'Platforms')
const BoundedApiKeys = withErrorBoundary(ApiKeys, 'API Keys')
const BoundedFineTune = withErrorBoundary(FineTune, 'Fine-Tune')
const BoundedInsights = withErrorBoundary(Insights, 'Insights')
const BoundedDiagnostics = withErrorBoundary(Diagnostics, 'Diagnostics')
const BoundedWebhooks = withErrorBoundary(WebhooksPage, 'Webhooks')
const BoundedEnvVars = withErrorBoundary(EnvVarsPage, 'Environment')
const BoundedPlugins = withErrorBoundary(PluginsPage, 'Plugins')
const BoundedMcpServers = withErrorBoundary(McpServersPage, 'MCP Servers')
const BoundedAuthPairing = withErrorBoundary(AuthPairingPage, 'Auth & Pairing')
const BoundedUsers = withErrorBoundary(UsersPage, 'Users')
const BoundedProfiles = withErrorBoundary(ProfilesPage, 'Profiles')
const BoundedBackup = withErrorBoundary(BackupRestorePage, 'Backup')
const BoundedClaudeCode = withErrorBoundary(ClaudeCodePage, 'Claude Code')
const BoundedWiki = withErrorBoundary(WikiPage, 'Wiki')
const BoundedMoa = withErrorBoundary(MoaConfig, 'MOA')
const BoundedBacklog = withErrorBoundary(Backlog, 'Backlog')
const BoundedProjects = withErrorBoundary(Projects, 'Projects')
const BoundedNotFound = withErrorBoundary(NotFound, 'Not Found')
const BoundedSearchHistory = withErrorBoundary(SearchHistory, 'Search History')
const BoundedActivity = withErrorBoundary(ActivityPage, 'Activit\u00e9')
const BoundedBenchmark = withErrorBoundary(Benchmark, 'Benchmark')

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/gateway', icon: Activity, label: 'Gateway' },
  { to: '/claude-code', icon: Bot, label: 'Claude Code' },
  { to: '/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/config', icon: Settings, label: 'Configuration' },
  { to: '/sessions', icon: MessageSquare, label: 'Sessions' },
  { to: '/search-history', icon: SearchIcon, label: 'Recherches' },
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
  { to: '/moa', icon: Layers, label: 'MOA' },
  { to: '/fine-tune', icon: Mic, label: 'Fine-Tune' },
  { to: '/insights', icon: BarChart3, label: 'Insights' },
  { to: '/benchmark', icon: Timer, label: 'Benchmark' },
  { to: '/diagnostics', icon: Stethoscope, label: 'Diagnostics' },
  { to: '/webhooks', icon: Webhook, label: 'Webhooks' },
  { to: '/env-vars', icon: Shield, label: 'Environment' },
  { to: '/plugins', icon: Puzzle, label: 'Plugins' },
  { to: '/mcp', icon: Network, label: 'MCP Servers' },
  { to: '/auth-pairing', icon: UserCheck, label: 'Auth & Pairing' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/profiles', icon: Users, label: 'Profiles' },
  { to: '/backup', icon: HardDrive, label: 'Backup' },
  { to: '/projects', icon: FolderKanban, label: 'Projets' },
  { to: '/backlog', icon: ClipboardList, label: 'Backlog' },
  { to: '/activity', icon: Activity, label: 'Activit\u00e9' },
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

function AuthGuard({ currentUser, children }) {
  const userToken = localStorage.getItem('hermes_user_token')
  const legacyToken = localStorage.getItem('hermes_token')

  // Still checking auth state
  if (currentUser === undefined) {
    return <Spinner />
  }

  // No token at all — redirect to login
  if (!userToken && !legacyToken) {
    return <Navigate to="/login" replace />
  }

  // Has user token (account-based auth) — validate it
  if (userToken && !currentUser) {
    return <Navigate to="/login" replace />
  }

  // All good — render children
  return children
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState(undefined) // undefined = loading, null = no user system
  const [cmdOpen, setCmdOpen] = useState(false)
  const location = useLocation()

  // Only connect WebSocket when authenticated and inside dashboard
  useWebSocket(!!currentUser)

  useEffect(() => {
    setSidebarOpen(false)
  }, [location])

  // Ctrl+K for command palette
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setCmdOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Check auth state on mount and when auth events fire
  useEffect(() => {
    checkAuth()
    const onAuthRequired = () => {
      // If we have a user token and got 401, session expired
      if (localStorage.getItem('hermes_user_token')) {
        setCurrentUser(null)
      }
    }
    const onAuthChanged = () => {
      checkAuth()
    }
    window.addEventListener('auth-required', onAuthRequired)
    window.addEventListener('auth-changed', onAuthChanged)
    return () => {
      window.removeEventListener('auth-required', onAuthRequired)
      window.removeEventListener('auth-changed', onAuthChanged)
    }
  }, [])

  async function checkAuth() {
    const userToken = localStorage.getItem('hermes_user_token')
    const legacyToken = localStorage.getItem('hermes_token')

    // No user token, has legacy token or nothing — skip user auth check
    if (!userToken) {
      setCurrentUser(null)
      return
    }

    try {
      const data = await api.userMe()
      if (data.authenticated && data.user) {
        setCurrentUser(data.user)
        localStorage.setItem('hermes_user', JSON.stringify(data.user))
      } else {
        setCurrentUser(null)
      }
    } catch {
      setCurrentUser(null)
    }
  }

  function handleLogout() {
    localStorage.removeItem('hermes_user_token')
    localStorage.removeItem('hermes_user')
    setCurrentUser(null)
    window.dispatchEvent(new CustomEvent('auth-changed'))
  }

  const isAdmin = currentUser && currentUser.role === 'admin'
  const visibleNavItems = NAV_ITEMS

  // Auth pages rendered without dashboard chrome
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register'

  if (isAuthPage) {
    return (
      <ToastProvider>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    )
  }

  return (
    <ToastProvider>
    <AuthGuard currentUser={currentUser}>
    <div className="app-layout">
      <button className="mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
        {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <Cpu size={22} />
          Hermes Dashboard
        </div>
        <nav className="sidebar-nav" role="navigation" aria-label="Main navigation">
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
          {currentUser && (
            <div className="sidebar-user">
              <span className="sidebar-user-name">{currentUser.display_name || currentUser.username}</span>
              <span className="sidebar-user-role">{currentUser.role}</span>
            </div>
          )}
          {currentUser && (
            <button className="sidebar-logout" onClick={handleLogout} title="Sign out">
              <LogOut size={16} />
            </button>
          )}
          <ThemeToggle />
        </div>
      </aside>

      <main className="main-content" role="main">
        <header className="main-header">
          <GlobalSearch />
          <div className="main-header-actions">
            <AutofeedIndicator />
            <NotificationBell />
          </div>
        </header>
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<BoundedOverview />} />
            <Route path="/gateway" element={<BoundedGateway />} />
            <Route path="/chat" element={<BoundedChat />} />
            <Route path="/chat/:id" element={<BoundedChat />} />
            <Route path="/config" element={<BoundedConfig />} />
            <Route path="/sessions" element={<BoundedSessions />} />
            <Route path="/sessions/:id" element={<BoundedSessions />} />
            <Route path="/search-history" element={<BoundedSearchHistory />} />
            <Route path="/files" element={<BoundedFiles />} />
            <Route path="/terminal" element={<BoundedTerminal />} />
            <Route path="/tools" element={<BoundedTools />} />
            <Route path="/skills" element={<BoundedSkills />} />
            <Route path="/skills-hub" element={<BoundedSkillsHub />} />
            <Route path="/cron" element={<BoundedCronJobs />} />
            <Route path="/memory" element={<BoundedMemorySoul />} />
            <Route path="/models" element={<BoundedModels />} />
            <Route path="/platforms" element={<BoundedPlatforms />} />
            <Route path="/api-keys" element={<BoundedApiKeys />} />
            <Route path="/fine-tune" element={<BoundedFineTune />} />
            <Route path="/insights" element={<BoundedInsights />} />
            <Route path="/diagnostics" element={<BoundedDiagnostics />} />
            <Route path="/webhooks" element={<BoundedWebhooks />} />
            <Route path="/env-vars" element={<BoundedEnvVars />} />
            <Route path="/plugins" element={<BoundedPlugins />} />
            <Route path="/mcp" element={<BoundedMcpServers />} />
            <Route path="/auth-pairing" element={<BoundedAuthPairing />} />
            <Route path="/users" element={<BoundedUsers />} />
            <Route path="/profiles" element={<BoundedProfiles />} />
            <Route path="/backup" element={<BoundedBackup />} />
            <Route path="/claude-code" element={<BoundedClaudeCode />} />
            <Route path="/wiki" element={<BoundedWiki />} />
            <Route path="/moa" element={<BoundedMoa />} />
            <Route path="/projects" element={<BoundedProjects />} />
            <Route path="/backlog" element={<BoundedBacklog />} />
            <Route path="/activity" element={<BoundedActivity />} />
            <Route path="/benchmark" element={<BoundedBenchmark />} />
            <Route path="*" element={<BoundedNotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
    </AuthGuard>
    </ToastProvider>
  )
}

export default App
