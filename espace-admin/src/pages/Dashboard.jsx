/**
 * Dashboard.jsx — connected to the real backend via GET /admin/stats
 * and GET /admin/tasks.
 *
 * Changes from the original:
 * - All hardcoded mock arrays replaced by state populated from the API.
 * - Added loading skeleton and error banner at the top of the page.
 * - KPI values now come from stats.kpis; charts use stats.dailyActivity,
 *   stats.dealsByStatus, stats.topRoutes, etc.
 * - Admin tasks count (from /admin/tasks) drives the "Moderation Queue" KPI.
 * - Chart data falls back gracefully to empty arrays when the API is loading.
 */
import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import {
  Package, Users, CheckCircle2, DollarSign,
  Clock, ShieldAlert, UserCheck, Flag, AlertCircle, Loader2,
} from 'lucide-react'
import KpiCard from '../components/shared/KpiCard'
import ChartCard from '../components/shared/ChartCard'
import api from '../services/api'

// ── Colour palette ────────────────────────────────────────────────────────────
const ROLE_COLORS   = ['#1A2E82', '#059669', '#D97706', '#6B7280']
const STATUS_COLORS = {
  OPEN: '#93C5FD', MATCHED: '#D97706', PICKED_UP: '#10B981',
  IN_TRANSIT: '#10B981', DELIVERED: '#1A2E82', COMPLETED: '#1A2E82',
  CANCELLED: '#EF4444', DISPUTED: '#EF4444',
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-container-lowest border border-surface-container-high rounded-xl px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-on-surface mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color }} className="font-medium">
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  )
}

// ── Matching Efficiency ───────────────────────────────────────────────────────
function MatchingEfficiency({ matchRate = 0, matches = 0, total = 0 }) {
  const [width, setWidth] = useState(0)
  const color = matchRate >= 70 ? '#1A2E82' : matchRate >= 50 ? '#D97706' : '#EF4444'
  useEffect(() => { const t = setTimeout(() => setWidth(matchRate), 300); return () => clearTimeout(t) }, [matchRate])

  return (
    <ChartCard title="Matching Efficiency" subtitle="Shipments matched to travelers">
      <div className="text-center pt-2 pb-3">
        <div className="text-[40px] font-bold leading-none mb-1" style={{ color }}>{matchRate}%</div>
        <p className="text-xs text-on-surface-variant">{matches.toLocaleString()} of {total.toLocaleString()} matched</p>
      </div>
      <div className="h-3 bg-surface-container rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-[800ms] ease-out" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </ChartCard>
  )
}

// ── Donut legend ──────────────────────────────────────────────────────────────
function DonutLegend({ data, total }) {
  return (
    <div className="space-y-1.5 mt-2">
      {data.map(d => (
        <div key={d.name} className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-on-surface-variant">{d.name}</span>
          </div>
          <span className="font-semibold text-on-surface">
            {total > 0 ? ((d.value / total) * 100).toFixed(1) : 0}%
          </span>
        </div>
      ))}
    </div>
  )
}

