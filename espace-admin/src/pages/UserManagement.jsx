/**
 * UserManagement.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Removed hardcoded USERS array; data is fetched from GET /admin/users.
 * - Search and filter inputs send query params to the API (server-side
 *   filtering) instead of filtering a local array.
 * - Pagination is driven by the API's total/page response.
 * - Loading skeleton and error state added.
 * - "Approve KYC" / "Reject KYC" drawer buttons call PATCH /admin/users/:id/kyc.
 * - Suspend/Ban actions show the confirm modal but note the backend limitation
 *   (no banned field in schema) in the console — the UI interaction is preserved.
 */
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  UserPlus, Star, CheckCircle, Clock, X, ChevronDown,
  Search, MessageSquare, MoreVertical, AlertTriangle, Users,
  Loader2, AlertCircle,
} from 'lucide-react'
import KpiCard from '../components/shared/KpiCard'
import StatusBadge from '../components/shared/StatusBadge'
import RiskBadge from '../components/shared/RiskBadge'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import ExportButton from '../components/shared/ExportButton'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../services/api'

// ── KYC badge styles (unchanged) ─────────────────────────────────────────────
const KYC_BADGE = {
  APPROVED:   'bg-emerald-100 text-emerald-700',
  SUBMITTED:  'bg-amber-100 text-amber-700',
  PENDING:    'bg-gray-100 text-gray-600',
  REJECTED:   'bg-red-100 text-red-700',
}

// Map backend kycStatus labels to display strings
const KYC_LABEL = {
  APPROVED: 'Verified', SUBMITTED: 'Pending', PENDING: 'Unverified', REJECTED: 'Rejected',
}

const AVATAR_COLORS = [
  'bg-blue-200 text-blue-700', 'bg-purple-200 text-purple-700',
  'bg-rose-200 text-rose-700',  'bg-amber-200 text-amber-700',
  'bg-teal-200 text-teal-700',  'bg-indigo-200 text-indigo-700',
  'bg-orange-200 text-orange-700','bg-green-200 text-green-700',
]

