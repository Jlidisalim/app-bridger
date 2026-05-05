/**
 * Analytics.jsx — connected to the real backend.
 *
 * Changes from the original:
 * - Removed all hardcoded mock data arrays (revenueMonthly, topRoutes,
 *   categories, userGrowth, revenueByCountry).
 * - All chart data now fetched from GET /admin/analytics on mount.
 * - KPI cards driven by real kpis.totalUsers / kpis.matchRate from the API.
 * - Revenue trend = monthly GMV (sum of deal prices); not platform fee revenue
 *   since fee billing is not tracked in the current schema.
 * - Loading skeleton and error banner added.
 */
import { useState, useEffect } from 'react'
import {
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import { DollarSign, Users, CheckCircle2, RefreshCw, Loader2, AlertCircle, Wallet, ArrowRightLeft, Info } from 'lucide-react'
import KpiCard from '../components/shared/KpiCard'
import ChartCard from '../components/shared/ChartCard'
import api from '../services/api'

// Fee model — kept in sync with the per-deal breakdown elsewhere in the app.
//  • Service Fee  4.0%  → Bridger margin (net benefit)
//  • Logistics   12.0%  → traveler payout (pass-through)
//  • Insurance    1.5%  → insurance partner (pass-through)
//  • Item value   100%  → seller / traveler (pass-through)
const FEE_RATE          = 0.04
const PASS_THROUGH_MULT = 1 + 0.12 + 0.015   // 1.135

function PrimarySummaryCard({ label, value, sublabel, icon, accent, definition }) {
  return (
    <div className="relative bg-surface-container-lowest rounded-2xl shadow-card border border-surface-container overflow-hidden">
      <div className="h-1" style={{ backgroundColor: accent }} />
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.14em] uppercase text-on-surface-variant">{label}</span>
              <span className="group relative inline-flex">
                <Info className="w-3.5 h-3.5 text-on-surface-variant/50 cursor-help" />
                <span className="invisible group-hover:visible absolute z-20 left-0 top-5 w-64 bg-surface-container-highest text-on-surface text-[11px] leading-relaxed rounded-lg p-3 shadow-xl border border-surface-container-high">
                  {definition}
                </span>
              </span>
            </div>
            <p className="text-[34px] font-semibold text-on-surface leading-none mt-3 tabular-nums">{value}</p>
            {sublabel && <p className="text-xs text-on-surface-variant mt-1.5">{sublabel}</p>}
          </div>
          <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ backgroundColor: accent + '1A' }}>
            {icon}
          </div>
        </div>
      </div>
    </div>
  )
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-container-lowest border border-surface-container-high rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color ?? p.fill }} className="font-medium">
          {p.name}: {typeof p.value === 'number' && p.name?.toLowerCase().includes('revenue')
            ? `$${p.value.toLocaleString()}` : p.value?.toLocaleString?.() ?? p.value}
        </p>
      ))}
    </div>
  )
}

