import { useEffect, useState } from 'react'
import { getStats } from '../api/client'

function StatCard({ icon, label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
      <div className={`text-2xl mb-3`}>{icon}</div>
      <div className="text-3xl font-bold text-slate-800">{value ?? '—'}</div>
      <div className="text-sm font-medium text-slate-500 mt-1">{label}</div>
      {sub && <div className={`text-xs mt-1 ${color || 'text-slate-400'}`}>{sub}</div>}
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch(err => setError(err.message))
  }, [])

  if (error) return <div className="text-red-500 p-4">{error}</div>

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800">Tableau de bord</h1>
        <p className="text-slate-500 text-sm mt-1">Vue d'ensemble — Agence ImmoPlus</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon="🏠"
          label="Biens au catalogue"
          value={stats?.properties.total}
          sub={`${stats?.properties.active ?? 0} actifs`}
          color="text-green-600"
        />
        <StatCard
          icon="💬"
          label="Conversations"
          value={stats?.conversations.total}
          sub={`${stats?.conversations.open ?? 0} ouvertes`}
          color="text-blue-600"
        />
        <StatCard
          icon="📄"
          label="Documents analysés"
          value={stats?.documents.done}
          sub={`${stats?.documents.total ?? 0} total`}
          color="text-slate-400"
        />
        <StatCard
          icon="📝"
          label="Annonces générées"
          value={stats?.listings.total}
          sub={`${stats?.listings.approved ?? 0} approuvées`}
          color="text-purple-600"
        />
      </div>

      <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
        <h2 className="font-semibold text-slate-700 mb-4">Accès rapides</h2>
        <div className="grid grid-cols-2 gap-3">
          {(() => {
            const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
              ? 'http://localhost:8000'
              : window.location.origin
            return [
              { icon: '🤖', label: 'Chatbot RAG', desc: 'Widget prospect en temps réel', href: `${BASE}/widget/demo.html` },
              { icon: '🎙️', label: 'Assistant Vocal', desc: 'Pipeline Whisper → GPT → TTS', href: `${BASE}/widget/voice_demo.html` },
              { icon: '📋', label: 'API Docs', desc: 'Swagger / OpenAPI', href: `${BASE}/docs` },
              { icon: '🔧', label: 'Biens', desc: 'Gérer le catalogue', action: 'properties' },
            ]
          })().map(item => (
            <a
              key={item.label}
              href={item.href || '#'}
              target={item.href ? '_blank' : undefined}
              rel="noreferrer"
              className="flex items-start gap-3 p-4 rounded-lg border border-slate-100 hover:border-blue-200 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              <span className="text-2xl">{item.icon}</span>
              <div>
                <div className="text-sm font-medium text-slate-700">{item.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{item.desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
