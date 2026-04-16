import { useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, Users, Calendar,
  BarChart2, MessageSquare, Phone,
} from 'lucide-react'
import {
  getAnalyticsOverview,
  getAnalyticsTimeline,
  getAnalyticsTopSearches,
} from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n) { return `${n}%` }

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, trend, accent = false }) {
  return (
    <div className="bg-white border border-lin rounded-xl p-5 shadow-card">
      <div className="flex items-start justify-between mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
             style={{ background: accent ? 'rgba(201,169,110,0.12)' : '#F5F3EE' }}>
          <Icon size={17} style={{ color: accent ? '#C9A96E' : '#9B9488' }} />
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 text-xs font-medium"
               style={{ color: trend >= 0 ? '#10B981' : '#EF4444' }}>
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend >= 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>
      <div className="font-serif text-noir leading-none mb-1.5"
           style={{ fontSize: '1.85rem', fontWeight: 600 }}>
        {value ?? '\u2014'}
      </div>
      <div className="text-xs font-medium" style={{ color: '#6B6459' }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: '#9B9488' }}>{sub}</div>}
    </div>
  )
}

// ── SimpleBar ─────────────────────────────────────────────────────────────────

function SimpleBar({ data = [], label, accent = false }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.value), 1)
  const barColor = accent ? '#C9A96E' : '#0A0A0F'
  return (
    <div className="bg-white border border-lin rounded-xl p-5 shadow-card">
      {label && <div className="font-serif font-semibold text-noir mb-4" style={{ fontSize: '0.95rem' }}>{label}</div>}
      <div className="space-y-3">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-xs truncate flex-shrink-0" style={{ color: '#6B6459' }}>{item.label}</div>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#F0ECE4' }}>
              <div
                className="h-1.5 rounded-full transition-all"
                style={{ width: `${Math.round((item.value / max) * 100)}%`, background: barColor }}
              />
            </div>
            <div className="w-8 text-xs text-right flex-shrink-0 font-medium text-noir">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── MiniTimeline ──────────────────────────────────────────────────────────────

function MiniTimeline({ timeline = [] }) {
  if (!timeline.length) return null
  const max = Math.max(...timeline.map(d => d.total), 1)

  return (
    <div className="bg-white border border-lin rounded-xl p-5 shadow-card">
      <div className="font-serif font-semibold text-noir mb-4" style={{ fontSize: '0.95rem' }}>
        Conversations par jour
      </div>
      <div className="flex items-end gap-0.5 h-20">
        {timeline.map((day, i) => {
          const h = Math.max(Math.round((day.total / max) * 72), day.total > 0 ? 4 : 2)
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative">
              <div
                className="w-full rounded-sm transition-opacity group-hover:opacity-100"
                style={{ height: `${h}px`, background: '#0A0A0F', opacity: 0.7 }}
              />
              <div className="absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 bg-noir text-white text-xs px-2 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {day.date?.slice(5)}: {day.total}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs" style={{ color: '#9B9488' }}>
        <span>{timeline[0]?.date?.slice(5)}</span>
        <span>{timeline[timeline.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [days, setDays] = useState(30)
  const [overview, setOverview] = useState(null)
  const [timeline, setTimeline] = useState([])
  const [searches, setSearches] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      getAnalyticsOverview(days),
      getAnalyticsTimeline(days),
      getAnalyticsTopSearches(days),
    ])
      .then(([ov, tl, sr]) => { setOverview(ov); setTimeline(tl); setSearches(sr) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

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

  const channelData = Object.entries(overview?.by_channel || {}).map(([k, v]) => ({
    label: k === 'web_chat' ? 'Chat web' : k === 'phone' ? 'T\u00e9l\u00e9phone' : k,
    value: v,
  })).sort((a, b) => b.value - a.value)

  const typeData = (searches?.top_types || []).map(([label, value]) => ({ label, value }))
  const cityData = (searches?.top_cities || []).map(([label, value]) => ({ label, value }))

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1"
             style={{ color: '#C9A96E', letterSpacing: '0.12em' }}>
            Performance
          </p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '2rem', fontWeight: 500 }}>
            Analytics
          </h1>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="input-field w-auto text-xs"
          style={{ paddingTop: '6px', paddingBottom: '6px' }}
        >
          <option value={7}>7 derniers jours</option>
          <option value={14}>14 derniers jours</option>
          <option value={30}>30 derniers jours</option>
          <option value={90}>90 derniers jours</option>
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Conversations"
          value={overview?.conversations?.total ?? '\u2014'}
          trend={overview?.conversations?.trend_pct}
          accent
        />
        <StatCard
          icon={TrendingUp}
          label="Taux de qualification"
          value={pct(overview?.qualification_rate ?? 0)}
          sub="Email captur\u00e9 / Total"
        />
        <StatCard
          icon={Calendar}
          label="RDV planifi\u00e9s"
          value={overview?.by_status?.visit_booked ?? '\u2014'}
          sub={`Taux\u00a0: ${pct(overview?.visit_booking_rate ?? 0)}`}
          accent
        />
        <StatCard
          icon={BarChart2}
          label="Conversations ferm\u00e9es"
          value={overview?.by_status?.closed ?? '\u2014'}
          sub={`Taux\u00a0: ${pct(overview?.conversion_rate ?? 0)}`}
        />
      </div>

      {/* Timeline */}
      <MiniTimeline timeline={timeline} />

      {/* Channel + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SimpleBar data={channelData} label="Conversations par canal" />
        <SimpleBar
          data={[
            { label: 'Nouveau',       value: overview?.by_status?.open || 0 },
            { label: 'Qualifi\u00e9', value: overview?.by_status?.qualified || 0 },
            { label: 'RDV planifi\u00e9', value: overview?.by_status?.visit_booked || 0 },
            { label: 'Ferm\u00e9',    value: overview?.by_status?.closed || 0 },
          ]}
          label="R\u00e9partition par statut"
          accent
        />
      </div>

      {/* Search criteria */}
      {searches && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {typeData.length > 0 && <SimpleBar data={typeData} label="Types de biens recherch\u00e9s" accent />}
          {cityData.length > 0 && <SimpleBar data={cityData} label="Villes les plus recherch\u00e9es" />}

          {(searches.avg_budget || searches.avg_surface) && (
            <div className="bg-white border border-lin rounded-xl p-5 shadow-card lg:col-span-2">
              <div className="font-serif font-semibold text-noir mb-4" style={{ fontSize: '0.95rem' }}>
                Tendances de recherche
              </div>
              <div className="grid grid-cols-2 gap-4">
                {searches.avg_budget && (
                  <div className="text-center p-4 rounded-lg" style={{ background: '#F5F3EE' }}>
                    <div className="font-serif text-2xl font-semibold text-noir">
                      {searches.avg_budget.toLocaleString('fr-FR')} \u20ac
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#9B9488' }}>Budget moyen recherch\u00e9</div>
                  </div>
                )}
                {searches.avg_surface && (
                  <div className="text-center p-4 rounded-lg" style={{ background: '#F5F3EE' }}>
                    <div className="font-serif text-2xl font-semibold text-noir">
                      {searches.avg_surface} m\u00b2
                    </div>
                    <div className="text-xs mt-1" style={{ color: '#9B9488' }}>Surface minimale moyenne</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
