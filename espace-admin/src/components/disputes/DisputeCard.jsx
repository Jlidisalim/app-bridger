import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, ArrowRight, Calendar, CheckCircle2, ChevronDown, ChevronUp,
  Clock, ExternalLink, FileText, Hash, Hourglass, Image as ImageIcon, Loader2,
  MessageSquare, Package, Phone, Tag, Truck, User, Video, X,
} from 'lucide-react'
import { resolveMediaUrl } from '../../services/api'
import {
  STATUS_MAP, DISPUTE_TYPE_META, OUTCOME_META,
  timeRemaining, slaBadgeColor, formatDate, formatDateFull,
} from './disputeMeta'

/**
 * DisputeCard — full rich dispute card.
 * Used on the Admin Dashboard (clickable preview) and inside the Disputes detail panel.
 *
 * Props:
 *  - dispute: the dispute object (with deal, filer, against, evidences, _count, etc.)
 *  - onClick: when set, the whole header becomes clickable (used on the dashboard)
 *  - onResolve(outcome), onDiscuss, currentAdminId: action handlers (omit on dashboard)
 *  - onDiscuss(): opens the conversational moderator chat. The handler is also responsible
 *    for auto-assigning the dispute to the active moderator before the conversation starts.
 *  - now: current timestamp (ms) for SLA badges
 *  - defaultExpanded: when true, the structured submission details are shown by default
 */
