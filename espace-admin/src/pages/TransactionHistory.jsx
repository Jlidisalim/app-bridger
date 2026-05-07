import React, { useState, useEffect } from 'react'
import {
  CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Loader2,
  ChevronDown, ChevronRight, RefreshCw, Search, FileText, Tag,
  ArrowRight, Lock, Unlock, ArrowDownToLine, ArrowUpFromLine,
  Send, Undo2, Building2, Wallet, Copy, ExternalLink, MapPin,
} from 'lucide-react'
import Pagination from '../components/shared/Pagination'
import api from '../services/api'

const STATUS_BADGE = {
  PENDING:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED:    'bg-red-100 text-red-700',
  REFUNDED:  'bg-purple-100 text-purple-700',
}

// Each transaction type carries a semantic flow descriptor used by the
// expandable detail view to render the "from → to → why" lifecycle.
//   category   — high-level bucket shown as a chip in the row
//   from / to  — placeholder labels resolved at render time against the
//                transaction's user, deal sender, deal traveler, and stripe id
//   icon       — directional glyph in the type column
const TX_META = {
  DEPOSIT: {
    label: 'Deposit',
    category: 'External Payment',
    categoryCls: 'bg-sky-50 text-sky-700 border-sky-200',
    fromKind: 'stripe',
    toKind: 'user',
    icon: ArrowDownToLine,
    direction: 'in',
    description: 'Funds moved from an external payment method into the user wallet.',
  },
  WITHDRAWAL: {
    label: 'Withdrawal',
    category: 'External Payment',
    categoryCls: 'bg-sky-50 text-sky-700 border-sky-200',
    fromKind: 'user',
    toKind: 'bank',
    icon: ArrowUpFromLine,
    direction: 'out',
    description: 'Funds moved from the user wallet out to an external bank or payout method.',
  },
  ESCROW_HOLD: {
    label: 'Escrow Hold',
    category: 'Internal Transfer',
    categoryCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    fromKind: 'sender',
    toKind: 'escrow',
    icon: Lock,
    direction: 'out',
    description: 'Sender funds reserved in the platform escrow vault for the linked deal.',
  },
  ESCROW_RELEASE: {
    label: 'Escrow Release',
    category: 'Settlement',
    categoryCls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    fromKind: 'escrow',
    toKind: 'traveler',
    icon: Unlock,
    direction: 'in',
    description: 'Escrowed funds released to the traveler upon delivery confirmation.',
  },
  PAYMENT: {
    label: 'Payment',
    category: 'Internal Transfer',
    categoryCls: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    fromKind: 'user',
    toKind: 'platform',
    icon: Send,
    direction: 'out',
    description: 'Direct payment booked against the user wallet (fees, top-ups, or service charges).',
  },
  REFUND: {
    label: 'Refund',
    category: 'Refund',
    categoryCls: 'bg-purple-50 text-purple-700 border-purple-200',
    fromKind: 'escrow',
    toKind: 'user',
    icon: Undo2,
    direction: 'in',
    description: 'Funds returned to the user wallet, typically following a cancellation or dispute resolution.',
  },
}

const FALLBACK_META = {
  label: 'Other',
  category: 'Other',
  categoryCls: 'bg-gray-100 text-gray-700 border-gray-200',
  fromKind: 'unknown',
  toKind: 'unknown',
  icon: Tag,
  direction: 'in',
  description: 'Transaction type not recognised — review raw metadata for details.',
}

