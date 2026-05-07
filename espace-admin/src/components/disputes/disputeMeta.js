import {
  AlertTriangle, Package, PackageX, FileSearch, ShieldAlert, HelpCircle,
} from 'lucide-react'

export const STATUS_MAP = {
  OPENED:               { label: 'Opened',          color: 'bg-gray-100 text-gray-700',       progress: 10 },
  EVIDENCE_SUBMITTED:   { label: 'Evidence Sent',   color: 'bg-amber-100 text-amber-700',     progress: 40 },
  ADMIN_REVIEWING:      { label: 'Under Review',    color: 'bg-blue-100 text-blue-700',       progress: 70 },
  RESOLVED_FILER_WIN:   { label: 'Filer Won',       color: 'bg-emerald-100 text-emerald-700', progress: 100 },
  RESOLVED_AGAINST_WIN: { label: 'Against Won',     color: 'bg-emerald-100 text-emerald-700', progress: 100 },
  RESOLVED_SPLIT:       { label: 'Split Decision',  color: 'bg-purple-100 text-purple-700',   progress: 100 },
  CLOSED:               { label: 'Closed',          color: 'bg-slate-100 text-slate-700',     progress: 100 },
}

export const FILTER_TABS = [
  { value: 'ADMIN_REVIEWING',      label: 'Under Review' },
  { value: 'OPENED',               label: 'Opened' },
  { value: 'EVIDENCE_SUBMITTED',   label: 'Evidence Sent' },
  { value: 'RESOLVED_FILER_WIN',   label: 'Filer Won' },
  { value: 'RESOLVED_AGAINST_WIN', label: 'Against Won' },
  { value: 'RESOLVED_SPLIT',       label: 'Split' },
  { value: 'CLOSED',               label: 'Closed' },
]

export const DISPUTE_TYPE_META = {
  NOT_DELIVERED: { label: 'Not Delivered', icon: PackageX,      tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  ITEM_DAMAGED:  { label: 'Item Damaged',  icon: AlertTriangle, tone: 'bg-red-50 text-red-700 border-red-200' },
  ITEM_LOST:     { label: 'Item Lost',     icon: FileSearch,    tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  WRONG_ITEM:    { label: 'Wrong Item',    icon: Package,       tone: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  FRAUD:         { label: 'Fraud',         icon: ShieldAlert,   tone: 'bg-rose-50 text-rose-700 border-rose-200' },
  OTHER:         { label: 'Other',         icon: HelpCircle,    tone: 'bg-slate-50 text-slate-700 border-slate-200' },
}

export const OUTCOME_META = {
  FILER_WIN:   { label: 'Filer Wins',      short: 'Filer wins',      btn: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200', headerBg: 'bg-emerald-50', headerText: 'text-emerald-700' },
  AGAINST_WIN: { label: 'Against Wins',    short: 'Respondent wins', btn: 'bg-blue-100 text-blue-700 hover:bg-blue-200',           headerBg: 'bg-blue-50',    headerText: 'text-blue-700' },
  SPLIT:       { label: 'Split Decision',  short: 'Split 50/50',     btn: 'bg-purple-100 text-purple-700 hover:bg-purple-200',     headerBg: 'bg-purple-50',  headerText: 'text-purple-700' },
  CLOSED:      { label: 'Close No Action', short: 'No payout',       btn: 'bg-slate-100 text-slate-700 hover:bg-slate-200',         headerBg: 'bg-slate-50',   headerText: 'text-slate-700' },
}

export function timeRemaining(deadlineStr, now = Date.now()) {
  if (!deadlineStr) return { ms: 0, hours: 0, minutes: 0, expired: true }
  const ms = new Date(deadlineStr).getTime() - now
  if (ms <= 0) return { ms: 0, hours: 0, minutes: 0, expired: true }
  return {
    ms,
    hours:   Math.floor(ms / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    expired: false,
  }
}

export function slaBadgeColor(deadlineStr, now = Date.now()) {
  const { hours, expired } = timeRemaining(deadlineStr, now)
  if (expired)    return 'text-red-700 bg-red-100'
  if (hours < 4)  return 'text-red-700 bg-red-50'
  if (hours < 12) return 'text-amber-700 bg-amber-50'
  return 'text-emerald-700 bg-emerald-50'
}

export function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDateFull(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}
