import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, Clock, CheckCircle, XCircle, User, DollarSign,
  FileText, RefreshCw, Loader2, AlertCircle, ChevronDown, Ban,
  MessageSquare, Image as ImageIcon,
} from 'lucide-react'
import StatusBadge from '../components/shared/StatusBadge'
import ConfirmModal from '../components/shared/ConfirmModal'
import api from '../services/api'

const STATUS_MAP = {
  OPENED:              { label: 'Opened',          color: 'bg-gray-100 text-gray-700', progress: 10 },
  EVIDENCE_SUBMITTED:  { label: 'Evidence Sent',    color: 'bg-amber-100 text-amber-700', progress: 40 },
  ADMIN_REVIEWING:     { label: 'Under Review',     color: 'bg-blue-100 text-blue-700', progress: 70 },
  RESOLVED_FILER_WIN:  { label: 'Filer Won',        color: 'bg-emerald-100 text-emerald-700', progress: 100 },
  RESOLVED_AGAINST_WIN:{ label: 'Against Won',      color: 'bg-emerald-100 text-emerald-700', progress: 100 },
  RESOLVED_SPLIT:      { label: 'Split Decision',   color: 'bg-purple-100 text-purple-700', progress: 100 },
  CLOSED:              { label: 'Closed',           color: 'bg-slate-100 text-slate-700', progress: 100 },
}

