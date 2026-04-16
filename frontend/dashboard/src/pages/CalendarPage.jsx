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

function fmtCriteria(criteria) {
  if (!criteria) return ''
  const parts = []
  if (criteria.property_type) parts.push(criteria.property_type)
  if (criteria.city)          parts.push(criteria.city)
  if (criteria.max_price)     parts.push(`\u2264 ${Number(criteria.max_price).toLocaleString('fr-FR')} \u20ac`)
  if (criteria.min_surface)   parts.push(`\u2265 ${criteria.min_surface} m\u00b2`)
  return parts.join(' \u00b7 ')
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
    <div className="bg-white border border-lin rounded-xl p-5 shadow-card hover:shadow-card-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: 'rgba(201,169,110,0.1)' }}>
          <User size={16} style={{ color: '#C9A96E' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-noir text-sm">
              {prospect.prospect_name || 'Prospect anonyme'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: 'rgba(16,185,129,0.1)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
              RDV planifi\u00e9
            </span>
          </div>

          {criteria && (
            <p className="text-xs mb-2" style={{ color: '#9B9488' }}>{criteria}</p>
          )}

          <div className="flex flex-wrap gap-3 text-xs" style={{ color: '#9B9488' }}>
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

          <div className="flex items-center gap-1 mt-2.5 text-xs" style={{ color: '#9B9488' }}>
            <Clock size={11} />
            <span>Cr\u00e9\u00e9 le {fmtDate(prospect.created_at)}</span>
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
      <div className="w-6 h-6 rounded-full border-2 border-lin animate-spin"
           style={{ borderTopColor: '#C9A96E' }} />
    </div>
  )

  if (error) return (
    <div className="rounded-lg p-4 text-sm"
         style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
      {error}
    </div>
  )

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1"
             style={{ color: '#C9A96E', letterSpacing: '0.12em' }}>
            Visites
          </p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '2rem', fontWeight: 500 }}>
            Agenda
          </h1>
          <p className="text-sm mt-1" style={{ color: '#9B9488' }}>
            {prospects.length} visite{prospects.length !== 1 ? 's' : ''} planifi\u00e9e{prospects.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-lin bg-white hover:bg-creme"
          style={{ color: '#6B6459' }}
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {prospects.length === 0 ? (
        <div className="bg-white border border-lin rounded-xl p-14 text-center shadow-card">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
               style={{ background: '#F5F3EE' }}>
            <Calendar size={22} style={{ color: '#9B9488' }} />
          </div>
          <h3 className="font-semibold text-noir mb-1.5">Aucune visite planifi\u00e9e</h3>
          <p className="text-sm" style={{ color: '#9B9488' }}>
            Les visites confirm\u00e9es via le chatbot ou l&apos;agent vocal appara\u00eetront ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {prospects.map(p => (
            <RdvCard key={p.id} prospect={p} />
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-xl p-4 flex items-start gap-3"
           style={{ background: 'rgba(201,169,110,0.06)', border: '1px solid rgba(201,169,110,0.2)' }}>
        <Calendar size={16} style={{ color: '#C9A96E' }} className="flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-noir">Synchronisation Google Calendar</p>
          <p className="text-xs mt-0.5" style={{ color: '#9B9488' }}>
            Les visites sont automatiquement cr\u00e9\u00e9es dans votre agenda Google lors de la confirmation.
            Configurez dans <span className="font-semibold text-noir">Param\u00e8tres \u2192 Calendrier</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
