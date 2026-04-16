import { useEffect, useState } from 'react'
import { MessageSquare, User, Clock, Mail, ExternalLink, Loader2 } from 'lucide-react'
import { getConversations, getMessages } from '../api/client'

const STATUS_COLORS = {
  open:         { bg: 'rgba(59,130,246,0.1)',  text: '#2563EB', border: 'rgba(59,130,246,0.2)'  },
  qualified:    { bg: 'rgba(16,185,129,0.1)',  text: '#059669', border: 'rgba(16,185,129,0.2)'  },
  visit_booked: { bg: 'rgba(139,92,246,0.1)',  text: '#7C3AED', border: 'rgba(139,92,246,0.2)'  },
  closed:       { bg: 'rgba(155,148,136,0.1)', text: '#9B9488', border: 'rgba(155,148,136,0.2)' },
}

const STATUS_LABELS = {
  open: 'Ouverte', qualified: 'Qualifi\u00e9e',
  visit_booked: 'Visite planifi\u00e9e', closed: 'Ferm\u00e9e',
}

const CHANNEL_LABELS = {
  web_chat: 'Chat web', phone: 'T\u00e9l\u00e9phone', email: 'Email',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `il y a ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

const BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:8000'
  : window.location.origin

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)

  useEffect(() => {
    getConversations()
      .then(setConversations).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const selectConv = async (conv) => {
    setSelected(conv)
    setMsgLoading(true)
    try { setMessages(await getMessages(conv.id)) }
    catch { setMessages([]) }
    finally { setMsgLoading(false) }
  }

  const statusStyle = (status) => STATUS_COLORS[status] || STATUS_COLORS.closed

  return (
    <div className="flex gap-5 h-full min-h-0">
      {/* Left — list */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest mb-1"
             style={{ color: '#C9A96E', letterSpacing: '0.12em' }}>
            Historique
          </p>
          <h1 className="font-serif text-noir leading-tight" style={{ fontSize: '1.9rem', fontWeight: 500 }}>
            Conversations
          </h1>
          <p className="text-sm mt-1" style={{ color: '#9B9488' }}>{conversations.length} au total</p>
        </div>

        <div className="overflow-y-auto flex flex-col gap-2 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12" style={{ color: '#9B9488' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12" style={{ color: '#9B9488' }}>
              <MessageSquare size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm mb-3">Aucune conversation pour l&apos;instant.</p>
              <a
                href={`${BASE}/widget/demo.html`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium"
                style={{ color: '#C9A96E' }}
              >
                <ExternalLink size={11} /> Ouvrir le chatbot d\u00e9mo
              </a>
            </div>
          ) : conversations.map(c => {
            const s = statusStyle(c.status)
            const active = selected?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => selectConv(c)}
                className="text-left p-3.5 rounded-xl border transition-all"
                style={active ? {
                  borderColor: 'rgba(201,169,110,0.4)',
                  background: 'rgba(201,169,110,0.06)',
                  boxShadow: '0 1px 6px rgba(201,169,110,0.15)',
                } : {
                  borderColor: '#E8E2D5',
                  background: '#FFFFFF',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.boxShadow = '0 2px 8px rgba(10,10,15,0.08)' }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.boxShadow = 'none' }}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: '#F5F3EE' }}>
                    <User size={14} style={{ color: '#9B9488' }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-noir truncate">
                        {c.prospect_name || 'Prospect anonyme'}
                      </span>
                      <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                            style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                        {STATUS_LABELS[c.status] || c.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: '#9B9488' }}>
                      <span>{CHANNEL_LABELS[c.channel] || c.channel}</span>
                      <span style={{ color: '#E8E2D5' }}>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Clock size={10} />{timeAgo(c.created_at)}
                      </span>
                    </div>
                    {c.prospect_email && (
                      <div className="flex items-center gap-1 text-xs mt-0.5 truncate" style={{ color: '#9B9488' }}>
                        <Mail size={10} />{c.prospect_email}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Right — messages */}
      {selected ? (
        <div className="flex-1 bg-white border border-lin rounded-xl shadow-card flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-5 py-4 flex items-center gap-3"
               style={{ borderBottom: '1px solid #E8E2D5', background: '#F8F6F1' }}>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                 style={{ background: '#0A0A0F' }}>
              <User size={16} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-noir text-sm">{selected.prospect_name || 'Prospect anonyme'}</div>
              <div className="text-xs mt-0.5 flex items-center gap-2" style={{ color: '#9B9488' }}>
                <span>{CHANNEL_LABELS[selected.channel] || selected.channel}</span>
                <span style={{ color: '#E8E2D5' }}>&bull;</span>
                <span>{new Date(selected.created_at).toLocaleString('fr-FR')}</span>
              </div>
            </div>
            <div>
              {(() => {
                const s = statusStyle(selected.status)
                return (
                  <span className="text-xs px-2.5 py-1 rounded-full font-medium"
                        style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
                    {STATUS_LABELS[selected.status] || selected.status}
                  </span>
                )
              })()}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {msgLoading ? (
              <div className="flex items-center justify-center py-12" style={{ color: '#9B9488' }}>
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color: '#9B9488' }}>Aucun message</div>
            ) : messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-sm lg:max-w-lg px-4 py-3 rounded-xl text-sm leading-relaxed"
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
                  <div className="text-xs mt-1.5" style={{ color: m.role === 'user' ? 'rgba(248,246,241,0.4)' : '#9B9488' }}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4"
                 style={{ background: '#F5F3EE', border: '1px solid #E8E2D5' }}>
              <MessageSquare size={22} style={{ color: '#E8E2D5' }} />
            </div>
            <p className="text-sm" style={{ color: '#9B9488' }}>S\u00e9lectionnez une conversation</p>
          </div>
        </div>
      )}
    </div>
  )
}
