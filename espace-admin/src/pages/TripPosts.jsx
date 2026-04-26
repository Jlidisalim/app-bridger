/**
 * TripPosts.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Removed hardcoded TRIPS array; data is fetched from GET /trips.
 * - Status filter and search pass query params to the API.
 * - "Suspend" action calls DELETE /trips/:id (cancels the trip on the backend).
 * - "Flag" action logs a console warning — flagging trips requires a schema
 *   migration to add a flagged/status field beyond OPEN/MATCHED/COMPLETED/CANCELLED.
 * - Top Corridors chart now uses data from GET /trips/popular-routes
 *   (public endpoint, no auth required).
 * - Loading and error states added.
 */
import { useState, useEffect, useCallback } from 'react'
import {
  AlertTriangle, Plane, Car, Bus, Star, Flag, Ban,
  Eye, Search, ChevronDown, MapPin, Loader2, AlertCircle,
  X, Calendar, User, Shield
} from 'lucide-react'
import KpiCard from '../components/shared/KpiCard'
import StatusBadge from '../components/shared/StatusBadge'
import RiskBadge from '../components/shared/RiskBadge'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import ExportButton from '../components/shared/ExportButton'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../services/api'

const TRANSPORT_ICON = { plane: Plane, car: Car, bus: Bus }
const INIT_COLORS    = ['bg-blue-200 text-blue-700','bg-purple-200 text-purple-700','bg-rose-200 text-rose-700','bg-emerald-200 text-emerald-700','bg-amber-200 text-amber-700','bg-indigo-200 text-indigo-700','bg-teal-200 text-teal-700','bg-orange-200 text-orange-700']

const BACKEND_STATUS_MAP = {
  OPEN: 'active', MATCHED: 'active', COMPLETED: 'completed', CANCELLED: 'suspended',
}

