/**
 * DealsEscrow.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Removed hardcoded TRANSACTIONS array; data is fetched from GET /deals
 *   with status filter query params.
 * - Status filter buttons pass the backend status values (OPEN, MATCHED,
 *   PICKED_UP, IN_TRANSIT, DELIVERED, COMPLETED, CANCELLED, DISPUTED).
 * - "Release Funds" calls POST /wallet/payout (admin triggers the transfer).
 * - "Issue Refund" calls POST /wallet/refund with the deal id.
 * - KPI cards (total volume, pending escrow, settled, disputes) are computed
 *   from the loaded deal list; they refresh on filter change.
 * - Loading and error states added throughout.
 */
import React, { useState, useEffect, useCallback } from 'react'
import {
  ChevronDown, ChevronRight, Clock, Send, TrendingUp, Coins,
  Lock, DollarSign, Package, AlertTriangle, Loader2, AlertCircle,
} from 'lucide-react'
import KpiCard from '../components/shared/KpiCard'
import StatusBadge from '../components/shared/StatusBadge'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import ExportButton from '../components/shared/ExportButton'
import api from '../services/api'

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

// ── Dual-metric KPI card (Page Volume vs. Beneficial Value) ──────────────────
function DualKpiCard({ left, right, className = '' }) {
  return (
    <div className={`bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden ${className}`}>
      <div className="flex h-[3px]">
        <div className="flex-1" style={{ backgroundColor: left.color }} />
        <div className="flex-1" style={{ backgroundColor: right.color }} />
      </div>
      <div className="grid grid-cols-2 divide-x divide-surface-container-high">
        {[left, right].map((m, i) => (
          <div key={i} className="p-5">
            <div className="flex items-start justify-between mb-3">
              <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant">{m.label}</span>
              {m.icon && (
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: m.color + '1A' }}>
                  {m.icon}
                </div>
              )}
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-[22px] font-semibold text-on-surface leading-tight">{m.value}</span>
            </div>
            {m.sublabel && <span className="text-[11px] text-on-surface-variant">{m.sublabel}</span>}
          </div>
        ))}
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

