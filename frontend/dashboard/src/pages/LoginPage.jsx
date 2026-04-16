import { useState } from 'react'
import { Mail, Lock, AlertCircle, Loader2, Building2 } from 'lucide-react'
import { login } from '../api/client'

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
      await login(email, password)
      onLogin()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-creme">
      {/* Left — dark brand panel */}
      <div className="hidden lg:flex lg:w-[46%] flex-col relative overflow-hidden bg-noir">
        {/* Background texture */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 50%, #C9A96E 0%, transparent 60%), radial-gradient(circle at 80% 20%, #C9A96E 0%, transparent 50%)' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-between h-full p-12">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #C9A96E, #A8823A)' }}>
              <Building2 size={17} className="text-white" />
            </div>
            <span className="font-serif text-white font-semibold text-xl tracking-wide">ImmoPlus</span>
          </div>

          {/* Main copy */}
          <div>
            <div className="mb-6">
              <div className="h-px w-12 mb-8" style={{ background: '#C9A96E' }} />
              <h1 className="font-serif text-white leading-tight mb-5"
                  style={{ fontSize: '2.6rem', fontWeight: 500, lineHeight: 1.15 }}>
                L&apos;IA au service<br />
                <span style={{ color: '#C9A96E' }}>de votre agence</span>
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: '#6A6A88' }}>
                Automatisez la qualification des prospects, la r&eacute;daction d&apos;annonces et la prise de rendez-vous 24h/24.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                ['4', 'Agents IA'],
                ['24/7', 'Disponibilit&eacute;'],
                ['100%', 'Automatis&eacute;'],
              ].map(([v, l]) => (
                <div key={l} className="p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="font-serif text-2xl font-semibold" style={{ color: '#C9A96E' }} dangerouslySetInnerHTML={{ __html: v }} />
                  <div className="text-xs mt-0.5" style={{ color: '#6A6A88' }} dangerouslySetInnerHTML={{ __html: l }} />
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs" style={{ color: '#3A3A52' }}>ImmoPlus &mdash; Agence immobili&egrave;re Lyon</p>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2.5 justify-center mb-10">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                 style={{ background: 'linear-gradient(135deg, #C9A96E, #A8823A)' }}>
              <Building2 size={15} className="text-white" />
            </div>
            <span className="font-serif text-noir font-semibold text-xl tracking-wide">ImmoPlus</span>
          </div>

          <div className="mb-8">
            <h2 className="font-serif text-noir leading-tight mb-1.5"
                style={{ fontSize: '1.9rem', fontWeight: 500 }}>
              Connexion
            </h2>
            <p className="text-sm" style={{ color: '#9B9488' }}>Dashboard de gestion agence</p>
          </div>

          {error && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg mb-5 text-sm"
                 style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B6459', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Email
              </label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9B9488' }} />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="input-field pl-9"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#6B6459', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Mot de passe
              </label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9B9488' }} />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="input-field pl-9"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all mt-2 text-white disabled:opacity-60"
              style={{ background: loading ? '#4A4A62' : '#0A0A0F' }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.background = '#1F1F2E' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.background = '#0A0A0F' }}
            >
              {loading ? (
                <><Loader2 size={14} className="animate-spin" /> Connexion&hellip;</>
              ) : (
                'Se connecter'
              )}
            </button>
          </form>

          <div className="mt-8 pt-6 text-center" style={{ borderTop: '1px solid #E8E2D5' }}>
            <p className="text-xs" style={{ color: '#9B9488' }}>
              AutoPilot Immo &mdash; Syst&egrave;me multi-agents IA
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
