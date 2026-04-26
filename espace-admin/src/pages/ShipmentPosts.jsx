/**
 * ShipmentPosts.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Removed hardcoded SHIPMENTS array; data is fetched from GET /deals.
 * - Search (by route, ID), status filter, and category/risk filters are
 *   applied server-side via query params where supported, with client-side
 *   fallback for packageSize (category) and ML-risk filtering.
 * - Delete button calls DELETE /deals/:id after confirmation.
 * - KPI cards at the bottom are computed from the loaded page data.
 * - Loading and error states added.
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Eye, Trash2, Flag, Search, ChevronDown, Package, Loader2, AlertCircle,
  ChevronRight, ChevronLeft, Gavel, X, MapPin, Calendar,
  User, Truck, ImageOff, Shield,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import KpiCard from '../components/shared/KpiCard'
import StatusBadge from '../components/shared/StatusBadge'
import RiskBadge from '../components/shared/RiskBadge'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import ExportButton from '../components/shared/ExportButton'
import api, { resolveMediaUrl } from '../services/api'

// Map backend packageSize values to category display labels
const SIZE_LABELS = {
  SMALL: 'Small Package', MEDIUM: 'Medium Package',
  LARGE: 'Large Package', EXTRA_LARGE: 'Extra Large',
}

// Map backend deal status to display
const STATUS_DISPLAY = {
  OPEN: 'inactive', MATCHED: 'booked', PICKED_UP: 'picked',
  IN_TRANSIT: 'in_transit', DELIVERED: 'delivered',
  COMPLETED: 'delivered', CANCELLED: 'cancelled', DISPUTED: 'cancelled',
}

const STATUSES = ['All', 'OPEN', 'MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED']

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

function PartyCard({ role, person, fallback = 'Not assigned', icon: CustomIcon }) {
  // person can be a full user object { name, avatar, rating, totalDeals }
  // or a flat receiver object { name, phone }
  const isReceiver = role === 'Receiver'

  if (!person) {
    return (
      <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant/60">
          {CustomIcon ? <CustomIcon className="w-4 h-4" /> : <User className="w-4 h-4" />}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">{role}</p>
          <p className="text-sm text-on-surface-variant italic">{fallback}</p>
        </div>
      </div>
    )
  }

  // Receiver — flat object with name + phone
  if (isReceiver) {
    return (
      <div className="bg-surface-container-low rounded-xl p-3 space-y-1.5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold">
            <User className="w-4 h-4" />
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">{role}</p>
            <p className="text-sm font-semibold text-on-surface">{person.name ?? '—'}</p>
          </div>
        </div>
        {person.phone && (
          <p className="text-xs text-on-surface-variant pl-13 ml-1">{person.phone}</p>
        )}
      </div>
    )
  }

  // Sender / Traveler — full user object
  const initials = (person.name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const avatarUrl = resolveMediaUrl(person.avatar || person.profilePhoto)
  const [imgError, setImgError] = useState(false)
  return (
    <div className="bg-surface-container-low rounded-xl p-3 flex items-center gap-3">
      {avatarUrl && !imgError
        ? <img src={avatarUrl} alt={person.name} className="w-10 h-10 rounded-full object-cover flex-shrink-0" onError={() => setImgError(true)} />
        : <div className="w-10 h-10 rounded-full bg-blue-200 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">{initials}</div>
      }
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-on-surface-variant/60">{role}</p>
        <p className="text-sm font-semibold text-on-surface truncate">{person.name ?? '—'}</p>
        <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
          {person.rating != null && <span>★ {Number(person.rating).toFixed(1)}</span>}
          {person.totalDeals != null && <span>· {person.totalDeals} deals</span>}
        </div>
      </div>
    </div>
  )
}

function PhotoGallery({ photos }) {
  const [active, setActive] = useState(0)
  if (!photos || photos.length === 0) {
    return (
      <div className="bg-surface-container-low rounded-xl p-6 flex flex-col items-center justify-center gap-2 text-on-surface-variant/60">
        <ImageOff className="w-6 h-6" />
        <p className="text-xs">No photos uploaded</p>
      </div>
    )
  }
  const current = photos[Math.min(active, photos.length - 1)]
  return (
    <div>
      <div className="relative w-full aspect-video bg-surface-container-low rounded-xl overflow-hidden">
        <img
          src={current}
          alt={`Photo ${active + 1}`}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
        <span className="absolute top-2 right-2 text-[10px] font-semibold bg-black/60 text-white px-2 py-0.5 rounded-full">
          {active + 1} / {photos.length}
        </span>
      </div>
      {photos.length > 1 && (
        <div className="flex gap-1.5 mt-2 overflow-x-auto scrollbar-hidden pb-1">
          {photos.map((url, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                i === active ? 'border-primary' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={url} alt={`Thumb ${i + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TrackingTimeline({ events }) {
  if (!events || events.length === 0) {
    return <p className="text-xs text-on-surface-variant/60 italic">No tracking events yet.</p>
  }
  return (
    <ol className="relative border-l border-surface-container-high ml-1.5 space-y-3">
      {events.map((ev, i) => (
        <li key={ev.id ?? i} className="pl-3 relative">
          <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-primary ring-2 ring-surface-container-lowest" />
          <p className="text-sm font-medium text-on-surface">{ev.status ?? ev.type ?? 'Event'}</p>
          {ev.note && <p className="text-xs text-on-surface-variant">{ev.note}</p>}
          {(ev.location || ev.city) && (
            <p className="text-[11px] text-on-surface-variant/80">{ev.location ?? ev.city}</p>
          )}
          <p className="text-[10px] text-on-surface-variant/60 mt-0.5">
            {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}
          </p>
        </li>
      ))}
    </ol>
  )
}

// ── Shipment detail drawer (right-side slide-out) ───────────────────────────
function ShipmentDrawer({ open, deal, detail, loading, error, onClose }) {
  // Animate even when `deal` becomes null on close; keep mounted briefly
  const [rendered, setRendered] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setRendered(true)
      // next tick → allow initial translate-x-full to register, then animate in
      const id = requestAnimationFrame(() => setVisible(true))
      return () => cancelAnimationFrame(id)
    }
    setVisible(false)
    const t = setTimeout(() => setRendered(false), 300) // match duration
    return () => clearTimeout(t)
  }, [open])

  // ESC to close
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const source = detail ?? deal
  const photos = useMemo(() => {
    if (!source?.images) return []
    if (Array.isArray(source.images)) return source.images
    try {
      const parsed = JSON.parse(source.images)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch { return [] }
  }, [source?.images])

  if (!rendered) return null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      />
      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 h-full w-full sm:w-[480px] bg-surface-container-lowest shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-out ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Shipment details"
      >
        {/* Header */}
        <div className="p-5 border-b border-surface-container-high flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant/60">
              Shipment #{source?.id?.slice(-8) ?? ''}
            </p>
            <h2 className="text-lg font-semibold text-on-surface truncate flex items-center gap-2 mt-0.5">
              <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="truncate">{source?.fromCity ?? '—'} → {source?.toCity ?? '—'}</span>
            </h2>
            <div className="flex items-center gap-2 mt-2">
              {source?.status && <StatusBadge status={STATUS_DISPLAY[source.status] ?? source.status?.toLowerCase()} />}
              {source?.mlScore != null && <RiskBadge score={Math.round(source.mlScore)} />}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-surface-container-high rounded-lg flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        {/* Body */}
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

              {/* Photos */}
              <DrawerSection title="Post Photos">
                <PhotoGallery photos={photos} />
              </DrawerSection>

              {/* Route */}
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

              {/* Package details */}
              <DrawerSection title="Package" icon={<Package className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
                  {source?.title && <InfoRow label="Title" value={source.title} />}
                  {source?.description && (
                    <div className="text-sm pt-1">
                      <p className="text-on-surface-variant text-xs mb-1">Description</p>
                      <p className="text-on-surface whitespace-pre-wrap">{source.description}</p>
                    </div>
                  )}
                  <InfoRow label="Size" value={SIZE_LABELS[source?.packageSize] ?? source?.packageSize ?? '—'} />
                  <InfoRow label="Weight" value={source?.weight != null ? `${source.weight} kg` : '—'} />
                  <InfoRow label="Price" value={`${source?.currency ?? 'USD'} ${Number(source?.price ?? 0).toLocaleString()}`} />
                </div>
              </DrawerSection>

              {/* Parties */}
              <DrawerSection title="Parties" icon={<User className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="space-y-2">
                  <PartyCard role="Sender" person={source?.sender} fallback="Unknown sender" />
                  <PartyCard role="Traveler" person={source?.traveler} fallback="Not assigned yet" />
                  <PartyCard role="Receiver" person={source ? { name: source.receiverName, phone: source.receiverPhone } : null} fallback="No receiver specified" icon={User} />
                </div>
              </DrawerSection>

              {/* Dates */}
              <DrawerSection title="Schedule" icon={<Calendar className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
                  <InfoRow
                    label="Pickup"
                    value={source?.pickupDate ? new Date(source.pickupDate).toLocaleString() : 'Not scheduled'}
                  />
                  <InfoRow
                    label="Delivery"
                    value={source?.deliveryDate ? new Date(source.deliveryDate).toLocaleString() : 'Not scheduled'}
                  />
                  <InfoRow
                    label="Created"
                    value={source?.createdAt ? new Date(source.createdAt).toLocaleString() : '—'}
                  />
                  <InfoRow
                    label="Updated"
                    value={source?.updatedAt ? new Date(source.updatedAt).toLocaleString() : '—'}
                  />
                </div>
              </DrawerSection>

              {/* Tracking */}
              {(detail?.trackingEvents?.length ?? 0) > 0 && (
                <DrawerSection title="Tracking Timeline" icon={<Truck className="w-3 h-3 text-on-surface-variant/60" />}>
                  <div className="bg-surface-container-low rounded-xl p-3">
                    <TrackingTimeline events={detail.trackingEvents} />
                  </div>
                </DrawerSection>
              )}

              {/* Meta */}
              <DrawerSection title="Metadata" icon={<Shield className="w-3 h-3 text-on-surface-variant/60" />}>
                <div className="bg-surface-container-low rounded-xl p-3 space-y-1">
                  <InfoRow label="Full ID" value={source?.id} mono />
                  <InfoRow label="Fraud Score" value={source?.mlScore != null ? `${Math.round(source.mlScore)} / 100` : '—'} />
                  <InfoRow label="Disputes" value={source?._count?.disputes ?? detail?._count?.disputes ?? 0} />
                  {source?.qrCode && <InfoRow label="QR Code" value="Generated" />}
                </div>
              </DrawerSection>
            </>
          )}
        </div>
      </aside>
    </>
  )
}

