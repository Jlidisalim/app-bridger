import { useCallback } from 'react'
import { Download } from 'lucide-react'

function buildCSV(deals) {
  if (!deals || deals.length === 0) return ''
  const headers = [
    'ID', 'From', 'To', 'Sender', 'Traveler', 'Receiver Name', 'Receiver Phone',
    'Size', 'Weight (kg)', 'Price', 'Currency', 'Status', 'ML Score',
    'Pickup Date', 'Delivery Date', 'Created At',
  ]
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = deals.map(d => [
    d.id,
    d.fromCity, d.toCity,
    d.sender?.name ?? '', d.traveler?.name ?? '',
    d.receiverName ?? '', d.receiverPhone ?? '',
    d.packageSize, d.weight ?? '', d.price, d.currency, d.status,
    Math.round(d.mlScore ?? 0),
    d.pickupDate ? new Date(d.pickupDate).toLocaleString() : '',
    d.deliveryDate ? new Date(d.deliveryDate).toLocaleString() : '',
    new Date(d.createdAt).toLocaleString(),
  ].map(escape).join(','))
  return [headers.map(escape).join(','), ...rows].join('\n')
}

function downloadCSV(csv, filename = 'shipments.csv') {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ExportButton({ onClick, data, filename, label = 'Export CSV' }) {
  const handleClick = useCallback(() => {
    if (onClick) { onClick(); return }
    const csv = buildCSV(data)
    if (!csv) return
    downloadCSV(csv, filename || 'shipments.csv')
  }, [onClick, data, filename])

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-on-surface-variant border border-outline-variant rounded-xl hover:bg-surface-container-high transition-colors"
    >
      <Download className="w-4 h-4" /> {label}
    </button>
  )
}
