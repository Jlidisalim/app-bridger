export default function RiskBadge({ score }) {
  const pct = Math.min(100, Math.max(0, score))
  let label, color, bar
  if (pct <= 30)      { label = 'Low';  color = 'text-emerald-700'; bar = 'bg-emerald-500' }
  else if (pct <= 60) { label = 'Med';  color = 'text-amber-700';   bar = 'bg-amber-500' }
  else                { label = 'High'; color = 'text-red-700';     bar = 'bg-red-500' }

  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <span className={`text-xs font-bold ${color} w-5`}>{label}</span>
      <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] text-on-surface-variant w-6 text-right">{pct}</span>
    </div>
  )
}
