import { useEffect, useState } from 'react'
import {
  Moon, RefreshCw, Phone, Mail, MessageSquare,
  Calendar, User, Clock,
} from 'lucide-react'
import { getStats, getMorningBrief } from '../api/client'

// getStats kept in import to avoid breaking existing imports — unused in render

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateFull(date) {
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtDuration(sec) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = String(sec % 60).padStart(2, '0')
  return `${m}m${s}s`
}

function fmtPrice(price) {
  if (!price) return ''
  return Number(price).toLocaleString('fr-FR')
}

const CHANNEL_ICONS = {
  web_chat: MessageSquare,
  phone:    Phone,
  email:    Mail,
}

const STATUS_LABELS = {
  open:         'Nouveau',
  qualified:    'Qualifi\u00e9',
  visit_booked: 'RDV planifi\u00e9',
  closed:       'Ferm\u00e9',
}

const STATUS_STYLE = {
  open:         { bg: 'rgba(59,130,246,0.08)',  text: '#2563EB', border: 'rgba(59,130,246,0.2)'  },
  qualified:    { bg: 'rgba(245,158,11,0.08)',  text: '#D97706', border: 'rgba(245,158,11,0.2)'  },
  visit_booked: { bg: 'rgba(16,185,129,0.08)',  text: '#059669', border: 'rgba(16,185,129,0.2)'  },
  closed:       { bg: 'rgba(155,148,136,0.08)', text: '#9B9488', border: 'rgba(155,148,136,0.2)' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest mb-3"
        style={{ color: '#9B9488', letterSpacing: '0.12em' }}>
      {children}
    </h2>
  )
}

function ProspectCard({ prospect }) {
  const Icon = CHANNEL_ICONS[prospect.channel] || MessageSquare
  const ss = STATUS_STYLE[prospect.status] || STATUS_STYLE.closed

  return (
    <div className="bg-white border border-lin rounded-xl p-4 shadow-card flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
           style={{ background: 'rgba(201,169,110,0.1)' }}>
        <User size={14} style={{ color: '#C9A96E' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-sm font-semibold text-noir">
            {prospect.prospect_name || 'Anonyme'}
          </span>
          <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}>
            {STATUS_LABELS[prospect.status] || prospect.status}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs" style={{ color: '#9B9488' }}>
          {prospect.prospect_email && (
            <span className="flex items-center gap-1">
              <Mail size={10} />
              {prospect.prospect_email}
            </span>
          )}
          {prospect.prospect_phone && (
            <span className="flex items-center gap-1">
              <Phone size={10} />
              {prospect.prospect_phone}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Icon size={10} />
            {prospect.channel}
          </span>
        </div>
        {prospect.created_at && (
          <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: '#9B9488' }}>
            <Clock size={10} />
            {fmtTime(prospect.created_at)}
          </div>
        )}
      </div>
    </div>
  )
}

function CallCard({ call }) {
  return (
    <div className="bg-white border border-lin rounded-xl p-4 shadow-card flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
           style={{ background: '#F5F3EE' }}>
        <Phone size={14} style={{ color: '#9B9488' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-noir">
            {call.prospect_name || call.prospect_phone || 'Num\u00e9ro inconnu'}
          </span>
          {call.call_duration_sec > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: '#F5F3EE', color: '#6B6459' }}>
              {fmtDuration(call.call_duration_sec)}
            </span>
          )}
        </div>
        {call.call_summary && (
          <p className="text-xs leading-relaxed line-clamp-2" style={{ color: '#9B9488' }}>
            {call.call_summary}
          </p>
        )}
        {call.created_at && (
          <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: '#9B9488' }}>
            <Clock size={10} />
            {fmtTime(call.created_at)}
          </div>
        )}
      </div>
    </div>
  )
}

