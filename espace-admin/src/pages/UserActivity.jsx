import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, AlertCircle, Package, Plane, Star,
  CreditCard, AlertTriangle, Activity, ShieldAlert, Filter,
} from 'lucide-react'
import api from '../services/api'

const CATEGORY_META = {
  DEAL:        { label: 'Deals',        icon: Package,      color: 'text-blue-600',    bg: 'bg-blue-50',    ring: 'ring-blue-200' },
  TRIP:        { label: 'Trips',        icon: Plane,        color: 'text-indigo-600',  bg: 'bg-indigo-50',  ring: 'ring-indigo-200' },
  REVIEW:      { label: 'Reviews',      icon: Star,         color: 'text-amber-600',   bg: 'bg-amber-50',   ring: 'ring-amber-200' },
  TRANSACTION: { label: 'Wallet',       icon: CreditCard,   color: 'text-emerald-600', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
  DISPUTE:     { label: 'Disputes',     icon: AlertTriangle,color: 'text-red-600',     bg: 'bg-red-50',     ring: 'ring-red-200' },
  SYSTEM:      { label: 'System',       icon: ShieldAlert,  color: 'text-purple-600',  bg: 'bg-purple-50',  ring: 'ring-purple-200' },
}

const AVATAR_COLORS = [
  'bg-blue-200 text-blue-700', 'bg-purple-200 text-purple-700',
  'bg-rose-200 text-rose-700',  'bg-amber-200 text-amber-700',
  'bg-teal-200 text-teal-700',  'bg-indigo-200 text-indigo-700',
]

function initials(name) {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function formatRelative(iso) {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const sec = Math.round(diffMs / 1000)
  if (sec < 60)        return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60)        return `${min}m ago`
  const hrs = Math.round(min / 60)
  if (hrs < 24)        return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30)       return `${days}d ago`
  return d.toLocaleDateString()
}

function groupByDay(events) {
  const groups = new Map()
  for (const e of events) {
    const key = new Date(e.timestamp).toDateString()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }
  return Array.from(groups.entries())
}

function EventCard({ event }) {
  const meta = CATEGORY_META[event.category] || CATEGORY_META.SYSTEM
  const Icon = meta.icon
  return (
    <div className="flex gap-3 group">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-9 h-9 rounded-full ${meta.bg} ring-2 ring-white flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${meta.color}`} />
        </div>
        <div className="flex-1 w-px bg-surface-container-high mt-1 group-last:hidden" />
      </div>
      <div className="flex-1 pb-5 min-w-0">
        <div className="bg-surface-container-lowest border border-surface-container rounded-xl p-4 hover:shadow-card transition-shadow">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase ${meta.bg} ${meta.color}`}>
                  {meta.label}
                </span>
                <span className="text-[10px] font-mono text-on-surface-variant/70">{event.action}</span>
              </div>
              <p className="text-sm font-semibold text-on-surface mt-1.5 break-words">{event.title}</p>
              {event.description && (
                <p className="text-xs text-on-surface-variant mt-1 break-words">{event.description}</p>
              )}
            </div>
            <span className="text-[11px] text-on-surface-variant whitespace-nowrap flex-shrink-0">
              {formatRelative(event.timestamp)}
            </span>
          </div>

          {event.meta && Object.keys(event.meta).length > 0 && (
            <details className="mt-2.5">
              <summary className="text-[10px] font-semibold tracking-wider uppercase text-on-surface-variant/70 cursor-pointer hover:text-on-surface-variant select-none">
                Details
              </summary>
              <pre className="mt-2 bg-surface-container-low rounded-lg p-2 text-[11px] text-on-surface-variant overflow-x-auto">
                {JSON.stringify(event.meta, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UserActivity() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('ALL')
  const [limit] = useState(200)

  useEffect(() => {
    setLoading(true)
    setError(null)
    api.get(`/admin/users/${id}/activity?limit=${limit}`)
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load activity.'))
      .finally(() => setLoading(false))
  }, [id, limit])

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'ALL') return data.events
    return data.events.filter(e => e.category === filter)
  }, [data, filter])

  const grouped = useMemo(() => groupByDay(filtered), [filtered])

  const user = data?.user
  const counts = data?.counts || {}
  const colorIdx = user ? parseInt((user.id || '').replace(/\D/g, '').slice(-1) || '0', 10) % AVATAR_COLORS.length : 0
  const avatarColor = AVATAR_COLORS[colorIdx]

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Activity History</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            Comprehensive log of posts, updates and system interactions
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
        </div>
      ) : data ? (
        <>
          {/* User summary card */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5 flex items-center gap-4">
            <div className={`w-14 h-14 rounded-full ${avatarColor} flex items-center justify-center text-lg font-bold flex-shrink-0`}>
              {initials(user.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-base font-semibold text-on-surface truncate">{user.name || user.phone}</p>
                {user.banned && <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">BANNED</span>}
                {user.flagged && <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">FLAGGED</span>}
                {user.isAdmin && <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">ADMIN</span>}
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">{user.email || user.phone}</p>
              <div className="flex items-center gap-4 mt-2 text-[11px] text-on-surface-variant">
                <span>Member since {new Date(user.createdAt).toLocaleDateString()}</span>
                {user.lastLoginAt && <span>· Last login {formatRelative(user.lastLoginAt)}</span>}
                <span>· {user.totalDeals ?? 0} deals</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-on-surface-variant text-xs flex-shrink-0">
              <Activity className="w-4 h-4" />
              <span><span className="font-semibold text-on-surface">{counts.total ?? 0}</span> events</span>
            </div>
          </div>

          {/* Category counters / filter pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilter('ALL')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
                filter === 'ALL'
                  ? 'bg-on-surface text-surface-container-lowest'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <Filter className="w-3 h-3" />
              All <span className="opacity-60">· {counts.total ?? 0}</span>
            </button>
            {Object.entries(CATEGORY_META).map(([key, meta]) => {
              const Icon = meta.icon
              const active = filter === key
              const count = counts[key] ?? 0
              return (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  disabled={count === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    active
                      ? `${meta.bg} ${meta.color} ring-1 ${meta.ring}`
                      : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  {meta.label} <span className="opacity-60">· {count}</span>
                </button>
              )
            })}
          </div>

          {/* Timeline */}
          {filtered.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container py-16 text-center">
              <Activity className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">
                No {filter === 'ALL' ? 'activity' : CATEGORY_META[filter]?.label.toLowerCase()} recorded for this user
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map(([dayKey, dayEvents]) => (
                <div key={dayKey}>
                  <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60 mb-3">
                    {new Date(dayKey).toLocaleDateString(undefined, {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                    })}
                    <span className="ml-2 text-on-surface-variant/40">· {dayEvents.length}</span>
                  </p>
                  <div className="pl-1">
                    {dayEvents.map(e => <EventCard key={e.id} event={e} />)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {data.events.length >= limit && (
            <p className="text-center text-xs text-on-surface-variant py-2">
              Showing the most recent {limit} events. Older entries are not displayed.
            </p>
          )}
        </>
      ) : null}
    </div>
  )
}
