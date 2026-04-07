import { useState } from 'react'
import {
  LayoutDashboard, Building2, MessageSquare,
  Bot, Mic, FileCode2, ExternalLink, LogOut, Home, Circle
} from 'lucide-react'
import { clearToken, getToken } from './api/client'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PropertiesPage from './pages/PropertiesPage'
import ConversationsPage from './pages/ConversationsPage'

const NAV = [
  { id: 'dashboard',     icon: LayoutDashboard, label: 'Tableau de bord' },
  { id: 'properties',    icon: Building2,        label: 'Biens' },
  { id: 'conversations', icon: MessageSquare,    label: 'Conversations' },
]

const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : window.location.origin

const EXTERNAL = [
  { icon: Bot,       label: 'Chatbot démo',  href: `${BASE}/widget/demo.html` },
  { icon: Mic,       label: 'Vocal démo',    href: `${BASE}/widget/voice_demo.html` },
  { icon: FileCode2, label: 'API Swagger',   href: `${BASE}/docs` },
]

function Sidebar({ page, setPage, onLogout }) {
  return (
    <aside className="w-60 flex-shrink-0 bg-slate-950 min-h-screen flex flex-col border-r border-slate-800">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <Home size={18} className="text-white" />
          </div>
          <div>
            <div className="text-white font-extrabold text-sm tracking-tight">AutoPilot Immo</div>
            <div className="text-slate-500 text-xs">Dashboard agence</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 mb-2">Navigation</div>
        {NAV.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setPage(id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              page === id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}

        <div className="pt-5">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 mb-2">Outils</div>
          {EXTERNAL.map(({ icon: Icon, label, href }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
            >
              <Icon size={16} />
              <span className="flex-1">{label}</span>
              <ExternalLink size={12} className="text-slate-600" />
            </a>
          ))}
        </div>
      </nav>

      {/* Status */}
      <div className="px-3 mb-3">
        <div className="px-3 py-2.5 bg-slate-900 rounded-xl flex items-center gap-2">
          <Circle size={8} className="text-green-500 fill-green-500 flex-shrink-0" />
          <span className="text-xs text-slate-400">4 agents IA opérationnels</span>
        </div>
      </div>

      {/* User */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">A</div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">Admin</div>
            <div className="text-slate-500 text-xs truncate">admin@immoplus.fr</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-colors"
        >
          <LogOut size={15} />
          Déconnexion
        </button>
      </div>
    </aside>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())
  const [page, setPage] = useState('dashboard')

  const handleLogout = () => { clearToken(); setAuthed(false) }

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  const PAGES = {
    dashboard:     <DashboardPage />,
    properties:    <PropertiesPage />,
    conversations: <ConversationsPage />,
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />
      <main className="flex-1 p-8 overflow-auto">{PAGES[page]}</main>
    </div>
  )
}
