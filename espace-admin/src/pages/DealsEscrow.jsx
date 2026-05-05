/**
 * DealsEscrow.jsx — connected to the real backend.
 *
 * Data display:
 * - The page auto-paginates the GET /deals endpoint and shows every record
 *   matching the selected status, so admins see the full picture instead of
 *   one paginated page at a time. The backend caps `limit` at 50, so this
 *   loops until `hasMore` is false (with a safety cap).
 * - A search input is wired adjacent to a status `<select>`; search filters
 *   the loaded list client-side across deal id, route and parties.
 * - Layout is responsive: KPI grid, main-vs-side-actions split, and the
 *   bottom analytic modules collapse to single-column on mobile and tablet.
 *   On screens below `xl`, the inline detail panel is replaced by the
 *   centered modal so the table keeps its full width.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  ChevronRight, Clock, Send, TrendingUp, Coins,
  Lock, DollarSign, Package, Loader2, AlertCircle,
  X, Info, Calendar, MapPin, User, FileText, Search, ChevronDown, Activity,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import KpiCard from '../components/shared/KpiCard'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import ExportButton from '../components/shared/ExportButton'
import api from '../services/api'

// Match Tailwind's `xl` breakpoint so the inline detail panel only renders
// where the table has horizontal room to flex without overlapping content.
function useIsXl() {
  const [isXl, setIsXl] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1280px)').matches
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1280px)')
    const cb = (e) => setIsXl(e.matches)
    mq.addEventListener('change', cb)
    return () => mq.removeEventListener('change', cb)
  }, [])
  return isXl
}

// ── Status display map (backend → display) ────────────────────────────────────
const STATUS_MAP = {
  OPEN:       { label: 'Open',       cls: 'bg-gray-100 text-gray-700' },
  MATCHED:    { label: 'Matched',    cls: 'bg-blue-100 text-blue-700' },
  PICKED_UP:  { label: 'Picked Up',  cls: 'bg-indigo-100 text-indigo-700' },
  IN_TRANSIT: { label: 'In Transit', cls: 'bg-amber-100 text-amber-700' },
  DELIVERED:  { label: 'Delivered',  cls: 'bg-teal-100 text-teal-700' },
  COMPLETED:  { label: 'Completed',  cls: 'bg-emerald-100 text-emerald-700' },
  CANCELLED:  { label: 'Cancelled',  cls: 'bg-red-100 text-red-700' },
  DISPUTED:   { label: 'Disputed',   cls: 'bg-orange-100 text-orange-700' },
}

// Statuses that have funds in escrow (not yet released/refunded)
const ESCROW_STATUSES = new Set(['MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'])

// ── Unified Volume + Beneficial Value card ───────────────────────────────────
// Consolidates the two KPIs that were previously rendered side-by-side as two
// separate halves. Volume is the primary metric; beneficial value (platform
// take) is shown as a derived secondary line so the relationship between them
// is immediately legible at a glance.
function UnifiedVolumeCard({ totalVolume, beneficialValue, currency = 'USD', className = '' }) {
  const takeRate = totalVolume > 0 ? (beneficialValue / totalVolume) * 100 : 0
  return (
    <div className={`bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden ${className}`}>
      <div className="h-[3px]" style={{ background: 'linear-gradient(90deg,#3B82F6 0%,#059669 100%)' }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant">Page Volume · Beneficial Value</p>
            <p className="text-[10px] text-on-surface-variant/70 mt-0.5">Gross deal value and the platform take it generates</p>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#3B82F61A' }}>
              <DollarSign className="w-4 h-4 text-blue-600" />
            </div>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#0596691A' }}>
              <Coins className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600/80">Page Volume</p>
            <p className="text-[26px] font-semibold text-on-surface leading-tight">
              {currency === 'USD' ? '$' : `${currency} `}{Number(totalVolume).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-on-surface-variant">Sum of `price` across loaded deals</p>
          </div>
          <div className="self-stretch w-px bg-surface-container-high mx-1" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700/80">Beneficial Value</p>
            <p className="text-[26px] font-semibold text-on-surface leading-tight">
              {currency === 'USD' ? '$' : `${currency} `}{Number(beneficialValue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-[11px] text-on-surface-variant">Take rate · {takeRate.toFixed(1)}%</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Tiny info-tooltip used by the bottom metric cards ────────────────────────
// Each bottom card declares its data source / calculation rationale via this
// tooltip so admins can audit the figure without leaving the page.
function InfoTip({ children }) {
  return (
    <span className="relative inline-flex group">
      <Info className="w-3.5 h-3.5 text-on-surface-variant/60 hover:text-on-surface-variant cursor-help" tabIndex={0} />
      <span className="pointer-events-none absolute right-0 top-5 z-20 w-64 p-2.5 text-[11px] leading-snug rounded-lg bg-on-surface text-surface-container-lowest shadow-lg opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        {children}
      </span>
    </span>
  )
}

// ── Shared deal-detail body (used by both modal and drawer) ──────────────────
function DealDetailBody({ deal }) {
  if (!deal) return null
  const inEscrow = ESCROW_STATUSES.has(deal.status)
  const stat = STATUS_MAP[deal.status]
  const fee = Math.round((deal.price ?? 0) * 0.04)
  const logic = Math.round((deal.price ?? 0) * 0.12)
  const insur = Math.round((deal.price ?? 0) * 0.015)
  const total = (deal.price ?? 0) + fee + logic + insur

  const Section = ({ title, icon, children }) => (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60">{title}</p>
      </div>
      {children}
    </div>
  )
  const Row = ({ label, value, mono }) => (
    <div className="flex justify-between items-start gap-4 text-sm py-1">
      <span className="text-on-surface-variant flex-shrink-0">{label}</span>
      <span className={`text-on-surface font-medium text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>{value ?? '—'}</span>
    </div>
  )

  return (
    <>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {stat && <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stat.cls}`}>{stat.label}</span>}
        {inEscrow && <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-full">FUNDS HELD</span>}
        {deal.flagged && <span className="text-[10px] font-bold px-2 py-1 bg-red-100 text-red-700 rounded-full">FLAGGED</span>}
      </div>

      <Section title="Route" icon={<MapPin className="w-3 h-3 text-on-surface-variant/60" />}>
        <div className="bg-surface-container-low rounded-xl p-3 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">From</p>
            <p className="text-sm font-semibold text-on-surface">{deal.fromCity ?? '—'}{deal.fromCountry ? `, ${deal.fromCountry}` : ''}</p>
          </div>
          <div className="border-l-2 border-dashed border-surface-container-high ml-2 h-3" />
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">To</p>
            <p className="text-sm font-semibold text-on-surface">{deal.toCity ?? '—'}{deal.toCountry ? `, ${deal.toCountry}` : ''}</p>
          </div>
        </div>
      </Section>

      <Section title="Parties" icon={<User className="w-3 h-3 text-on-surface-variant/60" />}>
        <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
          <Row label="Sender" value={deal.sender?.name ?? '—'} />
          <Row label="Traveler" value={deal.traveler?.name ?? 'Not assigned'} />
          <Row label="Receiver" value={deal.receiverName ?? '—'} />
          {deal.receiverPhone && <Row label="Receiver phone" value={deal.receiverPhone} />}
        </div>
      </Section>

      <Section title="Package" icon={<Package className="w-3 h-3 text-on-surface-variant/60" />}>
        <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
          {deal.title && <Row label="Title" value={deal.title} />}
          <Row label="Size" value={deal.packageSize ?? '—'} />
          <Row label="Weight" value={deal.weight != null ? `${deal.weight} kg` : '—'} />
          {deal.itemValue != null && <Row label="Item value" value={`${deal.currency ?? 'USD'} ${Number(deal.itemValue).toLocaleString()}`} />}
          {deal.isFragile && <Row label="Fragile" value="Yes" />}
        </div>
      </Section>

      <Section title="Money" icon={<DollarSign className="w-3 h-3 text-on-surface-variant/60" />}>
        <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
          <Row label="Item value" value={`${deal.currency ?? 'USD'} ${Number(deal.price ?? 0).toLocaleString()}`} />
          <Row label="Service fee · 4%" value={`${deal.currency ?? 'USD'} ${fee.toLocaleString()}`} />
          <Row label="Logistics · 12%" value={`${deal.currency ?? 'USD'} ${logic.toLocaleString()}`} />
          <Row label="Insurance · 1.5%" value={`${deal.currency ?? 'USD'} ${insur.toLocaleString()}`} />
          <div className="flex justify-between border-t border-surface-container-high pt-1.5 mt-1 text-sm">
            <span className="font-semibold text-on-surface">Total payable</span>
            <span className="font-bold text-on-surface">{deal.currency ?? 'USD'} {total.toLocaleString()}</span>
          </div>
        </div>
      </Section>

      <Section title="Schedule" icon={<Calendar className="w-3 h-3 text-on-surface-variant/60" />}>
        <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
          <Row label="Created" value={deal.createdAt ? new Date(deal.createdAt).toLocaleString() : '—'} />
          {deal.pickupDate && <Row label="Pickup" value={new Date(deal.pickupDate).toLocaleString()} />}
          {deal.deliveryDate && <Row label="Delivery" value={new Date(deal.deliveryDate).toLocaleString()} />}
          {deal.updatedAt && <Row label="Updated" value={new Date(deal.updatedAt).toLocaleString()} />}
        </div>
      </Section>

      <Section title="Metadata" icon={<FileText className="w-3 h-3 text-on-surface-variant/60" />}>
        <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
          <Row label="Full ID" value={deal.id} mono />
          {deal.mlScore != null && <Row label="ML score" value={`${Math.round(deal.mlScore)} / 100`} />}
          {deal._count?.disputes != null && <Row label="Disputes" value={deal._count.disputes} />}
          {deal.qrCode && <Row label="QR code" value="Generated" />}
        </div>
      </Section>
    </>
  )
}

// ── Centered modal — opened from the clickable "deal cards" ──────────────────
function DealDetailModal({ open, deal, onClose }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open || !deal) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Deal detail" className="relative bg-surface-container-lowest w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-surface-container-high flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60">Deal #{deal.id?.slice(-8)}</p>
            <h2 className="text-lg font-semibold text-on-surface truncate flex items-center gap-2 mt-0.5">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate">{deal.fromCity ?? '—'} → {deal.toCity ?? '—'}</span>
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-lg flex-shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto scrollbar-hidden">
          <DealDetailBody deal={deal} />
        </div>
      </div>
    </div>
  )
}

// ── In-flow detail panel ─────────────────────────────────────────────────────
// Sits inside the page grid as its own column rather than overlaying the page.
// The wrapping <aside> in the parent layout animates the column width; this
// component is just the panel content and never owns positioning. Sticky top
// keeps the header visible while the user scrolls through long row lists.
function DealDetailPanel({ deal, onClose }) {
  if (!deal) return null
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container flex flex-col h-full sticky top-4 max-h-[calc(100vh-2rem)] overflow-hidden">
      <div className="p-4 border-b border-surface-container-high flex items-start justify-between gap-3 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60">Deal #{deal.id?.slice(-8)}</p>
          <h2 className="text-base font-semibold text-on-surface truncate flex items-center gap-2 mt-0.5">
            <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="truncate">{deal.fromCity ?? '—'} → {deal.toCity ?? '—'}</span>
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-surface-container-high rounded-lg flex-shrink-0"
          aria-label="Close detail panel"
          title="Close"
        >
          <X className="w-4 h-4 text-on-surface-variant" />
        </button>
      </div>
      <div className="p-4 flex-1 overflow-y-auto scrollbar-hidden">
        <DealDetailBody deal={deal} />
      </div>
    </div>
  )
}

// ── Pending Payouts Queue ────────────────────────────────────────────────────
function PendingPayouts({ deals, onSelect }) {
  const pending = deals
    .filter(d => d.status === 'DELIVERED')
    .map(d => ({ ...d, days: Math.floor((Date.now() - new Date(d.createdAt)) / 86400000) }))
    .sort((a, b) => b.days - a.days)

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <Send className="w-4 h-4 text-emerald-600" />
            Pending Payouts
            <InfoTip>
              <strong>Source:</strong> deals in the current view with <code>status === DELIVERED</code>.<br />
              <strong>Logic:</strong> <code>days = floor((now − createdAt) / 1 day)</code>, sorted descending.<br />
              <strong>Why it matters:</strong> these deals have funds held in escrow that the traveler is owed — older entries indicate operational lag releasing payouts.
            </InfoTip>
          </h3>
          <p className="text-xs text-on-surface-variant">Delivered, awaiting release</p>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{pending.length}</span>
      </div>
      {pending.length === 0 ? (
        <div className="py-8 text-center text-xs text-on-surface-variant">No payouts pending</div>
      ) : (
        <ul className="divide-y divide-surface-container max-h-56 overflow-y-auto">
          {pending.map(d => (
            <li
              key={d.id}
              onClick={() => onSelect(d)}
              className="py-2.5 px-1 cursor-pointer hover:bg-surface-container-low/40 rounded transition-colors"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-primary-container">#{d.id.slice(-8)}</span>
                <span className="font-bold text-on-surface">{d.currency} {Number(d.price ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px] text-on-surface-variant">
                <span>{d.fromCity} → {d.toCity}</span>
                <span className={d.days >= 3 ? 'text-amber-600 font-semibold' : ''}>{d.days}d waiting</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Dispute Aging ────────────────────────────────────────────────────────────
function DisputeAging({ deals, onSelect }) {
  const disputed = deals
    .filter(d => d.status === 'DISPUTED')
    .map(d => ({ ...d, days: Math.floor((Date.now() - new Date(d.createdAt)) / 86400000) }))
    .sort((a, b) => b.days - a.days)

  // SLA: 3d at-risk, 7d breached
  const slaCls = days => days >= 7 ? 'bg-red-100 text-red-700' : days >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
  const slaLabel = days => days >= 7 ? 'Breached' : days >= 3 ? 'At risk' : 'On track'

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-600" />
            Dispute Aging
            <InfoTip>
              <strong>Source:</strong> deals in the current view with <code>status === DISPUTED</code>.<br />
              <strong>Logic:</strong> age in days from <code>createdAt</code>; SLA buckets — <em>On track</em> &lt; 3d, <em>At risk</em> 3–6d, <em>Breached</em> ≥ 7d.<br />
              <strong>Why it matters:</strong> escrow stays frozen while a dispute is open; aging entries are direct customer-experience and cash-flow risks.
            </InfoTip>
          </h3>
          <p className="text-xs text-on-surface-variant">SLA · 3d at-risk · 7d breached</p>
        </div>
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700">{disputed.length}</span>
      </div>
      {disputed.length === 0 ? (
        <div className="py-8 text-center text-xs text-on-surface-variant">No open disputes</div>
      ) : (
        <ul className="divide-y divide-surface-container max-h-56 overflow-y-auto">
          {disputed.map(d => (
            <li
              key={d.id}
              onClick={() => onSelect(d)}
              className="py-2.5 px-1 cursor-pointer hover:bg-surface-container-low/40 rounded transition-colors"
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-primary-container">#{d.id.slice(-8)}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${slaCls(d.days)}`}>
                  {d.days}d · {slaLabel(d.days)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-1 text-[11px] text-on-surface-variant">
                <span>{d.fromCity} → {d.toCity}</span>
                <span>{d.currency} {Number(d.price ?? 0).toLocaleString()}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Active Status KPI card ───────────────────────────────────────────────────
// Replaces the static "Completed" KPI tile. The card mirrors the table's
// status select: when the operator changes the filter, this tile re-labels
// itself and recomputes count + total value for the active status. The
// `deals` prop is already scoped by the active filter, so we just aggregate.
const STATUS_ACCENTS = {
  ALL:        '#1A2E82',
  OPEN:       '#6B7280',
  MATCHED:    '#3B82F6',
  PICKED_UP:  '#6366F1',
  IN_TRANSIT: '#D97706',
  DELIVERED:  '#0D9488',
  COMPLETED:  '#059669',
  CANCELLED:  '#DC2626',
  DISPUTED:   '#EA580C',
}

function ActiveStatusCard({ deals, status, currency = 'USD' }) {
  const count   = deals.length
  const value   = deals.reduce((s, d) => s + (d.price ?? 0), 0)
  const accent  = STATUS_ACCENTS[status] ?? '#1A2E82'
  const label   = status === 'ALL' ? 'Active Status' : (STATUS_MAP[status]?.label ?? status)
  const sublabel = status === 'ALL' ? 'All statuses · pick one in the filter' : 'Mirrors the status filter'

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
      <div style={{ backgroundColor: accent, height: 3 }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-2">
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant truncate">
            {label}
          </span>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: accent + '1A' }}
          >
            <Activity className="w-4 h-4" style={{ color: accent }} />
          </div>
        </div>
        <div className="flex items-baseline gap-2 mb-1 flex-wrap">
          <span className="text-[22px] font-semibold text-on-surface leading-tight tabular-nums">{count}</span>
          <span className="text-[11px] text-on-surface-variant">
            · {currency} {Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
        </div>
        <p className="text-[11px] text-on-surface-variant">{sublabel}</p>
      </div>
    </div>
  )
}

// ── Financial Evolution chart (replaces the legacy stacked-bar FundsFlow) ────
// Visualises the temporal evolution of cash flow as a stacked area chart.
// Supports two granularities: last 30 days (daily buckets) and last 12 months
// (monthly buckets). Buckets are computed on the loaded deals only — see the
// InfoTip for the exact aggregation contract.
function FinancialEvolution({ deals }) {
  const [range, setRange] = useState('30d') // '30d' | '12m'
  // Multi-toggle: each series is independently visible. Defaults to all-on so
  // the card matches its previous behaviour. Clicking a button hides the
  // corresponding stream from the chart and the matching deal rows from the
  // transaction list — clicking again restores it.
  const [series, setSeries] = useState({ held: true, released: true, refunded: true })
  const toggle = (key) => setSeries(s => ({ ...s, [key]: !s[key] }))
  const anyActive = series.held || series.released || series.refunded
  const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x }
  const startOfMonth = d => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(1); return x }

  const data = useMemo(() => {
    const now = new Date()
    if (range === '30d') {
      const today = startOfDay(now)
      const buckets = Array.from({ length: 30 }, (_, i) => {
        const dt = new Date(today.getTime() - (29 - i) * 86400000)
        return { key: dt.getTime(), label: dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), held: 0, released: 0, refunded: 0 }
      })
      const byKey = new Map(buckets.map(b => [b.key, b]))
      deals.forEach(d => {
        const k = startOfDay(d.createdAt).getTime()
        const b = byKey.get(k)
        if (!b) return
        const amt = d.price ?? 0
        if (d.status === 'COMPLETED') b.released += amt
        else if (d.status === 'CANCELLED') b.refunded += amt
        else if (ESCROW_STATUSES.has(d.status)) b.held += amt
      })
      return buckets
    }
    // 12 months
    const thisMonth = startOfMonth(now)
    const buckets = Array.from({ length: 12 }, (_, i) => {
      const dt = new Date(thisMonth)
      dt.setMonth(thisMonth.getMonth() - (11 - i))
      return { key: dt.getTime(), label: dt.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }), held: 0, released: 0, refunded: 0 }
    })
    const byKey = new Map(buckets.map(b => [b.key, b]))
    deals.forEach(d => {
      const k = startOfMonth(d.createdAt).getTime()
      const b = byKey.get(k)
      if (!b) return
      const amt = d.price ?? 0
      if (d.status === 'COMPLETED') b.released += amt
      else if (d.status === 'CANCELLED') b.refunded += amt
      else if (ESCROW_STATUSES.has(d.status)) b.held += amt
    })
    return buckets
  }, [deals, range])

  const fmt = (v) => `$${Number(v).toLocaleString()}`

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            Financial Evolution
            <InfoTip>
              <strong>Source:</strong> deals in the current view bucketed by <code>createdAt</code>.<br />
              <strong>Logic:</strong> daily (30d) or monthly (12m) buckets; each deal's <code>price</code> is added to <em>Held</em> if its status is in escrow ({Array.from(ESCROW_STATUSES).join(', ')}), <em>Released</em> if COMPLETED, <em>Refunded</em> if CANCELLED.<br />
              <strong>Why it matters:</strong> reveals cash-flow trends over time — a falling Held line with a rising Released line is healthy; rising Refunded is not.
            </InfoTip>
          </h3>
          <p className="text-xs text-on-surface-variant">Temporal evolution of escrow funds · based on visible deals</p>
        </div>
        <div className="flex bg-surface-container rounded-lg p-0.5 text-[11px]">
          {[['30d', '30 days'], ['12m', '12 months']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setRange(v)}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${range === v ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Series toggles — each filters its own area in the chart and its deal
          rows in the transaction list below. Buttons render in colour-matched
          dots so the active stream maps visually to the chart fill. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {[
          { key: 'released', label: 'Released', color: '#059669', bg: 'bg-emerald-50',  text: 'text-emerald-700', ring: 'ring-emerald-300' },
          { key: 'refunded', label: 'Refunded', color: '#DC2626', bg: 'bg-red-50',      text: 'text-red-700',     ring: 'ring-red-300' },
          { key: 'held',     label: 'Held',     color: '#D97706', bg: 'bg-amber-50',    text: 'text-amber-700',   ring: 'ring-amber-300' },
        ].map(s => {
          const active = series[s.key]
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all border ${
                active
                  ? `${s.bg} ${s.text} border-transparent ring-1 ${s.ring}`
                  : 'bg-surface-container text-on-surface-variant border-surface-container-high hover:bg-surface-container-high'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: active ? s.color : '#94A3B8' }}
              />
              {s.label}
            </button>
          )
        })}
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gHeld" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D97706" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#D97706" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gReleased" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gRefunded" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#DC2626" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#DC2626" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmt} width={70} />
            <Tooltip formatter={(v, name) => [fmt(v), name]} cursor={{ stroke: '#94A3B8', strokeDasharray: '3 3' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            {series.held     && <Area type="monotone" dataKey="held"     name="Held"     stroke="#D97706" fill="url(#gHeld)"     stackId="1" />}
            {series.released && <Area type="monotone" dataKey="released" name="Released" stroke="#059669" fill="url(#gReleased)" stackId="1" />}
            {series.refunded && <Area type="monotone" dataKey="refunded" name="Refunded" stroke="#DC2626" fill="url(#gRefunded)" stackId="1" />}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Transaction list — same filter contract as the chart. Helps the
          operator drill from the trend into the individual deals that
          contributed to the active stream(s). */}
      <FinancialTransactionList deals={deals} series={series} anyActive={anyActive} />
    </div>
  )
}