export default function Disputes() {
  const [disputes, setDisputes]   = useState([])
  const [page,      setPage]      = useState(1)
  const [total,     setTotal]     = useState(0)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [confirm,   setConfirm]   = useState(null)
  const [statusFilter, setStatusFilter] = useState('ADMIN_REVIEWING')

  const perPage = 15

  const fetchDisputes = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page, limit: perPage, status: statusFilter })
    api.get(`/admin/disputes?${params}`)
      .then(r => { setDisputes(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load disputes.'))
      .finally(() => setLoading(false))
  }, [page, statusFilter])

  useEffect(() => { fetchDisputes() }, [fetchDisputes])

  // Countdown timer — updates every minute
  function timeRemaining(deadlineStr) {
    if (!deadlineStr) return { hours: 0, minutes: 0, expired: true }
    const deadline = new Date(deadlineStr).getTime()
    const now = Date.now()
    const diff = deadline - now
    if (diff <= 0) return { hours: 0, minutes: 0, expired: true }
    const hours   = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    return { hours, minutes, expired: false }
  }

  function getSlaColor(deadlineStr) {
    const { hours } = timeRemaining(deadlineStr)
    if (hours < 4)  return 'text-red-600 bg-red-50'
    if (hours < 12) return 'text-amber-600 bg-amber-50'
    return 'text-emerald-600 bg-emerald-50'
  }

  // Resolve handler
  function handleResolve(dispute, outcome) {
    const outcomeLabel = outcome === 'FILER_WIN' ? 'filer win (refund to sender)' :
                         outcome === 'AGAINST_WIN' ? 'against win (escrow to traveler)' :
                         outcome === 'SPLIT' ? 'split decision (half refund / half release)' :
                         'closed without payment'
    const resolution = `Automatically resolved as ${outcomeLabel} by admin.`
    setConfirm({
      title: `Resolve as ${outcome.replace('_', ' ')}`,
      message: `This will trigger wallet transfers and notify both parties. Continue?`,
      danger: false,
      onConfirm: async () => {
        try {
          await api.patch(`/disputes/${dispute.id}/resolve`, { outcome, resolution })
          setDisputes(prev => prev.filter(d => d.id !== dispute.id))
          setTotal(prev => prev - 1)
        } catch (err) { alert('Resolution failed: ' + (err.response?.data?.error || err.message)) }
        setConfirm(null)
      },
    })
  }

  // Assign handler
  function handleAssign(dispute) {
    const adminId = prompt('Enter admin userId to assign to this dispute:')
    if (!adminId) return
    if (!dispute.adminTaskId) {
      alert('No admin task linked to this dispute. The task may have already been assigned or closed.')
      return
    }
    api.patch(`/admin/tasks/${dispute.adminTaskId}/assign`, { assignedTo: adminId })
      .then(() => {
        setDisputes(prev => prev.map(d => d.id === dispute.id ? { ...d, assignedTo: adminId } : d))
      })
      .catch(err => alert('Assign failed: ' + (err.response?.data?.error || err.message)))
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Dispute Resolution</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Review evidence and adjudicate escalated disputes</p>
        </div>
        <button
          onClick={fetchDisputes}
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

      {/* Status filter */}
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
          className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
        >
          <option value="ADMIN_REVIEWING">Under Review</option>
          <option value="OPENED">Opened</option>
          <option value="EVIDENCE_SUBMITTED">Evidence Submitted</option>
          <option value="RESOLVED_FILER_WIN">Resolved — Filer Win</option>
          <option value="RESOLVED_AGAINST_WIN">Resolved — Against Win</option>
          <option value="RESOLVED_SPLIT">Resolved — Split</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Dispute table */}
      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map(dispute => {
            const statusInfo = STATUS_MAP[dispute.status] || { label: dispute.status, color: 'bg-gray-100 text-gray-700', progress: 0 }
            const sla = timeRemaining(dispute.slaDeadline)
            const isUrgent = sla.hours < 12

            return (
              <div key={dispute.id} className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-surface-container-high flex items-start justify-between gap-4 bg-surface-container-low/30">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                      {isUrgent && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 ${getSlaColor(dispute.slaDeadline)}`}>
                          <Clock className="w-3 h-3" /> {sla.hours}h {sla.minutes}m remaining
                        </span>
                      )}
                      <span className="text-[10px] text-on-surface-variant font-mono">
                        Dispute #{dispute.id.slice(-6)} · Deal #{dispute.deal?.id?.slice(-6)}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-on-surface">
                      {dispute.deal?.fromCity} → {dispute.deal?.toCity}
                    </p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{dispute.reason}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">
                      ${Number(dispute.deal?.price || 0).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-on-surface-variant">escrow amount</p>
                  </div>
                </div>

                {/* Parties & Evidence */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Filer */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-2">
                      <User className="w-3.5 h-3.5" /> Filer ({dispute.filer?.name})
                    </h4>
                    <div className="space-y-2">
                      {(dispute.evidences || []).filter(e => e.uploaderId === dispute.filerId).map(ev => (
                        <div key={ev.id} className="flex items-start gap-2 bg-surface-container rounded-lg p-2">
                          {ev.type === 'TEXT' ? (
                            <MessageSquare className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-xs text-on-surface line-clamp-2">{ev.content || 'Evidence file'}</p>
                            {ev.url && <a href={ev.url} target="_blank" className="text-[10px] text-primary hover:underline">View file</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Against */}
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-2">
                      <User className="w-3.5 h-3.5" /> Against ({dispute.against?.name})
                    </h4>
                    <div className="space-y-2">
                      {(dispute.evidences || []).filter(e => e.uploaderId !== dispute.filerId).map(ev => (
                        <div key={ev.id} className="flex items-start gap-2 bg-surface-container rounded-lg p-2">
                          {ev.type === 'TEXT' ? (
                            <MessageSquare className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          ) : (
                            <ImageIcon className="w-4 h-4 text-on-surface-variant mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-xs text-on-surface line-clamp-2">{ev.content || 'Evidence file'}</p>
                            {ev.url && <a href={ev.url} target="_blank" className="text-[10px] text-primary hover:underline">View file</a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-4">
                  <div className="h-1.5 bg-surface-container rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#1A2E82] to-primary transition-all duration-500"
                      style={{ width: `${statusInfo.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[9px] text-on-surface-variant">Filed</span>
                    <span className="text-[9px] text-on-surface-variant">Evidence</span>
                    <span className="text-[9px] text-on-surface-variant">Review</span>
                    <span className="text-[9px] text-on-surface-variant">Resolved</span>
                  </div>
                </div>

                {/* Actions */}
                {dispute.status === 'ADMIN_REVIEWING' && (
                  <div className="p-4 border-t border-surface-container-high bg-surface-container-low/20 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-on-surface-variant mr-2">Resolution:</span>
                    <button
                      onClick={() => handleResolve(dispute, 'FILER_WIN')}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200 transition-colors"
                    >
                      Filer Wins
                    </button>
                    <button
                      onClick={() => handleResolve(dispute, 'AGAINST_WIN')}
                      className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                    >
                      Against Wins
                    </button>
                    <button
                      onClick={() => handleResolve(dispute, 'SPLIT')}
                      className="px-3 py-1.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors"
                    >
                      Split Decision
                    </button>
                    <button
                      onClick={() => handleResolve(dispute, 'CLOSED')}
                      className="px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      Close No Action
                    </button>
                    <div className="flex-1" />
                    {!dispute.assignedTo && (
                      <button
                        onClick={() => handleAssign(dispute)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
                      >
                        <User className="w-3.5 h-3.5" /> Assign Self
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {disputes.length === 0 && !loading && !error && (
            <div className="py-16 text-center bg-surface-container-lowest rounded-xl border border-surface-container">
              <AlertTriangle className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">No disputes match the current filter</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && disputes.length > 0 && (
        <Pagination page={page} totalPages={totalPages || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel="Confirm"
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
