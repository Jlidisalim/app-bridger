import { useState, useEffect } from 'react'
import {
  CreditCard, Clock, CheckCircle, XCircle, AlertCircle, Loader2,
  ChevronDown, RefreshCw, Search, FileText, User, Tag,
} from 'lucide-react'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import api from '../services/api'

const STATUS_BADGE = {
  PENDING:   'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED:    'bg-red-100 text-red-700',
  REFUNDED:  'bg-purple-100 text-purple-700',
}

const TYPE_LABEL = {
  DEPOSIT:        'Deposit',
  WITHDRAWAL:     'Withdrawal',
  ESCROW_HOLD:    'Escrow Hold',
  ESCROW_RELEASE: 'Escrow Release',
  PAYMENT:        'Payment',
  REFUND:         'Refund',
}

export default function TransactionHistory() {
  const [transactions, setTransactions] = useState([])
  const [page,     setPage]    = useState(1)
  const [total,    setTotal]   = useState(0)
  const [loading, setLoading]  = useState(true)
  const [error,   setError]    = useState(null)

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

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Transaction History</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">All wallet movements across the platform</p>
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
                  {['User', 'Type', 'Amount', 'Status', 'Date', 'Details'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx, idx) => {
                  const rowColor = idx % 2 === 0 ? 'bg-surface-container-low/20' : ''
                  return (
                    <tr key={tx.id} className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors ${rowColor}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-[#1A2E82] flex items-center justify-center text-white text-[10px] font-bold">
                            {tx.user?.name?.slice(0,2).toUpperCase() || '??'}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-on-surface">{tx.user?.name || 'Unknown User'}</p>
                            <p className="text-[10px] text-on-surface-variant font-mono">{tx.userId?.slice(-8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span className="flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-primary" />
                          <span className="text-sm text-on-surface">{TYPE_LABEL[tx.type] || tx.type}</span>
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-sm font-semibold ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {tx.amount >= 0 ? '+' : ''}{Number(tx.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_BADGE[tx.status] || 'bg-gray-100 text-gray-600'}`}>
                          {tx.status === 'PENDING' && <Clock className="w-2.5 h-2.5" />}
                          {tx.status === 'COMPLETED' && <CheckCircle className="w-2.5 h-2.5" />}
                          {tx.status === 'FAILED' && <XCircle className="w-2.5 h-2.5" />}
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-on-surface-variant">
                        {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3 text-on-surface-variant">
                          {tx.dealId && (
                            <span className="text-xs font-mono" title={`Deal: ${tx.dealId}`}>
                              Deal: {tx.dealId.slice(-6)}
                            </span>
                          )}
                          {tx.stripeId && (
                            <span className="text-xs" title={`Stripe: ${tx.stripeId}`}>Stripe</span>
                          )}
                        </div>
                      </td>
                    </tr>
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
