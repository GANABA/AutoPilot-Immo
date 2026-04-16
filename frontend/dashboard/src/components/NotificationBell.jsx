import { useEffect, useRef, useState } from 'react'
import { Bell, X, Check, Users, Phone, Calendar, AlertTriangle } from 'lucide-react'
import { getNotifications, markNotificationRead, markAllNotificationsRead, wsUrl } from '../api/client'

const NOTIF_ICONS = {
  new_prospect:  { icon: Users,         bg: 'rgba(201,169,110,0.12)', color: '#C9A96E'  },
  visit_booked:  { icon: Calendar,      bg: 'rgba(16,185,129,0.10)',  color: '#10B981'  },
  new_call:      { icon: Phone,         bg: 'rgba(139,92,246,0.10)',  color: '#8B5CF6'  },
  escalation:    { icon: AlertTriangle, bg: 'rgba(239,68,68,0.10)',   color: '#EF4444'  },
}

function fmtAge(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return "\u00e0 l\u2019instant"
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

      ws.onclose = () => { setTimeout(connect, 5000) }
    }

    connect()
    return () => { wsRef.current?.close() }
  }, [])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
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
        className="relative p-2 rounded-lg transition-colors"
        style={{ color: '#9B9488' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#F5F3EE'; e.currentTarget.style.color = '#6B6459' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9488' }}
        aria-label="Notifications"
      >
        <Bell size={17} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 rounded-full flex items-center justify-center text-white font-bold"
                style={{ fontSize: '9px' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-card-lg border border-lin z-50 overflow-hidden"
             style={{ boxShadow: '0 12px 40px rgba(10,10,15,0.14), 0 4px 12px rgba(10,10,15,0.06)' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-lin">
            <span className="font-serif font-semibold text-noir text-sm">Notifications</span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs flex items-center gap-1 transition-colors"
                  style={{ color: '#C9A96E' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#A8823A'}
                  onMouseLeave={e => e.currentTarget.style.color = '#C9A96E'}
                >
                  <Check size={11} />
                  Tout lire
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg transition-colors"
                style={{ color: '#9B9488' }}
                onMouseEnter={e => e.currentTarget.style.background = '#F5F3EE'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 rounded-full border-2 border-lin animate-spin"
                     style={{ borderTopColor: '#C9A96E' }} />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8 text-xs" style={{ color: '#9B9488' }}>
                Aucune notification
              </div>
            ) : (
              notifications.map(n => {
                const cfg = NOTIF_ICONS[n.type] || NOTIF_ICONS['new_prospect']
                const Icon = cfg.icon
                return (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-lin transition-colors cursor-default"
                    style={{
                      background: !n.is_read ? 'rgba(201,169,110,0.04)' : 'transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FAFAF8'}
                    onMouseLeave={e => e.currentTarget.style.background = !n.is_read ? 'rgba(201,169,110,0.04)' : 'transparent'}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                         style={{ background: cfg.bg }}>
                      <Icon size={14} style={{ color: cfg.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug"
                         style={{
                           fontWeight: !n.is_read ? 600 : 400,
                           color: !n.is_read ? '#0A0A0F' : '#4A4540',
                         }}>
                        {n.title}
                      </p>
                      {n.body && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: '#9B9488' }}>{n.body}</p>
                      )}
                      <p className="text-xs mt-1" style={{ color: '#C0B8AC' }}>{fmtAge(n.created_at)}</p>
                    </div>
                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="p-1 rounded-lg flex-shrink-0 mt-0.5 transition-colors"
                        style={{ color: '#9B9488' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#F5F3EE'; e.currentTarget.style.color = '#C9A96E' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9B9488' }}
                        title="Marquer comme lu"
                      >
                        <Check size={12} />
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