export default function DisputeCard({
  dispute, onClick,
  onResolve, onDiscuss, currentAdminId,
  now = Date.now(),
  defaultExpanded = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  const statusInfo = STATUS_MAP[dispute.status] || { label: dispute.status, color: 'bg-gray-100 text-gray-700', progress: 0 }
  const typeInfo   = DISPUTE_TYPE_META[dispute.disputeType] || DISPUTE_TYPE_META.OTHER
  const TypeIcon   = typeInfo.icon
  const sla        = timeRemaining(dispute.slaDeadline, now)
  const filerEvidence   = (dispute.evidences || []).filter(e => e.uploaderId === dispute.filerId)
  const againstEvidence = (dispute.evidences || []).filter(e => e.uploaderId !== dispute.filerId)
  const isMine     = dispute.assignedTo && dispute.assignedTo === currentAdminId
  const canResolve = dispute.status === 'ADMIN_REVIEWING' && !!onResolve
  const messageCount = dispute._count?.messages ?? 0
  const isResolved = ['RESOLVED_FILER_WIN', 'RESOLVED_AGAINST_WIN', 'RESOLVED_SPLIT', 'CLOSED'].includes(dispute.status)

  const HeaderShell = onClick ? 'button' : 'div'
  const headerProps = onClick
    ? { type: 'button', onClick, className: 'w-full text-left p-4 border-b border-surface-container-high flex items-start justify-between gap-4 bg-surface-container-low/30 hover:bg-surface-container transition-colors' }
    : { className: 'p-4 border-b border-surface-container-high flex items-start justify-between gap-4 bg-surface-container-low/30' }

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
      {/* Header */}
      <HeaderShell {...headerProps}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-colors duration-300 ${
                isResolved ? 'bg-emerald-100 text-emerald-700' : statusInfo.color
              }`}
            >
              {isResolved && (
                <CheckCircle2
                  className="w-3 h-3 text-emerald-600 transition-all duration-300 ease-out"
                  aria-hidden="true"
                />
              )}
              {statusInfo.label}
            </span>
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${typeInfo.tone}`}>
              <TypeIcon className="w-3 h-3" /> {typeInfo.label}
            </span>
            {dispute.slaDeadline && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${slaBadgeColor(dispute.slaDeadline, now)}`}>
                <Clock className="w-3 h-3" />
                {sla.expired ? 'SLA expired' : `${sla.hours}h ${sla.minutes}m`}
              </span>
            )}
            {isMine && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 flex items-center gap-1">
                <User className="w-3 h-3" /> Assigned to you
              </span>
            )}
            {dispute.assignedTo && !isMine && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 flex items-center gap-1">
                <User className="w-3 h-3" />
                Assigned · {dispute.assignedAdmin?.name || 'admin'}
              </span>
            )}
            {messageCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-50 text-cyan-700 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {messageCount}
              </span>
            )}
            <span className="text-[10px] text-on-surface-variant font-mono">
              Dispute #{dispute.id.slice(-6)} · Deal #{dispute.deal?.id?.slice(-6)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-on-surface">
              {dispute.deal?.fromCity} <ArrowRight className="w-3.5 h-3.5 inline" /> {dispute.deal?.toCity}
            </p>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">{dispute.reason}</p>
          <p className="text-[10px] text-on-surface-variant/70 mt-1">
            Filed {formatDate(dispute.createdAt)} · Deadline {formatDate(dispute.slaDeadline)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-lg font-bold text-primary">
            ${Number(dispute.deal?.price || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-on-surface-variant">escrow amount</p>
        </div>
      </HeaderShell>

      {/* Collapsed description preview */}
      {!expanded && dispute.description && (
        <div className="px-4 pt-3">
          <p className="text-xs text-on-surface-variant line-clamp-2">{dispute.description}</p>
        </div>
      )}

      {/* Expanded: full submission details panel */}
      {expanded && (
        <SubmissionDetailsPanel dispute={dispute} typeInfo={typeInfo} />
      )}

      {/* Parties & Evidence */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        <PartyEvidenceColumn title="Filer"      user={dispute.filer}   evidence={filerEvidence}   expanded={expanded} />
        <PartyEvidenceColumn title="Respondent" user={dispute.against} evidence={againstEvidence} expanded={expanded} />
      </div>

      {/* Expand toggle */}
      {(dispute.evidences?.length > 0 || dispute.description || dispute.reason) && (
        <div className="px-4 -mt-2 pb-2">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
          >
            {expanded
              ? <><ChevronUp className="w-3 h-3" /> Hide submission details</>
              : <><ChevronDown className="w-3 h-3" /> Show submission details</>
            }
          </button>
        </div>
      )}

      {/* Progress bar */}
      <div className="px-4 pb-3">
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
      {canResolve && (
        <div className="p-4 border-t border-surface-container-high bg-surface-container-low/20 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-on-surface-variant mr-2">Resolution:</span>
          {Object.entries(OUTCOME_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => onResolve(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${meta.btn}`}
            >
              {meta.label}
            </button>
          ))}
          <div className="flex-1" />
          {onDiscuss && (
            <button
              onClick={onDiscuss}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg monolith-gradient text-white hover:opacity-90 transition-opacity shadow-sm"
              title={isMine
                ? 'Continue the moderator conversation'
                : 'Open a conversation — this dispute will be auto-assigned to you'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              {isMine ? 'Continue Discussion' : 'Discuss Problem'}
            </button>
          )}
        </div>
      )}

      {/* Resolved footer */}
      {!canResolve && dispute.resolution && (
        <div className="p-4 border-t border-surface-container-high bg-surface-container-low/20">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-semibold">
              Admin resolution
            </p>
            <p className="text-[10px] text-on-surface-variant">
              {dispute.resolvedBy?.name && <>by <span className="font-semibold text-on-surface">{dispute.resolvedBy.name}</span> · </>}
              {formatDate(dispute.updatedAt)}
            </p>
          </div>
          <p className="text-xs text-on-surface whitespace-pre-wrap leading-relaxed">{dispute.resolution}</p>
        </div>
      )}
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function SubmissionDetailsPanel({ dispute, typeInfo }) {
  const TypeIcon = typeInfo.icon
  const filer    = dispute.filer || {}
  const against  = dispute.against || {}
  const deal     = dispute.deal || {}
  const evidenceCount = dispute._count?.evidences ?? (dispute.evidences?.length ?? 0)
  const messageCount  = dispute._count?.messages ?? 0

  return (
    <div className="mx-4 mt-3 rounded-xl border border-surface-container-high bg-surface-container-low/40 overflow-hidden">
      <div className="px-4 py-2 border-b border-surface-container-high bg-surface-container-low/60">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
          <FileText className="w-3 h-3" /> Submission details
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 px-4 py-3">
        <DetailField icon={Hash}     label="Dispute ID" value={<span className="font-mono text-[11px] break-all">{dispute.id}</span>} />
        <DetailField icon={TypeIcon} label="Category"   value={
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold border ${typeInfo.tone}`}>
            {typeInfo.label}
          </span>
        } />
        <DetailField icon={Calendar} label="Filed at" value={formatDateFull(dispute.createdAt)} />

        <DetailField icon={User} label="Filer" value={
          <Link to={`/users/${filer.id}/activity`} className="hover:text-primary inline-flex items-center gap-1">
            {filer.name || '—'}<ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
        } />
        <DetailField icon={Phone} label="Filer phone" value={filer.phone || '—'} />
        <DetailField icon={Hash}  label="Filer ID"    value={<span className="font-mono text-[11px] break-all">{filer.id || '—'}</span>} />

        <DetailField icon={User} label="Filed against" value={
          <Link to={`/users/${against.id}/activity`} className="hover:text-primary inline-flex items-center gap-1">
            {against.name || '—'}<ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
        } />
        <DetailField icon={Phone} label="Respondent phone" value={against.phone || '—'} />
        <DetailField icon={Hash}  label="Respondent ID"    value={<span className="font-mono text-[11px] break-all">{against.id || '—'}</span>} />

        <DetailField icon={Truck} label="Deal route" value={
          <span className="inline-flex items-center gap-1">
            {deal.fromCity || '—'} <ArrowRight className="w-3 h-3" /> {deal.toCity || '—'}
          </span>
        } />
        <DetailField icon={Hash} label="Deal ID" value={
          <Link to={`/deals/${deal.id}`} className="font-mono text-[11px] break-all hover:text-primary">
            {deal.id || '—'}
          </Link>
        } />
        <DetailField icon={Tag} label="Escrow amount" value={
          <span className="font-semibold">${Number(deal.price || 0).toLocaleString()}</span>
        } />

        <DetailField icon={Hourglass}     label="SLA deadline"    value={formatDateFull(dispute.slaDeadline)} />
        <DetailField icon={ImageIcon}     label="Attachments"     value={`${evidenceCount} file${evidenceCount === 1 ? '' : 's'}`} />
        <DetailField icon={MessageSquare} label="Thread messages" value={`${messageCount} message${messageCount === 1 ? '' : 's'}`} />
      </div>

      <div className="px-4 pt-2 pb-1 border-t border-surface-container-high">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
          Reason <span className="text-red-600 font-bold">*</span>
        </p>
        <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed">
          {dispute.reason || <span className="text-on-surface-variant italic">No reason provided</span>}
        </p>
      </div>

      <div className="px-4 pt-3 pb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
          Additional context
        </p>
        <p className="text-sm text-on-surface-variant whitespace-pre-wrap leading-relaxed">
          {dispute.description || <span className="italic opacity-70">No additional context submitted</span>}
        </p>
      </div>
    </div>
  )
}

function DetailField({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3" /> {label}
      </p>
      <div className="text-xs text-on-surface min-w-0 break-words">{value}</div>
    </div>
  )
}

function PartyEvidenceColumn({ title, user, evidence, expanded }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant mb-2 flex items-center gap-2">
        <User className="w-3.5 h-3.5" />
        <span>{title}</span>
        {user?.name && (
          <Link
            to={`/users/${user.id}/activity`}
            className="text-on-surface hover:text-primary normal-case tracking-normal font-semibold flex items-center gap-1"
          >
            ({user.name})
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
        )}
      </h4>
      {evidence.length === 0 ? (
        <p className="text-[11px] text-on-surface-variant/60 italic">No evidence submitted</p>
      ) : (
        <div className="space-y-2">
          {evidence.map(ev => <EvidenceItem key={ev.id} ev={ev} expanded={expanded} />)}
        </div>
      )}
    </div>
  )
}

function EvidenceItem({ ev, expanded }) {
  const isImage = ev.type === 'PHOTO' || (ev.mimeType || '').startsWith('image/')
  const isVideo = ev.type === 'VIDEO' || (ev.mimeType || '').startsWith('video/')
  const isDoc   = ev.type === 'DOCUMENT'
  const url     = ev.url ? resolveMediaUrl(ev.url) : null

  return (
    <div className="bg-surface-container rounded-lg p-2 flex items-start gap-2">
      {isImage && url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
          <img src={url} alt="evidence" className="w-14 h-14 object-cover rounded-md border border-surface-container-high" loading="lazy" />
        </a>
      ) : (
        <div className="w-8 h-8 rounded-md bg-surface-container-high flex items-center justify-center flex-shrink-0">
          {isVideo ? <Video className="w-4 h-4 text-on-surface-variant" />
            : isDoc ? <FileText className="w-4 h-4 text-on-surface-variant" />
            : <MessageSquare className="w-4 h-4 text-on-surface-variant" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        {ev.content && (
          <p className={`text-xs text-on-surface ${expanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
            {ev.content}
          </p>
        )}
        {ev.fileName && (
          <p className="text-[10px] text-on-surface-variant/70 mt-0.5 truncate">{ev.fileName}</p>
        )}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-primary hover:underline inline-flex items-center gap-1 mt-0.5">
            <ImageIcon className="w-3 h-3" /> Open file
          </a>
        )}
      </div>
    </div>
  )
}

