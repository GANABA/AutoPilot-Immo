import { useEffect, useState, useCallback } from 'react'
import {
  User, Phone, Mail, MessageSquare, Calendar, Tag,
  ChevronRight, Search, X, Send, Download, RefreshCw,
  FileText, Clock
} from 'lucide-react'
import {
  getProspects, getProspect, updateProspect,
  sendProspectEmail, getProspectsExportUrl
} from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: 'open',         label: 'Nouveau',       color: 'blue'  },
  { id: 'qualified',    label: 'Qualifié',       color: 'amber' },
  { id: 'visit_booked', label: 'RDV planifié',   color: 'green' },
  { id: 'closed',       label: 'Fermé',          color: 'slate' },
]

const STATUS_COLORS = {
  open:         'bg-blue-100 text-blue-700 border-blue-200',
  qualified:    'bg-amber-100 text-amber-700 border-amber-200',
  visit_booked: 'bg-green-100 text-green-700 border-green-200',
  closed:       'bg-slate-100 text-slate-600 border-slate-200',
}

const STATUS_LABELS = {
  open:         'Nouveau',
  qualified:    'Qualifié',
  visit_booked: 'RDV planifié',
  closed:       'Fermé',
}

const CHANNEL_ICONS = {
  web_chat: MessageSquare,
  phone:    Phone,
  email:    Mail,
}

function fmtDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtCriteria(criteria) {
  if (!criteria) return ''
  const parts = []
  if (criteria.property_type) parts.push(criteria.property_type)
  if (criteria.city)          parts.push(criteria.city)
  if (criteria.max_price)     parts.push(`≤ ${Number(criteria.max_price).toLocaleString('fr-FR')} €`)
  if (criteria.min_surface)   parts.push(`≥ ${criteria.min_surface} m²`)
  if (criteria.nb_rooms)      parts.push(`${criteria.nb_rooms} p.`)
  return parts.join(' · ')
}

// ── ProspectCard ──────────────────────────────────────────────────────────────

function ProspectCard({ prospect, onSelect }) {
  const Icon = CHANNEL_ICONS[prospect.channel] || MessageSquare
  const criteria = fmtCriteria(prospect.search_criteria)

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
      onClick={() => onSelect(prospect)}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Icon size={13} className="text-slate-500" />
          </div>
          <span className="text-sm font-semibold text-slate-800 truncate">
            {prospect.prospect_name || prospect.prospect_email || 'Anonyme'}
          </span>
        </div>
        <ChevronRight size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
      </div>

      {criteria && (
        <p className="text-xs text-slate-500 mb-2 truncate">{criteria}</p>
      )}

      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{fmtDate(prospect.created_at)}</span>
        {prospect.message_count > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare size={11} />
            {prospect.message_count}
          </span>
        )}
      </div>
    </div>
  )
}

// ── ProspectDetail ────────────────────────────────────────────────────────────

