import { useState, useEffect, useCallback } from 'react'
import {
  ClipboardList, Clock, CheckCircle, XCircle, User, Mail, AlertCircle,
  ChevronDown, Loader2, Search, RefreshCw, Trash2, MoreVertical,
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

  const perPage = 15

  const fetchTasks = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      page,
      limit: perPage,
      status: statusFilter,
      ...(typeFilter && { type: typeFilter }),
    })
    api.get(`/admin/tasks?${params}`)
      .then(r => { setTasks(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load tasks.'))
      .finally(() => setLoading(false))
  }, [page, statusFilter, typeFilter])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  // Debounce search by status reset
  useEffect(() => {
    const t = setTimeout(() => { setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput, statusFilter, typeFilter])

  // Socket.IO: listen for new admin tasks
  useEffect(() => {
    const socketInstance = io(import.meta.env.VITE_API_URL || 'http://localhost:4000', {
      auth: { token: localStorage.getItem('accessToken') },
    })
    socketInstance.connect()

    socketInstance.on('new_admin_task', (payload) => {
      // Prepend to the current list if it matches current filters
      if (payload.type === (typeFilter || 'DISPUTE_REVIEW') && payload.status === 'OPEN') {
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
  }, [typeFilter])

  function handleAssign(task) {
    const adminId = prompt('Enter admin userId to assign (or leave blank to self-assign):')
    const assignee = adminId?.trim() || null
    api.patch(`/admin/tasks/${task.id}`, { assignedTo: assignee, status: 'IN_PROGRESS' })
      .then(() => {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, assignedTo: assignee, status: 'IN_PROGRESS' } : t))
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
        } catch (err) { alert('Delete failed: ' + (err.response?.data?.error || err.message)) }
        setConfirm(null)
      },
    })
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
        <button
          onClick={fetchTasks}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
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
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search tasks…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
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
              onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="">All Types</option>
              <option value="DISPUTE_REVIEW">Dispute Review</option>
              <option value="KYC_REVIEW">KYC Review</option>
              <option value="FRAUD_FLAG">Fraud Flag</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Table */}
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
                  {['Type', 'Status', 'Assigned To', 'Notes', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tasks.map((task, idx) => {
                  const rowColor = idx % 2 === 0 ? 'bg-surface-container-low/20' : ''
                  return (
                    <tr key={task.id} className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors ${rowColor}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <ClipboardList className="w-4 h-4 text-on-surface-variant" />
                          <span className="text-sm font-semibold text-on-surface">{TYPE_LABEL[task.type] || task.type}</span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant mt-0.5 font-mono">#{task.id.slice(-6)}</p>
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
                        <p className="text-xs text-on-surface-variant line-clamp-2 max-w-[200px]" title={task.notes || ''}>
                          {task.notes || '—'}
                        </p>
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
                          {task.status !== 'RESOLVED' && (
                            <button
                              onClick={() => handleClose(task)}
                              className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 transition-colors"
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

          {tasks.length === 0 && !loading && !error && (
            <div className="py-16 text-center">
              <ClipboardList className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">No tasks match your filters</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && tasks.length > 0 && (
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
    </div>
  )
}
