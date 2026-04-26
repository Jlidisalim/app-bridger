import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, totalPages, total, perPage, onPage }) {
  const from = (page - 1) * perPage + 1
  const to   = Math.min(page * perPage, total)

  const pages = []
  const start = Math.max(1, page - 2)
  const end   = Math.min(totalPages, page + 2)
  for (let i = start; i <= end; i++) pages.push(i)

  return (
    <div className="px-6 py-4 border-t border-surface-container-high flex items-center justify-between text-xs text-on-surface-variant">
      <span>Showing {from}–{to} of {total.toLocaleString()} entries</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {pages.map(n => (
          <button
            key={n}
            onClick={() => onPage(n)}
            className={`w-7 h-7 rounded-lg text-xs font-medium transition-colors ${
              n === page ? 'monolith-gradient text-white' : 'hover:bg-surface-container-high'
            }`}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg hover:bg-surface-container-high disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
