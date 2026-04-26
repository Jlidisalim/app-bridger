import { useState, useEffect } from 'react'
import {
  TrendingUp, Plus, Trash2, AlertCircle, Loader2, RefreshCw,
} from 'lucide-react'
import Pagination from '../components/shared/Pagination'
import ConfirmModal from '../components/shared/ConfirmModal'
import api from '../services/api'

export default function PricingDataManager() {
  const [data,      setData]     = useState([])
  const [page,      setPage]     = useState(1)
  const [total,     setTotal]    = useState(0)
  const [loading,   setLoading]  = useState(true)
  const [error,     setError]    = useState(null)
  const [confirm,   setConfirm]  = useState(null)

  const [showForm,  setShowForm] = useState(false)
  const [newPoint,  setNewPoint] = useState({ distance: '', weight: '', volume: '', urgent: false, price: '' })
  const [submitting, setSubmitting] = useState(false)

  const perPage = 20

  const fetchData = () => {
    setLoading(true)
    setError(null)
    api.get(`/admin/pricing-data?page=${page}&limit=${perPage}`)
      .then(r => { setData(r.data.items); setTotal(r.data.total) })
      .catch(err => setError(err.response?.data?.error || 'Failed to load pricing data.'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [page])

  function handleAdd() {
    setSubmitting(true)
    api.post('/admin/pricing-data', {
      distance: Number(newPoint.distance),
      weight:   Number(newPoint.weight),
      volume:   Number(newPoint.volume) || 0,
      urgent:   Boolean(newPoint.urgent),
      price:    Number(newPoint.price),
    })
      .then(() => {
        setNewPoint({ distance: '', weight: '', volume: '', urgent: false, price: '' })
        setShowForm(false)
        fetchData()
      })
      .catch(err => alert('Add failed: ' + (err.response?.data?.error || err.message)))
      .finally(() => setSubmitting(false))
  }

  function handleDelete(id) {
    setConfirm({
      title: 'Delete Data Point',
      message: 'Remove this ML training sample?',
      danger: true,
      onConfirm: async () => {
        try {
          await api.delete(`/admin/pricing-data/${id}`)
          setData(prev => prev.filter(p => p.id !== id))
          setTotal(prev => prev - 1)
        } catch (err) { alert('Delete failed: ' + (err.response?.data?.error || err.message)) }
        setConfirm(null)
      },
    })
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">Pricing Data Manager</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">ML training data: distance, weight, and price</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold monolith-gradient text-white rounded-xl hover:opacity-90 transition-opacity shadow-sm"
          >
            <Plus className="w-4 h-4" /> Add Data Point
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {/* Add Form */}
      {showForm && (
        <div className="bg-surface-container-lowest rounded-xl p-5 border border-surface-container space-y-4">
          <h3 className="text-sm font-semibold text-on-surface">New Training Sample</h3>
          <div className="grid grid-cols-4 gap-4">
            <input
              type="number"
              step="0.01"
              value={newPoint.distance}
              onChange={e => setNewPoint(p => ({ ...p, distance: e.target.value }))}
              placeholder="Distance (km)"
              className="bg-surface-container rounded-lg px-3 py-2 text-sm border border-transparent focus:border-primary/30 outline-none"
            />
            <input
              type="number"
              step="0.1"
              value={newPoint.weight}
              onChange={e => setNewPoint(p => ({ ...p, weight: e.target.value }))}
              placeholder="Weight (kg)"
              className="bg-surface-container rounded-lg px-3 py-2 text-sm border border-transparent focus:border-primary/30 outline-none"
            />
            <input
              type="number"
              step="0.01"
              value={newPoint.price}
              onChange={e => setNewPoint(p => ({ ...p, price: e.target.value }))}
              placeholder="Price (USD)"
              className="bg-surface-container rounded-lg px-3 py-2 text-sm border border-transparent focus:border-primary/30 outline-none"
            />
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
                <input
                  type="checkbox"
                  checked={newPoint.urgent}
                  onChange={e => setNewPoint(p => ({ ...p, urgent: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300"
                />
                Urgent
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={submitting || !newPoint.distance || !newPoint.weight || !newPoint.price}
              className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin inline mr-1" /> : <Plus className="w-4 h-4 inline mr-1" />}
              Add
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-semibold border border-outline-variant rounded-lg hover:bg-surface-container-high"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
        </div>
      ) : (
        <div className="bg-surface-container-lowest rounded-xl shadow-card border border-surface-container overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface-container-low/40">
                <tr>
                  {['Distance (km)', 'Weight (kg)', 'Volume (m³)', 'Urgent', 'Price (USD)', 'Created', 'Actions'].map(h => (
                    <th key={h} className="px-5 py-3 text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((pt, idx) => {
                  const rowColor = idx % 2 === 0 ? 'bg-surface-container-low/20' : ''
                  return (
                    <tr key={pt.id} className={`border-t border-surface-container hover:bg-surface-container-low/40 transition-colors ${rowColor}`}>
                      <td className="px-5 py-4 text-sm text-on-surface font-medium">{Number(pt.distance).toLocaleString()}</td>
                      <td className="px-5 py-4 text-sm text-on-surface">{Number(pt.weight).toLocaleString()}</td>
                      <td className="px-5 py-4 text-sm text-on-surface-variant">{Number(pt.volume || 0).toLocaleString()}</td>
                      <td className="px-5 py-4">
                        {pt.urgent ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">Yes</span>
                        ) : (
                          <span className="text-xs text-on-surface-variant">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-sm font-semibold text-on-surface">
                        ${Number(pt.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-5 py-4 text-xs text-on-surface-variant">
                        {pt.createdAt ? new Date(pt.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={() => handleDelete(pt.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {data.length === 0 && !loading && !error && (
            <div className="py-16 text-center">
              <TrendingUp className="w-10 h-10 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="text-sm text-on-surface-variant">No pricing data points yet</p>
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {!loading && data.length > 0 && (
        <Pagination page={page} totalPages={totalPages || 1} total={total} perPage={perPage} onPage={p => setPage(p)} />
      )}

      <ConfirmModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        danger={confirm?.danger}
        confirmLabel="Delete"
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}
