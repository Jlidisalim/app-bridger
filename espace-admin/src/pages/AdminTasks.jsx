import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ClipboardList, Clock, CheckCircle, CheckCircle2, XCircle, User, Mail, AlertCircle,
  ChevronDown, Hourglass, Loader2, Search, RefreshCw, Trash2,
  MoreVertical, Plus, X, ShieldAlert, Flame, TrendingUp, CalendarCheck,
} from 'lucide-react'
import StatusBadge from '../components/shared/StatusBadge'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import api from '../services/api'
import { io, Socket } from 'socket.io-client'

const STATUS_BADGE = {
  OPEN:       'bg-amber-100 text-amber-700',
  IN_PROGRESS:'bg-blue-100 text-blue-700',
  RESOLVED:   'bg-emerald-100 text-emerald-700',
}

const TYPE_LABEL = {
  DISPUTE_REVIEW: 'Dispute Review',
  KYC_REVIEW:     'KYC Review',
  FRAUD_FLAG:     'Fraud Flag',
  REPORT:         'Report',
  OTHER:          'Other',
}

const PRIORITY_META = {
  LOW:      { label: 'Low',      badge: 'bg-slate-100 text-slate-600' },
  MEDIUM:   { label: 'Medium',   badge: 'bg-blue-100 text-blue-700' },
  HIGH:     { label: 'High',     badge: 'bg-orange-100 text-orange-700' },
  CRITICAL: { label: 'Critical', badge: 'bg-red-100 text-red-700' },
  URGENT:   { label: 'Urgent',   badge: 'bg-red-100 text-red-700' },
}

// Notes are persisted as `[PRIORITY] TaskName — Description` so we can recover
// priority on the client without a schema migration. Anything that doesn't
// match is treated as MEDIUM with the raw notes as the description.
const NOTES_RX = /^\[(LOW|MEDIUM|HIGH|CRITICAL|URGENT)\]\s*(.*?)\s*(?:—|--)\s*([\s\S]*)$/

function encodeNotes({ priority, taskName, description }) {
  const p = priority || 'MEDIUM'
  const name = (taskName || '').trim() || 'Untitled task'
  const desc = (description || '').trim()
  return `[${p}] ${name} — ${desc}`
}

function decodeNotes(notes) {
  if (!notes) return { priority: 'MEDIUM', taskName: '', description: '' }
  const m = NOTES_RX.exec(notes)
  if (!m) return { priority: 'MEDIUM', taskName: '', description: notes }
  return { priority: m[1], taskName: m[2], description: m[3] }
}

// A task counts as urgent if it's a Dispute or Risk-Assessment category, or
// if an admin manually marked its importance as URGENT/HIGH/CRITICAL.
function isHighRisk(task) {
  const { priority } = decodeNotes(task.notes)
  return (
    priority === 'URGENT' ||
    priority === 'HIGH' ||
    priority === 'CRITICAL' ||
    task.type === 'FRAUD_FLAG' ||
    task.type === 'DISPUTE_REVIEW'
  )
}

