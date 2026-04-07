import { useEffect, useState } from 'react'
import { MessageSquare, User, Clock, Mail, ExternalLink, Loader2 } from 'lucide-react'
import { getConversations, getMessages } from '../api/client'

const STATUS_COLORS = {
  open:         'bg-blue-100 text-blue-700',
  qualified:    'bg-emerald-100 text-emerald-700',
  visit_booked: 'bg-violet-100 text-violet-700',
  closed:       'bg-slate-100 text-slate-500',
}

const STATUS_LABELS = {
  open: 'Ouverte', qualified: 'Qualifiée', visit_booked: 'Visite planifiée', closed: 'Fermée',
}

const CHANNEL_LABELS = {
  web_chat: 'Chat web', phone: 'Téléphone', email: 'Email',
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

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* Left — list */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Conversations</h1>
          <p className="text-slate-400 text-sm mt-0.5">{conversations.length} au total</p>
        </div>

        <div className="overflow-y-auto flex flex-col gap-2 flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <MessageSquare size={36} className="mx-auto mb-3 text-slate-200" />
              <p className="text-sm mb-3">Aucune conversation pour l'instant.</p>
              <a
                href={`${BASE}/widget/demo.html`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                <ExternalLink size={12} /> Ouvrir le chatbot démo
              </a>
            </div>
          ) : conversations.map(c => (
            <button
              key={c.id}
              onClick={() => selectConv(c)}
              className={`text-left p-4 rounded-2xl border transition-all ${
                selected?.id === c.id
                  ? 'border-blue-400 bg-blue-50 shadow-sm'
                  : 'border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <User size={16} className="text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-800 truncate">
                      {c.prospect_name || 'Prospect anonyme'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${STATUS_COLORS[c.status] || 'bg-slate-100 text-slate-500'}`}>
                      {STATUS_LABELS[c.status] || c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span>{CHANNEL_LABELS[c.channel] || c.channel}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{timeAgo(c.created_at)}</span>
                  </div>
                  {c.prospect_email && (
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-0.5 truncate">
                      <Mail size={10} />{c.prospect_email}
                    </div>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right — messages */}
      {selected ? (
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
              <User size={18} className="text-blue-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-800">{selected.prospect_name || 'Prospect anonyme'}</div>
              <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                <span>{CHANNEL_LABELS[selected.channel] || selected.channel}</span>
                <span>·</span>
                <span>{new Date(selected.created_at).toLocaleString('fr-FR')}</span>
              </div>
            </div>
            <div className="ml-auto">
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLORS[selected.status] || 'bg-slate-100 text-slate-500'}`}>
                {STATUS_LABELS[selected.status] || selected.status}
              </span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-3">
            {msgLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 size={20} className="animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-sm">Aucun message</div>
            ) : messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-sm lg:max-w-lg px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                }`}>
                  {m.content}
                  <div className={`text-xs mt-1.5 ${m.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
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
            <MessageSquare size={48} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-400 text-sm">Sélectionnez une conversation</p>
          </div>
        </div>
      )}
    </div>
  )
}
