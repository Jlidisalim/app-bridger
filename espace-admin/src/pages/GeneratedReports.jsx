/**
 * GeneratedReports.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Removed hardcoded REPORTS array.
 * - On mount, fetches GET /admin/reports which returns a virtual report list
 *   derived from live DB stats (tasks, audit logs, user/deal counts).
 * - Summary cards (Active Reports, Storage) driven by API stats.
 * - Frequency and status filters still work client-side on the fetched list.
 * - ScheduleModal remains UI-only (scheduling requires a job queue not in schema).
 * - Loading and error states added.
 */
import { useState, useEffect } from 'react'
import { FileText, Download, Eye, Plus, Zap, Calendar, ChevronDown, X, Database, Clock, HardDrive, Loader2, AlertCircle } from 'lucide-react'
import Pagination from '../components/shared/Pagination'
import api from '../services/api'

const FREQ_BADGE = {
  DAILY:   'bg-blue-100 text-blue-700',
  WEEKLY:  'bg-emerald-100 text-emerald-700',
  MONTHLY: 'bg-amber-100 text-amber-700',
}

const FORMAT_ICON = {
  pdf:  { color: 'text-red-500 bg-red-50',      label: 'PDF' },
  csv:  { color: 'text-emerald-500 bg-emerald-50', label: 'CSV' },
  xlsx: { color: 'text-orange-500 bg-orange-50', label: 'XLS' },
}

const STATUS_DOT = {
  ready:      { dot: 'bg-emerald-500',              label: 'Ready' },
  processing: { dot: 'bg-blue-500 animate-pulse',   label: 'Processing' },
  archived:   { dot: 'bg-gray-400',                 label: 'Archived' },
  failed:     { dot: 'bg-red-500',                  label: 'Failed' },
}

