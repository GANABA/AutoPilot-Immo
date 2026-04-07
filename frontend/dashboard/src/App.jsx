import { useState } from 'react'
import { clearToken, getToken } from './api/client'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PropertiesPage from './pages/PropertiesPage'
import ConversationsPage from './pages/ConversationsPage'

const NAV = [
  { id: 'dashboard',     icon: '📊', label: 'Tableau de bord' },
  { id: 'properties',    icon: '🏠', label: 'Biens' },
  { id: 'conversations', icon: '💬', label: 'Conversations' },
]

const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : window.location.origin

const EXTERNAL = [
  { icon: '🤖', label: 'Chatbot démo',  href: `${BASE}/widget/demo.html` },
  { icon: '🎙️', label: 'Vocal démo',    href: `${BASE}/widget/voice_demo.html` },
  { icon: '📋', label: 'API Swagger',   href: `${BASE}/docs` },
]

function Sidebar({ page, setPage, onLogout }) {
  return (
    <aside className="w-60 flex-shrink-0 bg-slate-950 min-h-screen flex flex-col border-r border-slate-800">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-lg">🏠</div>
          <div>
            <div className="text-white font-extrabold text-sm tracking-tight">AutoPilot Immo</div>
            <div className="text-slate-500 text-xs">Dashboard agence</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 mb-2">Navigation</div>
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              page === item.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/30'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div className="pt-5">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 mb-2">Outils</div>
          {EXTERNAL.map(item => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-all"
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
              <span className="ml-auto text-slate-600 text-xs">↗</span>
            </a>
          ))}
        </div>
      </nav>

      {/* Status */}
      <div className="px-5 py-3 mx-3 mb-3 bg-slate-900 rounded-xl">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></span>
          <span className="text-xs text-slate-400">4 agents IA opérationnels</span>
        </div>
      </div>

      {/* User */}
      <div className="p-3 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">A</div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-semibold truncate">Admin</div>
            <div className="text-slate-500 text-xs truncate">admin@immoplus.fr</div>
          </div>
        </div>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-800 hover:text-red-400 transition-colors"
        >
          <span>🚪</span>
          Déconnexion
        </button>
      </div>
    </aside>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(!!getToken())
  const [page, setPage] = useState('dashboard')

  const handleLogout = () => {
    clearToken()
    setAuthed(false)
  }

  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />

  const PAGES = {
    dashboard:     <DashboardPage />,
    properties:    <PropertiesPage />,
    conversations: <ConversationsPage />,
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />
      <main className="flex-1 p-8 overflow-auto">
        {PAGES[page]}
      </main>
    </div>
  )
}