// ── Deal Status Funnel ───────────────────────────────────────────────────────
function StatusFunnel({ deals }) {
  const stages = [
    { key: 'OPEN',       label: 'Open',       color: '#6B7280' },
    { key: 'MATCHED',    label: 'Matched',    color: '#3B82F6' },
    { key: 'IN_TRANSIT', label: 'In Transit', color: '#D97706' },
    { key: 'DELIVERED',  label: 'Delivered',  color: '#0D9488' },
    { key: 'COMPLETED',  label: 'Completed',  color: '#059669' },
  ]
  const counts = stages.map(s => deals.filter(d => d.status === s.key).length)
  const max = Math.max(...counts, 1)

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-on-surface">Deal Status Funnel</h3>
        <p className="text-xs text-on-surface-variant">Distribution across lifecycle stages</p>
      </div>
      <div className="space-y-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-3">
            <span className="w-20 text-[11px] text-on-surface-variant">{s.label}</span>
            <div className="flex-1 h-5 bg-surface-container-low/40 rounded-md overflow-hidden">
              <div
                className="h-full rounded-md transition-all"
                style={{ width: `${(counts[i] / max) * 100}%`, backgroundColor: s.color, opacity: 0.85 }}
              />
            </div>
            <span className="w-7 text-right text-xs font-semibold text-on-surface">{counts[i]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Escrow Funds Flow (7-day) ────────────────────────────────────────────────
function FundsFlow({ deals }) {
  const DAYS = 7
  const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x.getTime() }
  const today = startOfDay(new Date())

  const buckets = Array.from({ length: DAYS }, (_, i) => {
    const ts = today - (DAYS - 1 - i) * 86400000
    return { ts, held: 0, released: 0, refunded: 0 }
  })

  deals.forEach(d => {
    const ts = startOfDay(d.createdAt)
    const b = buckets.find(b => b.ts === ts)
    if (!b) return
    const amt = d.price ?? 0
    if (d.status === 'COMPLETED') b.released += amt
    else if (d.status === 'CANCELLED') b.refunded += amt
    else if (ESCROW_STATUSES.has(d.status)) b.held += amt
  })

  const max = Math.max(...buckets.map(b => b.held + b.released + b.refunded), 1)

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-on-surface flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-600" />
          Escrow Funds Flow
        </h3>
        <p className="text-xs text-on-surface-variant">Last 7 days · based on visible deals</p>
      </div>
      <div className="flex items-end gap-1.5 h-28 mb-2">
        {buckets.map(b => (
          <div
            key={b.ts}
            className="flex-1 flex flex-col-reverse gap-0.5"
            title={`Held ${b.held.toLocaleString()} · Released ${b.released.toLocaleString()} · Refunded ${b.refunded.toLocaleString()}`}
          >
            <div style={{ height: `${(b.held / max) * 100}%`, backgroundColor: '#D97706' }} className="rounded-sm" />
            <div style={{ height: `${(b.released / max) * 100}%`, backgroundColor: '#059669' }} className="rounded-sm" />
            <div style={{ height: `${(b.refunded / max) * 100}%`, backgroundColor: '#DC2626' }} className="rounded-sm" />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-on-surface-variant mb-3">
        {buckets.map(b => (
          <span key={b.ts} className="flex-1 text-center">
            {new Date(b.ts).toLocaleDateString(undefined, { weekday: 'short' })}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-amber-600" /><span className="text-on-surface-variant">Held</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-emerald-600" /><span className="text-on-surface-variant">Released</span></div>
        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-sm bg-red-600" /><span className="text-on-surface-variant">Refunded</span></div>
      </div>
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
  const [page,         setPage]       = useState(1)
  const [selected,     setSelected]   = useState(null)
  const [expanded,     setExpanded]   = useState(null)
  const [confirm,      setConfirm]    = useState(null)
  const [statusFilter, setFilter]     = useState('ALL')
  const [deals,        setDeals]      = useState([])
  const [total,        setTotal]      = useState(0)
  const [loading,      setLoading]    = useState(true)
  const [error,        setError]      = useState(null)

  const perPage = 10

  const fetchDeals = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page, limit: perPage })
    if (statusFilter !== 'ALL') params.set('status', statusFilter)
    api.get(`/deals?${params}`)
      .then(r => { setDeals(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load deals.'))
      .finally(() => setLoading(false))
  }, [page, statusFilter])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  // ── KPI computations from loaded page ─────────────────────────────────
  const escrowDeals     = deals.filter(d => ESCROW_STATUSES.has(d.status))
  const completedDeals  = deals.filter(d => d.status === 'COMPLETED')
  const disputedDeals   = deals.filter(d => d.status === 'DISPUTED')
  const totalVolume     = deals.reduce((s, d) => s + (d.price ?? 0), 0)
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

  const FILTER_TABS = ['ALL', 'MATCHED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'DISPUTED', 'CANCELLED']

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Transactions</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Monitor financial transactions, manage escrow, and handle disputes</p>
        </div>
        <ExportButton />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-4">
        <DualKpiCard
          className="col-span-2"
          left={{
            label:    'Page Volume',
            value:    `$${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            sublabel: 'Gross deal value',
            icon:     <DollarSign className="w-4 h-4 text-blue-600" />,
            color:    '#3B82F6',
          }}
          right={{
            label:    'Beneficial Value',
            value:    `$${beneficialValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
            sublabel: 'Platform fees · 4%',
            icon:     <Coins className="w-4 h-4 text-emerald-600" />,
            color:    '#059669',
          }}
        />
        <KpiCard label="In Escrow" value={escrowDeals.length.toString()}    sublabel="Active transactions" changeType="neutral" icon={<Lock         className="w-4 h-4 text-amber-600" />}  accentColor="#D97706" />
        <KpiCard label="Completed" value={completedDeals.length.toString()} sublabel="This page"           changeType="neutral" icon={<Package      className="w-4 h-4 text-emerald-600" />} accentColor="#059669" />
        <KpiCard label="Disputed"  value={disputedDeals.length.toString()}  sublabel="Open cases"          changeType="neutral" icon={<AlertTriangle className="w-4 h-4 text-red-600" />}   accentColor="#DC2626" />
      </div>

      {/* Main content + quick actions */}
      <div className="grid grid-cols-[1fr_300px] gap-4">
        <div className="space-y-4">
          {/* Status filter tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {FILTER_TABS.map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1) }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${statusFilter === f ? 'bg-[#1A2E82] text-white' : 'bg-surface-container-lowest border border-surface-container-high text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                {f === 'ALL' ? 'All' : STATUS_MAP[f]?.label ?? f}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
            {loading ? (
              <div className="py-20 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="bg-surface-container-low/40">
                  <tr>
                    {['Deal ID', 'Route', 'Amount', 'Status', 'Sender', ''].map(h => (
                      <th key={h} className="px-5 py-3.5 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deals.map(tx => {
                    const stat      = STATUS_MAP[tx.status]
                    const isExpanded = expanded === tx.id
                    const isSelected = selected?.id === tx.id
                    return (
                      <React.Fragment key={tx.id}>
                        <tr
                          onClick={() => { setSelected(isSelected ? null : tx); setExpanded(null) }}
                          className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors cursor-pointer ${isSelected ? 'bg-primary/5' : ''}`}
                        >
                          <td className="px-5 py-4 text-sm font-semibold text-primary-container">#{tx.id.slice(-8)}</td>
                          <td className="px-5 py-4">
                            <span className="text-sm font-semibold text-on-surface">{tx.fromCity} → {tx.toCity}</span>
                          </td>
                          <td className="px-5 py-4">
                            <p className="text-sm font-bold text-on-surface">{tx.currency} {Number(tx.price ?? 0).toLocaleString()}</p>
                            <p className="text-xs text-on-surface-variant">{tx.packageSize ?? '—'}</p>
                          </td>
                          <td className="px-5 py-4">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stat?.cls ?? 'bg-gray-100 text-gray-600'}`}>{stat?.label ?? tx.status}</span>
                          </td>
                          <td className="px-5 py-4">
                            <span className="text-xs text-on-surface-variant">{tx.sender?.name ?? '—'}</span>
                          </td>
                          <td className="px-5 py-4">
                            <button
                              onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : tx.id) }}
                              className="p-1 hover:bg-surface-container-high rounded text-on-surface-variant transition-colors"
                            >
                              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${tx.id}-exp`} className="bg-surface-container-low/30 border-t border-surface-container">
                            <td colSpan={6} className="px-5 py-3">
                              <div className="flex flex-wrap gap-6 text-xs text-on-surface-variant">
                                <span>📦 {tx.title ?? tx.description ?? 'No title'}</span>
                                <span>⚖ Weight: <strong className="text-on-surface">{tx.weight ?? '—'}kg</strong></span>
                                <span>📅 Created: <strong className="text-on-surface">{new Date(tx.createdAt).toLocaleDateString()}</strong></span>
                                {tx.traveler && <span>🧳 Traveler: <strong className="text-on-surface">{tx.traveler.name}</strong></span>}
                                {tx.receiverName && <span>👤 Receiver: <strong className="text-on-surface">{tx.receiverName}</strong></span>}
                                {tx.receiverPhone && <span>📞 Receiver Phone: <strong className="text-on-surface">{tx.receiverPhone}</strong></span>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}

            {!loading && deals.length === 0 && !error && (
              <div className="py-16 text-center">
                <Package className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
                <p className="text-sm text-on-surface-variant">No deals found for this filter</p>
              </div>
            )}

            <Pagination
              page={page}
              totalPages={Math.ceil(total / perPage) || 1}
              total={total}
              perPage={perPage}
              onPage={p => setPage(p)}
            />
          </div>

          {/* Operational modules */}
          <div className="grid grid-cols-2 gap-4">
            <PendingPayouts deals={deals} onSelect={setSelected} />
            <DisputeAging   deals={deals} onSelect={setSelected} />
            <StatusFunnel   deals={deals} />
            <FundsFlow      deals={deals} />
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
    </div>
  )
}
