import { useState } from 'react'
import { Mail, Lock, Home, AlertCircle, Loader2 } from 'lucide-react'
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
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1200&q=80"
          alt="Immeuble"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/90 to-blue-700/80" />
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Home size={20} className="text-white" />
            </div>
            <span className="text-white font-bold text-xl">AutoPilot Immo</span>
          </div>
          <div>
            <h1 className="text-4xl font-extrabold text-white leading-tight mb-4">
              Gérez votre agence<br />avec l'IA
            </h1>
            <p className="text-blue-200 text-base leading-relaxed mb-8">
              Chatbot RAG 24/7 · Rédaction d'annonces · Analyse de documents · Agent vocal Twilio
            </p>
            <div className="flex gap-8">
              {[['4', 'Agents IA'], ['24/7', 'Disponibilité'], ['100%', 'Automatisé']].map(([v, l]) => (
                <div key={l}>
                  <div className="text-2xl font-extrabold text-white">{v}</div>
                  <div className="text-blue-300 text-sm">{l}</div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-blue-300/60 text-xs">ImmoPlus — Agence immobilière Lyon</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <Home size={18} className="text-white" />
            </div>
            <span className="text-xl font-bold text-slate-800">AutoPilot Immo</span>
          </div>

          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
            <h2 className="text-xl font-bold text-slate-800 mb-1">Connexion</h2>
            <p className="text-slate-400 text-sm mb-6">Dashboard de gestion agence</p>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5 flex items-center gap-2">
                <AlertCircle size={15} className="flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Mot de passe</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
              >
                {loading
                  ? <><Loader2 size={15} className="animate-spin" /> Connexion…</>
                  : 'Se connecter'
                }
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