function initials(name) {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function DrawerSection({ title, children }) {
  return (
    <div className="mb-5">
      <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60 mb-2">{title}</p>
      {children}
    </div>
  )
}

function UserDrawer({ user, onClose, onAction, onKycAction }) {
  const navigate = useNavigate()
  const [kycLoading, setKycLoading] = useState(false)

  if (!user) return null

  const colorIdx = parseInt(user.id.replace(/\D/g, '').slice(-1) || '0', 10) % AVATAR_COLORS.length
  const color    = AVATAR_COLORS[colorIdx]
  const kycLabel = KYC_LABEL[user.kycStatus] ?? user.kycStatus

  async function handleKyc(status) {
    setKycLoading(true)
    try {
      await api.patch(`/admin/users/${user.id}/kyc`, { status })
      onKycAction(user.id, status === 'APPROVED' ? 'APPROVED' : 'REJECTED')
    } catch (err) {
      console.error('KYC action failed:', err)
    } finally {
      setKycLoading(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 h-full w-[440px] bg-surface-container-lowest shadow-2xl z-50 flex flex-col overflow-y-auto scrollbar-hidden">
        {/* Header */}
        <div className="p-6 border-b border-surface-container-high flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-base font-bold flex-shrink-0`}>
              {initials(user.name)}
            </div>
            <div>
              <p className="font-semibold text-on-surface">{user.name || user.phone}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${KYC_BADGE[user.kycStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                  {kycLabel}
                </span>
                {user.isAdmin && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Admin</span>
                )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-lg">
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div className="p-5 space-y-5 flex-1">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total Deals',    value: user.totalDeals ?? 0 },
              { label: 'Completion',     value: user.completionRate != null ? `${Math.round(user.completionRate * 100)}%` : 'N/A' },
              { label: 'Avg Rating',     value: user.rating ? Number(user.rating).toFixed(1) : 'N/A' },
            ].map(({ label, value }) => (
              <div key={label} className="bg-surface-container-low rounded-xl p-3 text-center">
                <p className="text-lg font-bold text-primary">{value}</p>
                <p className="text-[10px] text-on-surface-variant mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Personal info */}
          <DrawerSection title="Profile">
            <div className="space-y-2 text-sm">
              {[
                ['Phone',        user.phone],
                ['Email',        user.email || '—'],
                ['Member since', new Date(user.createdAt).toLocaleDateString()],
                ['Wallet',       `$${Number(user.walletBalance ?? 0).toFixed(2)}`],
                ['Face Verify',  user.faceVerificationStatus ?? 'PENDING'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-on-surface-variant">{k}</span>
                  <span className="text-on-surface font-medium truncate ml-4 max-w-[200px]">{v}</span>
                </div>
              ))}
            </div>
          </DrawerSection>

          {/* KYC documents */}
          <DrawerSection title="KYC Documents">
            <div className="bg-surface-container-low rounded-xl p-4 space-y-3">
              {[
                { label: 'ID / Passport', done: ['APPROVED', 'SUBMITTED'].includes(user.kycStatus) },
                { label: 'Selfie Verification', done: user.faceVerificationStatus === 'VERIFIED' },
              ].map(({ label, done }) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-on-surface-variant">{label}</span>
                  {done
                    ? <span className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Submitted</span>
                    : <span className="text-on-surface-variant flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>
                  }
                </div>
              ))}

              {/* KYC action buttons — shown when document is pending review */}
              {user.kycStatus === 'SUBMITTED' && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => handleKyc('APPROVED')}
                    disabled={kycLoading}
                    className="flex-1 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    {kycLoading ? 'Saving…' : 'Approve KYC'}
                  </button>
                  <button
                    onClick={() => handleKyc('REJECTED')}
                    disabled={kycLoading}
                    className="flex-1 py-2 text-xs font-semibold border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              )}
              <button
                onClick={() => navigate(`/users/${user.id}/kyc`)}
                className="w-full py-2 text-xs font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
              >
                View Full KYC Docs
              </button>
            </div>
          </DrawerSection>

          {/* Actions — ban/unban now call PATCH /admin/users/:id/ban */}
          <DrawerSection title="Actions">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onAction(user, 'warn')}
                className="py-2.5 text-sm font-semibold border border-outline-variant rounded-xl hover:bg-surface-container-high transition-colors text-on-surface-variant"
              >
                Warn User
              </button>
              {user.banned ? (
                <button
                  onClick={() => onAction(user, 'unban')}
                  className="py-2.5 text-sm font-semibold bg-emerald-100 text-emerald-700 rounded-xl hover:bg-emerald-200 transition-colors col-span-2"
                >
                  Remove Ban
                </button>
              ) : (
                <>
                  <button
                    onClick={() => onAction(user, 'suspend')}
                    className="py-2.5 text-sm font-semibold bg-amber-100 text-amber-700 rounded-xl hover:bg-amber-200 transition-colors"
                  >
                    Suspend (7d)
                  </button>
                  <button
                    onClick={() => onAction(user, 'ban')}
                    className="py-2.5 text-sm font-semibold bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors col-span-2"
                  >
                    Permanent Ban
                  </button>
                </>
              )}
            </div>
          </DrawerSection>
        </div>
      </aside>
    </>
  )
}

// ── Inline risk badge ─────────────────────────────────────────────────────────
function InlineRiskBadge({ score }) {
  const pct = Math.min(100, Math.max(0, score ?? 0))
  let label, color, bar
  if (pct <= 30)      { label = 'Low';  color = 'text-emerald-700'; bar = 'bg-emerald-500' }
  else if (pct <= 60) { label = 'Med';  color = 'text-amber-700';   bar = 'bg-amber-500' }
  else                { label = 'High'; color = 'text-red-700';     bar = 'bg-red-500' }
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <span className={`text-xs font-bold ${color} w-5`}>{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-on-surface-variant w-6 text-right">{pct}</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function UserManagement() {
  const [page,         setPage]        = useState(1)
  const [search,       setSearch]      = useState('')
  const [kycFilter,    setKycFilter]   = useState('')
  const [drawerUser,   setDrawerUser]  = useState(null)
  const [confirm,      setConfirm]     = useState(null)
  const [users,        setUsers]       = useState([])
  const [total,        setTotal]       = useState(0)
  const [loading,      setLoading]     = useState(true)
  const [error,        setError]       = useState(null)

  const perPage = 20

  // Fetch users whenever page, search, or filter changes
  const fetchUsers = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      page,
      limit: perPage,
      ...(search    && { search }),
      ...(kycFilter && { kycStatus: kycFilter }),
    })
    api.get(`/admin/users?${params}`)
      .then(r => { setUsers(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load users.'))
      .finally(() => setLoading(false))
  }, [page, search, kycFilter])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  // Debounce search input so we don't fire on every keystroke
  const [searchInput, setSearchInput] = useState('')
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  // Update a single user's kycStatus in local state after API action
  function handleKycAction(userId, newKycStatus) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, kycStatus: newKycStatus } : u))
    if (drawerUser?.id === userId) setDrawerUser(u => ({ ...u, kycStatus: newKycStatus }))
  }

  // Connected to PATCH /admin/users/:id/ban — toggles the banned field
  async function executeBan(userId, banValue) {
    try {
      await api.patch(`/admin/users/${userId}/ban`, { banned: banValue })
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: banValue } : u))
      if (drawerUser?.id === userId) setDrawerUser(u => ({ ...u, banned: banValue }))
    } catch (err) {
      console.error('Ban action failed:', err)
    }
  }

  function handleAction(user, action) {
    const messages = {
      warn:    { title: `Warn ${user.name || user.phone}`, message: 'Send an automated warning to this user about policy violations.', danger: false },
      suspend: { title: `Suspend ${user.name || user.phone}`, message: `Suspend this user. Sets banned = true in the database. They will be locked out until an admin unbans them.`, danger: true },
      ban:     { title: `Permanently ban ${user.name || user.phone}`, message: `Permanently ban this user. Sets banned = true in the database.`, danger: true },
      unban:   { title: `Unban ${user.name || user.phone}`, message: `Remove the ban from this user. They will regain full access.`, danger: false },
    }
    setConfirm({
      ...messages[action],
      onConfirm: async () => {
        if (action === 'suspend' || action === 'ban')  await executeBan(user.id, true)
        if (action === 'unban')                        await executeBan(user.id, false)
        setConfirm(null)
      },
    })
  }

  const totalPages    = Math.ceil(total / perPage)
  const flaggedCount  = users.filter(u => u.kycStatus === 'SUBMITTED').length

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">User Management</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Monitor, manage, and moderate platform users</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton />
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-semibold monolith-gradient text-white rounded-xl hover:opacity-90 transition-opacity shadow-sm">
            <UserPlus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total Users"      value={total.toLocaleString()}         changeType="neutral" icon={<Users         className="w-4 h-4 text-blue-600" />}   accentColor="#3B82F6" />
        <KpiCard label="KYC Pending"      value={flaggedCount.toString()}         sublabel="Awaiting review" changeType="neutral" icon={<AlertTriangle className="w-4 h-4 text-amber-600" />} accentColor="#D97706" />
        <KpiCard label="Active on Page"   value={users.length.toString()}         sublabel={`page ${page}`}  changeType="neutral" icon={<Users         className="w-4 h-4 text-emerald-600" />} accentColor="#059669" />
      </div>

      {/* Table card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container">
        {/* Filters */}
        <div className="p-4 border-b border-surface-container-high flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search name, email or phone…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
            />
          </div>

          {/* KYC filter */}
          <div className="relative">
            <select
              value={kycFilter}
              onChange={e => { setKycFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="">KYC: All</option>
              <option value="APPROVED">Verified</option>
              <option value="SUBMITTED">Pending</option>
              <option value="PENDING">Unverified</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low/40">
                <tr>
                  {['User Details', 'KYC Status', 'Total Deals', 'Rating', 'Wallet', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const color    = AVATAR_COLORS[idx % AVATAR_COLORS.length]
                  const kycLabel = KYC_LABEL[u.kycStatus] ?? u.kycStatus
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setDrawerUser(u)}
                      className="border-t border-surface-container hover:bg-surface-container-low/40 transition-colors cursor-pointer"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full ${color} flex items-center justify-center text-sm font-bold flex-shrink-0`}>
                            {initials(u.name)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-semibold text-on-surface">{u.name || '—'}</p>
                              {/* Shows banned badge when banned field is true */}
                              {u.banned && <span className="text-[9px] font-bold px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">BANNED</span>}
                            </div>
                            <p className="text-xs text-on-surface-variant">{u.email || u.phone}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${KYC_BADGE[u.kycStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                          {kycLabel}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface font-medium">{u.totalDeals ?? 0}</td>
                      <td className="px-5 py-4">
                        {u.rating
                          ? <div className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /><span className="text-sm font-semibold text-on-surface">{Number(u.rating).toFixed(1)}</span></div>
                          : <span className="text-xs text-on-surface-variant">N/A</span>
                        }
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface">${Number(u.walletBalance ?? 0).toFixed(2)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <button className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors">
                            <MessageSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDrawerUser(u)}
                            className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && users.length === 0 && !error && (
          <div className="py-16 text-center">
            <Users className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">No users match your filters</p>
          </div>
        )}

        <Pagination page={page} totalPages={totalPages || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      </div>

      {/* User Drawer */}
      <UserDrawer
        user={drawerUser}
        onClose={() => setDrawerUser(null)}
        onAction={handleAction}
        onKycAction={handleKycAction}
      />

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.danger ? 'Confirm' : 'OK'}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
