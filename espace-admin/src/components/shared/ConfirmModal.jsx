import { AlertTriangle, X } from 'lucide-react'

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onCancel} />
      <div className="relative bg-surface-container-lowest rounded-2xl shadow-2xl w-full max-w-sm p-6 z-10">
        <div className="flex items-start gap-4 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-600' : 'text-amber-600'}`} />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-on-surface text-base">{title}</h3>
            <p className="text-sm text-on-surface-variant mt-1">{message}</p>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-surface-container-high">
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant rounded-lg border border-outline-variant hover:bg-surface-container-high transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700 text-white' : 'monolith-gradient text-white hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
