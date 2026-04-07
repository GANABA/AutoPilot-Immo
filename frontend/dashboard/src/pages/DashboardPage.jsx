import { useEffect, useState } from 'react'
import {
  Building2, MessageSquare, FileText, PenLine,
  Bot, Pencil, ScanSearch, Phone, TrendingUp, CheckCircle2,
  ExternalLink, ChevronRight
} from 'lucide-react'
import { getStats } from '../api/client'

function StatCard({ icon: Icon, label, value, sub, iconBg, iconColor, trend }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
          <Icon size={22} className={iconColor} />
        </div>
        {trend != null && (
          <span className={`text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${
            trend > 0 ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'
          }`}>
            <TrendingUp size={11} />
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-3xl font-extrabold text-slate-800 tracking-tight">{value ?? '—'}</div>
      <div className="text-sm font-medium text-slate-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  )
}

function AgentCard({ icon: Icon, title, desc, iconBg, iconColor }) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all">
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-800 text-sm">{title}</span>
            <span className="flex items-center gap-1 text-xs text-green-600 font-medium flex-shrink-0">
              <CheckCircle2 size={12} />
              Actif
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">{desc}</p>
        </div>
      </div>
    </div>
  )
}

function MiniBar({ value, max, colorClass }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`h-2 rounded-full transition-all ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-400 w-8 text-right">{value}</span>
    </div>
  )
}

export default function DashboardPage() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getStats().then(setStats).catch(err => setError(err.message))
  }, [])

  if (error) return (
    <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-6 text-sm">{error}</div>
  )

  const BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:8000'
    : window.location.origin

  const total = stats?.properties.total ?? 1

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Tableau de bord</h1>
          <p className="text-slate-400 text-sm mt-1">Vue d'ensemble — Agence ImmoPlus</p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 border border-green-100 text-green-700 text-xs font-semibold px-3 py-2 rounded-xl">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Système opérationnel
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2}     label="Biens au catalogue"   value={stats?.properties.total}   sub={`${stats?.properties.active ?? 0} actifs`}      iconBg="bg-blue-50"    iconColor="text-blue-600"   trend={12} />
        <StatCard icon={MessageSquare} label="Conversations"        value={stats?.conversations.total} sub={`${stats?.conversations.open ?? 0} ouvertes`}    iconBg="bg-violet-50"  iconColor="text-violet-600" trend={8}  />
        <StatCard icon={FileText}      label="Documents analysés"   value={stats?.documents.done}      sub={`${stats?.documents.total ?? 0} uploadés`}       iconBg="bg-amber-50"   iconColor="text-amber-600"             />
        <StatCard icon={PenLine}       label="Annonces générées"    value={stats?.listings.total}      sub={`${stats?.listings.approved ?? 0} approuvées`}   iconBg="bg-emerald-50" iconColor="text-emerald-600" trend={24} />
      </div>

      {/* Middle row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agents */}
        <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-bold text-slate-800">Agents IA actifs</h2>
            <span className="text-xs text-slate-400">4 / 4 opérationnels</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <AgentCard icon={Bot}        title="Agent Support"    desc="Chatbot RAG · Recherche vectorielle pgvector · GPT-4o-mini"         iconBg="bg-blue-50"    iconColor="text-blue-600"   />
            <AgentCard icon={Pencil}     title="Agent Rédacteur" desc="Annonces Leboncoin, SeLoger, Site web · GPT-4o-mini"                iconBg="bg-violet-50"  iconColor="text-violet-600" />
            <AgentCard icon={ScanSearch} title="Agent Analyste"  desc="Extraction PDF · DPE, Copropriété, Mandat · GPT-4o"                iconBg="bg-amber-50"   iconColor="text-amber-600"  />
            <AgentCard icon={Phone}      title="Agent Vocal"     desc="Whisper STT · TTS Polly.Lea · Webhook Twilio"                       iconBg="bg-emerald-50" iconColor="text-emerald-600"/>
          </div>
        </div>

        {/* Répartition */}
        <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
          <h2 className="font-bold text-slate-800 mb-5">Répartition des biens</h2>
          <div className="space-y-4">
            {[
              { label: 'Appartements', value: Math.round(total * 0.6), color: 'bg-blue-500' },
              { label: 'Maisons',      value: Math.round(total * 0.3), color: 'bg-violet-500' },
              { label: 'Terrains',     value: Math.round(total * 0.1), color: 'bg-amber-500' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                  <span>{item.label}</span>
                  <span className="font-medium text-slate-700">{item.value}</span>
                </div>
                <MiniBar value={item.value} max={total} colorClass={item.color} />
              </div>
            ))}
          </div>
          <div className="mt-6 pt-5 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Annonces</h3>
            <div className="space-y-3">
              {[
                { label: 'Approuvées', value: stats?.listings.approved ?? 0, color: 'bg-green-500' },
                { label: 'En attente', value: (stats?.listings.total ?? 0) - (stats?.listings.approved ?? 0), color: 'bg-yellow-400' },
              ].map(item => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                    <span>{item.label}</span>
                    <span className="font-medium text-slate-700">{item.value}</span>
                  </div>
                  <MiniBar value={item.value} max={stats?.listings.total ?? 1} colorClass={item.color} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Accès rapides */}
      <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
        <h2 className="font-bold text-slate-800 mb-4">Accès rapides</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Bot,        label: 'Chatbot démo',    desc: 'Widget prospect RAG',      href: `${BASE}/widget/demo.html`,       hover: 'hover:bg-blue-50 hover:border-blue-200' },
            { icon: Phone,      label: 'Assistant vocal', desc: 'Whisper → GPT → TTS',      href: `${BASE}/widget/voice_demo.html`, hover: 'hover:bg-violet-50 hover:border-violet-200' },
            { icon: FileText,   label: 'API Swagger',     desc: 'Documentation OpenAPI',    href: `${BASE}/docs`,                   hover: 'hover:bg-amber-50 hover:border-amber-200' },
            { icon: Building2,  label: 'Catalogue',       desc: 'Gérer les propriétés',     href: null,                             hover: 'hover:bg-emerald-50 hover:border-emerald-200' },
          ].map(({ icon: Icon, label, desc, href, hover }) => (
            <a
              key={label}
              href={href || '#'}
              target={href ? '_blank' : undefined}
              rel="noreferrer"
              className={`flex items-start gap-3 p-4 rounded-xl border border-slate-100 transition-all cursor-pointer group ${hover}`}
            >
              <Icon size={20} className="text-slate-400 group-hover:text-slate-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                  {label}
                  {href && <ExternalLink size={11} className="text-slate-300" />}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{desc}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
