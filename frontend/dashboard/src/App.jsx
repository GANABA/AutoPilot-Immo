import { useState } from 'react'
import { clearToken, getToken } from './api/client'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PropertiesPage from './pages/PropertiesPage'
import ConversationsPage from './pages/ConversationsPage'

const NAV = [
  { id: 'dashboard',     icon: '📊', label: 'Dashboard' },
  { id: 'properties',    icon: '🏠', label: 'Biens' },
  { id: 'conversations', icon: '💬', label: 'Conversations' },
]

const EXTERNAL = [
  { icon: '🤖', label: 'Chatbot démo',  href: 'http://localhost:8000/widget/demo.html' },
  { icon: '🎙️', label: 'Vocal démo',    href: 'http://localhost:8000/widget/voice_demo.html' },
  { icon: '📋', label: 'API Swagger',   href: 'http://localhost:8000/docs' },
]

function Sidebar({ page, setPage, onLogout }) {
  return (
    <aside className="w-56 flex-shrink-0 bg-slate-900 min-h-screen flex flex-col">
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🏠</span>
          <div>
            <div className="text-white font-bold text-sm">AutoPilot</div>
            <div className="text-slate-400 text-xs">ImmoPlus</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV.map(item => (
          <button
            key={item.id}
            onClick={() => setPage(item.id)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
              page === item.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div className="pt-4 pb-1">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-3 mb-2">
            Outils
          </div>
          {EXTERNAL.map(item => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <span>{item.icon}</span>
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="p-3 border-t border-slate-800">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
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
    <div className="flex min-h-screen">
      <Sidebar page={page} setPage={setPage} onLogout={handleLogout} />
      <main className="flex-1 p-8 overflow-auto">
        {PAGES[page]}
      </main>
    </div>
  )
}
