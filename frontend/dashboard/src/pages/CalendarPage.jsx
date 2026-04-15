import { useEffect, useState } from 'react'
import { Calendar, Phone, Mail, MessageSquare, Clock, User, RefreshCw } from 'lucide-react'
import { getProspects } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  })
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtCriteria(criteria) {
  if (!criteria) return ''
  const parts = []
  if (criteria.property_type) parts.push(criteria.property_type)
  if (criteria.city)          parts.push(criteria.city)
  if (criteria.max_price)     parts.push(`≤ ${Number(criteria.max_price).toLocaleString('fr-FR')} €`)
  if (criteria.min_surface)   parts.push(`≥ ${criteria.min_surface} m²`)
  return parts.join(' · ')
}

const CHANNEL_ICONS = {
  web_chat: MessageSquare,
  phone:    Phone,
  email:    Mail,
}

// ── RDV Card ──────────────────────────────────────────────────────────────────

function RdvCard({ prospect }) {
  const Icon = CHANNEL_ICONS[prospect.channel] || Calendar
  const criteria = fmtCriteria(prospect.search_criteria)

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-green-300 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <User size={16} className="text-green-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-slate-900 text-sm">
              {prospect.prospect_name || 'Prospect anonyme'}
            </span>
            <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium border border-green-200">
              RDV planifié
            </span>
          </div>

          {criteria && (
            <p className="text-xs text-slate-500 mb-2">{criteria}</p>
          )}

          <div className="flex flex-wrap gap-3 text-xs text-slate-500">
            {prospect.prospect_email && (
              <span className="flex items-center gap-1">
                <Mail size={11} />
                {prospect.prospect_email}
              </span>
            )}
            {prospect.prospect_phone && (
              <span className="flex items-center gap-1">
                <Phone size={11} />
                {prospect.prospect_phone}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Icon size={11} />
              {prospect.channel}
            </span>
          </div>

          <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
            <Clock size={11} />
            Créé le {fmtDate(prospect.created_at)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    getProspects({ status: 'visit_booked', limit: 100 })
      .then(r => setProspects(r.items || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 m-6">{error}</div>
  )

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Agenda</h1>
          <p className="text-slate-500 mt-1 text-sm">
            {prospects.length} visite{prospects.length !== 1 ? 's' : ''} planifiée{prospects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {prospects.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar size={24} className="text-slate-400" />
          </div>
          <h3 className="text-slate-600 font-medium mb-1">Aucune visite planifiée</h3>
          <p className="text-slate-400 text-sm">
            Les visites confirmées via le chatbot ou l'agent vocal apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {prospects.map(p => (
            <RdvCard key={p.id} prospect={p} />
          ))}
        </div>
      )}

      {/* Info box about Google Calendar */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Calendar size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-blue-800">Synchronisation Google Calendar</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Les visites sont automatiquement créées dans votre agenda Google lors de la confirmation par le chatbot.
            Configurez votre calendrier dans les{' '}
            <span className="font-semibold">Paramètres → Calendrier</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