export default function AdminTasks() {
  const [tasks,     setTasks]     = useState([])
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [statusFilter, setStatusFilter] = useState('OPEN')
  const [typeFilter,   setTypeFilter]   = useState('')
  const [searchInput,  setSearchInput]  = useState('')
  const [confirm,      setConfirm]      = useState(null)
  const [socket,       setSocket]       = useState(null)
  const [showCreate,   setShowCreate]   = useState(false)
  // Local filter applied by the Urgent summary card — high-risk filter is
  // computed from notes/type, so it can't be expressed as a server query.
  const [urgentOnly,   setUrgentOnly]   = useState(false)

  // Scroll target so clicking a summary card brings the matching list into view.
  const tableRef = useRef(null)

  // Admin-task summary (Total Pending / Weekly Completed / Urgent)
  const [taskStats, setTaskStats] = useState({ totalPending: 0, weeklyCompleted: 0, urgent: 0 })

  // Live-search query — filtering happens automatically as the user types.
  const searchQuery = searchInput.trim().toLowerCase()

  const perPage = 15

  const fetchTasks = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      page,
      limit: perPage,
      ...(statusFilter && statusFilter !== 'ALL' ? { status: statusFilter } : {}),
      ...(typeFilter && { type: typeFilter }),
    })
    api.get(`/admin/tasks?${params}`)
      .then(r => { setTasks(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load tasks.'))
      .finally(() => setLoading(false))
  }, [page, statusFilter, typeFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Reset to page 1 whenever filters change.
  useEffect(() => { setPage(1) }, [statusFilter, typeFilter])

  // Pull admin-task summary stats:
  //   • totalPending   = OPEN + IN_PROGRESS counts
  //   • weeklyCompleted = RESOLVED tasks whose updatedAt is within the last 7 days
  //                       (resets naturally as the rolling 7-day window slides)
  //   • urgent         = pending tasks flagged by isHighRisk (Dispute /
  //                       Risk-Assessment categories or manual URGENT priority)
  const fetchTaskStats = useCallback(() => {
    Promise.all([
      api.get('/admin/tasks?status=OPEN&limit=200').catch(() => ({ data: { total: 0, items: [] } })),
      api.get('/admin/tasks?status=IN_PROGRESS&limit=200').catch(() => ({ data: { total: 0, items: [] } })),
      api.get('/admin/tasks?status=RESOLVED&limit=200').catch(() => ({ data: { total: 0, items: [] } })),
    ]).then(([opens, ips, resolved]) => {
      const openTotal = opens.data.total || 0
      const ipTotal   = ips.data.total   || 0
      const pendingItems = [...(opens.data.items || []), ...(ips.data.items || [])]

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const weeklyCompleted = (resolved.data.items || []).filter(t => {
        const ts = t.updatedAt || t.resolvedAt || t.createdAt
        return ts && new Date(ts).getTime() >= sevenDaysAgo
      }).length

      setTaskStats({
        totalPending:    openTotal + ipTotal,
        weeklyCompleted,
        urgent:          pendingItems.filter(isHighRisk).length,
      })
    })
  }, [])

  useEffect(() => { fetchTaskStats() }, [fetchTaskStats])

  // Socket.IO: listen for new admin tasks
  useEffect(() => {
    const socketInstance = io(import.meta.env.VITE_API_URL || 'http://localhost:4000', {
      auth: { token: localStorage.getItem('accessToken') },
    })
    socketInstance.connect()

    socketInstance.on('new_admin_task', (payload) => {
      if ((!typeFilter || payload.type === typeFilter) && (statusFilter === 'ALL' || statusFilter === 'OPEN')) {
        setTasks(prev => [{
          id:         payload.taskId,
          type:       payload.type,
          referenceId: payload.disputeId,
          status:     'OPEN',
          assignedTo: null,
          notes:      `Dispute ${payload.disputeId} escalated`,
          createdAt:  payload.createdAt,
        }, ...prev])
        setTotal(prev => prev + 1)
      }
    })

    setSocket(socketInstance)
    return () => { socketInstance.disconnect(); setSocket(null) }
  }, [typeFilter, statusFilter])

  // Client-side search across the loaded page (notes/referenceId/type/id/assignedTo).
  // Urgent-only filter is also applied here since high-risk classification lives
  // on the client (notes encode priority).
  const visibleTasks = useMemo(() => {
    let list = urgentOnly ? tasks.filter(isHighRisk) : tasks
    if (!searchQuery) return list
    return list.filter(t => {
      const haystack = [
        t.id, t.type, t.status, t.referenceId, t.assignedTo, t.notes,
        TYPE_LABEL[t.type] || '',
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(searchQuery)
    })
  }, [tasks, searchQuery, urgentOnly])

  // Summary-card click handlers — each card jumps the list to the matching
  // slice of work and scrolls the table into view. We also clear the search
  // input so the user isn't surprised by a hidden text filter.
  const scrollToTable = useCallback(() => {
    requestAnimationFrame(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [])

  function handleViewPending() {
    setStatusFilter('OPEN')
    setTypeFilter('')
    setUrgentOnly(false)
    setSearchInput('')
    scrollToTable()
  }

  function handleViewWeeklyCompleted() {
    setStatusFilter('RESOLVED')
    setTypeFilter('')
    setUrgentOnly(false)
    setSearchInput('')
    scrollToTable()
  }

  function handleViewUrgent() {
    setStatusFilter('OPEN')
    setTypeFilter('')
    setUrgentOnly(true)
    setSearchInput('')
    scrollToTable()
  }

  // Used to highlight the card whose filter is currently active.
  const isPendingActive   = statusFilter === 'OPEN' && !typeFilter && !urgentOnly && !searchQuery
  const isCompletedActive = statusFilter === 'RESOLVED' && !typeFilter && !urgentOnly && !searchQuery
  const isUrgentActive    = urgentOnly

  function handleAssign(task) {
    const adminId = prompt('Enter admin userId to assign (or leave blank to self-assign):')
    const assignee = adminId?.trim() || null
    api.patch(`/admin/tasks/${task.id}`, { assignedTo: assignee, status: 'IN_PROGRESS' })
      .then(() => {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, assignedTo: assignee, status: 'IN_PROGRESS' } : t))
        fetchTaskStats()
      })
      .catch(err => alert('Assign failed: ' + (err.response?.data?.error || err.message)))
  }

  function handleClose(task) {
    setConfirm({
      title: `Close Task #${task.id.slice(-6)}`,
      message: `Mark this ${task.type} task as resolved?`,
      danger: false,
      onConfirm: async () => {
        try {
          await api.patch(`/admin/tasks/${task.id}`, { status: 'RESOLVED' })
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'RESOLVED' } : t))
          fetchTaskStats()
        } catch (err) { alert('Close failed: ' + (err.response?.data?.error || err.message)) }
        setConfirm(null)
      },
    })
  }

  function handleDelete(task) {
    setConfirm({
      title: `Delete Task #${task.id.slice(-6)}`,
      message: 'Permanently delete this task? This cannot be undone.',
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/admin/tasks/${task.id}`)
          setTasks(prev => prev.filter(t => t.id !== task.id))
          setTotal(prev => prev - 1)
          fetchTaskStats()
        } catch (err) { alert('Delete failed: ' + (err.response?.data?.error || err.message)) }
        setConfirm(null)
      },
    })
  }

  // Risk-escalation: high-risk tasks are forced to OPEN status and prepended
  // to the queue for immediate review, even if the current view is filtered
  // to a different status (we then jump to the matching filter).
  function handleCreated(newTask) {
    const highRisk = isHighRisk(newTask)
    if (highRisk && statusFilter !== 'OPEN' && statusFilter !== 'ALL') {
      setStatusFilter('OPEN')
    } else {
      setTasks(prev => [newTask, ...prev])
      setTotal(prev => prev + 1)
    }
    fetchTaskStats()
    setShowCreate(false)
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Admin Tasks</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Review and manage assigned administrative tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchTasks(); fetchTaskStats() }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#1A2E82] text-white rounded-lg hover:bg-[#162569] transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Task
          </button>
        </div>
      </div>

      {/* Admin-task summary cards (Total Pending / Weekly Completed / Urgent).
          Each card is an interactive button that jumps the list below to its
          matching slice of work. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TotalPendingTasksCard
          value={taskStats.totalPending}
          onActivate={handleViewPending}
          active={isPendingActive}
        />
        <WeeklyCompletedCard
          value={taskStats.weeklyCompleted}
          onActivate={handleViewWeeklyCompleted}
          active={isCompletedActive}
        />
        <UrgentTasksCard
          value={taskStats.urgent}
          onActivate={handleViewUrgent}
          active={isUrgentActive}
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Live search — filters as the user types, no submit button. */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search tasks…"
              className="w-full pl-9 pr-9 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-surface-container-high"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5 text-on-surface-variant" />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="RESOLVED">Resolved</option>
              <option value="ALL">All Statuses</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>

          {/* Type filter */}
          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="">All Types</option>
              <option value="DISPUTE_REVIEW">Dispute Review</option>
              <option value="KYC_REVIEW">KYC Review</option>
              <option value="FRAUD_FLAG">Fraud Flag</option>
              <option value="REPORT">Report</option>
              <option value="OTHER">Other</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>

          {urgentOnly && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full bg-red-100 text-red-700">
              <ShieldAlert className="w-3 h-3" /> Urgent only
              <button
                type="button"
                onClick={() => setUrgentOnly(false)}
                aria-label="Clear urgent-only filter"
                className="ml-0.5 -mr-1 p-0.5 rounded-full hover:bg-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Table */}
      <div ref={tableRef} className="scroll-mt-4">
      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low/40">
                <tr>
                  {['Type', 'Priority', 'Status', 'Assigned To', 'Notes', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleTasks.map((task, idx) => {
                  const decoded   = decodeNotes(task.notes)
                  const highRisk  = isHighRisk(task)
                  const priMeta   = PRIORITY_META[decoded.priority] || PRIORITY_META.MEDIUM
                  const rowColor  = highRisk
                    ? 'bg-red-50/60'
                    : (idx % 2 === 0 ? 'bg-surface-container-low/20' : '')
                  return (
                    <tr key={task.id} className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors ${rowColor}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          {highRisk
                            ? <ShieldAlert className="w-4 h-4 text-red-500" />
                            : <ClipboardList className="w-4 h-4 text-on-surface-variant" />}
                          <span className="text-sm font-semibold text-on-surface">{TYPE_LABEL[task.type] || task.type}</span>
                          {highRisk && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700">
                              <Flame className="w-2.5 h-2.5" /> HIGH RISK
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-0.5 font-mono">#{task.id.slice(-6)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${priMeta.badge}`}>
                          {priMeta.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[task.status] || 'bg-gray-100 text-gray-600'}`}>
                          {task.status === 'OPEN' && <Clock className="w-2.5 h-2.5" />}
                          {task.status === 'IN_PROGRESS' && <RefreshCw className="w-2.5 h-2.5" />}
                          {task.status === 'RESOLVED' && <CheckCircle className="w-2.5 h-2.5" />}
                          {task.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {task.assignedTo ? (
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-[#1A2E82] flex items-center justify-center text-white text-[9px] font-bold">
                              {task.assignedTo.slice(0,2).toUpperCase()}
                            </div>
                            <span className="text-xs text-on-surface font-mono">{task.assignedTo.slice(0,8)}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-on-surface-variant">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="max-w-[260px]">
                          {decoded.taskName && (
                            <p className="text-xs font-semibold text-on-surface truncate" title={decoded.taskName}>
                              {decoded.taskName}
                            </p>
                          )}
                          <p className="text-xs text-on-surface-variant line-clamp-2" title={decoded.description || task.notes || ''}>
                            {decoded.description || task.notes || '—'}
                          </p>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-on-surface-variant">
                        {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          {task.status === 'OPEN' && (
                            <button
                              onClick={() => handleAssign(task)}
                              className="p-1.5 rounded-lg hover:bg-surface-container-high text-primary transition-colors"
                              title="Assign to self"
                            >
                              <User className="w-4 h-4" />
                            </button>
                          )}
                          {task.status === 'RESOLVED' ? (
                            <span
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 inline-flex transition-colors"
                              title="Task completed"
                            >
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                            </span>
                          ) : (
                            <button
                              onClick={() => handleClose(task)}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-on-surface-variant hover:text-emerald-600 transition-colors"
                              title="Mark resolved"
                            >
                              <CheckCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(task)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                            title="Delete task"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {visibleTasks.length === 0 && !loading && !error && (
            <div className="py-16 text-center">
              <ClipboardList className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">
                {searchQuery ? `No tasks match "${searchQuery}"` : 'No tasks match your filters'}
              </p>
            </div>
          )}
        </div>
      )}
      </div>

      {/* Pagination */}
      {!loading && visibleTasks.length > 0 && !searchQuery && (
        <Pagination page={page} totalPages={totalPages || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.danger ? 'Yes, Delete' : 'Confirm'}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />

      {showCreate && (
        <CreateTaskModal
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}

// ── Admin-task summary cards ────────────────────────────────────────────────
//
// Each card is a real <button> so it gets keyboard activation (Enter / Space),
// focus management, and screen-reader semantics for free. We layer hover
// (scale + shadow), active (press-down), and focus-visible (ring) states on
// top, plus an `aria-pressed` indicator that flips when the card's filter is
// the currently-applied one.

const CARD_BASE =
  'group block w-full text-left relative rounded-2xl p-5 shadow-card-md overflow-hidden ' +
  'transition-all duration-200 ease-out cursor-pointer ' +
  'hover:shadow-xl hover:-translate-y-0.5 hover:scale-[1.015] ' +
  'active:translate-y-0 active:scale-[0.99] ' +
  'focus:outline-none focus-visible:outline-none ' +
  'focus-visible:ring-4 focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

/** Total Pending Tasks — every incomplete task (OPEN + IN_PROGRESS). */
function TotalPendingTasksCard({ value, onActivate, active }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={active}
      aria-label={`View ${Number(value).toLocaleString()} pending admin tasks`}
      className={`${CARD_BASE} bg-gradient-to-br from-[#1A2E82] via-[#243aa3] to-[#3a52c4] focus-visible:ring-[#1A2E82]/50 ${
        active ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-surface' : ''
      }`}
    >
      <ClipboardList className="absolute -right-3 -bottom-3 w-28 h-28 text-white/10 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" strokeWidth={1.5} />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center ring-1 ring-white/10 transition-colors group-hover:bg-white/25">
            <ClipboardList className="w-5 h-5 text-white" />
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-white/80">
            <Hourglass className="w-3 h-3" /> Awaiting action
          </span>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/70">Total pending tasks</p>
          <p className="text-4xl font-extrabold text-white leading-none mt-1.5 tabular-nums">
            {Number(value).toLocaleString()}
          </p>
          <p className="text-xs text-white/70 mt-2">All incomplete tasks across every queue</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/0 group-hover:text-white/90 group-focus-visible:text-white/90 mt-2 transition-colors" aria-hidden="true">
            View pending →
          </p>
        </div>
      </div>
    </button>
  )
}

/** Weekly Productivity — tasks marked done in the last 7 days (rolling window). */
function WeeklyCompletedCard({ value, onActivate, active }) {
  return (
    <button
      type="button"
      onClick={onActivate}
      aria-pressed={active}
      aria-label={`View ${Number(value).toLocaleString()} tasks completed this week`}
      className={`${CARD_BASE} bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 focus-visible:ring-emerald-400/60 ${
        active ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-surface' : ''
      }`}
    >
      <CalendarCheck className="absolute -right-3 -bottom-3 w-28 h-28 text-emerald-300/40 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" strokeWidth={1.5} />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center ring-1 ring-emerald-300 transition-colors group-hover:bg-emerald-500/25">
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
          </div>
          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-800/80">
            <TrendingUp className="w-3 h-3" /> This week
          </span>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-800/80">Tasks completed this week</p>
          <p className="text-4xl font-extrabold text-emerald-900 leading-none mt-1.5 tabular-nums">
            {Number(value).toLocaleString()}
          </p>
          <p className="text-xs text-emerald-800/80 mt-2">Resolved in the last 7 days — resets weekly</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/0 group-hover:text-emerald-800 group-focus-visible:text-emerald-800 mt-2 transition-colors" aria-hidden="true">
            View resolved →
          </p>
        </div>
      </div>
    </button>
  )
}

/** Urgent tasks — high-contrast red, with a pulsing dot for attention. */
function UrgentTasksCard({ value, onActivate, active }) {
  const isUrgent = value > 0
  return (
    <button
      type="button"
      onClick={onActivate}
      disabled={!isUrgent}
      aria-pressed={active}
      aria-label={
        isUrgent
          ? `View ${Number(value).toLocaleString()} urgent admin tasks`
          : 'No urgent tasks at this time'
      }
      className={`${CARD_BASE} focus-visible:ring-red-400/60 disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:shadow-card-md ${
        isUrgent
          ? 'bg-gradient-to-br from-red-500 via-red-600 to-rose-700'
          : 'bg-gradient-to-br from-slate-100 to-slate-200 border border-slate-200'
      } ${active ? 'ring-2 ring-red-300 ring-offset-2 ring-offset-surface' : ''}`}
    >
      <ShieldAlert className={`absolute -right-3 -bottom-3 w-28 h-28 transition-transform duration-300 ${
        isUrgent ? 'text-white/10 group-hover:scale-110 group-hover:rotate-3' : 'text-slate-300/60'
      }`} strokeWidth={1.5} />
      <div className="relative flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ring-1 transition-colors ${
            isUrgent ? 'bg-white/15 backdrop-blur ring-white/20 group-hover:bg-white/25' : 'bg-slate-300/40 ring-slate-300'
          }`}>
            <ShieldAlert className={`w-5 h-5 ${isUrgent ? 'text-white' : 'text-slate-600'}`} />
          </div>
          {isUrgent ? (
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
              </span>
              Action needed
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">All clear</span>
          )}
        </div>
        <div>
          <p className={`text-[10px] font-bold uppercase tracking-widest ${isUrgent ? 'text-white/80' : 'text-slate-500'}`}>
            Urgent tasks
          </p>
          <p className={`text-4xl font-extrabold leading-none mt-1.5 tabular-nums ${isUrgent ? 'text-white' : 'text-slate-700'}`}>
            {Number(value).toLocaleString()}
          </p>
          <p className={`text-xs mt-2 ${isUrgent ? 'text-white/80' : 'text-slate-500'}`}>
            Disputes, risk-assessment & manually-flagged urgent tasks
          </p>
          {isUrgent && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/0 group-hover:text-white/90 group-focus-visible:text-white/90 mt-2 transition-colors" aria-hidden="true">
              Review now →
            </p>
          )}
        </div>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Create-task modal