function ScheduleModal({ open, onClose }) {
  const [form, setForm] = useState({ name: '', frequency: 'DAILY', time: '06:00', format: 'PDF', emails: '' })
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-on-surface text-base">Schedule Automated Report</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-surface-container-high rounded-lg"><X className="w-4 h-4 text-on-surface-variant" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-on-surface-variant block mb-1.5">Report Name</label>
            <input
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Weekly Shipment Summary"
              className="w-full px-3 py-2 text-sm bg-surface-container rounded-lg border border-surface-container-high focus:border-primary/30 focus:ring-2 focus:ring-primary/10 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-on-surface-variant block mb-1.5">Frequency</label>
              <select value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-surface-container rounded-lg border border-surface-container-high outline-none appearance-none cursor-pointer">
                <option>DAILY</option><option>WEEKLY</option><option>MONTHLY</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-on-surface-variant block mb-1.5">Time</label>
              <input type="time" value={form.time} onChange={e => setForm(p => ({ ...p, time: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-surface-container rounded-lg border border-surface-container-high outline-none" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-on-surface-variant block mb-1.5">Output Format</label>
            <div className="flex gap-2">
              {['PDF', 'CSV', 'XLSX'].map(f => (
                <button key={f} onClick={() => setForm(p => ({ ...p, format: f }))}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-colors ${form.format === f ? 'bg-[#1A2E82] text-white border-[#1A2E82]' : 'border-surface-container-high text-on-surface-variant hover:bg-surface-container-high'}`}>
                  {f}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-on-surface-variant block mb-1.5">Email Recipients</label>
            <input value={form.emails} onChange={e => setForm(p => ({ ...p, emails: e.target.value }))}
              placeholder="admin@bridger.io, ops@bridger.io"
              className="w-full px-3 py-2 text-sm bg-surface-container rounded-lg border border-surface-container-high focus:border-primary/30 outline-none" />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold border border-outline-variant rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors">Cancel</button>
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold monolith-gradient text-white rounded-xl hover:opacity-90 transition-opacity">Save Schedule</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function GeneratedReports() {
  const [reports,    setReports]    = useState([])
  const [stats,      setStats]      = useState({ total: 0, storageUsed: '0 MB', lastGeneration: '—' })
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState(null)
  const [page,       setPage]       = useState(1)
  const [freqFilter, setFreqFilter] = useState('All')
  const [statFilter, setStatFilter] = useState('All')
  const [schedModal, setSchedModal] = useState(false)

  // Fetch virtual report list from /admin/reports on mount
  useEffect(() => {
    setLoading(true)
    api.get('/admin/reports')
      .then(r => {
        setReports(r.data.reports ?? [])
        setStats(r.data.stats ?? {})
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load reports.'))
      .finally(() => setLoading(false))
  }, [])

  const filtered = reports.filter(r => {
    const matchFreq = freqFilter === 'All' || r.frequency === freqFilter
    const matchStat = statFilter === 'All' || r.status === statFilter.toLowerCase()
    return matchFreq && matchStat
  })

  const perPage    = 10
  const totalPages = Math.ceil(filtered.length / perPage) || 1
  const displayed  = filtered.slice((page - 1) * perPage, page * perPage)

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Reports Central</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Manage system reports, schedules, and data exports</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium border border-outline-variant rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors">
            <Zap className="w-4 h-4" /> Generate Instant Audit
          </button>
          <button onClick={() => setSchedModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold monolith-gradient text-white rounded-xl hover:opacity-90 transition-opacity shadow-sm">
            <Calendar className="w-4 h-4" /> Schedule Automated
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Summary Cards — driven by API stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { icon: FileText,   label: 'Active Reports',   value: loading ? '…' : String(stats.total),         sub: 'From live DB activity',         color: '#3B82F6' },
          { icon: HardDrive,  label: 'Storage Utilized', value: loading ? '…' : stats.storageUsed,           sub: 'Combined report sizes',         color: '#D97706' },
          { icon: Clock,      label: 'Last Generation',  value: loading ? '…' : stats.lastGeneration ?? '—', sub: 'Most recent auto-report',        color: '#059669' },
          { icon: Plus,       label: 'New Query',        value: '+ Builder',                                 sub: 'Run a custom query',            color: '#1A2E82' },
        ].map(({ icon: Icon, label, value, sub, color }) => (
          <div key={label} className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
            <div style={{ borderTop: `3px solid ${color}` }} className="-mx-5 -mt-5 mb-4 rounded-t-xl" />
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: color + '1A' }}>
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <span className="text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">{label}</span>
            </div>
            <p className="text-xl font-semibold text-on-surface">{value}</p>
            <p className="text-xs text-on-surface-variant mt-1">{sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex border border-surface-container-high rounded-lg overflow-hidden">
          {['All','DAILY','WEEKLY','MONTHLY'].map(f => (
            <button key={f} onClick={() => { setFreqFilter(f); setPage(1) }}
              className={`px-3 py-2 text-xs font-semibold transition-colors ${freqFilter === f ? 'bg-[#1A2E82] text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}>
              {f === 'All' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative">
          <select value={statFilter} onChange={e => { setStatFilter(e.target.value); setPage(1) }}
            className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface outline-none cursor-pointer">
            <option>All</option><option>Ready</option><option>Processing</option><option>Archived</option><option>Failed</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low/40">
                <tr>
                  {['Report Name', 'Frequency', 'Generation Date', 'Size', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(r => {
                  const fmt  = FORMAT_ICON[r.format] ?? FORMAT_ICON.pdf
                  const stat = STATUS_DOT[r.status] ?? STATUS_DOT.ready
                  return (
                    <tr key={r.id} className="border-t border-surface-container hover:bg-surface-container-low/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${fmt.color}`}>
                            {fmt.label}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-on-surface">{r.name}</p>
                            <p className="text-xs text-on-surface-variant">Author: {r.author}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {r.frequency
                          ? <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${FREQ_BADGE[r.frequency]}`}>{r.frequency}</span>
                          : <span className="text-xs text-on-surface-variant">One-time</span>
                        }
                      </td>
                      {/* Date comes as ISO string from API — format for display */}
                      <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                        {r.date ? new Date(r.date).toLocaleString() : '—'}
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface">{r.size}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${stat.dot}`} />
                          <span className="text-xs text-on-surface-variant">{stat.label}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors" disabled={r.status !== 'ready'}>
                            <Eye className="w-4 h-4" />
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors" disabled={r.status !== 'ready'}>
                            <Download className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && displayed.length === 0 && (
          <div className="py-12 text-center">
            <FileText className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">No reports match your filters</p>
          </div>
        )}
        <Pagination page={page} totalPages={totalPages} total={filtered.length} perPage={perPage} onPage={setPage} />
      </div>

      {/* Bottom promo + retention */}
      <div className="grid grid-cols-2 gap-4">
        <div className="monolith-gradient rounded-xl p-6 space-y-3">
          <div>
            <p className="text-white font-semibold text-base">Automate Your Intelligence</p>
            <p className="text-blue-200 text-sm mt-1">Set up automated reports that deliver actionable insights straight to your inbox — daily, weekly, or monthly.</p>
          </div>
          <button onClick={() => setSchedModal(true)} className="px-5 py-2.5 bg-white text-[#1A2E82] text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors">
            Setup Schedule
          </button>
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-on-surface-variant" />
            <h3 className="text-sm font-semibold text-on-surface">Data Retention Policy</h3>
          </div>
          <div className="space-y-2 text-sm">
            {[
              ['Daily reports',   'Retained for 90 days'],
              ['Weekly reports',  'Retained indefinitely'],
              ['Monthly reports', 'Retained indefinitely'],
              ['Instant audits',  'Retained for 1 year'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span className="text-on-surface-variant">{k}</span>
                <span className="font-medium text-on-surface">{v}</span>
              </div>
            ))}
          </div>
          <button className="mt-4 text-xs text-primary-container hover:underline font-medium">View Compliance Details →</button>
        </div>
      </div>

      <ScheduleModal open={schedModal} onClose={() => setSchedModal(false)} />
    </div>
  )
}
