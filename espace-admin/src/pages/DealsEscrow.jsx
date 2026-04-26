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
  CreditCard, Landmark, Wallet, ChevronDown, ChevronRight,
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

// ── Mediterranean Map (unchanged UI) ─────────────────────────────────────────
const PORTS = [
  { name: 'Tunis',     x: 51, y: 47 },
  { name: 'Marseille', x: 40, y: 32 },
  { name: 'Sfax',      x: 52, y: 52 },
  { name: 'Valencia',  x: 28, y: 36 },
  { name: 'Bizerte',   x: 50, y: 44 },
  { name: 'Algiers',   x: 41, y: 44 },
  { name: 'Genoa',     x: 43, y: 30 },
]

function MedMap() {
  const [hovered, setHovered] = useState(null)
  return (
    <div className="relative w-full h-56 bg-gradient-to-b from-blue-50 to-blue-100 rounded-xl overflow-hidden border border-blue-200">
      <svg viewBox="0 0 100 70" className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <ellipse cx="50" cy="55" rx="8" ry="5" fill="#e8d5b7" stroke="#d4b896" strokeWidth="0.3" opacity="0.8" />
        <ellipse cx="42" cy="48" rx="5" ry="3" fill="#e8d5b7" stroke="#d4b896" strokeWidth="0.3" opacity="0.8" />
        <ellipse cx="44" cy="26" rx="12" ry="8" fill="#e8d5b7" stroke="#d4b896" strokeWidth="0.3" opacity="0.8" />
        <ellipse cx="28" cy="38" rx="7" ry="5" fill="#e8d5b7" stroke="#d4b896" strokeWidth="0.3" opacity="0.8" />
        {[[51,47,40,32],[51,47,43,30],[51,47,28,36],[52,52,40,32],[41,44,40,32],[51,47,41,44]].map((line, i) => (
          <line key={i} x1={line[0]} y1={line[1]} x2={line[2]} y2={line[3]} stroke="#3B82F6" strokeWidth="0.3" strokeDasharray="1,1" opacity="0.5" />
        ))}
        {PORTS.map(p => (
          <g key={p.name} onMouseEnter={() => setHovered(p)} onMouseLeave={() => setHovered(null)} style={{ cursor: 'pointer' }}>
            <circle cx={p.x} cy={p.y} r="1.8" fill="#1A2E82" opacity="0.85" />
            <circle cx={p.x} cy={p.y} r="3.5" fill="#1A2E82" opacity="0.15" />
          </g>
        ))}
      </svg>
      {hovered && (
        <div className="absolute top-2 left-2 bg-white rounded-lg shadow-lg px-3 py-2 text-xs border border-surface-container-high">
          <p className="font-semibold text-on-surface">{hovered.name}</p>
        </div>
      )}
      <div className="absolute bottom-2 right-2 flex items-center gap-3 bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 text-[10px]">
        <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-[#1A2E82]" /> Active Deals</div>
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
  const escrowDeals    = deals.filter(d => ESCROW_STATUSES.has(d.status))
  const completedDeals = deals.filter(d => d.status === 'COMPLETED')
  const disputedDeals  = deals.filter(d => d.status === 'DISPUTED')
  const totalVolume    = deals.reduce((s, d) => s + (d.price ?? 0), 0)

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
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Page Volume"     value={`$${totalVolume.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} changeType="neutral" icon={<DollarSign  className="w-4 h-4 text-blue-600" />}   accentColor="#3B82F6" />
        <KpiCard label="In Escrow"       value={escrowDeals.length.toString()}    sublabel="Active transactions" changeType="neutral" icon={<Lock         className="w-4 h-4 text-amber-600" />}  accentColor="#D97706" />
        <KpiCard label="Completed"       value={completedDeals.length.toString()} sublabel="This page"           changeType="neutral" icon={<Package      className="w-4 h-4 text-emerald-600" />} accentColor="#059669" />
        <KpiCard label="Disputed"        value={disputedDeals.length.toString()}  sublabel="Open cases"          changeType="neutral" icon={<AlertTriangle className="w-4 h-4 text-red-600" />}   accentColor="#DC2626" />
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

          {/* Mediterranean Map */}
          <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-on-surface">Live Logistics Intelligence</h3>
              <p className="text-xs text-on-surface-variant">Mediterranean Corridor Activity</p>
            </div>
            <MedMap />
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
