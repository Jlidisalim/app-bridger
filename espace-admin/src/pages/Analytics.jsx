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
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart,
} from 'recharts'
import { DollarSign, Users, CheckCircle2, RefreshCw, Loader2, AlertCircle } from 'lucide-react'
import KpiCard from '../components/shared/KpiCard'
import ChartCard from '../components/shared/ChartCard'
import api from '../services/api'

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
  const [countryView,  setCountryView]  = useState('revenue')
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

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-on-surface">Analytics</h1>
        <p className="text-sm text-on-surface-variant mt-0.5">Deep-dive platform metrics for strategic decisions</p>
      </div>

      {/* KPIs — driven by /admin/analytics kpis */}
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Total Users"    value={kpis.totalUsers?.toLocaleString() ?? '—'}    changeType="neutral" icon={<Users        className="w-4 h-4 text-blue-600" />}    accentColor="#3B82F6" />
        <KpiCard label="Total Deals"    value={kpis.totalDeals?.toLocaleString() ?? '—'}    changeType="neutral" icon={<DollarSign   className="w-4 h-4 text-emerald-600" />} accentColor="#059669" />
        <KpiCard label="Match Rate"     value={`${kpis.matchRate ?? 0}%`}                    changeType="neutral" icon={<CheckCircle2 className="w-4 h-4 text-teal-600" />}    accentColor="#0D9488" />
      </div>

      {/* Revenue (GMV) Trends — full width */}
      <ChartCard
        title="GMV Trends"
        subtitle="Total deal value posted per month (GMV proxy)"
        actions={
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
        }
      >
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={revenueChartData}>
            <defs>
              <linearGradient id="revGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#1A2E82" stopOpacity={0.15} />
                <stop offset="100%" stopColor="#1A2E82" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} formatter={v => [`$${v.toLocaleString()}`, 'GMV']} />
            <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#1A2E82" strokeWidth={2} fill="url(#revGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Top Routes + Categories */}
      <div className="grid grid-cols-2 gap-4">
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

      {/* User Growth — real monthly registrations */}
      <ChartCard title="User Growth" subtitle="New registrations per month — last 12 months">
        <div className="flex gap-5 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant"><div className="w-4 h-0.5 bg-[#1A2E82] rounded" /> New Registrations</div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={userGrowth}>
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

      {/* Deals by Country */}
      <ChartCard
        title="Deals by Destination Country"
        subtitle="Top 6 destination markets"
        actions={
          <div className="flex border border-surface-container-high rounded-lg overflow-hidden">
            {[['revenue','Value'],['deals','Volume']].map(([k, l]) => (
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
        {revenueByCountry.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={revenueByCountry} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="country" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={v => countryView === 'revenue' ? `$${(v/1000).toFixed(0)}k` : v}
              />
              <Tooltip content={<ChartTooltip />} formatter={v => countryView === 'revenue' ? [`$${v.toLocaleString()}`, 'GMV'] : [v, 'Deals']} />
              <Bar dataKey={countryView} name={countryView === 'revenue' ? 'GMV' : 'Deals'} fill="#1A2E82" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-on-surface-variant text-center py-8">No country data yet</p>
        )}
      </ChartCard>
    </div>
  )
}
