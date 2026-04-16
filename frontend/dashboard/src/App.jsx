import { useState } from 'react'
import {
  LayoutDashboard, Building2, MessageSquare, Settings,
  Bot, Mic, FileCode2, ExternalLink, LogOut, Users, BarChart2,
  Calendar, ChevronRight, Dot,
} from 'lucide-react'
import { getToken, logout as apiLogout } from './api/client'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PropertiesPage from './pages/PropertiesPage'
import ConversationsPage from './pages/ConversationsPage'
import SettingsPage from './pages/SettingsPage'
import ProspectsPage from './pages/ProspectsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import CalendarPage from './pages/CalendarPage'
import NotificationBell from './components/NotificationBell'

const NAV = [
  { id: 'dashboard',     icon: LayoutDashboard, label: 'Tableau de bord' },
  { id: 'properties',    icon: Building2,        label: 'Biens' },
  { id: 'prospects',     icon: Users,            label: 'Prospects' },
  { id: 'calendar',      icon: Calendar,         label: 'Agenda' },
  { id: 'analytics',     icon: BarChart2,        label: 'Analytics' },
  { id: 'conversations', icon: MessageSquare,    label: 'Conversations' },
  { id: 'settings',      icon: Settings,         label: 'Param\u00e8tres' },
]

const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : window.location.origin

const EXTERNAL = [
  { icon: Bot,       label: 'Chatbot d\u00e9mo',  href: `${BASE}/widget/demo.html` },
  { icon: Mic,       label: 'Vocal d\u00e9mo',    href: `${BASE}/widget/voice_demo.html` },
  { icon: FileCode2, label: 'API Swagger',         href: `${BASE}/docs` },
]

function Sidebar({ page, setPage, onLogout }) {
  return (
    <aside className="w-56 flex-shrink-0 bg-noir min-h-screen flex flex-col" style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Brand */}
      <div className="px-5 py-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #C9A96E, #A8823A)' }}>
            <Building2 size={14} className="text-white" />
          </div>
          <div>
            <div className="font-serif text-white font-semibold text-base leading-tight tracking-wide">ImmoPlus</div>
            <div className="text-xs leading-none mt-0.5" style={{ color: '#5A5A72' }}>Lyon</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <div className="text-xs font-medium uppercase tracking-widest px-2 mb-3" style={{ color: '#3A3A52', letterSpacing: '0.12em' }}>
          Navigation
        </div>
        {NAV.map(({ id, icon: Icon, label }) => {
          const active = page === id
          return (
            <button
              key={id}
              onClick={() => setPage(id)}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all text-left"
              style={active ? {
                background: 'rgba(201,169,110,0.10)',
                color: '#C9A96E',
                borderLeft: '2px solid #C9A96E',
                paddingLeft: '9px',
              } : {
                color: '#6A6A8A',
                borderLeft: '2px solid transparent',
              }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#A0A0C0'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.color = '#6A6A8A'; e.currentTarget.style.background = 'transparent' } }}
            >
              <Icon size={15} />
              <span className="font-medium">{label}</span>
            </button>
          )
        })}

        <div className="pt-5">
          <div className="text-xs font-medium uppercase tracking-widest px-2 mb-3" style={{ color: '#3A3A52', letterSpacing: '0.12em' }}>
            Outils
          </div>
          {EXTERNAL.map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all"
              style={{ color: '#6A6A8A' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#A0A0C0'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#6A6A8A'; e.currentTarget.style.background = 'transparent' }}
            >
              <Icon size={15} />
              <span className="flex-1 font-medium">{label}</span>
              <ExternalLink size={11} style={{ color: '#3A3A52' }} />
            </a>
          ))}
        </div>
      </nav>

      {/* Status badge */}
      <div className="px-3 mb-3">
        <div className="px-3 py-2 rounded-lg flex items-center gap-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow flex-shrink-0" />
          <span className="text-xs" style={{ color: '#5A5A72' }}>4 agents actifs</span>
        </div>
      </div>

      {/* User */}
      <div className="p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-2.5 px-2.5 py-2 mb-1">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-noir text-xs font-bold flex-shrink-0"
               style={{ background: 'linear-gradient(135deg, #C9A96E, #A8823A)' }}>
            A
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold truncate" style={{ color: '#D0D0E0' }}>Admin</div>
            <div className="text-xs truncate" style={{ color: '#4A4A62' }}>admin@immoplus.fr</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs transition-all"
          style={{ color: '#6A6A8A' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.06)' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#6A6A8A'; e.currentTarget.style.background = 'transparent' }}
        >
          <LogOut size={13} />
          <span className="font-medium">D\u00e9connexion</span>
        </button>
      </div>
    </aside>
  )
}

function TopBar() {
  return (
    <div className="h-11 flex-shrink-0 flex items-center justify-end px-6 gap-3"
         style={{ background: '#0A0A0F', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <NotificationBell />
    </div>
  )
}

const FULL_HEIGHT_PAGES = new Set(['prospects'])

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())
  const [page, setPage] = useState('dashboard')

  const handleLogout = async () => { await apiLogout(); setAuthed(false) }

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  const PAGES = {
    dashboard:     <DashboardPage />,
    properties:    <PropertiesPage />,
    prospects:     <ProspectsPage />,
    calendar:      <CalendarPage />,
    analytics:     <AnalyticsPage />,
    conversations: <ConversationsPage />,
    settings:      <SettingsPage />,
  }

  const isFullHeight = FULL_HEIGHT_PAGES.has(page)

  return (
    <div className="flex min-h-screen bg-creme">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <TopBar />
        <main className={`flex-1 overflow-auto ${isFullHeight ? '' : 'p-7'}`}>
          {PAGES[page]}
        </main>
      </div>
    </div>
  )
}