// ── Resolution Modal ─────────────────────────────────────────────────────────

export function ResolutionModal({ ctx, onChange, onClose, onSubmit }) {
  const { dispute, outcome, note, acknowledged, submitting, error } = ctx
  const meta = OUTCOME_META[outcome]
  const dealAmount = Number(dispute.deal?.price || 0)
  const filerName   = dispute.filer?.name || 'Filer'
  const againstName = dispute.against?.name || 'Respondent'

  const impact = (() => {
    if (outcome === 'FILER_WIN')   return [{ label: `Refund to ${filerName}`,  amount: dealAmount }, { label: `Released to ${againstName}`, amount: 0 }]
    if (outcome === 'AGAINST_WIN') return [{ label: `Refund to ${filerName}`,  amount: 0 },          { label: `Released to ${againstName}`, amount: dealAmount }]
    if (outcome === 'SPLIT')       return [{ label: `Refund to ${filerName}`,  amount: dealAmount / 2 }, { label: `Released to ${againstName}`, amount: dealAmount / 2 }]
    return [{ label: 'No payout — escrow remains untouched', amount: 0 }]
  })()

  const canSubmit = note.trim().length >= 5 && acknowledged && !submitting

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={submitting ? undefined : onClose} />
      <div className="relative bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-lg z-10 overflow-hidden">
        <div className={`p-5 border-b border-surface-container-high ${meta.headerBg}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Resolve dispute</p>
              <h3 className={`text-lg font-bold ${meta.headerText} mt-1`}>{meta.label}</h3>
              <p className="text-xs text-on-surface-variant mt-1">
                Dispute #{dispute.id.slice(-6)} · {dispute.deal?.fromCity} → {dispute.deal?.toCity}
              </p>
            </div>
            <button onClick={onClose} disabled={submitting} className="p-1 rounded-lg hover:bg-white/50 disabled:opacity-50">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-2">
              Financial impact
            </p>
            <div className="space-y-1.5 bg-surface-container rounded-lg p-3">
              {impact.map((row, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-on-surface">{row.label}</span>
                  <span className={`font-bold tabular-nums ${row.amount > 0 ? 'text-emerald-700' : 'text-on-surface-variant'}`}>
                    ${row.amount.toLocaleString(undefined, { minimumFractionDigits: row.amount % 1 ? 2 : 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-on-surface-variant mb-1 block">
              Resolution note <span className="text-red-600">*</span>
            </label>
            <textarea
              value={note}
              onChange={e => onChange({ note: e.target.value, error: null })}
              placeholder="Summarise the evidence and reasoning for this outcome (visible to both parties in the dispute thread)…"
              rows={4}
              maxLength={1000}
              className="w-full px-3 py-2 text-sm bg-surface-container border border-surface-container-high rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-on-surface-variant">Min 5 characters · sent to filer & respondent</span>
              <span className="text-[10px] text-on-surface-variant tabular-nums">{note.length}/1000</span>
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={acknowledged} onChange={e => onChange({ acknowledged: e.target.checked })} className="mt-0.5" />
            <span className="text-xs text-on-surface-variant">
              I have reviewed all evidence from both parties and confirm this outcome is appropriate.
              Wallet transfers will be triggered immediately and cannot be undone.
            </span>
          </label>

          {error && (
            <div className="flex items-center gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-surface-container-high bg-surface-container-low/30 flex gap-3 justify-end">
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant rounded-lg border border-outline-variant hover:bg-surface-container-high disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onSubmit} disabled={!canSubmit}
            className="px-4 py-2 text-sm font-semibold rounded-lg monolith-gradient text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Confirm {meta.label}
          </button>
        </div>
      </div>
    </div>
  )
}
