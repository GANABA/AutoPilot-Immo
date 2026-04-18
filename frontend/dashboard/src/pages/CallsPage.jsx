import { useEffect, useState } from 'react'
import { Phone, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { getConversations } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDateTime(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  const now = new Date()
  const diffMs = now - date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  const timeStr = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    .replace(':', 'h')

  if (diffDays === 0) return `aujourd'hui à ${timeStr}`
  if (diffDays === 1) return `hier à ${timeStr}`
  if (diffDays < 7) {
    const weekday = date.toLocaleDateString('fr-FR', { weekday: 'long' })
    return `${weekday} à ${timeStr}`
  }
  const dateStr = date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' })
  return `${dateStr} à ${timeStr}`
}

function fmtDuration(sec) {
  if (!sec || sec <= 0) return null
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}s`
  return `${m}min ${s > 0 ? s + 's' : ''}`.trim()
}

const STATUS_CONFIG = {
  open:         { label: 'En cours',     bg: 'rgba(107,100,89,0.1)',  color: '#6B6459',  border: 'rgba(107,100,89,0.2)' },
  qualified:    { label: 'Qualifié',     bg: 'rgba(201,169,110,0.1)', color: '#A8823A',  border: 'rgba(201,169,110,0.25)' },
  visit_booked: { label: 'Visite',       bg: 'rgba(16,185,129,0.1)',  color: '#059669',  border: 'rgba(16,185,129,0.2)' },
  closed:       { label: 'Clôturé',      bg: 'rgba(15,15,20,0.07)',   color: '#4A4A62',  border: 'rgba(15,15,20,0.12)' },
}

// ── Call Card ─────────────────────────────────────────────────────────────────

function CallCard({ call }) {
  const [expanded, setExpanded] = useState(false)

  const status = STATUS_CONFIG[call.status] || STATUS_CONFIG.open
  const duration = fmtDuration(call.call_duration_sec)
  const hasSummary = !!call.call_summary

  return (
    <div className="bg-white border border-lin rounded-xl p-5 shadow-card hover:shadow-card-md transition-shadow">
      <div className="flex items-start gap-3">

        {/* Icon */}
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
             style={{ background: '#0A0A0F' }}>
          <Phone size={15} className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          {/* Top row: name + status badge */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="font-semibold text-noir text-sm">
              {call.prospect_name || 'Inconnu'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{
                    background: status.bg,
                    color: status.color,
                    border: `1px solid ${status.border}`,
                  }}>
              {status.label}
            </span>
          </div>

          {/* Phone number */}
          {call.prospect_phone && (
            <p className="text-xs mb-2 font-mono" style={{ color: '#9B9488' }}>
              {call.prospect_phone}
            </p>
          )}

          {/* Meta row: date + duration */}
          <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: '#9B9488' }}>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {fmtDateTime(call.created_at)}
            </span>
            {duration && (
              <span className="flex items-center gap-1">
                <Phone size={11} />
                {duration}
              </span>
            )}
          </div>

          {/* Summary */}
          {hasSummary && (
            <div className="mt-3">
              <p className={`text-xs leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}
                 style={{ color: '#6B6459' }}>
                {call.call_summary}
              </p>
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-0.5 text-xs mt-1 transition-colors"
                style={{ color: '#C9A96E' }}
              >
                {expanded ? (
                  <><ChevronUp size={12} /> Réduire</>
                ) : (
                  <><ChevronDown size={12} /> Voir le résumé</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CallsPage() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = () => {
    setLoading(true)
    getConversations()
      .then(data => {
        const all = Array.isArray(data) ? data : (data?.items || [])
        setCalls(all.filter(c => c.channel === 'phone'))
      })
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
            Téléphonie
          </p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '2rem', fontWeight: 500 }}>
            Appels
          </h1>
          <p className="text-sm mt-1" style={{ color: '#9B9488' }}>
            {calls.length} appel{calls.length !== 1 ? 's' : ''} enregistré{calls.length !== 1 ? 's' : ''}
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

      {/* Empty state */}
      {calls.length === 0 ? (
        <div className="bg-white border border-lin rounded-xl p-14 text-center shadow-card">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
               style={{ background: '#F5F3EE' }}>
            <Phone size={22} style={{ color: '#9B9488' }} />
          </div>
          <h3 className="font-semibold text-noir mb-1.5">Aucun appel enregistré</h3>
          <p className="text-sm" style={{ color: '#9B9488' }}>
            Les appels entrants traités par l&apos;agent vocal apparaîtront ici.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {calls.map(call => (
            <CallCard key={call.id} call={call} />
          ))}
        </div>
      )}
    </div>
  )
}
