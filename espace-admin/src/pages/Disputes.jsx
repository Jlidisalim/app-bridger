import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertCircle, AlertTriangle, ArrowRight, CheckCircle2, Clock, Eye,
  Loader2, RefreshCw, Scale, Search, User, X,
} from 'lucide-react'
import Pagination from '../components/shared/Pagination'
import api from '../services/api'
import { useAuthStore } from '../store/authStore'
import DisputeCard, { ResolutionModal } from '../components/disputes/DisputeCard'
import DisputeChatModal from '../components/disputes/DisputeChatModal'
import {
  STATUS_MAP, FILTER_TABS, DISPUTE_TYPE_META, OUTCOME_META,
  timeRemaining, slaBadgeColor, formatDate,
} from '../components/disputes/disputeMeta'

export default function Disputes() {
  const adminUser = useAuthStore(s => s.user)
  const [searchParams, setSearchParams] = useSearchParams()

  // Compound presets — single tokens that resolve to multiple backend statuses.
  // The backend `/admin/disputes` route accepts comma-separated values directly.
  const PRE_REVIEW       = 'OPENED,EVIDENCE_SUBMITTED'
  const RESOLVED_ALL     = 'RESOLVED_FILER_WIN,RESOLVED_AGAINST_WIN,RESOLVED_SPLIT,CLOSED'
  const ALL              = 'ALL'

  const validStatusValues = useMemo(() => new Set(FILTER_TABS.map(t => t.value)), [])
  const isValidStatus = (s) =>
    s === ALL || (!!s && s.split(',').every(p => validStatusValues.has(p)))
  const initialStatus = (() => {
    const q = searchParams.get('status')
    return q && isValidStatus(q) ? q : ALL
  })()
  const urgentOnly = searchParams.get('urgent') === '1'

  const STATUS_OPTIONS = useMemo(() => [
    { value: ALL,          label: 'All' },
    ...FILTER_TABS,
    { value: PRE_REVIEW,   label: 'Pre-review (any)' },
    { value: RESOLVED_ALL, label: 'Resolved (any)' },
  ], [])

  const [disputes,     setDisputes]     = useState([])
  const [page,         setPage]         = useState(1)
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [typeFilter,   setTypeFilter]   = useState('ALL')
  const [search,       setSearch]       = useState('')
  const [counts,       setCounts]       = useState({})
  const [reviewingItems, setReviewingItems] = useState([])
  const [resolvedRecentItems, setResolvedRecentItems] = useState([])
  const [selectedId,   setSelectedId]   = useState(searchParams.get('focus') || null)
  const [resolveCtx,   setResolveCtx]   = useState(null)
  const [chatDisputeId, setChatDisputeId] = useState(null)
  const [now,          setNow]          = useState(Date.now())
  const [toast,        setToast]        = useState(null)

  const perPage = 25

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const q = searchParams.get('status')
    if (q && isValidStatus(q) && q !== statusFilter) {
      setStatusFilter(q)
      setPage(1)
    }
  }, [searchParams, statusFilter])

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const fetchDisputes = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page, limit: perPage })
    if (statusFilter !== ALL) params.set('status', statusFilter)
    api.get(`/admin/disputes?${params}`)
      .then(r => { setDisputes(r.data.items || []); setTotal(r.data.total || 0) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load disputes.'))
      .finally(() => setLoading(false))
  }, [page, statusFilter])

  useEffect(() => { fetchDisputes() }, [fetchDisputes])

  const fetchCounts = useCallback(() => {
    Promise.all(
      FILTER_TABS.map(t =>
        api.get(`/admin/disputes?page=1&limit=1&status=${t.value}`)
          .then(r => [t.value, r.data.total || 0])
          .catch(() => [t.value, 0])
      )
    ).then(entries => setCounts(Object.fromEntries(entries)))
  }, [])

  useEffect(() => { fetchCounts() }, [fetchCounts])

  // Pull a slim window of ADMIN_REVIEWING disputes solely to compute the
  // SLA-urgent count for the queue tile.
  const fetchReviewing = useCallback(() => {
    api.get('/admin/disputes?page=1&limit=100&status=ADMIN_REVIEWING')
      .then(r => setReviewingItems(r.data.items || []))
      .catch(() => {})
  }, [])

  useEffect(() => { fetchReviewing() }, [fetchReviewing])

  // Rolling 7-day count for the Resolved tile. We fetch items resolved within
  // the last 8 days (one-day cushion), then compute the visible count via
  // useMemo against `now`. Each `now` tick (every 30s) re-evaluates the
  // window, so disputes drop out of the count the instant they age past 7d
  // without needing another API round-trip.
  const fetchResolvedRecent = useCallback(() => {
    const since = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString()
    api.get(`/admin/disputes?page=1&limit=100&status=${RESOLVED_ALL}&since=${encodeURIComponent(since)}`)
      .then(r => setResolvedRecentItems(r.data.items || []))
      .catch(() => {})
  }, [])

  useEffect(() => { fetchResolvedRecent() }, [fetchResolvedRecent])

  const resolvedRecentCount = useMemo(() => {
    const cutoff = now - 7 * 24 * 3600 * 1000
    return resolvedRecentItems.filter(d => {
      const ts = d.updatedAt ? new Date(d.updatedAt).getTime() : 0
      return ts >= cutoff
    }).length
  }, [resolvedRecentItems, now])

  const reviewingCount = counts.ADMIN_REVIEWING ?? 0
  const evidenceCount  = (counts.OPENED ?? 0) + (counts.EVIDENCE_SUBMITTED ?? 0)
  const urgentCount = useMemo(() =>
    reviewingItems.filter(d => {
      const { hours, expired } = timeRemaining(d.slaDeadline, now)
      return expired || hours < 12
    }).length,
  [reviewingItems, now])

  function applyTileFilter(status, urgent = false) {
    setStatusFilter(status)
    setPage(1)
    setSearchParams(prev => {
      const sp = new URLSearchParams(prev)
      sp.set('status', status)
      if (urgent) sp.set('urgent', '1')
      else sp.delete('urgent')
      return sp
    }, { replace: true })
  }

  // If focus param is set but the matching dispute isn't in the current page,
  // try to fetch it directly so the side panel can open.
  useEffect(() => {
    if (!selectedId) return
    if (disputes.some(d => d.id === selectedId)) return
    api.get(`/admin/disputes?page=1&limit=1&status=${statusFilter}`)
      .catch(() => {})
  }, [selectedId, disputes, statusFilter])

  const sortedDisputes = useMemo(() => {
    let arr = [...disputes]
    if (typeFilter !== 'ALL') arr = arr.filter(d => d.disputeType === typeFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      arr = arr.filter(d => {
        const haystack = [
          d.id, d.dealId,
          d.reason, d.description,
          d.filer?.name, d.filer?.phone, d.filer?.id,
          d.against?.name, d.against?.phone, d.against?.id,
          d.deal?.fromCity, d.deal?.toCity,
          d.assignedAdmin?.name, d.resolvedBy?.name,
        ].filter(Boolean).join(' ').toLowerCase()
        return haystack.includes(q)
      })
    }
    if (urgentOnly) {
      arr = arr.filter(d => {
        if (!d.slaDeadline) return false
        const ms = new Date(d.slaDeadline).getTime() - now
        return ms <= 12 * 3600 * 1000
      })
    }
    if (statusFilter === 'ADMIN_REVIEWING') {
      arr.sort((a, b) => new Date(a.slaDeadline || 0) - new Date(b.slaDeadline || 0))
    }
    return arr
  }, [disputes, statusFilter, typeFilter, search, urgentOnly, now])

  const selectedDispute = useMemo(
    () => disputes.find(d => d.id === selectedId) || null,
    [disputes, selectedId],
  )

  const chatDispute = useMemo(
    () => disputes.find(d => d.id === chatDisputeId) || null,
    [disputes, chatDisputeId],
  )

  function openDetail(id) {
    setSelectedId(id)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.set('focus', id)
      return next
    }, { replace: true })
  }

  function closeDetail() {
    setSelectedId(null)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      next.delete('focus')
      return next
    }, { replace: true })
  }

  function openResolveModal(dispute, outcome) {
    setResolveCtx({ dispute, outcome, note: '', acknowledged: false, submitting: false })
  }

  async function submitResolution() {
    if (!resolveCtx) return
    const { dispute, outcome, note } = resolveCtx
    if (note.trim().length < 5) {
      setResolveCtx(c => ({ ...c, error: 'Resolution note must be at least 5 characters.' }))
      return
    }
    setResolveCtx(c => ({ ...c, submitting: true, error: null }))
    try {
      await api.patch(`/disputes/${dispute.id}/resolve`, { outcome, resolution: note.trim() })
      setResolveCtx(null)
      setToast({ type: 'success', message: `Dispute resolved (${OUTCOME_META[outcome].short}).` })
      fetchDisputes()
      fetchCounts()
      fetchReviewing()
      fetchResolvedRecent()
    } catch (err) {
      setResolveCtx(c => ({ ...c, submitting: false, error: err.response?.data?.error || 'Resolution failed.' }))
    }
  }

  async function handleStartDiscussion(dispute) {
    if (!adminUser?.id) return setToast({ type: 'error', message: 'Could not detect current admin session.' })

    // Auto-assign on first conversation. If already assigned to someone else,
    // we still allow opening the chat read/write but do not steal ownership.
    const needsAssign = !dispute.assignedTo
    if (needsAssign) {
      if (!dispute.adminTaskId) {
        setToast({ type: 'error', message: 'No admin task linked to this dispute — cannot auto-assign.' })
      } else {
        try {
          await api.patch(`/admin/tasks/${dispute.adminTaskId}/assign`, { assignedTo: adminUser.id })
          setDisputes(prev => prev.map(d => d.id === dispute.id
            ? { ...d, assignedTo: adminUser.id, assignedAdmin: { id: adminUser.id, name: adminUser.name || 'You' } }
            : d))
          setToast({ type: 'success', message: 'Dispute assigned to you — conversation opened.' })
        } catch (err) {
          setToast({ type: 'error', message: err.response?.data?.error || 'Auto-assign failed.' })
          return
        }
      }
    }

    setChatDisputeId(dispute.id)
  }

  function closeChat() {
    setChatDisputeId(null)
    // Refresh to pick up new message counts and any state changes
    fetchDisputes()
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Dispute Resolution</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Browse all disputes — click any row for full details</p>
        </div>
        <button
          onClick={() => { fetchDisputes(); fetchCounts(); fetchReviewing(); fetchResolvedRecent() }}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Dispute queue shortcuts — clickable filter tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <QueueTile
          label="Under Review"
          value={reviewingCount}
          icon={Scale}
          tone="bg-blue-50 text-blue-700"
          active={statusFilter === 'ADMIN_REVIEWING' && !urgentOnly}
          onClick={() => applyTileFilter('ADMIN_REVIEWING', false)}
        />
        <QueueTile
          label="Pre-review"
          value={evidenceCount}
          icon={Clock}
          tone="bg-amber-50 text-amber-700"
          active={statusFilter === PRE_REVIEW && !urgentOnly}
          onClick={() => applyTileFilter(PRE_REVIEW, false)}
        />
        <QueueTile
          label="Urgent (<12h SLA)"
          value={urgentCount}
          icon={AlertTriangle}
          tone="bg-red-50 text-red-700"
          active={statusFilter === 'ADMIN_REVIEWING' && urgentOnly}
          onClick={() => applyTileFilter('ADMIN_REVIEWING', true)}
        />
        <QueueTile
          label="Resolved (last 7d)"
          value={resolvedRecentCount}
          icon={CheckCircle2}
          tone="bg-emerald-50 text-emerald-700"
          activeTone="bg-emerald-600 text-white shadow-sm"
          activeClass="bg-emerald-50 border-emerald-500/70 ring-2 ring-emerald-200"
          active={statusFilter === RESOLVED_ALL && !urgentOnly}
          onClick={() => applyTileFilter(RESOLVED_ALL, false)}
        />
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-3 ${
          toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                                    : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                                    : <AlertCircle  className="w-4 h-4 flex-shrink-0" />}
          <span className="flex-1">{toast.message}</span>
          <button onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Urgent filter banner */}
      {urgentOnly && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">Showing only disputes with under 12 hours of SLA remaining.</span>
          <button
            onClick={() => setSearchParams(prev => {
              const sp = new URLSearchParams(prev)
              sp.delete('urgent')
              return sp
            }, { replace: true })}
            className="text-xs font-semibold underline hover:no-underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Status + Category selectors + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="flex items-center gap-2 sm:w-64">
          <label htmlFor="dispute-status" className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant flex-shrink-0">
            Status
          </label>
          <select
            id="dispute-status"
            value={statusFilter}
            onChange={e => {
              const next = e.target.value
              setStatusFilter(next)
              setPage(1)
              setSearchParams(prev => {
                const sp = new URLSearchParams(prev)
                sp.set('status', next)
                sp.delete('urgent')
                return sp
              }, { replace: true })
            }}
            className="flex-1 px-3 py-2 text-sm bg-surface-container-lowest border border-surface-container-high rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40 text-on-surface"
          >
            {STATUS_OPTIONS.map(tab => {
              const count = tab.value === ALL
                ? FILTER_TABS.reduce((sum, t) => sum + (counts[t.value] ?? 0), 0)
                : tab.value.includes(',')
                  ? tab.value.split(',').reduce((sum, s) => sum + (counts[s] ?? 0), 0)
                  : counts[tab.value]
              return (
                <option key={tab.value} value={tab.value}>
                  {tab.label}{count !== undefined ? ` (${count})` : ''}
                </option>
              )
            })}
          </select>
        </div>

        <div className="flex items-center gap-2 sm:w-64">
          <label htmlFor="dispute-category" className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant flex-shrink-0">
            Category
          </label>
          <select
            id="dispute-category"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="flex-1 px-3 py-2 text-sm bg-surface-container-lowest border border-surface-container-high rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40 text-on-surface"
          >
            <option value="ALL">All types</option>
            {Object.entries(DISPUTE_TYPE_META).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by user, phone, dispute/deal ID, route, reason…"
            className="w-full pl-9 pr-9 py-2 text-sm bg-surface-container-lowest border border-surface-container-high rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40 text-on-surface placeholder:text-on-surface-variant/70"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-container-high" aria-label="Clear search">
              <X className="w-3.5 h-3.5 text-on-surface-variant" />
            </button>
          )}
        </div>
      </div>

      {/* Data table */}
      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
        </div>
      ) : sortedDisputes.length === 0 ? (
        <div className="py-16 text-center bg-surface-container-lowest rounded-xl border border-surface-container">
          <AlertTriangle className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
          <p className="text-sm text-on-surface-variant">No disputes match the current filter</p>
        </div>
      ) : (
        <DisputeTable
          disputes={sortedDisputes}
          now={now}
          currentAdminId={adminUser?.id}
          onOpen={openDetail}
          onMarkDone={(d) => openResolveModal(d, 'CLOSED')}
        />
      )}

      {/* Pagination */}
      {!loading && sortedDisputes.length > 0 && (
        <Pagination page={page} totalPages={totalPages || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      )}

      {/* Detail side panel */}
      {selectedDispute && (
        <DisputeDetailPanel
          dispute={selectedDispute}
          now={now}
          currentAdminId={adminUser?.id}
          onClose={closeDetail}
          onResolve={(outcome) => openResolveModal(selectedDispute, outcome)}
          onDiscuss={() => handleStartDiscussion(selectedDispute)}
        />
      )}

      {/* Conversational moderator chat */}
      {chatDispute && (
        <DisputeChatModal
          dispute={chatDispute}
          currentAdminId={adminUser?.id}
          onClose={closeChat}
        />
      )}

      {/* Resolution modal */}
      {resolveCtx && (
        <ResolutionModal
          ctx={resolveCtx}
          onChange={(patch) => setResolveCtx(c => ({ ...c, ...patch }))}
          onClose={() => setResolveCtx(null)}
          onSubmit={submitResolution}
        />
      )}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function DisputeTable({ disputes, now, currentAdminId, onOpen, onMarkDone }) {
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-surface-container overflow-hidden shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-container-low/60 border-b border-surface-container-high text-[10px] uppercase tracking-widest text-on-surface-variant">
              <th className="px-4 py-3 text-left font-semibold">Status</th>
              <th className="px-4 py-3 text-left font-semibold">Category</th>
              <th className="px-4 py-3 text-left font-semibold">Dispute</th>
              <th className="px-4 py-3 text-left font-semibold">Parties</th>
              <th className="px-4 py-3 text-right font-semibold">Amount</th>
              <th className="px-4 py-3 text-left font-semibold">Filed</th>
              <th className="px-4 py-3 text-left font-semibold">SLA</th>
              <th className="px-4 py-3 text-right font-semibold w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {disputes.map(d => (
              <DisputeRow
                key={d.id}
                dispute={d}
                now={now}
                currentAdminId={currentAdminId}
                onOpen={() => onOpen(d.id)}
                onMarkDone={() => onMarkDone(d)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const RESOLVED_STATUSES = new Set([
  'RESOLVED_FILER_WIN', 'RESOLVED_AGAINST_WIN', 'RESOLVED_SPLIT', 'CLOSED',
])

function DisputeRow({ dispute, now, currentAdminId, onOpen, onMarkDone }) {
  const statusInfo = STATUS_MAP[dispute.status] || { label: dispute.status, color: 'bg-gray-100 text-gray-700' }
  const typeInfo   = DISPUTE_TYPE_META[dispute.disputeType] || DISPUTE_TYPE_META.OTHER
  const TypeIcon   = typeInfo.icon
  const sla        = timeRemaining(dispute.slaDeadline, now)
  const isMine     = dispute.assignedTo && dispute.assignedTo === currentAdminId
  const isResolved = RESOLVED_STATUSES.has(dispute.status)

  return (
    <tr
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open dispute ${dispute.id.slice(-6)}`}
      className={`border-b border-surface-container last:border-b-0 hover:bg-surface-container-low/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:bg-surface-container-low/40 cursor-pointer transition-colors ${
        isResolved ? 'bg-emerald-50/30' : ''
      }`}
    >
      <td className="px-4 py-3 align-middle">
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${statusInfo.color}`}
          title={isResolved ? 'Resolved' : statusInfo.label}
        >
          {isResolved && <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
          {statusInfo.label}
        </span>
      </td>

      <td className="px-4 py-3 align-middle">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border whitespace-nowrap ${typeInfo.tone}`}>
          <TypeIcon className="w-3 h-3" /> {typeInfo.label}
        </span>
      </td>

      <td className="px-4 py-3 align-middle">
        <p className="font-mono text-[11px] text-on-surface">#{dispute.id.slice(-6)}</p>
        <p className="text-[11px] text-on-surface-variant flex items-center gap-1">
          {dispute.deal?.fromCity || '—'} <ArrowRight className="w-3 h-3" /> {dispute.deal?.toCity || '—'}
        </p>
      </td>

      <td className="px-4 py-3 align-middle">
        <p className="text-xs text-on-surface truncate max-w-[180px]">{dispute.filer?.name || '—'}</p>
        <p className="text-[10px] text-on-surface-variant truncate max-w-[180px] flex items-center gap-1">
          <ArrowRight className="w-2.5 h-2.5" /> {dispute.against?.name || '—'}
        </p>
        {isMine && (
          <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-100 text-indigo-700">
            <User className="w-2.5 h-2.5" /> Mine
          </span>
        )}
      </td>

      <td className="px-4 py-3 align-middle text-right">
        <p className="text-sm font-bold text-primary tabular-nums whitespace-nowrap">
          ${Number(dispute.deal?.price || 0).toLocaleString()}
        </p>
      </td>

      <td className="px-4 py-3 align-middle text-xs text-on-surface-variant whitespace-nowrap">
        {formatDate(dispute.createdAt)}
      </td>

      <td className="px-4 py-3 align-middle">
        {dispute.slaDeadline ? (
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${slaBadgeColor(dispute.slaDeadline, now)}`}>
            <Clock className="w-3 h-3" />
            {sla.expired ? 'Expired' : `${sla.hours}h ${sla.minutes}m`}
          </span>
        ) : <span className="text-[10px] text-on-surface-variant">—</span>}
      </td>

      <td className="px-4 py-3 align-middle text-right">
        <div className="inline-flex items-center justify-end gap-1">
          {isResolved ? (
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700"
              title="Resolved"
              aria-label="Resolved"
            >
              <CheckCircle2 className="w-4 h-4" />
            </span>
          ) : (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onMarkDone() }}
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-emerald-700 hover:bg-emerald-100 transition-colors"
              aria-label="Mark dispute as done"
              title="Mark as done"
            >
              <CheckCircle2 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen() }}
            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-colors"
            aria-label="View dispute details"
            title="View dispute details"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function DisputeDetailPanel({ dispute, now, currentAdminId, onClose, onResolve, onDiscuss }) {
  // Lock body scroll while panel is open
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Dispute details"
        className="w-full max-w-2xl bg-surface-container-lowest shadow-2xl overflow-y-auto animate-slide-in-right"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-container-high bg-surface-container-lowest">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Dispute details</p>
            <p className="text-sm font-semibold text-on-surface truncate">
              #{dispute.id.slice(-6)} · {dispute.deal?.fromCity} → {dispute.deal?.toCity}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4">
          <DisputeCard
            dispute={dispute}
            currentAdminId={currentAdminId}
            now={now}
            onResolve={onResolve}
            onDiscuss={onDiscuss}
            defaultExpanded
          />
        </div>
      </aside>
    </div>
  )
}

function QueueTile({ label, value, icon: Icon, tone, activeTone, activeClass, active, onClick }) {
  const defaultActive = 'border-primary/60 ring-2 ring-primary/20 bg-surface-container-lowest'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 flex items-center gap-3 text-left transition-all hover:shadow-card cursor-pointer ${
        active
          ? (activeClass || defaultActive)
          : 'bg-surface-container-lowest border-surface-container hover:border-primary/40'
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active && activeTone ? activeTone : tone}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-on-surface-variant">{label}</p>
        <p className="text-xl font-bold text-on-surface leading-tight">{value}</p>
      </div>
    </button>
  )
}