function ProspectDetail({ prospectId, onClose, onUpdated }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [tab, setTab] = useState('info')

  useEffect(() => {
    setLoading(true)
    getProspect(prospectId)
      .then(d => { setData(d); setNotes(d.notes || '') })
      .finally(() => setLoading(false))
  }, [prospectId])

  const handleStatusChange = async (newStatus) => {
    const updated = await updateProspect(prospectId, { status: newStatus })
    setData(d => ({ ...d, status: updated.status }))
    onUpdated(updated)
  }

  const handleSaveNotes = async () => {
    setSavingNotes(true)
    try {
      const updated = await updateProspect(prospectId, { notes })
      setData(d => ({ ...d, notes: updated.notes }))
      onUpdated(updated)
    } finally {
      setSavingNotes(false)
    }
  }

  const handleSendEmail = async () => {
    if (!emailSubject.trim() || !emailBody.trim()) return
    setSendingEmail(true)
    try {
      await sendProspectEmail(prospectId, { subject: emailSubject, message: emailBody })
      setEmailSent(true)
      setEmailSubject('')
      setEmailBody('')
      setTimeout(() => setEmailSent(false), 3000)
    } catch (e) {
      alert(e.message)
    } finally {
      setSendingEmail(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
    </div>
  )
  if (!data) return null

  const criteria = fmtCriteria(data.search_criteria)
  const Icon = CHANNEL_ICONS[data.channel] || MessageSquare

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center">
            <User size={18} className="text-blue-600" />
          </div>
          <div>
            <div className="font-semibold text-slate-900 text-sm">
              {data.prospect_name || data.prospect_email || 'Prospect anonyme'}
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Icon size={11} />
              {data.channel} · {fmtDate(data.created_at)}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100">
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      {/* Status selector */}
      <div className="px-5 py-3 border-b border-slate-100 flex-shrink-0">
        <div className="flex gap-2 flex-wrap">
          {COLUMNS.map(col => (
            <button
              key={col.id}
              onClick={() => handleStatusChange(col.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                data.status === col.id
                  ? STATUS_COLORS[col.id]
                  : 'bg-transparent text-slate-500 border-slate-200 hover:border-slate-300'
              }`}
            >
              {col.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 flex-shrink-0 px-5">
        {[
          { id: 'info',    label: 'Infos' },
          { id: 'history', label: `Conversation (${data.messages?.length || 0})` },
          { id: 'email',   label: 'Email' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">

        {tab === 'info' && (
          <div className="space-y-4">
            {/* Contact */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2.5">
              {data.prospect_email && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail size={14} className="text-slate-400" />
                  <a href={`mailto:${data.prospect_email}`} className="text-blue-600 hover:underline">
                    {data.prospect_email}
                  </a>
                </div>
              )}
              {data.prospect_phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone size={14} className="text-slate-400" />
                  <a href={`tel:${data.prospect_phone}`} className="text-blue-600 hover:underline">
                    {data.prospect_phone}
                  </a>
                </div>
              )}
              {!data.prospect_email && !data.prospect_phone && (
                <p className="text-xs text-slate-400">Aucune coordonnée capturée</p>
              )}
            </div>

            {/* Search criteria */}
            {criteria && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Critères de recherche
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.search_criteria || {}).map(([k, v]) =>
                    v ? (
                      <span key={k} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs">
                        {k}: {v}
                      </span>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* Call summary */}
            {data.call_summary && (
              <div>
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                  <Phone size={11} />
                  Résumé d'appel
                  {data.call_duration_sec && (
                    <span className="ml-1 text-slate-400 font-normal">
                      · {Math.floor(data.call_duration_sec / 60)}m{String(data.call_duration_sec % 60).padStart(2, '0')}s
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3 leading-relaxed">
                  {data.call_summary}
                </p>
              </div>
            )}

            {/* Notes */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Notes internes
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="Ajouter des notes sur ce prospect…"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes || notes === (data.notes || '')}
                className="mt-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {savingNotes ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {(data.messages || []).length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Aucun message</p>
            ) : (
              (data.messages || []).map(m => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}>
                    {m.content}
                    <div className={`text-xs mt-1 ${m.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                      {m.created_at ? new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-4">
            {!data.prospect_email ? (
              <div className="text-sm text-slate-400 text-center py-8">
                Aucun email capturé pour ce prospect
              </div>
            ) : (
              <>
                <div className="text-xs text-slate-500">
                  Destinataire : <span className="text-slate-800 font-medium">{data.prospect_email}</span>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Objet</label>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Suivi de votre recherche immobilière"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Message</label>
                  <textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    rows={6}
                    placeholder="Bonjour,&#10;Suite à notre échange…"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleSendEmail}
                  disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <Send size={14} />
                  {sendingEmail ? 'Envoi…' : emailSent ? 'Envoyé !' : 'Envoyer'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProspectsPage() {
  const [prospects, setProspects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [channelFilter, setChannelFilter] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    const params = {}
    if (search) params.search = search
    if (channelFilter) params.channel = channelFilter
    getProspects({ ...params, limit: 200 })
      .then(r => setProspects(r.items || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [search, channelFilter])

  useEffect(() => { load() }, [load])

  const handleUpdated = (updated) => {
    setProspects(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p))
  }

  const byStatus = COLUMNS.reduce((acc, col) => {
    acc[col.id] = prospects.filter(p => p.status === col.id)
    return acc
  }, {})

  const exportUrl = getProspectsExportUrl()

  return (
    <div className="flex h-full gap-0">
      {/* ── Left: Kanban ── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 bg-white flex-shrink-0">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Prospects</h1>
            <p className="text-slate-500 text-xs mt-0.5">{prospects.length} prospect{prospects.length !== 1 ? 's' : ''} au total</p>
          </div>

          <div className="flex-1 relative max-w-xs ml-4">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tous les canaux</option>
            <option value="web_chat">Chat web</option>
            <option value="phone">Téléphone</option>
            <option value="email">Email</option>
          </select>

          <button onClick={load} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
            <RefreshCw size={15} className={`text-slate-500 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <a
            href={exportUrl}
            download="prospects.csv"
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            Export CSV
          </a>
        </div>

        {error && (
          <div className="m-4 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">{error}</div>
        )}

        {/* Kanban board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-4 p-6 h-full min-w-max">
            {COLUMNS.map(col => {
              const items = byStatus[col.id] || []
              return (
                <div key={col.id} className="w-64 flex flex-col flex-shrink-0">
                  {/* Column header */}
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                      {col.label}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_COLORS[col.id]}`}>
                      {items.length}
                    </span>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {items.length === 0 && !loading && (
                      <div className="text-center py-8 text-slate-300 text-xs">Aucun prospect</div>
                    )}
                    {items.map(p => (
                      <ProspectCard
                        key={p.id}
                        prospect={p}
                        onSelect={p => setSelectedId(p.id)}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Right: Detail panel ── */}
      {selectedId && (
        <div className="w-96 flex-shrink-0 border-l border-slate-200 bg-white overflow-hidden flex flex-col">
          <ProspectDetail
            prospectId={selectedId}
            onClose={() => setSelectedId(null)}
            onUpdated={handleUpdated}
          />
        </div>
      )}
    </div>
  )
}