// ─────────────────────────────────────────────────────────────────────────────
function CreateTaskModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    taskName:    '',
    description: '',
    type:        'DISPUTE_REVIEW',
    priority:    'MEDIUM',
    referenceId: '',
    assignedTo:  '',
  })
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const field = (k) => (v) => setForm(prev => ({ ...prev, [k]: v }))

  // Importance ≥ HIGH, manual URGENT, or auto-urgent categories (FRAUD_FLAG /
  // DISPUTE_REVIEW) all populate the Urgent Tasks card.
  const willEscalate =
    form.priority === 'URGENT' ||
    form.priority === 'HIGH' ||
    form.priority === 'CRITICAL' ||
    form.type === 'FRAUD_FLAG' ||
    form.type === 'DISPUTE_REVIEW'

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (!form.taskName.trim())    return setError('Task name is required.')
    if (!form.referenceId.trim()) return setError('Reference ID is required.')

    // Risk escalation: URGENT/HIGH/CRITICAL or FRAUD_FLAG/DISPUTE_REVIEW tasks
    // are pinned to OPEN status so they appear immediately in the review queue,
    // regardless of any assignee. Lower-importance tasks may go directly to
    // IN_PROGRESS when an assignee is provided.
    const effectivePriority = form.type === 'FRAUD_FLAG' && form.priority === 'LOW'
      ? 'HIGH'      // FRAUD_FLAG can never be low risk
      : form.priority

    const escalate =
      effectivePriority === 'URGENT' ||
      effectivePriority === 'HIGH' ||
      effectivePriority === 'CRITICAL' ||
      form.type === 'FRAUD_FLAG' ||
      form.type === 'DISPUTE_REVIEW'

    const payload = {
      type:        form.type,
      referenceId: form.referenceId.trim(),
      assignedTo:  form.assignedTo.trim() || null,
      notes:       encodeNotes({
        priority:    effectivePriority,
        taskName:    form.taskName,
        description: form.description,
      }),
    }

    setSaving(true)
    try {
      const r = await api.post('/admin/tasks', payload)
      // Force OPEN status for escalated tasks even if backend assigned otherwise.
      const created = escalate ? { ...r.data, status: 'OPEN' } : r.data
      if (escalate && r.data.status !== 'OPEN') {
        try { await api.patch(`/admin/tasks/${r.data.id}`, { status: 'OPEN' }) } catch {}
      }
      onCreated(created)
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to create task.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#1A2E82]/10 text-[#1A2E82] flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-on-surface">Create Admin Task</h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                File a new task for the admin review queue. High-risk tasks are auto-escalated.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !saving && onClose()}
            className="p-2 hover:bg-surface-container-high rounded-lg flex-shrink-0"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {willEscalate && (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-800 text-xs rounded-lg px-3 py-2 mb-4">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>Auto-escalation:</strong> this task will be flagged
              <em> high risk </em>
              and pinned to the top of the review queue with status <strong>OPEN</strong>.
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
              Task Name
            </label>
            <input
              required
              autoFocus
              value={form.taskName}
              onChange={e => field('taskName')(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/40 outline-none"
              placeholder="e.g. Verify suspicious payout request"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => field('description')(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/40 outline-none resize-none"
              placeholder="Context, evidence, links — anything that helps the reviewer."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
                Category / Type
              </label>
              <div className="relative">
                <select
                  value={form.type}
                  onChange={e => field('type')(e.target.value)}
                  className="appearance-none w-full px-3 pr-8 py-2.5 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/40 outline-none cursor-pointer"
                >
                  <option value="DISPUTE_REVIEW">Dispute Review</option>
                  <option value="KYC_REVIEW">KYC Review</option>
                  <option value="FRAUD_FLAG">Fraud Flag</option>
                  <option value="REPORT">Report</option>
                  <option value="OTHER">Other</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
                Level of Importance
              </label>
              <div className="relative">
                <select
                  value={form.priority}
                  onChange={e => field('priority')(e.target.value)}
                  className="appearance-none w-full px-3 pr-8 py-2.5 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/40 outline-none cursor-pointer"
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High (auto-escalate)</option>
                  <option value="CRITICAL">Critical (auto-escalate)</option>
                  <option value="URGENT">Urgent (pins to Urgent Tasks)</option>
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
                Reference ID
              </label>
              <input
                required
                value={form.referenceId}
                onChange={e => field('referenceId')(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/40 outline-none font-mono"
                placeholder="dispute / kyc / user id"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
                Assign To (User ID)
              </label>
              <input
                value={form.assignedTo}
                onChange={e => field('assignedTo')(e.target.value)}
                className="w-full px-3 py-2.5 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/40 outline-none font-mono"
                placeholder="optional admin userId"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => !saving && onClose()}
            disabled={saving}
            className="px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-[#1A2E82] text-white rounded-lg hover:bg-[#162569] disabled:opacity-60 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Creating…' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  )
}
