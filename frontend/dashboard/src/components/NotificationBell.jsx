import { useEffect, useRef, useState } from 'react'
import { Bell, X, Check, Users, Phone, Calendar, AlertTriangle } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead, wsUrl } from '../api/client'

const NOTIF_ICONS = {
  new_prospect:  { icon: Users,         bg: 'bg-blue-100',  color: 'text-blue-600'  },
  visit_booked:  { icon: Calendar,      bg: 'bg-green-100', color: 'text-green-600' },
  new_call:      { icon: Phone,         bg: 'bg-purple-100',color: 'text-purple-600'},
  escalation:    { icon: AlertTriangle, bg: 'bg-red-100',   color: 'text-red-600'   },
}

function fmtAge(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "à l'instant"
  if (m < 60) return `il y a ${m}min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h}h`
  return `il y a ${Math.floor(h / 24)}j`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const panelRef = useRef(null)
  const wsRef = useRef(null)

  // Load notifications
  const load = () => {
    setLoading(true)
    getNotifications()
      .then(r => {
        setNotifications(r.items || [])
        setUnreadCount(r.unread_count || 0)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()

    // WebSocket for real-time push (authenticated via token query param)
    const connect = () => {
      const ws = new WebSocket(wsUrl('/notifications/ws'))
      wsRef.current = ws

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'init') {
            setUnreadCount(msg.unread_count || 0)
          } else if (msg.type === 'notification') {
            setUnreadCount(c => c + 1)
            setNotifications(prev => [{
              id: msg.id,
              type: msg.notif_type,
              title: msg.title,
              body: msg.body,
              data: msg.data,
              is_read: false,
              created_at: msg.created_at,
            }, ...prev.slice(0, 49)])
          }
        } catch {}
      }

      ws.onclose = () => {
        // Reconnect after 5s
        setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      wsRef.current?.close()
    }
  }, [])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleMarkRead = async (id) => {
    await markNotificationRead(id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-xl hover:bg-slate-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} className="text-slate-400" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-semibold text-slate-900 text-sm">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  <Check size={11} />
                  Tout lire
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg">
                <X size={14} className="text-slate-400" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">Aucune notification</div>
            ) : (
              notifications.map(n => {
                const cfg = NOTIF_ICONS[n.type] || NOTIF_ICONS['new_prospect']
                const Icon = cfg.icon
                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg}`}>
                      <Icon size={14} className={cfg.color} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!n.is_read ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{n.body}</p>
                      )}
                      <p className="text-xs text-slate-400 mt-1">{fmtAge(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1 hover:bg-slate-200 rounded-lg flex-shrink-0 mt-0.5"
                        title="Marquer comme lu"
                      >
                        <Check size={12} className="text-slate-400" />
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
