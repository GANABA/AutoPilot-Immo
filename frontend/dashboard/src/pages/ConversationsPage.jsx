import { useEffect, useState } from 'react'
import { MessageSquare, User } from 'lucide-react'
import { getConversations, getMessages } from '../api/client'

const STATUS_BADGE = {
  open:         'bg-blue-100 text-blue-700',
  qualified:    'bg-green-100 text-green-700',
  visit_booked: 'bg-purple-100 text-purple-700',
  closed:       'bg-slate-100 text-slate-500',
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `il y a ${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

export default function ConversationsPage() {
  const [conversations, setConversations] = useState([])
  const [selected, setSelected] = useState(null)
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [msgLoading, setMsgLoading] = useState(false)

  useEffect(() => {
    getConversations()
      .then(setConversations)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const selectConv = async (conv) => {
    setSelected(conv)
    setMsgLoading(true)
    try {
      const msgs = await getMessages(conv.id)
      setMessages(msgs)
    } catch {
      setMessages([])
    } finally {
      setMsgLoading(false)
    }
  }

  return (
    <div className="flex gap-6 h-full">
      {/* ── Left: list ── */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Conversations</h1>
          <p className="text-slate-500 text-sm">{conversations.length} au total</p>
        </div>

        <div className="overflow-y-auto flex flex-col gap-2 flex-1">
          {loading ? (
            <div className="text-slate-400 text-sm text-center py-8">Chargement…</div>
          ) : conversations.length === 0 ? (
            <div className="text-slate-400 text-sm text-center py-8">
              Aucune conversation.<br />
              <a href="../widget/demo.html" target="_blank" rel="noreferrer"
                className="text-blue-500 hover:underline">Ouvrir le chatbot</a>
            </div>
          ) : conversations.map(c => (
            <button
              key={c.id}
              onClick={() => selectConv(c)}
              className={`text-left p-3 rounded-xl border transition-all ${
                selected?.id === c.id
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-slate-700">
                  {c.prospect_name || 'Prospect anonyme'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[c.status] || 'bg-slate-100 text-slate-500'}`}>
                  {c.status}
                </span>
              </div>
              <div className="text-xs text-slate-400">
                {c.channel} · {timeAgo(c.created_at)}
              </div>
              {c.prospect_email && (
                <div className="text-xs text-slate-400 truncate">{c.prospect_email}</div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Right: messages ── */}
      {selected ? (
        <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-100 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-100">
            <div className="font-semibold text-slate-800">
              {selected.prospect_name || 'Prospect anonyme'}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {selected.channel} · {new Date(selected.created_at).toLocaleString('fr-FR')}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {msgLoading ? (
              <div className="text-center text-slate-400 text-sm py-8">Chargement…</div>
            ) : messages.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">Aucun message</div>
            ) : messages.map(m => (
              <div
                key={m.id}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-700 rounded-bl-sm'
                  }`}
                >
                  {m.content}
                  <div className={`text-xs mt-1 ${m.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                    {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <div className="text-center">
            <MessageSquare size={40} className="mx-auto mb-3 text-slate-200" />
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        </div>
      )}
    </div>
  )
}
