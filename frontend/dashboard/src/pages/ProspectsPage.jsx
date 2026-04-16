import { useEffect, useState, useCallback } from 'react'
import {
  User, Phone, Mail, MessageSquare, Calendar, Tag,
  ChevronRight, Search, X, Send, Download, RefreshCw,
  Clock,
} from 'lucide-react'
import {
  getProspects, getProspect, updateProspect,
  sendProspectEmail, getProspectsExportUrl
} from '../api/client'

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS = [
  { id: 'open',         label: 'Nouveau',      accent: '#3B82F6' },
  { id: 'qualified',    label: 'Qualifi\u00e9', accent: '#F59E0B' },
  { id: 'visit_booked', label: 'RDV planifi\u00e9', accent: '#10B981' },
  { id: 'closed',       label: 'Ferm\u00e9',   accent: '#9B9488' },
]

const STATUS_STYLE = {
  open:         { bg: 'rgba(59,130,246,0.08)',  text: '#2563EB', border: 'rgba(59,130,246,0.2)'  },
  qualified:    { bg: 'rgba(245,158,11,0.08)',  text: '#D97706', border: 'rgba(245,158,11,0.2)'  },
  visit_booked: { bg: 'rgba(16,185,129,0.08)',  text: '#059669', border: 'rgba(16,185,129,0.2)'  },
  closed:       { bg: 'rgba(155,148,136,0.08)', text: '#9B9488', border: 'rgba(155,148,136,0.2)' },
}

const STATUS_LABELS = {
  open: 'Nouveau', qualified: 'Qualifi\u00e9',
  visit_booked: 'RDV planifi\u00e9', closed: 'Ferm\u00e9',
}

const CHANNEL_ICONS = { web_chat: MessageSquare, phone: Phone, email: Mail }