export default function Analytics() {
  const [period,       setPeriod]       = useState('12m')
  // 'top' = top 6 destinations by deal volume, 'bottom' = bottom 6
  const [countryView,  setCountryView]  = useState('top')
  // GMV Trends data view — 'passthrough' shows Total Pass-Through Value,
  // 'netbenefit' shows the 4% service-fee margin.
  const [gmvView,      setGmvView]      = useState('passthrough')
  const [data,         setData]         = useState(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  // Fetch all analytics data from the new /admin/analytics endpoint
  useEffect(() => {
    setLoading(true)
    setError(null)
    api.get('/admin/analytics')
      .then(r => setData(r.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load analytics.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto flex items-center justify-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-primary opacity-40" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="p-6 max-w-[1400px] mx-auto">
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error ?? 'No data returned'}</span>
        </div>
      </div>
    )
  }

  // Destructure fetched data
  const { kpis, revenueMonthly = [], topRoutes = [], dealsByCategory = [], userGrowth = [], revenueByCountry = [] } = data

  // Slice revenue chart based on selected period
  const revenueChartData = period === '30d'
    ? revenueMonthly.slice(-2)                 // last 2 months as proxy for 30d
    : period === '6m' ? revenueMonthly.slice(-6) : revenueMonthly

  const maxRouteCount = Math.max(...topRoutes.map(r => r.count), 1)
  const catTotal      = dealsByCategory.reduce((a, b) => a + b.value, 0) || 1

  // Period GMV drives the primary summary cards. Sliced to match the chart selector.
  const periodGmv      = revenueChartData.reduce((s, r) => s + (r.revenue ?? 0), 0)
  const totalNetBenefit  = Math.round(periodGmv * FEE_RATE)
  const totalPassThrough = Math.round(periodGmv * PASS_THROUGH_MULT)
  const periodLabel = period === '30d' ? 'last 2 months' : period === '6m' ? 'last 6 months' : 'last 12 months'

  // Derive monthly series for the GMV Trends chart depending on the active view.
  const gmvSeries = revenueChartData.map(r => ({
    month: r.month,
    value: gmvView === 'netbenefit'
      ? Math.round((r.revenue ?? 0) * FEE_RATE)
      : Math.round((r.revenue ?? 0) * PASS_THROUGH_MULT),
  }))
  const gmvMeta = gmvView === 'netbenefit'
    ? { label: 'Total Net Benefit',        color: '#059669', gradId: 'netGrad', subtitle: '4% service-fee margin retained per month' }
    : { label: 'Total Pass-Through Value', color: '#3B82F6', gradId: 'ptGrad',  subtitle: 'Funds routed through escrow per month (×1.135)' }

  // MoM growth pulled from the backend analytics endpoint.
  const usersMoM = kpis?.usersMoM ?? 0
  const dealsMoM = kpis?.dealsMoM ?? 0
  const fmtMoM = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}% vs last month`
  const momType = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : 'neutral')

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Analytics</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">Net benefit, pass-through volume, and platform health for the {periodLabel}</p>
        </div>
        <div className="flex border border-surface-container-high rounded-lg overflow-hidden">
          {[['12m','12 Months'],['6m','6 Months'],['30d','Last 2mo']].map(([k, l]) => (
            <button
              key={k}
              onClick={() => setPeriod(k)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${period === k ? 'bg-[#1A2E82] text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Primary summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PrimarySummaryCard
          label="Total Net Benefit"
          value={`$${totalNetBenefit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sublabel={`Exclusive Bridger margin · 4% of $${periodGmv.toLocaleString()} GMV (${periodLabel})`}
          icon={<Wallet className="w-5 h-5 text-emerald-600" />}
          accent="#059669"
          definition="Aggregates the 4% service fee earned across all GMV in the active period — Σ(monthly GMV) × 0.04. This is the only revenue Bridger retains."
        />
        <PrimarySummaryCard
          label="Total Pass-Through Value"
          value={`$${totalPassThrough.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
          sublabel={`Item value + logistics (12%) + insurance (1.5%) routed through escrow (${periodLabel})`}
          icon={<ArrowRightLeft className="w-5 h-5 text-blue-600" />}
          accent="#3B82F6"
          definition="Aggregates funds Bridger facilitates but does not keep — Σ(monthly GMV) × 1.135. Indicates marketplace throughput and the gross amount under custody, distinct from earnings."
        />
      </div>

      {/* Secondary KPIs — driven by /admin/analytics kpis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Total Users"
          value={kpis.totalUsers?.toLocaleString() ?? '—'}
          sublabel="All accounts on file"
          change={fmtMoM(usersMoM)}
          changeType={momType(usersMoM)}
          icon={<Users className="w-4 h-4 text-blue-600" />}
          accentColor="#3B82F6"
        />
        <KpiCard
          label="Total Deals"
          value={kpis.totalDeals?.toLocaleString() ?? '—'}
          sublabel="All statuses, lifetime"
          change={fmtMoM(dealsMoM)}
          changeType={momType(dealsMoM)}
          icon={<DollarSign className="w-4 h-4 text-emerald-600" />}
          accentColor="#059669"
        />
        <KpiCard
          label="Match Rate"
          value={`${kpis.matchRate ?? 0}%`}
          sublabel="Deals progressed past OPEN"
          changeType="neutral"
          icon={<CheckCircle2 className="w-4 h-4 text-teal-600" />}
          accentColor="#0D9488"
        />
      </div>

      {/* Compact monetary-growth trend pair — sized to match Top Routes / Categories below. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GMV Trends — monetary growth view, toggleable between Pass-Through & Net Benefit */}
        <ChartCard
          title="GMV Trends"
          subtitle={gmvMeta.subtitle}
          actions={
            <div className="flex border border-surface-container-high rounded-lg overflow-hidden">
              {[['passthrough','Pass-Through'],['netbenefit','Net Benefit']].map(([k, l]) => (
                <button
                  key={k}
                  onClick={() => setGmvView(k)}
                  className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${gmvView === k ? 'bg-[#1A2E82] text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
                >
                  {l}
                </button>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={gmvSeries} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gmvMeta.gradId} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%"   stopColor={gmvMeta.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={gmvMeta.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                content={<ChartTooltip />}
                formatter={v => [`$${v.toLocaleString()}`, gmvMeta.label]}
              />
              <Area type="monotone" dataKey="value" name={gmvMeta.label} stroke={gmvMeta.color} strokeWidth={2} fill={`url(#${gmvMeta.gradId})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* User Growth — sized to match GMV Trends and the Top Routes row below */}
        <ChartCard title="User Growth" subtitle="New registrations per month — last 12 months">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={userGrowth} margin={{ top: 5, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="regGrad" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#1A2E82" stopOpacity={0.12} />
                  <stop offset="100%" stopColor="#1A2E82" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="registrations" name="New Registrations" stroke="#1A2E82" strokeWidth={2} fill="url(#regGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Top Routes + Categories — same grid scale as GMV Trends / User Growth above */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Routes — real data from deals groupBy */}
        <ChartCard title="Top Performing Routes" subtitle="By shipment volume">
          <div className="space-y-2.5 mt-2">
            {topRoutes.length > 0 ? topRoutes.map(r => (
              <div key={r.route} className="flex items-center gap-3 cursor-pointer group">
                <div className="w-24 text-[11px] font-semibold text-on-surface-variant text-right flex-shrink-0 group-hover:text-primary transition-colors truncate">{r.route}</div>
                <div className="flex-1 h-6 bg-surface-container rounded overflow-hidden">
                  <div
                    className="h-full bg-[#1A2E82] group-hover:bg-[#3B82F6] rounded flex items-center justify-end pr-2 transition-all duration-300"
                    style={{ width: `${(r.count / maxRouteCount) * 100}%`, minWidth: '24px' }}
                  >
                    <span className="text-[10px] text-white font-medium">{r.count}</span>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-sm text-on-surface-variant text-center py-8">No route data yet</p>
            )}
          </div>
        </ChartCard>

        {/* Deal Categories Donut — real packageSize distribution */}
        <ChartCard
          title="Deal Categories"
          subtitle="Shipment type distribution"
          actions={
            <button className="p-2 hover:bg-surface-container-high rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-on-surface-variant" />
            </button>
          }
        >
          {dealsByCategory.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={dealsByCategory} cx="50%" cy="50%" innerRadius={50} outerRadius={70} dataKey="value" paddingAngle={2}>
                    {dealsByCategory.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={v => [`${v}%`, '']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {dealsByCategory.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-on-surface-variant truncate max-w-[110px]">{c.name}</span>
                    </div>
                    <span className="font-semibold text-on-surface">{c.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant text-center py-8">No deal data yet</p>
          )}
        </ChartCard>
      </div>

      {/* Deals by Destination Country — same horizontal-bar pattern as Top Performing Routes */}
      <ChartCard
        title="Deals by Destination Country"
        subtitle={countryView === 'top' ? 'Top 6 destinations by shipment volume' : 'Bottom 6 destinations by shipment volume'}
        actions={
          <div className="flex border border-surface-container-high rounded-lg overflow-hidden">
            {[['top','Top 6'],['bottom','Bottom 6']].map(([k, l]) => (
              <button
                key={k}
                onClick={() => setCountryView(k)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${countryView === k ? 'bg-[#1A2E82] text-white' : 'text-on-surface-variant hover:bg-surface-container-high'}`}
              >
                {l}
              </button>
            ))}
          </div>
        }
      >
        {(() => {
          if (revenueByCountry.length === 0) {
            return <p className="text-sm text-on-surface-variant text-center py-8">No country data yet</p>
          }
          const ranked = countryView === 'top'
            ? revenueByCountry.slice(0, 6)
            : [...revenueByCountry].sort((a, b) => a.deals - b.deals).slice(0, 6)
          const maxDeals = Math.max(...ranked.map(r => r.deals), 1)
          return (
            <div className="space-y-2.5 mt-2">
              {ranked.map(r => (
                <div key={r.country} className="flex items-center gap-3 cursor-pointer group">
                  <div className="w-24 text-[11px] font-semibold text-on-surface-variant text-right flex-shrink-0 group-hover:text-primary transition-colors truncate">{r.country}</div>
                  <div className="flex-1 h-6 bg-surface-container rounded overflow-hidden">
                    <div
                      className="h-full bg-[#1A2E82] group-hover:bg-[#3B82F6] rounded flex items-center justify-end pr-2 transition-all duration-300"
                      style={{ width: `${(r.deals / maxDeals) * 100}%`, minWidth: '24px' }}
                    >
                      <span className="text-[10px] text-white font-medium">{r.deals}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </ChartCard>
    </div>
  )
}
