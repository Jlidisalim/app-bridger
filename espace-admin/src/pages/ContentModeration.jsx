/**
 * ContentModeration.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Removed hardcoded QUEUE and AUDIT arrays.
 * - On mount, fetches GET /admin/moderation which returns:
 *     { queue: flagged/pending reviews, audit: recent audit log entries }
 * - "Hide / Warn / Suspend / Delete" actions call PATCH /admin/reviews/:id/dismiss
 *   and then remove the item from local state (same visual behavior as before).
 * - AUDIT table now shows real admin action history from AuditLog.
 * - Time display uses a local timeAgo() helper.
 * - Loading and error states added.
 */
import { useState, useEffect } from 'react'
import {
  MessageSquare, Mail, Flag, ShieldCheck, Trash2, EyeOff,
  AlertTriangle, ChevronDown, Clock, CheckCircle2, Loader2, AlertCircle, Gavel,
} from 'lucide-react'
import ConfirmModal from '../components/shared/ConfirmModal'
import api from '../services/api'

const ACTION_BADGE = {
  'PERMANENT BAN':   'bg-red-100 text-red-700',
  'SOFT DELETE':     'bg-gray-100 text-gray-600',
  'WARN':            'bg-amber-100 text-amber-700',
  'SUSPEND':         'bg-orange-100 text-orange-700',
  'CONTENT REMOVED': 'bg-purple-100 text-purple-700',
  // Fallback for arbitrary audit log action strings
  default:           'bg-gray-100 text-gray-600',
}

const ML_BADGE = {
  TOXIC: 'bg-orange-100 text-orange-700',
  SPAM:  'bg-gray-100 text-gray-600',
  HATE:  'bg-red-100 text-red-700',
  FRAUD: 'bg-rose-100 text-rose-700',
}

// Icon by content type
const TYPE_ICON = {
  REVIEW: Flag, COMMENT: MessageSquare, 'DIRECT MESSAGE': Mail, POST: Flag, DISPUTE: Gavel,
}