function fmtDate(iso) {
  if (!iso) return '\u2014'
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtCriteria(criteria) {
  if (!criteria) return ''
  const parts = []
  if (criteria.property_type) parts.push(criteria.property_type)
  if (criteria.city)          parts.push(criteria.city)
  if (criteria.max_price)     parts.push(`\u2264 ${Number(criteria.max_price).toLocaleString('fr-FR')} \u20ac`)
  if (criteria.min_surface)   parts.push(`\u2265 ${criteria.min_surface} m\u00b2`)
  if (criteria.nb_rooms)      parts.push(`${criteria.nb_rooms} p.`)
  return parts.join(' \u00b7 ')
}

// ── ProspectCard ──────────────────────────────────────────────────────────────

function ProspectCard({ prospect, onSelect }) {
  const Icon = CHANNEL_ICONS[prospect.channel] || MessageSquare
  const criteria = fmtCriteria(prospect.search_criteria)

  return (
    <div
      className="bg-white border border-lin rounded-xl p-3 cursor-pointer transition-all"
      style={{ boxShadow: '0 1px 3px rgba(10,10,15,0.04)' }}
      onClick={() => onSelect(prospect)}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 3px 10px rgba(10,10,15,0.10)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(10,10,15,0.04)'}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
               style={{ background: '#F5F3EE' }}>
            <Icon size={12} style={{ color: '#9B9488' }} />
          </div>
          <span className="text-sm font-semibold text-noir truncate">
            {prospect.prospect_name || prospect.prospect_email || 'Anonyme'}
          </span>
        </div>
        <ChevronRight size={13} style={{ color: '#E8E2D5' }} className="flex-shrink-0 mt-0.5" />
      </div>

      {criteria && (
        <p className="text-xs mb-2 truncate" style={{ color: '#9B9488' }}>{criteria}</p>
      )}

      <div className="flex items-center justify-between text-xs" style={{ color: '#9B9488' }}>
        <span>{fmtDate(prospect.created_at)}</span>
        {prospect.message_count > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare size={10} />
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
    } finally { setSavingNotes(false) }
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
    } finally { setSendingEmail(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 rounded-full border-2 border-lin animate-spin"
           style={{ borderTopColor: '#C9A96E' }} />
    </div>
  )
  if (!data) return null

  const criteria = fmtCriteria(data.search_criteria)
  const Icon = CHANNEL_ICONS[data.channel] || MessageSquare
  const ss = STATUS_STYLE[data.status] || STATUS_STYLE.closed

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
           style={{ borderBottom: '1px solid #E8E2D5' }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center"
               style={{ background: 'rgba(201,169,110,0.1)' }}>
            <User size={17} style={{ color: '#C9A96E' }} />
          </div>
          <div>
            <div className="font-semibold text-noir text-sm">
              {data.prospect_name || data.prospect_email || 'Prospect anonyme'}
            </div>
            <div className="text-xs flex items-center gap-1" style={{ color: '#9B9488' }}>
              <Icon size={10} />
              {data.channel} &bull; {fmtDate(data.created_at)}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-creme">
          <X size={15} style={{ color: '#9B9488' }} />
        </button>
      </div>

      {/* Status selector */}
      <div className="px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #F0ECE4' }}>
        <div className="flex gap-2 flex-wrap">
          {COLUMNS.map(col => {
            const active = data.status === col.id
            return (
              <button
                key={col.id}
                onClick={() => handleStatusChange(col.id)}
                className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                style={active
                  ? { background: STATUS_STYLE[col.id].bg, color: STATUS_STYLE[col.id].text, borderColor: STATUS_STYLE[col.id].border }
                  : { background: 'transparent', color: '#9B9488', borderColor: '#E8E2D5' }
                }
              >
                {col.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-shrink-0 px-5" style={{ borderBottom: '1px solid #E8E2D5' }}>
        {[
          { id: 'info',    label: 'Infos' },
          { id: 'history', label: `Conversation (${data.messages?.length || 0})` },
          { id: 'email',   label: 'Email' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="py-2.5 px-3 text-xs font-medium border-b-2 transition-colors"
            style={tab === t.id
              ? { borderColor: '#C9A96E', color: '#A8823A' }
              : { borderColor: 'transparent', color: '#9B9488' }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'info' && (
          <div className="space-y-4">
            <div className="rounded-lg p-4 space-y-2.5" style={{ background: '#F8F6F1', border: '1px solid #E8E2D5' }}>
              {data.prospect_email && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Mail size={13} style={{ color: '#9B9488' }} />
                  <a href={`mailto:${data.prospect_email}`} className="text-sm" style={{ color: '#C9A96E' }}>
                    {data.prospect_email}
                  </a>
                </div>
              )}
              {data.prospect_phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <Phone size={13} style={{ color: '#9B9488' }} />
                  <a href={`tel:${data.prospect_phone}`} className="text-sm" style={{ color: '#C9A96E' }}>
                    {data.prospect_phone}
                  </a>
                </div>
              )}
              {!data.prospect_email && !data.prospect_phone && (
                <p className="text-xs" style={{ color: '#9B9488' }}>Aucune coordonn\u00e9e captur\u00e9e</p>
              )}
            </div>

            {criteria && (
              <div>
                <div className="text-xs font-medium uppercase tracking-widest mb-2"
                     style={{ color: '#9B9488', letterSpacing: '0.1em' }}>
                  Crit\u00e8res de recherche
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.search_criteria || {}).map(([k, v]) =>
                    v ? (
                      <span key={k} className="px-2 py-0.5 rounded-full text-xs"
                            style={{ background: 'rgba(201,169,110,0.1)', color: '#A8823A', border: '1px solid rgba(201,169,110,0.2)' }}>
                        {k}: {v}
                      </span>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {data.call_summary && (
              <div>
                <div className="text-xs font-medium uppercase tracking-widest mb-2 flex items-center gap-1"
                     style={{ color: '#9B9488', letterSpacing: '0.1em' }}>
                  <Phone size={10} />
                  R\u00e9sum\u00e9 d&apos;appel
                  {data.call_duration_sec && (
                    <span className="font-normal ml-1">
                      &bull; {Math.floor(data.call_duration_sec / 60)}m{String(data.call_duration_sec % 60).padStart(2, '0')}s
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed rounded-lg p-3"
                   style={{ background: '#F8F6F1', border: '1px solid #E8E2D5', color: '#1A1A24' }}>
                  {data.call_summary}
                </p>
              </div>
            )}

            <div>
              <div className="text-xs font-medium uppercase tracking-widest mb-2"
                   style={{ color: '#9B9488', letterSpacing: '0.1em' }}>
                Notes internes
              </div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={4}
                placeholder="Ajouter des notes sur ce prospect\u2026"
                className="input-field resize-none"
              />
              <button
                onClick={handleSaveNotes}
                disabled={savingNotes || notes === (data.notes || '')}
                className="mt-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all text-white disabled:opacity-50"
                style={{ background: '#0A0A0F' }}
              >
                {savingNotes ? 'Enregistrement\u2026' : 'Enregistrer'}
              </button>
            </div>
          </div>
        )}

        {tab === 'history' && (
          <div className="space-y-3">
            {(data.messages || []).length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: '#9B9488' }}>Aucun message</p>
            ) : (data.messages || []).map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed"
                     style={m.role === 'user' ? {
                       background: '#0A0A0F',
                       color: '#F8F6F1',
                       borderBottomRightRadius: '4px',
                     } : {
                       background: '#F5F3EE',
                       color: '#1A1A24',
                       border: '1px solid #E8E2D5',
                       borderBottomLeftRadius: '4px',
                     }}>
                  {m.content}
                  <div className="text-xs mt-1" style={{ color: m.role === 'user' ? 'rgba(248,246,241,0.4)' : '#9B9488' }}>
                    {m.created_at ? new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'email' && (
          <div className="space-y-4">
            {!data.prospect_email ? (
              <div className="text-sm text-center py-8" style={{ color: '#9B9488' }}>
                Aucun email captur\u00e9 pour ce prospect
              </div>
            ) : (
              <>
                <div className="text-xs" style={{ color: '#9B9488' }}>
                  Destinataire\u00a0: <span className="font-medium text-noir">{data.prospect_email}</span>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#6B6459' }}>Objet</label>
                  <input
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                    placeholder="Suivi de votre recherche immobili\u00e8re"
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: '#6B6459' }}>Message</label>
                  <textarea
                    value={emailBody}
                    onChange={e => setEmailBody(e.target.value)}
                    rows={6}
                    placeholder="Bonjour,&#10;Suite \u00e0 notre \u00e9change\u2026"
                    className="input-field resize-none"
                  />
                </div>
                <button
                  onClick={handleSendEmail}
                  disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all text-white disabled:opacity-50"
                  style={{ background: '#0A0A0F' }}
                >
                  <Send size={13} />
                  {sendingEmail ? 'Envoi\u2026' : emailSent ? 'Envoy\u00e9\u00a0!' : 'Envoyer'}
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
        <div className="flex items-center gap-3 px-6 py-4 flex-shrink-0 bg-white"
             style={{ borderBottom: '1px solid #E8E2D5' }}>
          <div>
            <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '1.5rem', fontWeight: 500 }}>Prospects</h1>
            <p className="text-xs mt-0.5" style={{ color: '#9B9488' }}>
              {prospects.length} prospect{prospects.length !== 1 ? 's' : ''} au total
            </p>
          </div>

          <div className="flex-1 relative max-w-xs ml-4">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9B9488' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher\u2026"
              className="input-field pl-8"
              style={{ paddingTop: '7px', paddingBottom: '7px' }}
            />
          </div>

          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="input-field w-auto"
            style={{ paddingTop: '7px', paddingBottom: '7px' }}
          >
            <option value="">Tous les canaux</option>
            <option value="web_chat">Chat web</option>
            <option value="phone">T\u00e9l\u00e9phone</option>
            <option value="email">Email</option>
          </select>

          <button onClick={load} className="p-1.5 rounded-lg transition-colors hover:bg-creme border border-lin">
            <RefreshCw size={14} className={`${loading ? 'animate-spin' : ''}`} style={{ color: '#9B9488' }} />
          </button>

          <a
            href={exportUrl}
            download="prospects.csv"
            className="flex items-center gap-1.5 px-3 py-1.5 border border-lin rounded-lg text-xs font-medium transition-colors hover:bg-creme"
            style={{ color: '#6B6459' }}
          >
            <Download size={13} />
            Export CSV
          </a>
        </div>

        {error && (
          <div className="m-4 rounded-lg p-3 text-sm"
               style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
            {error}
          </div>
        )}

        {/* Kanban board */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden bg-creme">
          <div className="flex gap-4 p-5 h-full min-w-max">
            {COLUMNS.map(col => {
              const items = byStatus[col.id] || []
              const ss = STATUS_STYLE[col.id]
              return (
                <div key={col.id} className="w-60 flex flex-col flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold uppercase tracking-widest"
                          style={{ color: '#6B6459', letterSpacing: '0.1em' }}>
                      {col.label}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: ss.bg, color: ss.text, border: `1px solid ${ss.border}` }}>
                      {items.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {items.length === 0 && !loading && (
                      <div className="text-center py-8 text-xs" style={{ color: '#E8E2D5' }}>Aucun prospect</div>
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
        <div className="w-96 flex-shrink-0 bg-white overflow-hidden flex flex-col"
             style={{ borderLeft: '1px solid #E8E2D5' }}>
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
