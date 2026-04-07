import { useState } from 'react'
import { login, setToken } from '../api/client'

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('admin@immoplus.fr')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      setToken(data.access_token)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1200&q=80"
          alt="Immeuble Lyon"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/90 to-blue-700/80" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">🏠</div>
            <span className="text-white font-bold text-xl">AutoPilot Immo</span>
          </div>
          <div>
            <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
              Gérez votre agence<br />avec l'IA
            </h1>
            <p className="text-blue-200 text-base leading-relaxed mb-8">
              Chatbot RAG 24/7 · Rédaction d'annonces · Analyse de documents · Agent vocal Twilio
            </p>
            <div className="flex gap-6">
              {[
                { value: '4', label: 'Agents IA' },
                { value: '24/7', label: 'Disponibilité' },
                { value: '100%', label: 'Automatisé' },
              ].map(s => (
                <div key={s.label}>
                  <div className="text-2xl font-extrabold text-white">{s.value}</div>
                  <div className="text-blue-300 text-sm">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-blue-300 text-xs">Projet portfolio — Rodanim GANABA · Développeur IA Freelance</p>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden text-center mb-8">
            <div className="text-4xl mb-2">🏠</div>
            <h1 className="text-2xl font-bold text-slate-800">AutoPilot Immo</h1>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-800 mb-1">Connexion</h2>
            <p className="text-slate-400 text-sm mb-6">Dashboard de gestion agence</p>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
                <span>⚠️</span> {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading ? (
                  <><span className="animate-spin">⏳</span> Connexion…</>
                ) : (
                  <><span>🔐</span> Se connecter</>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-slate-400 mt-6">
            Démo : admin@immoplus.fr · admin123
          </p>
        </div>
      </div>
    </div>
  )
}
