const STATUS_MAP = {
  active:     { label: 'Active',     cls: 'bg-emerald-100 text-emerald-700' },
  pending:    { label: 'Pending',    cls: 'bg-amber-100 text-amber-700' },
  draft:      { label: 'Draft',      cls: 'bg-gray-100 text-gray-600' },
  cancelled:  { label: 'Cancelled',  cls: 'bg-red-100 text-red-700' },
  reported:   { label: 'Reported',   cls: 'bg-orange-100 text-orange-700' },
  flagged:    { label: 'Flagged',    cls: 'bg-red-100 text-red-700' },
  completed:  { label: 'Completed',  cls: 'bg-blue-100 text-blue-700' },
  in_transit: { label: 'In Transit', cls: 'bg-purple-100 text-purple-700' },
  delivered:  { label: 'Delivered',  cls: 'bg-teal-100 text-teal-700' },
  suspended:  { label: 'Suspended',  cls: 'bg-red-100 text-red-700' },
  accepted:   { label: 'Accepted',   cls: 'bg-indigo-100 text-indigo-700' },
}

export default function StatusBadge({ status }) {
  const s = STATUS_MAP[status?.toLowerCase()] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`}>
      {s.label}
    </span>
  )
}
