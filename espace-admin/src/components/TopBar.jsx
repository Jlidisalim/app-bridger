/**
 * TopBar.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Replaced hardcoded NOTIFICATIONS array with real data from GET /notifications
 *   (fetched once on mount, limited to 5 most recent).
 * - "Mark all read" button calls POST /notifications/read-all.
 * - User avatar/name/role read from the Zustand auth store instead of
 *   hardcoded "Super Admin".
 * - Logout button added to the user chip (calls authStore.logout()).
 * - Notification unread dot is driven by the API unread count.
 */
import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, Bell, Settings, AlertTriangle, FileText, User, Clock, LogOut } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import api from '../services/api'

const PAGE_TITLES = {
  '/dashboard':    'Dashboard',
  '/trips':        'Trip Post Management',
  '/shipments':    'Shipment Posts',
  '/users':        'User Management',
  '/analytics':    'Analytics',
  '/moderation':   'Risk Assessment',
  '/reports':      'Reports Central',
  '/transactions': 'Transactions',
}

// Icon mapping for notification types coming from the backend
function NotifIcon({ type }) {
  if (!type) return <AlertTriangle className="w-4 h-4" />
  if (type.includes('KYC') || type.includes('USER')) return <User className="w-4 h-4" />
  if (type.includes('PAYMENT') || type.includes('WALLET')) return <FileText className="w-4 h-4" />
  if (type.includes('DEAL') || type.includes('MATCH')) return <Clock className="w-4 h-4" />
  return <AlertTriangle className="w-4 h-4" />
}

function notifColor(type) {
  if (!type) return 'text-red-500 bg-red-50'
  if (type.includes('KYC'))     return 'text-amber-500 bg-amber-50'
  if (type.includes('PAYMENT')) return 'text-blue-500 bg-blue-50'
  if (type.includes('DEAL'))    return 'text-purple-500 bg-purple-50'
  return 'text-red-500 bg-red-50'
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)  return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs} hr ago`
  return `${Math.floor(hrs / 24)} days ago`
}

function initials(name) {
  if (!name) return 'SA'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function TopBar() {
  const { pathname } = useLocation()
  const navigate     = useNavigate()
  const { user, logout } = useAuthStore()

  const [notifOpen,    setNotifOpen]    = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount,  setUnreadCount]  = useState(0)
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const base  = '/' + pathname.split('/')[1]
  const title = PAGE_TITLES[base] ?? 'Bridger Admin'

  // Fetch recent notifications on mount
  useEffect(() => {
    api.get('/notifications?limit=5')
      .then(r => {
        const items = r.data.items ?? r.data ?? []
        setNotifications(items)
        setUnreadCount(items.filter(n => !n.read).length)
      })
      .catch(() => { /* non-critical — fail silently */ })
  }, [])

  async function markAllRead() {
    try {
      await api.post('/notifications/read-all')
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (_) {}
    setNotifOpen(false)
  }

  async function handleLogout() {
    setUserMenuOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <header className="fixed top-0 left-60 right-0 h-16 bg-surface-container-lowest border-b border-outline-variant/20 flex items-center px-6 gap-4 z-40">
      <h2 className="text-[15px] font-semibold text-on-surface min-w-[140px] whitespace-nowrap">{title}</h2>

      {/* Search */}
      <div className="flex-1 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
        <input
          type="text"
          placeholder="Search posts, routes, or users…"
          className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-xl border border-transparent focus:border-primary/30 focus:ring-2 focus:ring-primary/10 outline-none placeholder:text-on-surface-variant/60 transition-all"
        />
      </div>

      <div className="flex items-center gap-1 ml-auto">
        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setNotifOpen(v => !v)}
            className="relative p-2.5 rounded-xl hover:bg-surface-container-high transition-colors"
          >
            <Bell className="w-5 h-5 text-on-surface-variant" />
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full ring-2 ring-surface-container-lowest" />
            )}
          </button>

          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 top-12 w-80 bg-surface-container-lowest rounded-2xl shadow-2xl border border-surface-container-high z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-surface-container-high">
                  <span className="text-sm font-semibold text-on-surface">
                    Notifications {unreadCount > 0 && <span className="ml-1 text-xs text-red-500">({unreadCount} new)</span>}
                  </span>
                  <button
                    onClick={markAllRead}
                    className="text-[11px] text-primary-container font-medium hover:underline"
                  >
                    Mark all read
                  </button>
                </div>
                <div className="divide-y divide-surface-container-high max-h-72 overflow-y-auto">
                  {notifications.length > 0 ? notifications.map(n => (
                    <div
                      key={n.id}
                      className={`flex items-start gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors cursor-pointer ${!n.read ? 'bg-primary/[0.03]' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${notifColor(n.type)}`}>
                        <NotifIcon type={n.type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-on-surface leading-snug">{n.body ?? n.title ?? 'New notification'}</p>
                        <p className="text-[10px] text-on-surface-variant mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.read && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />}
                    </div>
                  )) : (
                    <div className="px-4 py-8 text-center text-sm text-on-surface-variant">No notifications</div>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-surface-container-high text-center">
                  <button className="text-[11px] text-primary-container font-medium hover:underline">
                    View all notifications
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Settings */}
        <button className="p-2.5 rounded-xl hover:bg-surface-container-high transition-colors">
          <Settings className="w-5 h-5 text-on-surface-variant" />
        </button>

        {/* User chip with logout dropdown */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2.5 pl-2 ml-1 border-l border-outline-variant/30 hover:bg-surface-container-high rounded-xl px-2 py-1 transition-colors"
          >
            <div className="w-8 h-8 rounded-full monolith-gradient flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials(user?.name)}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-xs font-semibold text-on-surface leading-tight">{user?.name ?? 'Super Admin'}</p>
              <p className="text-[10px] text-on-surface-variant">{user?.isAdmin ? 'ADMIN' : 'USER'}</p>
            </div>
          </button>

          {userMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
              <div className="absolute right-0 top-12 w-48 bg-surface-container-lowest rounded-xl shadow-2xl border border-surface-container-high z-50 overflow-hidden py-1">
                <div className="px-4 py-2 border-b border-surface-container-high">
                  <p className="text-xs font-semibold text-on-surface truncate">{user?.name ?? 'Admin'}</p>
                  <p className="text-[10px] text-on-surface-variant truncate">{user?.phone}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
