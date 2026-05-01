export default function ChartCard({ title, subtitle, children, actions, className = '' }) {
  return (
    <div className={`bg-surface-container-lowest rounded-xl shadow-card border border-surface-container p-5 ${className}`}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-on-surface">{title}</h3>
          {subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}