// Resolve a participant slot ("sender", "escrow", …) into a display object.
// Returns { name, sub, kind } so the From/To cells and detail panel render
// uniformly whether the counterparty is a user, the escrow vault, or Stripe.
function resolveParty(kind, tx) {
  switch (kind) {
    case 'user':
      return { name: tx.user?.name || 'Unknown User', sub: tx.userId?.slice(-8), kind: 'wallet' }
    case 'sender':
      return tx.deal?.sender
        ? { name: tx.deal.sender.name, sub: `Sender · ${tx.deal.sender.id.slice(-8)}`, kind: 'wallet' }
        : { name: tx.user?.name || 'Sender', sub: tx.userId?.slice(-8), kind: 'wallet' }
    case 'traveler':
      return tx.deal?.traveler
        ? { name: tx.deal.traveler.name, sub: `Traveler · ${tx.deal.traveler.id.slice(-8)}`, kind: 'wallet' }
        : { name: 'Traveler (unassigned)', sub: tx.dealId ? `Deal ${tx.dealId.slice(-6)}` : '—', kind: 'wallet' }
    case 'escrow':
      return { name: 'Platform Escrow', sub: tx.dealId ? `Deal ${tx.dealId.slice(-6)}` : 'No deal link', kind: 'escrow' }
    case 'stripe':
      return { name: 'Stripe Gateway', sub: tx.stripeId ? tx.stripeId.slice(0, 14) + '…' : 'External card / wallet', kind: 'external' }
    case 'bank':
      return { name: 'External Bank', sub: tx.stripeId ? `Payout · ${tx.stripeId.slice(-10)}` : 'Linked payout method', kind: 'external' }
    case 'platform':
      return { name: 'Bridger Platform', sub: 'Service ledger', kind: 'platform' }
    default:
      return { name: 'Unknown', sub: '—', kind: 'unknown' }
  }
}

const PARTY_BADGE = {
  wallet:   { icon: Wallet,    cls: 'bg-blue-50 text-blue-700' },
  escrow:   { icon: Lock,      cls: 'bg-indigo-50 text-indigo-700' },
  external: { icon: Building2, cls: 'bg-sky-50 text-sky-700' },
  platform: { icon: Building2, cls: 'bg-slate-100 text-slate-700' },
  unknown:  { icon: Tag,       cls: 'bg-gray-100 text-gray-600' },
}

function PartyChip({ party }) {
  const cfg = PARTY_BADGE[party.kind] || PARTY_BADGE.unknown
  const Icon = cfg.icon
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${cfg.cls}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-on-surface truncate">{party.name}</p>
        <p className="text-[10px] text-on-surface-variant font-mono truncate">{party.sub || '—'}</p>
      </div>
    </div>
  )
}

// Best-effort JSON parse for the Transaction.metadata blob (stored as text).
function parseMetadata(raw) {
  if (!raw) return null
  if (typeof raw === 'object') return raw
  try { return JSON.parse(raw) } catch { return { raw: String(raw) } }
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className="text-on-surface-variant hover:text-primary transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <CheckCircle className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function ReferenceRow({ label, value, mono = true }) {
  if (!value) return null
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-surface-container last:border-b-0">
      <span className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold">{label}</span>
      <span className="flex items-center gap-1.5 min-w-0 max-w-[60%]">
        <span className={`text-xs text-on-surface text-right truncate ${mono ? 'font-mono' : ''}`} title={String(value)}>{String(value)}</span>
        <CopyButton value={String(value)} />
      </span>
    </div>
  )
}

