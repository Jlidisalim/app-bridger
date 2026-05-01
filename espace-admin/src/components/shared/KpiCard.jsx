import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

export default function KpiCard({ label, value, change, changeType = 'neutral', icon, accentColor = '#1A2E82', sublabel }) {
  const changeColors = {
    up:      'text-emerald-600 bg-emerald-50',
    down:    'text-red-600 bg-red-50',
    neutral: 'text-on-surface-variant bg-surface-container',
  }
  const ChangeIcon = changeType === 'up' ? TrendingUp : changeType === 'down' ? TrendingDown : Minus

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
      <div style={{ backgroundColor: accentColor, height: 3 }} />
      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant">{label}</span>
          {icon && (
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: accentColor + '1A' }}>
              {icon}
            </div>
          )}
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-[22px] font-semibold text-on-surface leading-tight">{value}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {change && (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${changeColors[changeType]}`}>
              <ChangeIcon className="w-3 h-3" /> {change}
            </span>
          )}
          {sublabel && <span className="text-[11px] text-on-surface-variant">{sublabel}</span>}
        </div>
      </div>
    </div>
  )
}