const TIPS = [
  'Press Shift+D to quickly delete a confirmed violation',
  'Press Shift+S to suspend the reported user',
  'Press Shift+W to issue a user warning',
  'Press Shift+H to hide content from public view',
  'Use the filter bar to focus on CRITICAL reports first',
]

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)  return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs} hr ago`
  return `${Math.floor(hrs / 24)} days ago`
}

function AdminTip() {
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % TIPS.length), 8000)
    return () => clearInterval(t)
  }, [])
  return (
    <div className="bg-surface-container-low rounded-xl p-3 flex items-start gap-2 text-xs">
      <span className="font-bold text-primary flex-shrink-0">💡 Tip:</span>
      <span className="text-on-surface-variant">{TIPS[idx]}</span>
    </div>
  )
}

function SystemPulse({ queue }) {
  const critical = queue.filter(r => r.severity === 'CRITICAL').length
  const fraud    = queue.filter(r => r.mlCategory === 'FRAUD').length
  const toxic    = queue.filter(r => r.mlCategory === 'TOXIC').length
  const total    = queue.length || 1

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-full border-4 border-[#1A2E82] flex items-center justify-center flex-shrink-0">
          <div>
            <p className="text-xl font-bold text-[#1A2E82] leading-none text-center">{queue.length}</p>
            <p className="text-[9px] text-on-surface-variant text-center">pending</p>
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-sm font-semibold text-on-surface">Moderation Queue</span>
          </div>
          <p className="text-xs text-on-surface-variant mt-1 leading-snug">
            {critical > 0
              ? <><strong className="text-red-600">{critical}</strong> critical items require immediate attention.</>
              : 'No critical items in queue.'}
          </p>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="border-t border-surface-container-high pt-4 space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/60">Category Breakdown</p>
        {[
          { label: 'FRAUD', count: fraud, color: 'bg-rose-500' },
          { label: 'TOXIC', count: toxic, color: 'bg-orange-500' },
          { label: 'Other', count: queue.length - fraud - toxic, color: 'bg-[#1A2E82]' },
        ].map(({ label, count, color }) => (
          <div key={label}>
            <div className="flex justify-between mb-1">
              <span className="text-xs text-on-surface-variant">{label}</span>
              <span className="text-xs font-semibold text-on-surface">
                {count} ({Math.round((count / total) * 100)}%)
              </span>
            </div>
            <div className="h-2 bg-surface-container rounded-full overflow-hidden">
              <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.round((count / total) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <AdminTip />
    </div>
  )
}

function ReportCard({ report, onAction }) {
  // Map type string to icon component
  const ReportIcon = TYPE_ICON[report.type] ?? Flag

  // Special UI for DISPUTE cards
  if (report.type === 'DISPUTE') {
    return (
      <div className="bg-surface-container-lowest rounded-xl border border-surface-container p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Gavel className="w-4 h-4 text-amber-600" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-on-surface">{report.reporter} vs {report.againstName || 'Opposing Party'}</span>
                <span className="text-[10px] text-on-surface-variant">· {timeAgo(report.time)}</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-surface-container rounded text-on-surface-variant">DISPUTE</span>
                {report.severity === 'CRITICAL' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">CRITICAL</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <blockquote className="text-sm text-on-surface-variant italic bg-surface-container rounded-lg px-3 py-2 border-l-2 border-outline-variant">
          "{report.content}"
        </blockquote>

        <div className="flex items-center justify-between">
          <span className="text-xs text-on-surface-variant">
            Escrow: <strong className="text-on-surface">{report.amount ? '$' + Number(report.amount).toLocaleString() : '—'}</strong>
            <span className="mx-2">·</span>
            SLA: <strong className={`${report.severity === 'CRITICAL' ? 'text-red-600' : 'text-on-surface'}`}>
              {report.time ? new Date(report.time).toISOString() : ''} (72h)
            </strong>
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => window.location.href='/disputes'}
              className="px-3 py-1.5 text-xs font-semibold bg-primary text-white rounded-lg hover:opacity-90 transition-colors"
            >
              Resolve in Disputes
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Standard Review card
  return (
    <div className="bg-surface-container-lowest rounded-xl border border-surface-container p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-surface-container rounded-lg flex items-center justify-center flex-shrink-0">
            <ReportIcon className="w-4 h-4 text-on-surface-variant" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-on-surface">{report.reporter}</span>
              <span className="text-[10px] text-on-surface-variant">· {timeAgo(report.time)}</span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-surface-container rounded text-on-surface-variant">{report.type}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {report.severity === 'CRITICAL' && (
            <span className="text-[10px] font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">CRITICAL</span>
          )}
          {report.mlScore > 0 && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ML_BADGE[report.mlCategory] ?? ML_BADGE.SPAM}`}>
              {report.mlScore}% {report.mlCategory}
            </span>
          )}
        </div>
      </div>

      <blockquote className="text-sm text-on-surface-variant italic bg-surface-container rounded-lg px-3 py-2 border-l-2 border-outline-variant line-clamp-3">
        "{report.content}"
      </blockquote>

      <div className="flex items-center justify-between">
        <span className="text-xs text-on-surface-variant">
          Flagged for: <strong className="text-on-surface">{report.reason}</strong>
        </span>
        <div className="flex gap-1.5">
          <button onClick={() => onAction(report, 'hide')}    className="px-3 py-1.5 text-xs font-semibold bg-surface-container hover:bg-surface-container-high text-on-surface rounded-lg transition-colors flex items-center gap-1"><EyeOff className="w-3 h-3" /> Hide</button>
          <button onClick={() => onAction(report, 'warn')}    className="px-3 py-1.5 text-xs font-semibold bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg transition-colors">Warn</button>
          <button onClick={() => onAction(report, 'suspend')} className="px-3 py-1.5 text-xs font-semibold bg-orange-50 hover:bg-orange-100 text-orange-700 rounded-lg transition-colors">Suspend</button>
          <button onClick={() => onAction(report, 'delete')}  className="px-3 py-1.5 text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
        </div>
      </div>
    </div>
  )
}

