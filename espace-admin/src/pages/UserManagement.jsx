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
  Search, MessageSquare, Eye, AlertTriangle, Users,
  Loader2, AlertCircle, Ban,
} from 'lucide-react'
import KpiCard from '../components/shared/KpiCard'
import StatusBadge from '../components/shared/StatusBadge'
import RiskBadge from '../components/shared/RiskBadge'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import ExportButton from '../components/shared/ExportButton'
import { LineChart, Line, ResponsiveContainer, Tooltip, PieChart, Pie, Cell, Legend } from 'recharts'
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
                <button
                  onClick={() => onAction(user, 'ban-modal')}
                  className="py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors col-span-2 flex items-center justify-center gap-2"
                >
                  <Ban className="w-4 h-4" /> Ban User
                </button>
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

// ── Status distribution donut ────────────────────────────────────────────────
const STATUS_COLORS = {
  Verified: '#10B981',
  Pending:  '#F59E0B',
  Unverified: '#94A3B8',
  Rejected: '#EF4444',
  Banned:   '#7F1D1D',
}

function StatusDistribution({ data, loading }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-4 h-full">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="text-[11px] font-semibold tracking-widest uppercase text-on-surface-variant">User Status Distribution</p>
          <p className="text-xs text-on-surface-variant/70 mt-0.5">Breakdown across all KYC and ban states</p>
        </div>
        <Users className="w-4 h-4 text-on-surface-variant/60" />
      </div>

      {loading ? (
        <div className="h-[160px] flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary opacity-50" />
        </div>
      ) : total === 0 ? (
        <div className="h-[160px] flex items-center justify-center text-xs text-on-surface-variant">No data</div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="relative w-[140px] h-[140px] flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={42}
                  outerRadius={62}
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((d) => (
                    <Cell key={d.name} fill={STATUS_COLORS[d.name] || '#CBD5E1'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid #E2E8F0' }}
                  formatter={(v, n) => [`${v} (${total ? Math.round((v / total) * 100) : 0}%)`, n]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-lg font-bold text-on-surface leading-none">{total.toLocaleString()}</p>
              <p className="text-[10px] text-on-surface-variant mt-0.5">Total</p>
            </div>
          </div>
          <ul className="flex-1 space-y-1.5 text-xs">
            {data.map(d => (
              <li key={d.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS[d.name] || '#CBD5E1' }} />
                  <span className="text-on-surface-variant">{d.name}</span>
                </span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {d.value} <span className="text-on-surface-variant/60 font-normal">({total ? Math.round((d.value / total) * 100) : 0}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── Ban duration modal ───────────────────────────────────────────────────────
const BAN_DURATIONS = [
  { key: '1h',   label: '1 Hour',    hours: 1,        sublabel: 'Short timeout' },
  { key: '24h',  label: '24 Hours',  hours: 24,       sublabel: 'One day cooldown' },
  { key: '7d',   label: '7 Days',    hours: 24 * 7,   sublabel: 'Standard suspension' },
  { key: '30d',  label: '30 Days',   hours: 24 * 30,  sublabel: 'Extended suspension' },
  { key: 'inf',  label: 'Indefinite', hours: null,    sublabel: 'Until manually removed' },
]

function BanUserModal({ user, onClose, onConfirm, saving }) {
  const [selected, setSelected] = useState('7d')
  const [reason, setReason]     = useState('')

  if (!user) return null
  const choice = BAN_DURATIONS.find(d => d.key === selected)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-on-surface">Ban User</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {user.name || user.phone}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-lg flex-shrink-0">
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div>
          <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-2">
            Ban Duration
          </p>
          <div className="grid grid-cols-1 gap-2">
            {BAN_DURATIONS.map(d => {
              const active = selected === d.key
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => setSelected(d.key)}
                  className={`flex items-center justify-between text-left px-4 py-3 rounded-xl border transition-colors ${
                    active
                      ? 'border-red-500 bg-red-50'
                      : 'border-surface-container-high hover:bg-surface-container-low'
                  }`}
                >
                  <div>
                    <p className={`text-sm font-semibold ${active ? 'text-red-700' : 'text-on-surface'}`}>{d.label}</p>
                    <p className="text-[11px] text-on-surface-variant">{d.sublabel}</p>
                  </div>
                  <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    active ? 'border-red-500' : 'border-outline-variant'
                  }`}>
                    {active && <span className="w-2 h-2 rounded-full bg-red-500" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
            Reason (optional)
          </label>
          <textarea
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Visible in audit log and shown to user…"
            className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:ring-2 focus:ring-primary-container/20 resize-none"
          />
        </div>

        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2 mt-4">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            User status will switch to <strong>Banned</strong> immediately
            {choice?.hours != null
              ? ` and remain so for ${choice.label.toLowerCase()}.`
              : ' until an admin manually removes the ban.'}
          </span>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant border border-outline-variant rounded-xl hover:bg-surface-container-high transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({ duration: choice, reason })}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
            {saving ? 'Banning…' : 'Apply Ban'}
          </button>
        </div>
      </div>
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
  const [showAddUser,  setShowAddUser] = useState(false)
  const [addForm,      setAddForm]     = useState({ name: '', phone: '', email: '' })
  const [addSaving,    setAddSaving]   = useState(false)
  const [addError,     setAddError]    = useState(null)
  const [banTarget,    setBanTarget]   = useState(null)
  const [banSaving,    setBanSaving]   = useState(false)
  const [statusCounts, setStatusCounts] = useState(null) // { Verified, Pending, Unverified, Rejected, Banned }
  const [statusLoading, setStatusLoading] = useState(true)

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

  // Fetch counts for the status distribution donut. Uses the existing
  // /admin/users endpoint with limit=1 per status — we only need `total`.
  const fetchStatusCounts = useCallback(async () => {
    setStatusLoading(true)
    try {
      const reqs = [
        api.get('/admin/users?kycStatus=APPROVED&limit=1'),
        api.get('/admin/users?kycStatus=SUBMITTED&limit=1'),
        api.get('/admin/users?kycStatus=PENDING&limit=1'),
        api.get('/admin/users?kycStatus=REJECTED&limit=1'),
        api.get('/admin/users?banned=true&limit=1'),
      ]
      const [verified, pending, unverified, rejected, banned] = await Promise.all(reqs)
      setStatusCounts({
        Verified:   verified.data.total ?? 0,
        Pending:    pending.data.total ?? 0,
        Unverified: unverified.data.total ?? 0,
        Rejected:   rejected.data.total ?? 0,
        Banned:     banned.data.total ?? 0,
      })
    } catch (err) {
      console.error('Status counts failed:', err)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatusCounts() }, [fetchStatusCounts])

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
  async function executeBan(userId, banValue, extra = {}) {
    try {
      const endpoint = banValue
        ? `/admin/users/${userId}/ban`
        : `/admin/users/${userId}/unban`
      const body = banValue ? { reason: extra.reason || null, bannedUntil: extra.bannedUntil || null } : {}
      await api.patch(endpoint, body)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, banned: banValue, bannedUntil: extra.bannedUntil ?? null } : u))
      if (drawerUser?.id === userId) setDrawerUser(u => ({ ...u, banned: banValue, bannedUntil: extra.bannedUntil ?? null }))
      fetchStatusCounts()
    } catch (err) {
      console.error('Ban action failed:', err)
    }
  }

  async function handleBanConfirm({ duration, reason }) {
    if (!banTarget) return
    setBanSaving(true)
    try {
      const bannedUntil = duration?.hours != null
        ? new Date(Date.now() + duration.hours * 60 * 60 * 1000).toISOString()
        : null
      const reasonText = `${duration?.label || 'Ban'}${reason ? ` — ${reason}` : ''}`
      await executeBan(banTarget.id, true, { reason: reasonText, bannedUntil })
      setBanTarget(null)
    } finally {
      setBanSaving(false)
    }
  }

  function handleAction(user, action) {
    if (action === 'ban-modal') {
      setBanTarget(user)
      return
    }
    const messages = {
      warn:    { title: `Warn ${user.name || user.phone}`, message: 'Send an automated warning to this user about policy violations.', danger: false },
      unban:   { title: `Unban ${user.name || user.phone}`, message: `Remove the ban from this user. They will regain full access.`, danger: false },
    }
    setConfirm({
      ...messages[action],
      onConfirm: async () => {
        if (action === 'unban') await executeBan(user.id, false)
        setConfirm(null)
      },
    })
  }

  const totalPages    = Math.ceil(total / perPage)
  const flaggedCount  = users.filter(u => u.kycStatus === 'SUBMITTED').length

  function handleExport() {
    if (!users.length) return
    const headers = ['ID', 'Name', 'Phone', 'Email', 'KYC Status', 'Banned', 'Total Deals', 'Rating', 'Wallet', 'Risk Score', 'Created At']
    const escape = (v) => {
      if (v == null) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = users.map(u => [
      u.id, u.name ?? '', u.phone ?? '', u.email ?? '',
      u.kycStatus ?? '', u.banned ? 'true' : 'false',
      u.totalDeals ?? 0, u.rating ?? '', Number(u.walletBalance ?? 0).toFixed(2),
      u.riskScore ?? '', u.createdAt ? new Date(u.createdAt).toISOString() : '',
    ].map(escape).join(','))
    const csv = [headers.map(escape).join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `users-page-${page}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleAddUser(e) {
    e.preventDefault()
    setAddSaving(true)
    setAddError(null)
    try {
      await api.post('/admin/users', addForm)
      setShowAddUser(false)
      setAddForm({ name: '', phone: '', email: '' })
      fetchUsers()
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to create user.')
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">User Management</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Monitor, manage, and moderate platform users</p>
        </div>
        <div className="flex items-center gap-3">
          <ExportButton onClick={handleExport} />
          <button
            onClick={() => { setAddError(null); setShowAddUser(true) }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold monolith-gradient text-white rounded-xl hover:opacity-90 transition-opacity shadow-sm"
          >
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

      {/* KPIs + Status distribution donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="grid grid-cols-1 gap-4">
          <KpiCard label="Total Users"    value={total.toLocaleString()}   changeType="neutral" icon={<Users className="w-4 h-4 text-blue-600" />}   accentColor="#3B82F6" />
          <KpiCard label="Active on Page" value={users.length.toString()}  sublabel={`page ${page}`} changeType="neutral" icon={<Users className="w-4 h-4 text-emerald-600" />} accentColor="#059669" />
        </div>
        <div className="lg:col-span-2">
          <StatusDistribution
            loading={statusLoading}
            data={statusCounts ? [
              { name: 'Verified',   value: statusCounts.Verified },
              { name: 'Pending',    value: statusCounts.Pending },
              { name: 'Unverified', value: statusCounts.Unverified },
              { name: 'Rejected',   value: statusCounts.Rejected },
              { name: 'Banned',     value: statusCounts.Banned },
            ] : []}
          />
        </div>
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
                  {['User Details', 'KYC Status', 'Risk', 'Total Deals', 'Rating', 'Wallet', 'Actions'].map(h => (
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
                      <td className="px-5 py-4">
                        <InlineRiskBadge score={u.riskScore} />
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
                            <Eye className="w-4 h-4" />
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

      <BanUserModal
        user={banTarget}
        saving={banSaving}
        onClose={() => banSaving ? null : setBanTarget(null)}
        onConfirm={handleBanConfirm}
      />

      {/* Add User Modal */}
      {showAddUser && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setShowAddUser(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[420px] bg-surface-container-lowest rounded-2xl shadow-2xl">
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-on-surface">Add User</h2>
                <button type="button" onClick={() => setShowAddUser(false)} className="p-1.5 hover:bg-surface-container-high rounded-lg">
                  <X className="w-4 h-4 text-on-surface-variant" />
                </button>
              </div>

              {addError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{addError}</span>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant">Name</label>
                  <input
                    value={addForm.name}
                    onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant">Phone *</label>
                  <input
                    required
                    value={addForm.phone}
                    onChange={e => setAddForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
                    placeholder="+1234567890"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-on-surface-variant">Email</label>
                  <input
                    type="email"
                    value={addForm.email}
                    onChange={e => setAddForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full mt-1 px-3 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
                    placeholder="user@example.com"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddUser(false)}
                  className="flex-1 py-2 text-sm font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors text-on-surface-variant"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addSaving || !addForm.phone}
                  className="flex-1 py-2 text-sm font-semibold monolith-gradient text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {addSaving ? 'Saving…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
