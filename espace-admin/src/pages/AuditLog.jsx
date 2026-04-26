import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Search, Calendar, Trash2, AlertCircle, Loader2,
  ChevronDown, X, RefreshCw,
} from 'lucide-react'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import api from '../services/api'

export default function AuditLog() {
  const [logs,       setLogs]       = useState([])
  const [page,       setPage]       = useState(1)
  const [total,      setTotal]      = useState(0)
  const [loading,   setLoading]    = useState(true)
  const [error,     setError]      = useState(null)
  const [confirm,   setConfirm]    = useState(null)

  const [userIdFilter, setUserIdFilter]   = useState('')
  const [entityFilter, setEntityFilter]   = useState('')
  const [actionFilter, setActionFilter]   = useState('')
  const perPage = 20

  const fetchLogs = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page, limit: perPage })
    if (userIdFilter) params.set('userId', userIdFilter)
    if (entityFilter) params.set('entityType', entityFilter)
    if (actionFilter) params.set('action', actionFilter)
    api.get(`/admin/audit-logs?${params}`)
      .then(r => { setLogs(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load audit logs.'))
      .finally(() => setLoading(false))
  }, [page, userIdFilter, entityFilter, actionFilter])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPages = Math.ceil(total / perPage)

  function handleDelete(log) {
    setConfirm({
      title: `Delete Audit Entry`,
      message: `Permanently delete audit record ${log.id.slice(-8)}? This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/admin/audit-logs/${log.id}`)
          setLogs(prev => prev.filter(l => l.id !== log.id))
          setTotal(prev => prev - 1)
        } catch (err) { alert('Delete failed: ' + (err.response?.data?.error || err.message)) }
        setConfirm(null)
      },
    })
  }

  const clearFilters = () => {
    setUserIdFilter('')
    setEntityFilter('')
    setActionFilter('')
    setPage(1)
  }

  const hasFilters = userIdFilter || entityFilter || actionFilter

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Audit Log</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">System-wide action history and admin activities</p>
        </div>
        <button
          onClick={fetchLogs}
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
          {/* User ID */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              value={userIdFilter}
              onChange={e => { setUserIdFilter(e.target.value); setPage(1) }}
              placeholder="Filter by User ID…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
            />
          </div>

          {/* Entity Type */}
          <div className="relative">
            <select
              value={entityFilter}
              onChange={e => { setEntityFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="">All Entities</option>
              <option value="USER">User</option>
              <option value="DEAL">Deal</option>
              <option value="DISPUTE">Dispute</option>
              <option value="REVIEW">Review</option>
              <option value="TRANSACTION">Transaction</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>

          {/* Action */}
          <div className="relative">
            <select
              value={actionFilter}
              onChange={e => { setActionFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="">All Actions</option>
              <option value="USER_BAN">Ban User</option>
              <option value="USER_UNBAN">Unban User</option>
              <option value="KYC_APPROVED">KYC Approved</option>
              <option value="KYC_REJECTED">KYC Rejected</option>
              <option value="DISPUTE_RESOLVED">Dispute Resolved</option>
              <option value="REVIEW_MODERATED">Review Moderated</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 text-xs font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
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
                  {['Action', 'Entity', 'User', 'Time', 'Details'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => {
                  const rowColor = idx % 2 === 0 ? 'bg-surface-container-low/20' : ''
                  return (
                    <tr key={log.id} className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors ${rowColor}`}>
                      <td className="px-5 py-4">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
                          {log.action?.replace(/_/g, ' ') || 'ACTION'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface font-medium capitalize">
                        {log.entityType?.toLowerCase() || 'system'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#1A2E82] flex items-center justify-center text-white text-[9px] font-bold">
                            {log.user?.name?.slice(0,2).toUpperCase() || 'SYS'}
                          </div>
                          <span className="text-xs text-on-surface font-mono">{log.user?.name || 'System'}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs text-on-surface-variant">
                        {log.recordedAt ? new Date(log.recordedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-xs text-on-surface-variant font-mono">
                            ID: {(log.entityId || log.id).slice(-8)}
                          </span>
                          <button
                            onClick={() => handleDelete(log)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors flex-shrink-0"
                            title="Delete entry"
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

          {logs.length === 0 && !loading && !error && (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">No audit log entries found</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && logs.length > 0 && (
        <Pagination page={page} totalPages={totalPages || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.danger ? 'Delete' : 'OK'}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