function TransactionDetail({ tx }) {
  const meta = TX_META[tx.type] || FALLBACK_META
  const fromParty = resolveParty(meta.fromKind, tx)
  const toParty   = resolveParty(meta.toKind, tx)
  const parsed    = parseMetadata(tx.metadata)
  const Icon      = meta.icon

  const route = tx.deal && (tx.deal.fromCity || tx.deal.toCity)
    ? `${tx.deal.fromCity || '—'}, ${tx.deal.fromCountry || ''} → ${tx.deal.toCity || '—'}, ${tx.deal.toCountry || ''}`
    : null

  return (
    <div className="bg-surface-container-low/30 border-t border-surface-container px-5 py-5">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Lifecycle: From → To ───────────────────────────────────────── */}
        <div className="lg:col-span-2 bg-surface-container-lowest rounded-xl border border-surface-container p-4">
          <div className="flex items-center gap-2 mb-3">
            <Icon className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-on-surface">Fund Movement</h4>
            <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full border ${meta.categoryCls}`}>
              {meta.category}
            </span>
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="bg-surface-container-low/50 rounded-lg p-3 border border-surface-container">
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold mb-2">Source</p>
              <PartyChip party={fromParty} />
            </div>

            <div className="flex flex-col items-center text-on-surface-variant">
              <ArrowRight className="w-5 h-5 text-primary" />
              <span className={`text-[11px] font-semibold mt-1 ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency || 'USD'}
              </span>
            </div>

            <div className="bg-surface-container-low/50 rounded-lg p-3 border border-surface-container">
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold mb-2">Destination</p>
              <PartyChip party={toParty} />
            </div>
          </div>

          <p className="text-xs text-on-surface-variant mt-4 leading-relaxed">{meta.description}</p>

          {tx.deal && (
            <div className="mt-4 pt-4 border-t border-surface-container">
              <p className="text-[10px] uppercase tracking-wider text-on-surface-variant font-semibold mb-2">Linked Deal</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-on-surface">
                <span className="font-medium">{tx.deal.title || 'Untitled deal'}</span>
                {route && (
                  <span className="flex items-center gap-1 text-on-surface-variant">
                    <MapPin className="w-3 h-3" /> {route}
                  </span>
                )}
                {tx.deal.status && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
                    {tx.deal.status}
                  </span>
                )}
                {tx.deal.price != null && (
                  <span className="text-on-surface-variant">
                    Deal value: {Number(tx.deal.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.deal.currency || 'USD'}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── References & metadata ─────────────────────────────────────── */}
        <div className="bg-surface-container-lowest rounded-xl border border-surface-container p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold text-on-surface">References</h4>
          </div>
          <ReferenceRow label="Transaction ID" value={tx.id} />
          <ReferenceRow label="Deal ID"        value={tx.dealId} />
          <ReferenceRow label="Stripe Ref"     value={tx.stripeId} />
          <ReferenceRow label="Currency"       value={tx.currency || 'USD'} mono={false} />
          <ReferenceRow label="Created"        value={tx.createdAt ? new Date(tx.createdAt).toLocaleString() : null} mono={false} />

          {parsed && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-on-surface-variant font-semibold mb-1.5">Metadata</p>
              {Object.keys(parsed).length === 0 ? (
                <p className="text-xs text-on-surface-variant italic">No metadata recorded.</p>
              ) : (
                <div className="bg-surface-container-low/40 rounded-lg p-2 space-y-1 max-h-40 overflow-y-auto">
                  {Object.entries(parsed).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-2 text-[11px]">
                      <span className="font-mono text-on-surface-variant">{k}</span>
                      <span className="font-mono text-on-surface text-right break-all max-w-[60%]">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([])
  const [page,     setPage]    = useState(1)
  const [total,    setTotal]   = useState(0)
  const [loading, setLoading]  = useState(true)
  const [error,   setError]    = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const [userIdFilter, setUserIdFilter]   = useState('')
  const [typeFilter,   setTypeFilter]     = useState('')
  const [statusFilter, setStatusFilter]   = useState('')
  const [dateFrom,     setDateFrom]       = useState('')
  const [dateTo,       setDateTo]         = useState('')
  const perPage = 20

  const fetchTransactions = () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      page,
      limit: perPage,
      ...(userIdFilter && { userId: userIdFilter }),
      ...(typeFilter && { type: typeFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    })
    api.get(`/admin/transactions?${params}`)
      .then(r => { setTransactions(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load transactions.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchTransactions() }, [page, userIdFilter, typeFilter, statusFilter, dateFrom, dateTo])
  // Collapse detail row when filters change so users don't see a stale expansion.
  useEffect(() => { setExpandedId(null) }, [page, userIdFilter, typeFilter, statusFilter, dateFrom, dateTo])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Transaction History</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Trace every fund movement — source, destination, and supporting metadata.</p>
        </div>
        <button
          onClick={fetchTransactions}
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
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              value={userIdFilter}
              onChange={e => { setUserIdFilter(e.target.value); setPage(1) }}
              placeholder="Filter by User ID…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
            />
          </div>

          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => { setTypeFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="">All Types</option>
              <option value="DEPOSIT">Deposit</option>
              <option value="WITHDRAWAL">Withdrawal</option>
              <option value="ESCROW_HOLD">Escrow Hold</option>
              <option value="ESCROW_RELEASE">Escrow Release</option>
              <option value="PAYMENT">Payment</option>
              <option value="REFUND">Refund</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="COMPLETED">Completed</option>
              <option value="FAILED">Failed</option>
              <option value="REFUNDED">Refunded</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>

          <div className="flex items-center gap-1">
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1) }}
              className="bg-surface-container border border-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface outline-none"
            />
            <span className="text-on-surface-variant">→</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1) }}
              className="bg-surface-container border border-surface-container-high rounded-lg px-3 py-2 text-sm text-on-surface outline-none"
            />
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
                  {['', 'Type', 'From', 'To', 'Amount', 'Status', 'Date', 'Reference'].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => {
                  const meta = TX_META[tx.type] || FALLBACK_META
                  const Icon = meta.icon
                  const fromParty = resolveParty(meta.fromKind, tx)
                  const toParty   = resolveParty(meta.toKind, tx)
                  const isOpen    = expandedId === tx.id
                  const rowColor  = idx % 2 === 0 ? 'bg-surface-container-low/20' : ''
                  const toggle = () => setExpandedId(isOpen ? null : tx.id)

                  return (
                    <React.Fragment key={tx.id}>
                      <tr
                        onClick={toggle}
                        className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors cursor-pointer ${rowColor} ${isOpen ? 'bg-surface-container-low/50' : ''}`}
                      >
                        <td className="px-4 py-3 w-8">
                          {isOpen
                            ? <ChevronDown className="w-4 h-4 text-primary" />
                            : <ChevronRight className="w-4 h-4 text-on-surface-variant" />}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${meta.direction === 'in' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-on-surface whitespace-nowrap">{meta.label}</p>
                              <span className={`inline-block mt-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded border ${meta.categoryCls}`}>
                                {meta.category}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <PartyChip party={fromParty} />
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <PartyChip party={toParty} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-semibold whitespace-nowrap ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {tx.currency || 'USD'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[tx.status] || 'bg-gray-100 text-gray-600'}`}>
                            {tx.status === 'PENDING' && <Clock className="w-2.5 h-2.5" />}
                            {tx.status === 'COMPLETED' && <CheckCircle className="w-2.5 h-2.5" />}
                            {tx.status === 'FAILED' && <XCircle className="w-2.5 h-2.5" />}
                            {tx.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-on-surface-variant whitespace-nowrap">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-on-surface-variant text-xs">
                            {tx.dealId && (
                              <span className="font-mono" title={`Deal: ${tx.dealId}`}>D·{tx.dealId.slice(-6)}</span>
                            )}
                            {tx.stripeId && (
                              <span className="inline-flex items-center gap-1" title={`Stripe: ${tx.stripeId}`}>
                                <ExternalLink className="w-3 h-3" /> Stripe
                              </span>
                            )}
                            {!tx.dealId && !tx.stripeId && <span>—</span>}
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-container-low/30">
                          <td colSpan={8} className="p-0">
                            <TransactionDetail tx={tx} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {transactions.length === 0 && !loading && !error && (
            <div className="py-16 text-center">
              <CreditCard className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">No transactions match your filters</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && transactions.length > 0 && (
        <Pagination page={page} totalPages={totalPages || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      )}
    </div>
  )
}