// ── Conversion Funnel ─────────────────────────────────────────────────────────
function ConversionFunnel({ statusMap }) {
  const posted     = statusMap?.OPEN || 0
  const accepted   = (statusMap?.MATCHED || 0)
  const inTransit  = (statusMap?.IN_TRANSIT || 0)
  const delivered  = (statusMap?.DELIVERED || 0) + (statusMap?.COMPLETED || 0)

  const base = posted || 1 // avoid division by zero
  const steps = [
    { label: 'Posted',     value: posted },
    { label: 'Accepted',   value: accepted },
    { label: 'In Transit', value: inTransit },
    { label: 'Delivered',  value: delivered },
  ]

  const [animated, setAnimated] = useState(false)
  useEffect(() => { const t = setTimeout(() => setAnimated(true), 400); return () => clearTimeout(t) }, [])

  return (
    <ChartCard title="Conversion Funnel" subtitle="Shipment lifecycle — Posted → Delivered">
      <div className="space-y-2.5 mt-2">
        {steps.map((step, i) => {
          const pct  = ((step.value / base) * 100).toFixed(1)
          const drop = i > 0 && steps[i - 1].value > 0
            ? ((steps[i - 1].value - step.value) / steps[i - 1].value * 100).toFixed(1)
            : null
          const opacity = 1 - i * 0.15
          return (
            <div key={step.label}>
              <div className="flex items-center gap-3">
                <div className="w-20 text-right text-[11px] font-semibold text-on-surface-variant flex-shrink-0">{step.label}</div>
                <div className="flex-1 h-7 bg-surface-container rounded-lg overflow-hidden">
                  <div
                    className="h-full rounded-lg transition-all duration-700 ease-out flex items-center justify-end pr-3"
                    style={{ width: animated ? `${Math.max(Number(pct), 2)}%` : '0%', backgroundColor: `rgba(26,46,130,${opacity})` }}
                  >
                    <span className="text-[10px] text-white font-semibold">{step.value.toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-[11px] font-semibold text-on-surface w-10 text-right">{pct}%</div>
                {drop && parseFloat(drop) > 25 && (
                  <span className="text-[10px] text-red-500 font-bold">↓{drop}%</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </ChartCard>
  )
}

// ── Dashboard page ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [stats,   setStats]   = useState(null)
  const [tasks,   setTasks]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  // Fetch stats and tasks in parallel on mount
  useEffect(() => {
    Promise.all([
      api.get('/admin/stats'),
      api.get('/admin/tasks?status=OPEN&limit=5'),
    ])
      .then(([statsRes, tasksRes]) => {
        setStats(statsRes.data)
        setTasks(tasksRes.data)
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load dashboard data.'))
      .finally(() => setLoading(false))
  }, [])

  // ── Derived chart data ────────────────────────────────────────────────
  const rolesData = stats?.usersByRole
    ?.filter(r => r.count > 0)
    .map((r, i) => ({ name: r.role, value: r.count, color: ROLE_COLORS[i % ROLE_COLORS.length] }))
    ?? []

  const shipmentStatus = Object.entries(stats?.dealsByStatus ?? {}).map(([name, value]) => ({
    name, value, color: STATUS_COLORS[name] ?? '#6B7280',
  }))

  const topRoutes   = stats?.topRoutes ?? []
  const maxVol      = Math.max(...topRoutes.map(r => r.volume), 1)
  const dailyStats  = stats?.dailyActivity ?? []
  const rolesTotal  = rolesData.reduce((a, b) => a + b.value, 0)
  const statusTotal = shipmentStatus.reduce((a, b) => a + b.value, 0)

  if (loading) return (
    <div className="flex items-center justify-center h-96">
      <Loader2 className="w-8 h-8 animate-spin text-primary opacity-60" />
    </div>
  )

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5 pb-10">

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error} — showing live data where available.</span>
        </div>
      )}

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Total Shipments Posted"
          value={(stats?.kpis?.totalDeals ?? 0).toLocaleString()}
          changeType="neutral"
          icon={<Package className="w-4 h-4" style={{ color: '#1A2E82' }} />}
          accentColor="#1A2E82"
        />
        <KpiCard
          label="Total Users"
          value={(stats?.kpis?.totalUsers ?? 0).toLocaleString()}
          changeType="neutral"
          icon={<Users className="w-4 h-4" style={{ color: '#3B82F6' }} />}
          accentColor="#3B82F6"
        />
        <KpiCard
          label="Successful Matches"
          value={(stats?.kpis?.successfulMatches ?? 0).toLocaleString()}
          changeType="neutral"
          icon={<CheckCircle2 className="w-4 h-4" style={{ color: '#059669' }} />}
          accentColor="#059669"
        />
        <KpiCard
          label="Open Admin Tasks"
          value={(stats?.kpis?.openTasks ?? 0).toLocaleString()}
          changeType="neutral"
          icon={<DollarSign className="w-4 h-4" style={{ color: '#1A2E82' }} />}
          accentColor="#1A2E82"
        />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Match Rate"
          value={`${stats?.kpis?.matchRate ?? 0}%`}
          sublabel="deals matched"
          changeType="neutral"
          icon={<Clock className="w-4 h-4 text-teal-600" />}
          accentColor="#0D9488"
        />
        <KpiCard
          label="Open Disputes"
          value={(stats?.kpis?.openDisputes ?? 0).toString()}
          sublabel="require review"
          changeType="neutral"
          icon={<ShieldAlert className="w-4 h-4 text-red-600" />}
          accentColor="#DC2626"
        />
        <KpiCard
          label="KYC Pending"
          value={(stats?.kpis?.kycPending ?? 0).toString()}
          sublabel="Review required"
          changeType="neutral"
          icon={<UserCheck className="w-4 h-4 text-amber-600" />}
          accentColor="#D97706"
        />
        <KpiCard
          label="Open Tasks"
          value={(tasks?.total ?? stats?.kpis?.openTasks ?? 0).toString()}
          sublabel={tasks?.items?.length ? `${tasks.items.length} recent` : 'in queue'}
          changeType="neutral"
          icon={<Flag className="w-4 h-4 text-amber-600" />}
          accentColor="#D97706"
        />
      </div>

      {/* Activity + Matching + Roles */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ChartCard title="Activity Over Time" subtitle="Shipments posted & matches — last 30 days">
            <div className="flex gap-5 mb-3">
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant"><div className="w-4 h-0.5 bg-[#1A2E82] rounded" /> Shipments Posted</div>
              <div className="flex items-center gap-1.5 text-xs text-on-surface-variant"><div className="w-4 h-0.5 bg-[#10B981] rounded" /> Matches</div>
            </div>
            {dailyStats.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailyStats}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Line type="monotone" dataKey="dealsPosted" name="Shipments Posted" stroke="#1A2E82" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="matches"     name="Matches"          stroke="#10B981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-sm text-on-surface-variant">No activity data yet</div>
            )}
          </ChartCard>
        </div>

        <div className="space-y-4">
          <MatchingEfficiency
            matchRate={stats?.kpis?.matchRate ?? 0}
            matches={stats?.kpis?.successfulMatches ?? 0}
            total={stats?.kpis?.totalDeals ?? 0}
          />
          <ChartCard title="User Roles" subtitle="Distribution by role">
            {rolesData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={rolesData} cx="50%" cy="50%" innerRadius={34} outerRadius={50} dataKey="value" paddingAngle={2}>
                      {rolesData.map(d => <Cell key={d.name} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={v => v.toLocaleString()} />
                  </PieChart>
                </ResponsiveContainer>
                <DonutLegend data={rolesData} total={rolesTotal} />
              </>
            ) : (
              <div className="h-[110px] flex items-center justify-center text-sm text-on-surface-variant">No data</div>
            )}
          </ChartCard>
        </div>
      </div>

      {/* Shipment Status + Top Routes */}
      <div className="grid grid-cols-2 gap-4">
        <ChartCard title="Shipment Status Pipeline" subtitle="Current status breakdown">
          {shipmentStatus.length > 0 ? (
            <div className="flex gap-2 items-center">
              <ResponsiveContainer width="55%" height={180}>
                <PieChart>
                  <Pie data={shipmentStatus} cx="50%" cy="50%" innerRadius={46} outerRadius={65} dataKey="value" paddingAngle={2}>
                    {shipmentStatus.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={v => v.toLocaleString()} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1">
                <DonutLegend data={shipmentStatus} total={statusTotal} />
              </div>
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-sm text-on-surface-variant">No deals yet</div>
          )}
        </ChartCard>

        <ChartCard title="Top Routes" subtitle="By shipment volume">
          {topRoutes.length > 0 ? (
            <div className="space-y-2 mt-2">
              {topRoutes.map(r => (
                <div key={r.route} className="flex items-center gap-3">
                  <div className="w-24 text-[11px] font-semibold text-on-surface-variant text-right flex-shrink-0">{r.route}</div>
                  <div className="flex-1 h-6 bg-surface-container rounded overflow-hidden">
                    <div
                      className="h-full bg-[#1A2E82] rounded flex items-center justify-end pr-2 transition-all duration-500"
                      style={{ width: `${(r.volume / maxVol) * 100}%` }}
                    >
                      <span className="text-[10px] text-white font-medium">{r.volume.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-[180px] flex items-center justify-center text-sm text-on-surface-variant">No routes yet</div>
          )}
        </ChartCard>
      </div>

      {/* Conversion Funnel */}
      <ConversionFunnel statusMap={stats?.dealsByStatus ?? {}} />
    </div>
  )
}