// ── Drawer helpers ──────────────────────────────────────────────────────────
function DrawerSection({ title, icon, children }) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60">{title}</p>
      </div>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex justify-between items-start gap-4 text-sm py-1">
      <span className="text-on-surface-variant flex-shrink-0">{label}</span>
      <span className={`text-on-surface font-medium text-right truncate ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

// ── Trip detail drawer (right-side slide-out) ─────────────────────────────
function TripDrawer({ open, trip, detail, loading, error, onClose }) {
  const [rendered, setRendered] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setVisible(false)
    const t = setTimeout(() => setRendered(false), 300)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const source = detail ?? trip

  if (!rendered) return null

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      <aside
        className={`fixed right-0 top-0 h-full w-full sm:w-[480px] bg-surface-container-lowest shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Trip details"
      >
        <div className="p-5 border-b border-surface-container-high flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60">
              Trip #{source?.id?.slice(-8) ?? ''}
            </p>
            <h2 className="text-lg font-semibold text-on-surface truncate flex items-center gap-2 mt-0.5">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate">{source?.fromCity ?? '—'} → {source?.toCity ?? '—'}</span>
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {source?.status && <StatusBadge status={BACKEND_STATUS_MAP[source.status] ?? source.status?.toLowerCase()} />}
              {source?.mlScore != null && <RiskBadge score={Math.round(source.mlScore)} />}
              {source?.flagged && <span className="text-[10px] font-bold px-2 py-1 bg-amber-100 text-amber-700 rounded-full">FLAGGED</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-lg flex-shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div className="p-5 flex-1 overflow-y-auto scrollbar-hidden">
          {loading && !detail ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-primary opacity-60" />
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg px-3 py-2 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /><span>{error}</span>
                </div>
              )}

              <DrawerSection title="Route" icon={<MapPin className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 space-y-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">From</p>
                    <p className="text-sm font-semibold text-on-surface">{source?.fromCity ?? '—'}{source?.fromCountry ? `, ${source.fromCountry}` : ''}</p>
                  </div>
                  <div className="border-l-2 border-dashed border-surface-container-high ml-2 h-3" />
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">To</p>
                    <p className="text-sm font-semibold text-on-surface">{source?.toCity ?? '—'}{source?.toCountry ? `, ${source.toCountry}` : ''}</p>
                  </div>
                </div>
              </DrawerSection>

              <DrawerSection title="Traveler" icon={<User className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
                  {source?.traveler ? (
                    <>
                      <div className="w-10 h-10 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                        {(source.traveler.name || '??').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-on-surface">{source.traveler.name ?? '—'}</p>
                        <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                          <span>★ {Number(source.traveler.rating ?? 0).toFixed(1)}</span>
                          {source.traveler.totalDeals != null && <span>· {source.traveler.totalDeals} trips</span>}
                        </div>
                        {source.traveler.kycStatus && <p className="text-[10px] text-on-surface-variant/80">KYC: {source.traveler.kycStatus}</p>}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-on-surface-variant italic">No traveler assigned</p>
                  )}
                </div>
              </DrawerSection>

              <DrawerSection title="Trip Details" icon={<Plane className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
                  <InfoRow label="Max Weight" value={source?.maxWeight != null ? `${source.maxWeight} kg remaining` : '—'} />
                  <InfoRow label="Price" value={`${source?.currency ?? 'USD'} ${Number(source?.price ?? 0).toLocaleString()}/kg`} />
                  <InfoRow label="Negotiable" value={source?.negotiable ? 'Yes' : 'No'} />
                  <InfoRow label="Flight Number" value={source?.flightNumber ?? '—'} />
                  <InfoRow label="Departure Time" value={source?.departureTime ?? '—'} />
                </div>
              </DrawerSection>

              <DrawerSection title="Schedule" icon={<Calendar className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
                  <InfoRow label="Departure Date" value={source?.departureDate ? new Date(source.departureDate).toLocaleString() : 'Not set'} />
                  <InfoRow label="Created" value={source?.createdAt ? new Date(source.createdAt).toLocaleString() : '—'} />
                  <InfoRow label="Updated" value={source?.updatedAt ? new Date(source.updatedAt).toLocaleString() : '—'} />
                </div>
              </DrawerSection>

              <DrawerSection title="Metadata" icon={<Shield className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
                  <InfoRow label="Full ID" value={source?.id} mono />
                  <InfoRow label="ML Score" value={source?.mlScore != null ? `${Math.round(source.mlScore)} / 100` : '—'} />
                  <InfoRow label="Flagged" value={source?.flagged ? 'Yes' : 'No'} />
                  <InfoRow label="Status" value={source?.status ?? '—'} />
                </div>
              </DrawerSection>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

function Stars({ rating }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
      <span className="text-xs font-semibold text-on-surface">{Number(rating ?? 0).toFixed(1)}</span>
    </div>
  )
}

export default function TripPosts() {
  const [page,         setPage]         = useState(1)
  const [searchInput,  setSearchInput]  = useState('')
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [confirm,      setConfirm]      = useState(null)
  const [trips,        setTrips]        = useState([])
  const [total,        setTotal]        = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [corridors,    setCorridors]    = useState([])

  // Drawer state
  const [drawerTrip, setDrawerTrip] = useState(null)
  const [drawerDetail, setDrawerDetail] = useState(null)
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerError, setDrawerError] = useState(null)

  const perPage = 10

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchTrips = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page, limit: perPage })
    if (statusFilter !== 'all') params.set('status', statusFilter.toUpperCase())
    if (search) params.set('search', search)
    api.get(`/trips?${params}`)
      .then(r => { setTrips(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load trips.'))
      .finally(() => setLoading(false))
  }, [page, statusFilter, search])

  useEffect(() => { fetchTrips() }, [fetchTrips])

  // Fetch popular routes for the corridors chart (public endpoint)
  useEffect(() => {
    api.get('/trips/popular-routes')
      .then(r => {
        const routes = r.data.routes ?? r.data ?? []
        const maxCount = Math.max(...routes.map(x => x.count), 1)
        setCorridors(
          routes.slice(0, 4).map(rt => ({
            name: `${rt.from} → ${rt.to}`,
            pct: Math.round(rt.count / maxCount * 100),
            count: rt.count
          }))
        )
      })
      .catch(() => { /* corridors are optional — fail silently */ })
  }, [])

  const highRisk = trips.filter(t => (t.mlScore ?? 0) > 60)
  const anomalies = highRisk.length > 0

  function handleAction(trip, action) {
    const alreadyFlagged = trip.flagged
    setConfirm({
      title: action === 'suspend'
        ? `Cancel Trip ${trip.id.slice(-6)}`
        : alreadyFlagged ? `Unflag Trip ${trip.id.slice(-6)}` : `Flag Trip ${trip.id.slice(-6)}`,
      message: action === 'suspend'
        ? `Cancel trip ${trip.id.slice(-6)}? Calls DELETE /admin/trips/:id (admin bypass).`
        : alreadyFlagged
          ? `Remove the flag from trip ${trip.id.slice(-6)}.`
          : `Flag trip ${trip.id.slice(-6)} for review. Calls PATCH /admin/trips/:id/flag.`,
      danger: action === 'suspend',
      onConfirm: async () => {
        if (action === 'suspend') {
          // Admin cancel endpoint bypasses the traveler-ownership check
          try {
            await api.delete(`/admin/trips/${trip.id}`)
            setTrips(prev => prev.map(t => t.id === trip.id ? { ...t, status: 'CANCELLED' } : t))
          } catch (err) {
            setError(err.response?.data?.error || 'Cancel failed.')
          }
        }
        if (action === 'flag') {
          // Toggle flagged field via new admin endpoint
          try {
            const newFlagged = !alreadyFlagged
            await api.patch(`/admin/trips/${trip.id}/flag`, { flagged: newFlagged })
            setTrips(prev => prev.map(t => t.id === trip.id ? { ...t, flagged: newFlagged } : t))
          } catch (err) {
            setError(err.response?.data?.error || 'Flag failed.')
          }
        }
        setConfirm(null)
      },
    })
  }

  const openDrawer = useCallback((trip) => {
    setDrawerTrip(trip)
    setDrawerDetail(null)
    setDrawerError(null)
    setDrawerLoading(true)
    api.get(`/trips/${trip.id}`)
      .then(r => setDrawerDetail(r.data))
      .catch(err => setDrawerError(err.response?.data?.error || 'Failed to load trip details.'))
      .finally(() => setDrawerLoading(false))
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerTrip(null)
    setDrawerDetail(null)
    setDrawerError(null)
    setDrawerLoading(false)
  }, [])

  const handleExportCSV = useCallback(() => {
    if (!trips || trips.length === 0) return
    const headers = [
      'ID', 'From City', 'To City', 'From Country', 'To Country',
      'Traveler Name', 'Traveler Rating', 'Departure Date', 'Departure Time',
      'Max Weight (kg)', 'Price', 'Currency', 'Negotiable', 'Flight Number',
      'Status', 'ML Score', 'Flagged', 'Created At', 'Updated At'
    ]
    const escape = (v) => {
      if (v == null) return ''
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = trips.map(t => [
      t.id,
      t.fromCity, t.toCity, t.fromCountry, t.toCountry,
      t.traveler?.name ?? '', t.traveler?.rating ?? '',
      t.departureDate ? new Date(t.departureDate).toLocaleString() : '',
      t.departureTime ?? '',
      t.maxWeight ?? '', t.price, t.currency, t.negotiable ? 'Yes' : 'No',
      t.flightNumber ?? '', t.status, Math.round(t.mlScore ?? 0),
      t.flagged ? 'Yes' : 'No',
      new Date(t.createdAt).toLocaleString(),
      new Date(t.updatedAt).toLocaleString()
    ].map(escape).join(','))
    const csv = [headers.map(escape).join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'trips.csv'
    a.click()
    URL.revokeObjectURL(url)
  }, [trips])

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Trip Post Management</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Monitor traveler-published trips and detect anomalies</p>
        </div>
        <ExportButton onClick={handleExportCSV} />
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total Trips"      value={total.toLocaleString()}    changeType="neutral" icon={<MapPin className="w-4 h-4 text-blue-600" />}    accentColor="#3B82F6" />
        <KpiCard label="High Risk"        value={highRisk.length.toString()} sublabel="flagged on this page" changeType="neutral" icon={<AlertTriangle className="w-4 h-4 text-red-600" />}  accentColor="#DC2626" />
        <KpiCard label="This Page"        value={trips.length.toString()}    sublabel={`of ${total}`} changeType="neutral" icon={<MapPin className="w-4 h-4 text-emerald-600" />} accentColor="#059669" />
      </div>

      {/* ML Anomaly Banner */}
      {anomalies && (
        <div className="bg-[#0F1D6E] rounded-xl p-5 flex items-start gap-4">
          <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold">Anomaly Detected</p>
            <p className="text-blue-200 text-sm mt-0.5">
              {highRisk.length} trips with elevated ML risk score on this page. Review recommended.
            </p>
          </div>
          <button
            onClick={() => setStatusFilter('high')}
            className="px-4 py-2 bg-white text-[#0F1D6E] text-sm font-semibold rounded-lg hover:bg-blue-50 transition-colors flex-shrink-0"
          >
            View Alerts
          </button>
        </div>
      )}

      {/* Filters + Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container">
        <div className="p-4 border-b border-surface-container-high flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search city or route…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
            />
          </div>

          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              {[['all','All Status'],['open','Open'],['matched','Matched'],['completed','Completed'],['cancelled','Cancelled']].map(([v,l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-on-surface-variant pointer-events-none" />
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-20 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low/40">
                <tr>
                  {['Route', 'Traveler', 'Date', 'Capacity / Price', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trips.map((trip, idx) => {
                  const TransIcon   = Plane // flightNumber present → plane; no transport field in schema
                  const uiStatus    = BACKEND_STATUS_MAP[trip.status] ?? trip.status?.toLowerCase()
                  const travelerName = trip.traveler?.name ?? '—'

                  return (
                    <tr key={trip.id} className="border-t border-surface-container hover:bg-surface-container-low/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <TransIcon className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-on-surface">{trip.fromCity} → {trip.toCity}</p>
                            <p className="text-[10px] text-on-surface-variant">ID: #{trip.id.slice(-6)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${INIT_COLORS[idx % INIT_COLORS.length]}`}>
                            {travelerName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-on-surface">{travelerName}</p>
                            <Stars rating={trip.traveler?.rating ?? 0} />
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-on-surface-variant whitespace-nowrap">
                        {trip.departureDate ? new Date(trip.departureDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-on-surface">{trip.maxWeight}kg remaining</p>
                        <p className="text-xs text-on-surface-variant">
                          {trip.currency} {Number(trip.price ?? 0).toLocaleString()}/kg
                          {trip.negotiable && ' · Negotiable'}
                        </p>
                      </td>
                      <td className="px-5 py-4"><StatusBadge status={uiStatus} /></td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openDrawer(trip)} className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors" title="View">
                            <Eye className="w-4 h-4" />
                          </button>
                          {/* Fill icon if already flagged so state is visible */}
                          <button
                            onClick={() => handleAction(trip, 'flag')}
                            className={`p-1.5 rounded-lg transition-colors ${trip.flagged ? 'bg-amber-100 text-amber-600' : 'hover:bg-amber-50 text-amber-500'}`}
                            title={trip.flagged ? 'Unflag' : 'Flag'}
                          >
                            <Flag className={`w-4 h-4 ${trip.flagged ? 'fill-amber-500' : ''}`} />
                          </button>
                          {trip.status !== 'CANCELLED' && trip.status !== 'COMPLETED' && (
                            <button
                              onClick={() => handleAction(trip, 'suspend')}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors" title="Cancel trip"
                            >
                              <Ban className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && trips.length === 0 && !error && (
          <div className="py-16 text-center">
            <MapPin className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">No trips match your filters</p>
          </div>
        )}

        <Pagination page={page} totalPages={Math.ceil(total / perPage) || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      </div>

      {/* Bottom: Corridors as data cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
          <h3 className="text-sm font-semibold text-on-surface mb-4">Top Corridors</h3>
          {corridors.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {corridors.map((c, idx) => (
                <div key={c.name} className="bg-surface-container rounded-xl p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${['bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-amber-600'][idx % 4]}`}>
                      {idx + 1}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60">Corridor</span>
                  </div>
                  <p className="text-sm font-semibold text-on-surface mb-1">{c.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-on-surface-variant">{c.count} trips</span>
                    <span className="text-xs font-semibold text-primary">{c.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant text-center py-8">No route data yet</p>
          )}
        </div>

        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-on-surface">Trips This Page</h3>
            <span className="text-[10px] font-bold px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full">LIVE DATA</span>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={trips.map((t, i) => ({ name: `#${i + 1}`, weight: t.maxWeight ?? 0 }))} barSize={8}>
              <XAxis dataKey="name" tick={{ fontSize: 9 }} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={v => [`${v}kg`, 'Max Weight']} />
              <Bar dataKey="weight" fill="#1A2E82" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel={confirm?.danger ? 'Cancel Trip' : 'Flag'}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />

      <TripDrawer
        open={!!drawerTrip}
        trip={drawerTrip}
        detail={drawerDetail}
        loading={drawerLoading}
        error={drawerError}
        onClose={closeDrawer}
      />
    </div>
  )
}