// High Risk details table component
function HighRiskTable({ deals }) {
  if (!deals || deals.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-on-surface-variant">
        No high-risk shipments found
      </div>
    )
  }
  return (
    <div className="mt-4 space-y-2">
      {deals.map(d => (
        <div key={d.id} className="bg-surface-container rounded-lg p-3 flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-semibold text-on-surface">{d.fromCity} → {d.toCity}</p>
            <p className="text-xs text-on-surface-variant">
              {d.sender?.name ?? 'Unknown'} · ID: #{d.id.slice(-8)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-red-600">Score: {Math.round(d.mlScore ?? 0)}</p>
            <p className="text-xs text-on-surface-variant">mlScore &gt; 60</p>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ShipmentPosts() {
  const [page,           setPage]           = useState(1)
  const [search,         setSearch]         = useState('')
  const [searchInput,    setSearchInput]     = useState('')
  const [statusFilter,   setStatusFilter]   = useState('All')
  const [confirm,       setConfirm]        = useState(null)
  const [deals,         setDeals]          = useState([])
  const [total,         setTotal]          = useState(0)
  const [loading,       setLoading]        = useState(true)
  const [error,         setError]          = useState(null)
  const [highRiskExpanded, setHighRiskExpanded] = useState(false)
  const [highRiskDeals,   setHighRiskDeals]   = useState([])
  // Detail drawer state
  const [drawerDeal,      setDrawerDeal]      = useState(null)   // row data (fast open)
  const [drawerDetail,    setDrawerDetail]    = useState(null)   // full /deals/:id payload
  const [drawerLoading,   setDrawerLoading]   = useState(false)
  const [drawerError,     setDrawerError]     = useState(null)
  const navigate = useNavigate()

  const perPage = 10

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [searchInput])

  const fetchHighRiskDeals = useCallback(() => {
    api.get(`/deals?limit=100`)
      .then(r => {
        const highRisk = (r.data.items || []).filter(d => (d.mlScore ?? 0) > 60)
        setHighRiskDeals(highRisk)
      })
      .catch(() => setHighRiskDeals([]))
  }, [])

  const toggleHighRisk = useCallback(() => {
    if (!highRiskExpanded && highRiskDeals.length === 0) {
      fetchHighRiskDeals()
    }
    setHighRiskExpanded(prev => !prev)
  }, [highRiskExpanded, highRiskDeals.length, fetchHighRiskDeals])

  const fetchDeals = useCallback(() => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ page, limit: perPage })
    if (statusFilter !== 'All') params.set('status', statusFilter)
    // City search: try to match search string against fromCity / toCity
    if (search) {
      params.set('fromCity', search)
    }
    api.get(`/deals?${params}`)
      .then(r => { setDeals(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load shipments.'))
      .finally(() => setLoading(false))
  }, [page, statusFilter, search])

  useEffect(() => { fetchDeals() }, [fetchDeals])

  function requestDelete(deal) {
    setConfirm({
      title: `Delete Shipment #${deal.id.slice(-8)}`,
      message: `Permanently delete the shipment from ${deal.fromCity} to ${deal.toCity}? This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/deals/${deal.id}`)
          setDeals(prev => prev.filter(d => d.id !== deal.id))
          setTotal(t => t - 1)
          // Close the drawer too, if the deleted row was being viewed
          if (drawerDeal?.id === deal.id) closeDrawer()
        } catch (err) {
          setError(err.response?.data?.error || 'Delete failed.')
        } finally {
          setConfirm(null)
        }
      },
    })
  }

  const openDrawer = useCallback((deal) => {
    setDrawerDeal(deal)
    setDrawerDetail(null)
    setDrawerError(null)
    setDrawerLoading(true)
    api.get(`/deals/${deal.id}`)
      .then(r => setDrawerDetail(r.data))
      .catch(err => setDrawerError(err.response?.data?.error || 'Failed to load details.'))
      .finally(() => setDrawerLoading(false))
  }, [])

  const closeDrawer = useCallback(() => {
    setDrawerDeal(null)
    setDrawerDetail(null)
    setDrawerError(null)
    setDrawerLoading(false)
  }, [])

  // mlScore is now a real field on Deal — count deals above 60 as high-risk
  const highRiskCount = deals.filter(d => (d.mlScore ?? 0) > 60).length

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header and KPI Cards */}
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-on-surface">Shipment Posts</h1>
            <p className="text-sm text-on-surface-variant mt-0.5">Full database of all shipment requests</p>
          </div>
          <div className="flex items-center gap-3">
             <ExportButton data={deals} filename="shipments.csv" />
           </div>
        </div>

        {/* KPI Cards at Top */}
        <div className="grid grid-cols-3 gap-4">
          <KpiCard label="Total Shipments"   value={total.toLocaleString()}      changeType="neutral" icon={<Package className="w-4 h-4 text-blue-600" />}   accentColor="#3B82F6" />
          <KpiCard label="This Page"         value={deals.length.toString()}     sublabel="loaded"    changeType="neutral" icon={<Package className="w-4 h-4 text-on-surface-variant" />} accentColor="#757682" />
          <div
            onClick={toggleHighRisk}
            className={`bg-surface-container-lowest rounded-xl shadow-sm border border-surface-container p-4 cursor-pointer transition-all hover:shadow-md ${highRiskExpanded ? 'ring-2 ring-red-500' : ''}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">High Risk Flagged</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xl font-bold text-red-600">{highRiskCount.toString()}</span>
                {highRiskExpanded ? (
                  <ChevronLeft className="w-4 h-4 text-on-surface-variant" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-on-surface-variant" />
                )}
              </div>
            </div>
            <p className="text-[10px] text-on-surface-variant mt-1">mlScore &gt; 60 · click to {highRiskExpanded ? 'collapse' : 'expand'}</p>
            {highRiskExpanded && <HighRiskTable deals={highRiskDeals} />}
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Table card */}
      <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container">
        {/* Filters */}
        <div className="p-4 border-b border-surface-container-high flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Search route or city…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-surface-container rounded-lg border border-transparent focus:border-primary/30 outline-none"
            />
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="appearance-none bg-surface-container border border-surface-container-high rounded-lg pl-3 pr-7 py-2 text-sm text-on-surface focus:ring-1 focus:ring-primary/30 outline-none cursor-pointer"
            >
              {STATUSES.map(s => <option key={s} value={s}>{s === 'All' ? 'All Status' : s}</option>)}
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
                  {['Route', 'Receiver', 'Date & User', 'Package', 'Price', 'Status', 'Risk', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
                <tbody>
                  {deals.map(s => (
                    <tr
                      key={s.id}
                      className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors ${(s._count?.disputes ?? 0) > 0 ? 'bg-red-50 hover:bg-red-100' : ''}`}
                    >
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-on-surface">{s.fromCity} → {s.toCity}</p>
                        <p className="text-[10px] text-on-surface-variant">ID: #{s.id.slice(-8)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-on-surface">{s.receiverName || '—'}</p>
                        {s.receiverPhone && (
                          <p className="text-xs text-on-surface-variant">{s.receiverPhone}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm text-on-surface">{new Date(s.createdAt).toLocaleDateString()}</p>
                        <p className="text-xs text-on-surface-variant">By {s.sender?.name ?? '—'}</p>
                      </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-on-surface">{s.weight ? `${s.weight}kg` : '< 1kg'}</p>
                      <p className="text-xs text-on-surface-variant">{SIZE_LABELS[s.packageSize] ?? s.packageSize ?? '—'}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-on-surface">{s.currency} {Number(s.price ?? 0).toLocaleString()}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700`}>FIXED</span>
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={STATUS_DISPLAY[s.status] ?? s.status?.toLowerCase()} /></td>
                    {/* mlScore is a real DB field after the add_missing_fields migration */}
                    <td className="px-5 py-4"><RiskBadge score={Math.round(s.mlScore ?? 0)} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigate('/disputes')}
                          className="flex items-center gap-1 p-1.5 rounded-lg hover:bg-surface-container-high transition-colors"
                          title="View disputes"
                        >
                          <Gavel className={`w-4 h-4 ${(s._count?.disputes ?? 0) > 0 ? 'text-red-500' : 'text-on-surface-variant'}`} />
                          {(s._count?.disputes ?? 0) > 0 && (
                            <span className="text-[10px] font-bold text-red-500">{s._count.disputes}</span>
                          )}
                        </button>
                        <button
                          onClick={() => openDrawer(s)}
                          className="p-1.5 rounded-lg hover:bg-surface-container-high text-on-surface-variant transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => requestDelete(s)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && deals.length === 0 && !error && (
          <div className="py-16 text-center">
            <Package className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
            <p className="text-sm text-on-surface-variant">No shipments match your filters</p>
            <button
              onClick={() => { setSearchInput(''); setStatusFilter('All') }}
              className="text-xs text-primary-container mt-2 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}

        <Pagination page={page} totalPages={Math.ceil(total / perPage) || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      </div>



      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel="Delete"
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />

      <ShipmentDrawer
        open={!!drawerDeal}
        deal={drawerDeal}
        detail={drawerDetail}
        loading={drawerLoading}
        error={drawerError}
        onClose={closeDrawer}
      />
    </div>
  )
}