// Map each loaded deal to one of the three financial states the chart tracks.
// Anything outside the three buckets (e.g. OPEN, MATCHED with no escrow yet) is
// `null` and gets filtered out of the list.
function classifyDealStream(deal) {
  if (deal.status === 'COMPLETED') return 'released'
  if (deal.status === 'CANCELLED') return 'refunded'
  if (ESCROW_STATUSES.has(deal.status)) return 'held'
  return null
}

const STREAM_META = {
  held:     { label: 'Held',     dot: 'bg-amber-500',   text: 'text-amber-700' },
  released: { label: 'Released', dot: 'bg-emerald-500', text: 'text-emerald-700' },
  refunded: { label: 'Refunded', dot: 'bg-red-500',     text: 'text-red-700' },
}

function FinancialTransactionList({ deals, series, anyActive }) {
  const rows = useMemo(() => {
    if (!anyActive) return []
    return deals
      .map(d => ({ deal: d, stream: classifyDealStream(d) }))
      .filter(r => r.stream && series[r.stream])
      .sort((a, b) => new Date(b.deal.createdAt) - new Date(a.deal.createdAt))
      .slice(0, 50)
  }, [deals, series, anyActive])

  return (
    <div className="mt-4 border-t border-surface-container-high pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60">
          Matching transactions
        </p>
        <span className="text-[10px] text-on-surface-variant tabular-nums">{rows.length}</span>
      </div>
      {!anyActive ? (
        <div className="py-4 text-center text-[11px] text-on-surface-variant">
          Pick a stream above to see its transactions
        </div>
      ) : rows.length === 0 ? (
        <div className="py-4 text-center text-[11px] text-on-surface-variant">No transactions match the active streams</div>
      ) : (
        <ul className="divide-y divide-surface-container max-h-44 overflow-y-auto">
          {rows.map(({ deal, stream }) => {
            const meta = STREAM_META[stream]
            return (
              <li key={deal.id} className="py-2 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${meta.dot}`} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-on-surface truncate">
                      #{deal.id.slice(-8)} · {deal.fromCity} → {deal.toCity}
                    </p>
                    <p className="text-[10px] text-on-surface-variant">
                      <span className={`font-semibold ${meta.text}`}>{meta.label}</span>
                      {' · '}{new Date(deal.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-on-surface tabular-nums whitespace-nowrap">
                  {deal.currency ?? 'USD'} {Number(deal.price ?? 0).toLocaleString()}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Quick Actions panel ───────────────────────────────────────────────────────
function QuickActions({ tx, onRelease, onRefund }) {
  if (!tx) return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-6 flex flex-col items-center justify-center h-64">
      <Lock className="w-10 h-10 text-on-surface-variant/30 mb-3" />
      <p className="text-sm text-on-surface-variant text-center">Select a transaction to view quick actions</p>
    </div>
  )

  const amount  = tx.price ?? 0
  const fee     = Math.round(amount * 0.04)
  const logic   = Math.round(amount * 0.12)
  const insur   = Math.round(amount * 0.015)
  const total   = amount + fee + logic + insur
  const inEscrow = ESCROW_STATUSES.has(tx.status)

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5 space-y-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60">Deal Card</p>
        <p className="text-base font-semibold text-on-surface mt-1">Deal #{tx.id.slice(-8)}</p>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-sm font-semibold text-on-surface">{tx.fromCity}</span>
          <ChevronRight className="w-3 h-3 text-on-surface-variant" />
          <span className="text-sm font-semibold text-on-surface">{tx.toCity}</span>
        </div>
        <p className="text-xs text-on-surface-variant mt-1">
          {tx.sender?.name ?? 'Unknown sender'} · {new Date(tx.createdAt).toLocaleDateString()}
        </p>
      </div>

      {/* Fee breakdown */}
      <div className="border-t border-surface-container-high pt-3 space-y-1.5 text-sm">
        <p className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/60 mb-2">Fee Breakdown</p>
        {[
          ['Item Value',               `${tx.currency} ${amount.toLocaleString()}`],
          ['Service Fee (4%)',         `${tx.currency} ${fee.toLocaleString()}`],
          ['Logistics & Freight (12%)',`${tx.currency} ${logic.toLocaleString()}`],
          ['Insurance (1.5%)',         `${tx.currency} ${insur.toLocaleString()}`],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between">
            <span className="text-on-surface-variant">{k}</span>
            <span className="text-on-surface">{v}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-surface-container-high pt-1.5 mt-1">
          <span className="font-semibold text-on-surface">Total Payable</span>
          <span className="font-bold text-on-surface text-base">{tx.currency} {total.toLocaleString()}</span>
        </div>
      </div>

      {inEscrow && (
        <div className="bg-[#1A2E82]/8 border border-[#1A2E82]/20 rounded-lg p-3 text-xs text-on-surface-variant leading-relaxed">
          Funds are secured in <strong className="text-on-surface">Bridger Escrow</strong>. Release only upon confirmed delivery.
        </div>
      )}

      {/* Action buttons */}
      <div className="space-y-2">
        <button
          onClick={() => onRelease(tx)}
          disabled={!inEscrow}
          className="w-full py-2.5 text-sm font-semibold monolith-gradient text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Release Funds
        </button>
        <button
          onClick={() => onRefund(tx)}
          disabled={tx.status === 'CANCELLED' || tx.status === 'COMPLETED'}
          className="w-full py-2.5 text-sm font-semibold border border-red-300 text-red-600 rounded-xl hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Issue Refund
        </button>
        <p className="text-[10px] text-on-surface-variant text-center">Initiating a refund will notify all parties involved.</p>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function DealsEscrow() {
  const isXl = useIsXl()
  const [selected,     setSelected]   = useState(null)
  const [confirm,      setConfirm]    = useState(null)
  const [statusFilter, setFilter]     = useState('ALL')
  const [searchInput,  setSearchInput] = useState('')
  const [search,       setSearch]      = useState('')
  const [deals,        setDeals]      = useState([])
  const [loading,      setLoading]    = useState(true)
  const [error,        setError]      = useState(null)
  // Detail surfaces. On xl+ screens the inline side panel renders next to the
  // table; on smaller screens we route the same "open detail" intent to the
  // centered modal so the table keeps its full width.
  const [modalDeal,    setModalDeal]   = useState(null)
  const [panelDeal,    setPanelDeal]   = useState(null)
  const [page,         setPage]        = useState(1)
  const perPage = 10

  // Debounce the search input so we don't recompute the filtered list on
  // every keystroke (the bottom modules read the same array).
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  // Reset to first page whenever filters change so the user doesn't land on
  // an empty page after the result set shrinks.
  useEffect(() => { setPage(1) }, [search, statusFilter])

  // Fetch every deal once (no status param) and apply status + search
  // client-side. This keeps the Financial Evolution card pinned to the full
  // dataset regardless of what the table is filtered to. Backend caps `limit`
  // at 50, so loop until `hasMore` is false; safety cap of 20 iterations
  // (1000 records) prevents runaway loops on malformed responses.
  const fetchDeals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const limit = 50
      let pageNum = 1
      let hasMore = true
      let collected = []
      let safety = 20
      while (hasMore && safety > 0) {
        const params = new URLSearchParams({ page: String(pageNum), limit: String(limit) })
        const r = await api.get(`/deals?${params}`)
        collected = collected.concat(r.data.items ?? [])
        hasMore = !!r.data.hasMore
        pageNum += 1
        safety -= 1
      }
      setDeals(collected)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load deals.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  // Status + search filter, applied client-side over the full loaded set.
  // The unfiltered `deals` array is what feeds the Financial Evolution card
  // so it always reflects every record.
  const filteredDeals = useMemo(() => {
    let list = statusFilter === 'ALL' ? deals : deals.filter(d => d.status === statusFilter)
    if (search) {
      list = list.filter(d => {
        const hay = [
          d.id,
          d.fromCity, d.toCity, d.fromCountry, d.toCountry,
          d.sender?.name, d.traveler?.name, d.receiverName,
          d.title,
        ].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(search)
      })
    }
    return list
  }, [deals, statusFilter, search])

  // Client-side pagination: only the visible slice is rendered in the table,
  // but every aggregate (KPIs, bottom modules) is computed against the full
  // filtered list so counts stay correct across pages.
  const totalPages = Math.max(1, Math.ceil(filteredDeals.length / perPage))
  const safePage   = Math.min(page, totalPages)
  const pageDeals  = filteredDeals.slice((safePage - 1) * perPage, safePage * perPage)

  // ── KPI computations from the full filtered list (across all pages) ───
  const escrowDeals     = filteredDeals.filter(d => ESCROW_STATUSES.has(d.status))
  const totalVolume     = filteredDeals.reduce((s, d) => s + (d.price ?? 0), 0)
  // Beneficial value = platform revenue (4% service fee on all deal volume)
  const beneficialValue = Math.round(totalVolume * 0.04)

  // ── Release funds ──────────────────────────────────────────────────────
  function handleRelease(tx) {
    setConfirm({
      title: `Release Funds for Deal #${tx.id.slice(-8)}`,
      message: `Release ${tx.currency} ${tx.price?.toLocaleString()} to the traveler?\n\nThis calls POST /wallet/payout and cannot be undone.`,
      danger: false,
      onConfirm: async () => {
        try {
          await api.post('/wallet/payout', { dealId: tx.id })
          fetchDeals() // refresh list
        } catch (err) {
          setError(err.response?.data?.error || 'Payout failed. Check the logs.')
        } finally {
          setConfirm(null)
        }
      },
    })
  }

  // ── Issue refund ───────────────────────────────────────────────────────
  function handleRefund(tx) {
    setConfirm({
      title: `Issue Refund for Deal #${tx.id.slice(-8)}`,
      message: `Refund ${tx.currency} ${tx.price?.toLocaleString()} to the sender? This calls POST /wallet/refund and notifies all parties.`,
      danger: true,
      onConfirm: async () => {
        try {
          await api.post('/wallet/refund', { dealId: tx.id })
          fetchDeals()
        } catch (err) {
          setError(err.response?.data?.error || 'Refund failed. Check the logs.')
        } finally {
          setConfirm(null)
        }
      },
    })
  }

  const STATUS_OPTIONS = [
    ['ALL',        'All Statuses'],
    ['OPEN',       'Open'],
    ['MATCHED',    'Matched'],
    ['PICKED_UP',  'Picked Up'],
    ['IN_TRANSIT', 'In Transit'],
    ['DELIVERED',  'Delivered'],
    ['COMPLETED',  'Completed'],
    ['DISPUTED',   'Disputed'],
    ['CANCELLED',  'Cancelled'],
  ]

  // Row click. On xl+ this opens the inline side panel; on smaller screens
  // the table is full-width so we open the centered modal instead.
  const openDealDetail = (tx) => {
    setSelected(tx)
    if (isXl) {
      setPanelDeal(prev => (prev?.id === tx.id ? null : tx))
    } else {
      setModalDeal(tx)
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold text-on-surface">Transactions</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Monitor financial transactions, manage escrow, and handle disputes</p>
        </div>
        <div className="flex-shrink-0">
          <ExportButton />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* KPIs — Page Volume + Beneficial Value are merged into one unified card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <UnifiedVolumeCard
          className="sm:col-span-2 lg:col-span-2"
          totalVolume={totalVolume}
          beneficialValue={beneficialValue}
          currency="USD"
        />
        <KpiCard label="In Escrow" value={escrowDeals.length.toString()}    sublabel="Active transactions" changeType="neutral" icon={<Lock         className="w-4 h-4 text-amber-600" />}  accentColor="#D97706" />
        <ActiveStatusCard
          deals={filteredDeals}
          status={statusFilter}
          currency="USD"
        />
      </div>

      {/* Main content + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4 min-w-0">
          {/* Search bar + status filter — adjacent on every viewport, stacking
              only when the screen is too narrow for both inputs to coexist. */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
              <input
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search deal ID, route, sender or receiver…"
                className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
              />
            </div>
            <div className="relative w-full sm:w-auto">
              <select
                value={statusFilter}
                onChange={e => setFilter(e.target.value)}
                className="appearance-none w-full sm:w-auto bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-8 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
                aria-label="Filter deals by status"
              >
                {STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant pointer-events-none" />
            </div>
            {!loading && (
              <span className="text-xs text-on-surface-variant tabular-nums whitespace-nowrap sm:ml-1">
                {filteredDeals.length} {filteredDeals.length === 1 ? 'record' : 'records'}
              </span>
            )}
          </div>

          {/* Table card + inline detail panel — coexist side-by-side at xl+
              and stack via the modal on smaller viewports so the table keeps
              its full width on phone and tablet. */}
          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-0 bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
              {loading ? (
                <div className="py-20 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-container-low/40">
                      <tr>
                        {['Deal ID', 'Route', 'Amount', 'Status', 'Sender', ''].map(h => (
                          <th key={h} className="px-3 sm:px-5 py-3.5 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {pageDeals.map(tx => {
                        const stat       = STATUS_MAP[tx.status]
                        const isSelected = selected?.id === tx.id
                        const isOpen     = isXl && panelDeal?.id === tx.id
                        const handleToggle = (e) => {
                          e.stopPropagation()
                          openDealDetail(tx)
                        }
                        return (
                          <tr
                            key={tx.id}
                            onClick={handleToggle}
                            className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors cursor-pointer ${isSelected || isOpen ? 'bg-primary/5' : ''}`}
                          >
                            <td className="px-3 sm:px-5 py-4 text-sm font-semibold text-primary-container whitespace-nowrap">#{tx.id.slice(-8)}</td>
                            <td className="px-3 sm:px-5 py-4">
                              <span className="text-sm font-semibold text-on-surface whitespace-nowrap">{tx.fromCity} → {tx.toCity}</span>
                            </td>
                            <td className="px-3 sm:px-5 py-4 whitespace-nowrap">
                              <p className="text-sm font-bold text-on-surface">{tx.currency} {Number(tx.price ?? 0).toLocaleString()}</p>
                              <p className="text-xs text-on-surface-variant">{tx.packageSize ?? '—'}</p>
                            </td>
                            <td className="px-3 sm:px-5 py-4">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${stat?.cls ?? 'bg-gray-100 text-gray-600'}`}>{stat?.label ?? tx.status}</span>
                            </td>
                            <td className="px-3 sm:px-5 py-4">
                              <span className="text-xs text-on-surface-variant whitespace-nowrap">{tx.sender?.name ?? '—'}</span>
                            </td>
                            <td className="px-3 sm:px-5 py-4 text-right">
                              <button
                                onClick={handleToggle}
                                className={`p-1.5 rounded-lg transition-colors ${isOpen ? 'bg-primary/10 text-primary' : 'hover:bg-surface-container-high text-on-surface-variant'}`}
                                title={isOpen ? 'Close detail panel' : 'Open detail'}
                                aria-label={isOpen ? `Close detail for deal ${tx.id.slice(-8)}` : `Open detail for deal ${tx.id.slice(-8)}`}
                                aria-expanded={isOpen}
                              >
                                <ChevronRight className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!loading && filteredDeals.length === 0 && !error && (
                <div className="py-16 text-center">
                  <Package className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
                  <p className="text-sm text-on-surface-variant">
                    {search || statusFilter !== 'ALL'
                      ? 'No deals match your filters'
                      : 'No deals found'}
                  </p>
                  {(search || statusFilter !== 'ALL') && (
                    <button
                      onClick={() => { setSearchInput(''); setFilter('ALL') }}
                      className="text-xs text-primary-container mt-2 hover:underline"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              )}

              {!loading && filteredDeals.length > 0 && (
                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  total={filteredDeals.length}
                  perPage={perPage}
                  onPage={p => setPage(p)}
                />
              )}
            </div>

            {/* Sliding side detail panel — its own flex item next to the table.
                Only rendered at xl+ where there's room; smaller viewports use
                the centered modal driven by `modalDeal`. */}
            {isXl && (
              <aside
                aria-hidden={!panelDeal}
                className={`flex-shrink-0 transition-[width,opacity] duration-300 ease-out overflow-hidden self-stretch ${
                  panelDeal ? 'w-[400px] opacity-100' : 'w-0 opacity-0 pointer-events-none'
                }`}
              >
                <div className={`h-full transition-transform duration-300 ease-out ${panelDeal ? 'translate-x-0' : 'translate-x-4'}`}>
                  <DealDetailPanel deal={panelDeal} onClose={() => setPanelDeal(null)} />
                </div>
              </aside>
            )}
          </div>

          {/* Operational modules — bottom four cards. The two list-based cards
              double-publish their selection into Quick Actions and into the
              detail modal so a single click serves both surfaces. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* The three analytic cards below are pinned to the full loaded
                set — independent of the table's status filter — so the
                operator can scan operational signals without losing them
                when the table is scoped to a specific status. */}
            <PendingPayouts deals={deals} onSelect={(d) => { setSelected(d); setModalDeal(d) }} />
            <DisputeAging   deals={deals} onSelect={(d) => { setSelected(d); setModalDeal(d) }} />
            <div className="md:col-span-2">
              <FinancialEvolution deals={deals} />
            </div>
          </div>
        </div>

        {/* Quick Actions panel */}
        <div>
          <QuickActions tx={selected} onRelease={handleRelease} onRefund={handleRefund} />
        </div>
      </div>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.danger ? 'Issue Refund' : 'Release Funds'}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />

      <DealDetailModal
        open={!!modalDeal}
        deal={modalDeal}
        onClose={() => setModalDeal(null)}
      />
    </div>
  )
}
