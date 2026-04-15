import { useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, Users, Calendar,
  BarChart2, MessageSquare, Phone, Mail, Clock
} from 'lucide-react'
import {
  getAnalyticsOverview,
  getAnalyticsTimeline,
  getAnalyticsTopSearches,
} from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(n) { return `${n}%` }

function fmtTrend(trendPct) {
  const pos = trendPct >= 0
  return {
    text: `${pos ? '+' : ''}${trendPct}% vs période préc.`,
    positive: pos,
  }
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, trend, color = 'blue' }) {
  const colors = {
    blue:  'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    slate: 'bg-slate-100 text-slate-600',
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors[color]}`}>
          <Icon size={20} />
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend >= 0 ? 'text-green-600' : 'text-red-500'
          }`}>
            {trend >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {trend >= 0 ? '+' : ''}{trend}%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-900 mb-0.5">{value}</div>
      <div className="text-sm text-slate-500">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

// ── SimpleBar ─────────────────────────────────────────────────────────────────

function SimpleBar({ data = [], maxVal, color = '#3b82f6', label }) {
  if (!data.length) return null
  const max = maxVal || Math.max(...data.map(d => d.value), 1)
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      {label && <div className="text-sm font-semibold text-slate-700 mb-4">{label}</div>}
      <div className="space-y-2.5">
        {data.map((item, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-24 text-xs text-slate-600 truncate flex-shrink-0">{item.label}</div>
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${Math.round((item.value / max) * 100)}%`,
                  background: color,
                }}
              />
            </div>
            <div className="w-8 text-xs text-slate-500 text-right flex-shrink-0">{item.value}</div>
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
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <div className="text-sm font-semibold text-slate-700 mb-4">Conversations par jour</div>
      <div className="flex items-end gap-1 h-24">
        {timeline.map((day, i) => {
          const h = Math.max(Math.round((day.total / max) * 88), day.total > 0 ? 4 : 2)
          return (
            <div
              key={i}
              className="flex-1 flex flex-col items-center group relative"
            >
              <div
                className="w-full rounded-sm bg-blue-500 opacity-80 group-hover:opacity-100 transition-opacity"
                style={{ height: `${h}px` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-xs px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                {day.date.slice(5)}: {day.total}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-slate-400">
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
      .then(([ov, tl, sr]) => {
        setOverview(ov)
        setTimeline(tl)
        setSearches(sr)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  )

  if (error) return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 m-6">{error}</div>
  )

  const channelData = Object.entries(overview?.by_channel || {}).map(([k, v]) => ({
    label: k === 'web_chat' ? 'Chat web' : k === 'phone' ? 'Téléphone' : k,
    value: v,
  })).sort((a, b) => b.value - a.value)

  const typeData = (searches?.top_types || []).map(([label, value]) => ({ label, value }))
  const cityData = (searches?.top_cities || []).map(([label, value]) => ({ label, value }))

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>
          <p className="text-slate-500 mt-1 text-sm">Performance de l'agence</p>
        </div>
        <select
          value={days}
          onChange={e => setDays(Number(e.target.value))}
          className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          value={overview?.conversations?.total ?? '—'}
          trend={overview?.conversations?.trend_pct}
          color="blue"
        />
        <StatCard
          icon={TrendingUp}
          label="Taux de qualification"
          value={pct(overview?.qualification_rate ?? 0)}
          sub="Email capturé / Total"
          color="amber"
        />
        <StatCard
          icon={Calendar}
          label="RDV planifiés"
          value={overview?.by_status?.visit_booked ?? '—'}
          sub={`Taux : ${pct(overview?.visit_booking_rate ?? 0)}`}
          color="green"
        />
        <StatCard
          icon={BarChart2}
          label="Conversations fermées"
          value={overview?.by_status?.closed ?? '—'}
          sub={`Taux : ${pct(overview?.conversion_rate ?? 0)}`}
          color="slate"
        />
      </div>

      {/* Timeline */}
      <MiniTimeline timeline={timeline} />

      {/* Channel + Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SimpleBar
          data={channelData}
          label="Conversations par canal"
          color="#3b82f6"
        />

        <SimpleBar
          data={[
            { label: 'Nouveau', value: overview?.by_status?.open ?? 0 },
            { label: 'Qualifié', value: overview?.by_status?.qualified ?? 0 },
            { label: 'RDV planifié', value: overview?.by_status?.visit_booked ?? 0 },
            { label: 'Fermé', value: overview?.by_status?.closed ?? 0 },
          ]}
          label="Répartition par statut"
          color="#10b981"
        />
      </div>

      {/* Search criteria insights */}
      {searches && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {typeData.length > 0 && (
            <SimpleBar
              data={typeData}
              label="Types de biens recherchés"
              color="#f59e0b"
            />
          )}
          {cityData.length > 0 && (
            <SimpleBar
              data={cityData}
              label="Villes les plus recherchées"
              color="#8b5cf6"
            />
          )}

          {(searches.avg_budget || searches.avg_surface) && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 lg:col-span-2">
              <div className="text-sm font-semibold text-slate-700 mb-4">Tendances de recherche</div>
              <div className="grid grid-cols-2 gap-4">
                {searches.avg_budget && (
                  <div className="text-center">
                    <div className="text-xl font-bold text-slate-900">
                      {searches.avg_budget.toLocaleString('fr-FR')} €
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Budget moyen recherché</div>
                  </div>
                )}
                {searches.avg_surface && (
                  <div className="text-center">
                    <div className="text-xl font-bold text-slate-900">
                      {searches.avg_surface} m²
                    </div>
                    <div className="text-xs text-slate-500 mt-1">Surface minimale moyenne</div>
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