function VisitCard({ visit }) {
  const prop = visit.visited_property

  return (
    <div className="bg-white border border-lin rounded-xl p-4 shadow-card flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
           style={{ background: 'rgba(201,169,110,0.1)' }}>
        <Calendar size={14} style={{ color: '#C9A96E' }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-noir">
            {visit.prospect_name || 'Prospect anonyme'}
          </span>
          {visit.visit_booked_at && (
            <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(16,185,129,0.08)', color: '#059669', border: '1px solid rgba(16,185,129,0.2)' }}>
              {fmtTime(visit.visit_booked_at)}
            </span>
          )}
        </div>
        {prop && (
          <p className="text-xs mt-0.5" style={{ color: '#9B9488' }}>
            {prop.title}
            {prop.city && <span> &mdash; {prop.city}</span>}
            {prop.price && (
              <span> &mdash; <span style={{ color: '#C9A96E' }} className="font-medium">{fmtPrice(prop.price)}&nbsp;\u20ac</span></span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

const PIPELINE_CONFIG = [
  { key: 'open',         label: 'Nouveaux',   bg: 'rgba(155,148,136,0.08)', text: '#6B6459',  border: 'rgba(155,148,136,0.2)' },
  { key: 'qualified',    label: 'Qualifi\u00e9s',  bg: 'rgba(245,158,11,0.08)', text: '#D97706',  border: 'rgba(245,158,11,0.2)'  },
  { key: 'visit_booked', label: 'RDV',        bg: 'rgba(16,185,129,0.08)',  text: '#059669',  border: 'rgba(16,185,129,0.2)'   },
  { key: 'closed',       label: 'Ferm\u00e9s',    bg: 'rgba(100,116,139,0.08)', text: '#475569',  border: 'rgba(100,116,139,0.2)' },
]

function PipelineCard({ label, count, bg, text, border }) {
  return (
    <div className="bg-white border border-lin rounded-xl p-4 shadow-card flex-1 min-w-0 text-center">
      <div className="font-serif text-noir leading-none mb-1.5"
           style={{ fontSize: '1.6rem', fontWeight: 600 }}>
        {count ?? 0}
      </div>
      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
            style={{ background: bg, color: text, border: `1px solid ${border}` }}>
        {label}
      </span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [now, setNow] = useState(new Date())

  // update clock every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const load = (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    getMorningBrief()
      .then(setBrief)
      .catch(() => {})
      .finally(() => { setLoading(false); setRefreshing(false) })
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 rounded-full border-2 border-lin animate-spin"
           style={{ borderTopColor: '#C9A96E' }} />
    </div>
  )

  const b = brief || {}
  const prospects = b.overnight_prospects || []
  const calls     = b.overnight_calls || []
  const visits    = b.todays_visits || []
  const pipeline  = b.pipeline_summary || {}
  const nightQuiet = prospects.length === 0 && calls.length === 0

  const hourStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }).replace(':', 'h')
  const dateStr = fmtDateFull(now)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1"
             style={{ color: '#C9A96E', letterSpacing: '0.12em' }}>
            Bonjour &bull; {hourStr}
          </p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '2rem', fontWeight: 500 }}>
            Briefing du jour
          </h1>
          <p className="text-sm mt-1 capitalize" style={{ color: '#9B9488' }}>
            {dateStr}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-lin bg-white hover:bg-creme"
          style={{ color: '#6B6459' }}
        >
          <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          Actualiser
        </button>
      </div>

      {/* Section 1 — Cette nuit */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <SectionTitle>Cette nuit</SectionTitle>
          {!nightQuiet && (
            <div className="flex items-center gap-2 mb-3">
              {prospects.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: 'rgba(201,169,110,0.1)', color: '#A8823A', border: '1px solid rgba(201,169,110,0.25)' }}>
                  {prospects.length} prospect{prospects.length !== 1 ? 's' : ''}
                </span>
              )}
              {calls.length > 0 && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium"
                      style={{ background: '#F5F3EE', color: '#6B6459', border: '1px solid #E8E2D5' }}>
                  {calls.length} appel{calls.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>

        {nightQuiet ? (
          <div className="bg-white border border-lin rounded-xl p-10 text-center shadow-card">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
                 style={{ background: '#F5F3EE' }}>
              <Moon size={20} style={{ color: '#9B9488' }} />
            </div>
            <p className="text-sm font-medium text-noir mb-1">Nuit calme</p>
            <p className="text-xs" style={{ color: '#9B9488' }}>
              Aucun contact depuis hier soir
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {prospects.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#9B9488' }}>
                  Nouveaux prospects
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {prospects.map(p => <ProspectCard key={p.id} prospect={p} />)}
                </div>
              </div>
            )}
            {calls.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: '#9B9488' }}>
                  Appels re\u00e7us
                </p>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {calls.map(c => <CallCard key={c.id} call={c} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 2 — Visites du jour */}
      <div>
        <SectionTitle>Visites du jour</SectionTitle>
        {visits.length === 0 ? (
          <div className="bg-white border border-lin rounded-xl p-8 text-center shadow-card">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3"
                 style={{ background: '#F5F3EE' }}>
              <Calendar size={20} style={{ color: '#9B9488' }} />
            </div>
            <p className="text-sm" style={{ color: '#9B9488' }}>
              Aucune visite programm\u00e9e aujourd&apos;hui
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {visits.map(v => <VisitCard key={v.id} visit={v} />)}
          </div>
        )}
      </div>

      {/* Section 3 — Pipeline */}
      <div>
        <SectionTitle>Pipeline</SectionTitle>
        <div className="flex gap-3">
          {PIPELINE_CONFIG.map(cfg => (
            <PipelineCard
              key={cfg.key}
              label={cfg.label}
              count={pipeline[cfg.key]}
              bg={cfg.bg}
              text={cfg.text}
              border={cfg.border}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