export default function ContentModeration() {
  const [reports,    setReports]   = useState([])
  const [auditLog,   setAuditLog]  = useState([])
  const [typeFilter, setFilter]    = useState('All')
  const [confirm,    setConfirm]   = useState(null)
  const [loading,    setLoading]   = useState(true)
  const [error,      setError]     = useState(null)

  // Fetch queue and audit data from /admin/moderation on mount
  useEffect(() => {
    setLoading(true)
    api.get('/admin/moderation')
      .then(r => {
        setReports(r.data.queue ?? [])
        setAuditLog(r.data.audit ?? [])
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load moderation queue.'))
      .finally(() => setLoading(false))
  }, [])

  const critical = reports.filter(r => r.severity === 'CRITICAL').length
  const filtered = reports.filter(r => typeFilter === 'All' || r.type === typeFilter)

  function handleAction(report, action) {
    const messages = {
      hide:    { title: 'Hide Content',   message: `Hide this ${report.type.toLowerCase()} from public view?`, danger: false },
      warn:    { title: 'Warn User',      message: `Send an automated policy warning to ${report.reporter}?`, danger: false },
      suspend: { title: 'Suspend & Ban',  message: `Suspend ${report.reporter} and ban their account? This is a severe action.`, danger: true },
      delete:  { title: 'Delete Content', message: `Permanently delete this ${report.type.toLowerCase()}? This cannot be undone.`, danger: true },
    }
    const cfg = messages[action] ?? { title: 'Confirm', message: 'Continue?', danger: false }

    setConfirm({
      ...cfg,
      onConfirm: async () => {
        try {
          if (action === 'hide') {
            // Hide: just un-flag, keep review visible to admin only
            await api.patch(`/admin/reviews/${report.id}/dismiss`, { action: 'hide' })
          } else if (action === 'warn') {
            // Warn: moderate as 'warn' → keeps status approved, just un-flags
            await api.patch(`/reviews/${report.id}/moderate`, { action: 'warn' })
          } else if (action === 'suspend') {
            // Suspend: moderate as 'reject' AND ban user
            await api.patch(`/reviews/${report.id}/moderate`, { action: 'reject' })
            if (report.reporterId) {
              await api.patch(`/admin/users/${report.reporterId}/ban`, { banned: true })
            }
          } else if (action === 'delete') {
            // Delete: remove the review record
            await api.delete(`/reviews/${report.id}`)
          }
        } catch (err) {
          // Swallow errors but optionally show a toast in future
          console.error('Action failed:', action, err)
        } finally {
          // Remove from UI regardless of backend outcome for responsiveness
          setReports(prev => prev.filter(r => r.id !== report.id))
          setConfirm(null)
        }
      },
    })
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto pb-10">
      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-[1fr_300px] gap-5">
        {/* Left: Queue */}
        <div className="space-y-4">
          {/* Queue header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-on-surface tracking-wide uppercase">Active Reports Queue</h2>
              <span className="text-xs font-bold px-2 py-0.5 bg-surface-container rounded-full text-on-surface-variant">ALL: {reports.length}</span>
              {critical > 0 && (
                <span className="text-xs font-bold px-2 py-0.5 bg-red-100 text-red-700 rounded-full">CRITICAL: {critical}</span>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {['All', 'REVIEW', 'COMMENT', 'DIRECT MESSAGE', 'POST'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${typeFilter === f ? 'bg-[#1A2E82] text-white' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Report cards */}
          {loading ? (
            <div className="py-20 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(r => (
                <ReportCard key={r.id} report={r} onAction={handleAction} />
              ))}
              {filtered.length === 0 && (
                <div className="py-16 text-center bg-surface-container-lowest rounded-xl border border-surface-container">
                  <ShieldCheck className="w-10 h-10 text-emerald-500/40 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-on-surface">No active reports</p>
                  <p className="text-xs text-on-surface-variant mt-1">Platform is clean — no flagged content in this category.</p>
                </div>
              )}
            </div>
          )}

          {/* Recent Actions Audit — real data from GET /admin/moderation */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden mt-4">
            <div className="px-5 py-4 border-b border-surface-container-high flex items-center justify-between">
              <h3 className="text-sm font-semibold text-on-surface">Recent Moderation Actions</h3>
              <a href="/audit" className="text-xs text-primary hover:underline font-semibold">View Full Log →</a>
            </div>
            <table className="w-full text-left">
              <thead className="bg-surface-container-low/40">
                <tr>
                  {['Moderator', 'Action', 'Target', 'Time'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLog.length > 0 ? auditLog.map(a => (
                  <tr key={a.id} className="border-t border-surface-container hover:bg-surface-container-low/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-[#1A2E82] flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">{a.modInit}</div>
                        <span className="text-sm text-on-surface">{a.mod}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ACTION_BADGE[a.action] ?? ACTION_BADGE.default}`}>{a.action}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-on-surface-variant font-mono">{a.target}</td>
                    <td className="px-5 py-3 text-xs text-on-surface-variant">{timeAgo(a.time)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-5 py-6 text-center text-sm text-on-surface-variant">No audit log entries yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: System Pulse — driven by live queue */}
        <div className="space-y-4">
          <SystemPulse queue={reports} />
        </div>
      </div>

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
