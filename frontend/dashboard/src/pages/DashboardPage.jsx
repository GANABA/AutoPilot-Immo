import { useEffect, useState } from 'react'
import {
  Building2, MessageSquare, TrendingUp, Users,
  Phone, FileText, Zap, RefreshCw,
} from 'lucide-react'
import { getStats } from '../api/client'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtNum(n) {
  if (n === undefined || n === null) return '\u2014'
  return Number(n).toLocaleString('fr-FR')
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent = false }) {
  return (
    <div className="bg-white border border-lin rounded-xl p-5 shadow-card">
      <div className="mb-4">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center"
             style={{ background: accent ? 'rgba(201,169,110,0.12)' : '#F5F3EE' }}>
          <Icon size={17} style={{ color: accent ? '#C9A96E' : '#9B9488' }} />
        </div>
      </div>
      <div className="font-serif text-noir leading-none mb-1.5"
           style={{ fontSize: '1.85rem', fontWeight: 600 }}>
        {fmtNum(value)}
      </div>
      <div className="text-xs font-medium" style={{ color: '#6B6459' }}>{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: '#9B9488' }}>{sub}</div>}
    </div>
  )
}

// ── AgentCard ─────────────────────────────────────────────────────────────────

function AgentCard({ icon: Icon, name, role }) {
  return (
    <div className="bg-white border border-lin rounded-xl p-4 shadow-card flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-noir">
        <Icon size={16} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-noir truncate">{name}</div>
        <div className="text-xs truncate" style={{ color: '#9B9488' }}>{role}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
        <span className="text-xs" style={{ color: '#10B981' }}>Actif</span>
      </div>
    </div>
  )
}

// ── MiniBar ───────────────────────────────────────────────────────────────────

function MiniBar({ label, value, max, accent = false }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="w-24 text-xs truncate flex-shrink-0" style={{ color: '#6B6459' }}>{label}</div>
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#F0ECE4' }}>
        <div className="h-full rounded-full transition-all"
             style={{ width: `${pct}%`, background: accent ? '#C9A96E' : '#0A0A0F' }} />
      </div>
      <div className="w-7 text-xs text-right flex-shrink-0 font-medium text-noir">{value}</div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

const AGENTS = [
  { icon: MessageSquare, name: 'Agent Support',       role: 'Chatbot RAG 24/7'             },
  { icon: FileText,      name: 'Agent R\u00e9dacteur', role: 'G\u00e9n\u00e9ration annonces' },
  { icon: Zap,           name: 'Agent Analyste',      role: 'Analyse PDF'                   },
  { icon: Phone,         name: 'Agent Vocal',         role: 'T\u00e9l\u00e9phonie Vapi'     },
]

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    getStats()
      .then(setStats)
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

  const s = stats || {}
  const channelData = Object.entries(s.by_channel || {}).map(([k, v]) => ({
    label: k === 'web_chat' ? 'Chat web' : k === 'phone' ? 'T\u00e9l\u00e9phone' : k,
    value: v,
  })).sort((a, b) => b.value - a.value)
  const maxChannel = Math.max(...channelData.map(d => d.value), 1)
  const byStatus = s.by_status || {}
  const maxStatus = Math.max(byStatus.open || 0, byStatus.qualified || 0, byStatus.visit_booked || 0, byStatus.closed || 0, 1)

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1"
             style={{ color: '#C9A96E', letterSpacing: '0.12em' }}>
            Vue d&apos;ensemble
          </p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '2rem', fontWeight: 500 }}>
            Tableau de bord
          </h1>
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

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2}     label="Biens au catalogue" value={s.total_properties}   sub={`${s.active_properties || 0} actifs`}         accent />
        <StatCard icon={MessageSquare} label="Conversations"      value={s.total_conversations} sub="Toutes p\u00e9riodes" />
        <StatCard icon={Users}         label="Prospects"          value={s.total_prospects}     sub={`${s.qualified_prospects || 0} qualifi\u00e9s`} accent />
        <StatCard icon={TrendingUp}    label="Messages totaux"    value={s.total_messages}      sub="Tous canaux" />
      </div>

      {/* Agents + Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-noir font-semibold" style={{ fontSize: '1.1rem' }}>Agents IA</h2>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse-slow" />
              <span className="text-xs" style={{ color: '#9B9488' }}>Tous op\u00e9rationnels</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {AGENTS.map(a => <AgentCard key={a.name} {...a} />)}
          </div>
        </div>

        <div className="space-y-4">
          {channelData.length > 0 && (
            <div className="bg-white border border-lin rounded-xl p-5 shadow-card">
              <h2 className="font-serif text-noir font-semibold mb-4" style={{ fontSize: '1.1rem' }}>Canaux d&apos;entr\u00e9e</h2>
              <div className="space-y-3">
                {channelData.map(d => <MiniBar key={d.label} label={d.label} value={d.value} max={maxChannel} />)}
              </div>
            </div>
          )}

          {s.by_status && (
            <div className="bg-white border border-lin rounded-xl p-5 shadow-card">
              <h2 className="font-serif text-noir font-semibold mb-4" style={{ fontSize: '1.1rem' }}>Statuts prospects</h2>
              <div className="space-y-3">
                {[
                  { label: 'Nouveaux',           value: byStatus.open || 0 },
                  { label: 'Qualifi\u00e9s',     value: byStatus.qualified || 0 },
                  { label: 'RDV planifi\u00e9s',  value: byStatus.visit_booked || 0, accent: true },
                  { label: 'Ferm\u00e9s',         value: byStatus.closed || 0 },
                ].map(d => <MiniBar key={d.label} label={d.label} value={d.value} max={maxStatus} accent={d.accent} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
