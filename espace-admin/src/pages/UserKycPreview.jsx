import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, X, AlertTriangle, ShieldCheck, ChevronDown, Loader2, AlertCircle } from 'lucide-react'
import api from '../services/api'

const REJECT_REASONS = [
  'Document expired',
  'Photo unclear or blurry',
  'Information does not match',
  'Suspected fraudulent document',
  'Missing pages',
  'Other',
]

// ── KYC Rejection Modal ───────────────────────────────────────────────────────
function KycRejectionModal({ onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-container-lowest rounded-xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-lg font-semibold text-on-surface">Reject Verification</h3>
            <p className="text-sm text-on-surface-variant mt-0.5">
              Provide a reason and instructions for the applicant to rectify their submission.
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-surface-container-high rounded-lg flex-shrink-0">
            <X className="w-4 h-4 text-on-surface-variant" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Reason dropdown */}
          <div>
            <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
              Reason for Rejection
            </label>
            <div className="relative">
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                className="w-full appearance-none bg-surface-container-low border-none rounded-xl pl-4 pr-10 py-3 text-sm text-on-surface outline-none focus:ring-2 focus:ring-primary-container/20"
              >
                <option value="">Select a primary reason</option>
                {REJECT_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant pointer-events-none" />
            </div>
          </div>

          {/* Additional notes */}
          <div>
            <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant block mb-1.5">
              Additional Notes
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="E.g. Please ensure your name matches the bank statement exactly..."
              className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/60 outline-none focus:ring-2 focus:ring-primary-container/20 resize-none"
            />
          </div>

          {/* Warning */}
          <div className="flex items-start gap-3 bg-error-container/60 p-3 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-on-error-container mt-0.5 flex-shrink-0" />
            <p className="text-xs text-on-error-container leading-relaxed">
              This action will notify the user immediately and pause their onboarding flow until a new document is provided.
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-on-surface-variant border border-outline-variant rounded-xl hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason, notes)}
            disabled={!reason}
            className="flex-1 py-2.5 text-sm font-semibold bg-error text-white rounded-xl hover:bg-error/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Doc Section ───────────────────────────────────────────────────────────────
function DocCard({ title, bg, children }) {
  return (
    <div className="bg-surface-container-low rounded-xl p-4">
      <p className="text-[10px] font-semibold tracking-widest uppercase text-on-surface-variant mb-3">{title}</p>
      <div className={`rounded-xl h-32 ${bg} flex items-center justify-center`}>
        {children}
      </div>
    </div>
  )
}

// Fetch user + documents from backend
async function fetchKycData(userId) {
  const { data } = await api.get(`/admin/users/${userId}/kyc-documents`)
  return data
}

// Submit approval/rejection to backend
async function submitKycDecision(userId, status, documentId = null) {
  await api.patch(`/admin/users/${userId}/kyc`, { status, documentId })
}

export default function UserKycPreview() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const [kycData, setKycData]   = useState({ user: null, documents: [] })
  const [actionLoading, setActionLoading] = useState(false)
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [status, setStatus] = useState(null) // 'approved' | 'rejected'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchKycData(id)
        if (!cancelled) setKycData(data)
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load KYC documents.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id])

  const handleApprove = async () => {
    setActionLoading(true)
    try {
      // Approve all submitted documents (send no documentId → updates user.kycStatus)
      await submitKycDecision(id, 'APPROVED')
      setStatus('approved')
    } catch (err) {
      setError(err.response?.data?.error || 'Approval failed.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async (reason, notes) => {
    setShowRejectModal(false)
    setActionLoading(true)
    try {
      // Reject all documents (or could target a specific one)
      await submitKycDecision(id, 'REJECTED')
      setStatus('rejected')
    } catch (err) {
      setError(err.response?.data?.error || 'Rejection failed.')
    } finally {
      setActionLoading(false)
    }
  }

  const user       = kycData.user
  const documents  = kycData.documents || []
  const frontDoc   = documents.find(d => d.documentType === 'FRONT') || documents[0]
  const backDoc    = documents.find(d => d.documentType === 'BACK')
  const selfieDoc  = documents.find(d => d.documentType === 'SELFIE')

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 pb-12">
      {/* Back */}
      <button
        onClick={() => navigate('/users')}
        className="flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary-container transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to User Management
      </button>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-on-surface">KYC Document Review</h1>
          <p className="text-sm text-on-surface-variant mt-0.5">
            {user ? `User: ${user.name || user.phone}` : `User ID: ${id}`}
          </p>
        </div>
        {status === 'approved' && (
          <span className="flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl font-semibold text-sm">
            <CheckCircle className="w-4 h-4" /> KYC Approved
          </span>
        )}
        {status === 'rejected' && (
          <span className="flex items-center gap-2 bg-error-container text-on-error-container px-4 py-2 rounded-xl font-semibold text-sm">
            <X className="w-4 h-4" /> KYC Rejected
          </span>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-primary opacity-50" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Documents column */}
          <div className="lg:col-span-2 space-y-5">
            {/* Identity documents */}
            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary-container" /> Identity Documents
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <DocCard title="Document — Front" bg="bg-slate-100">
                  {frontDoc?.frontUrl ? (
                    <img src={frontDoc.frontUrl} alt="Front" className="max-h-full max-w-full object-contain rounded-lg" />
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-12 bg-slate-300 rounded-lg mx-auto mb-2 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6 text-slate-500" />
                      </div>
                      <p className="text-xs text-on-surface-variant">No image</p>
                    </div>
                  )}
                </DocCard>
                <DocCard title="Document — Back" bg="bg-slate-100">
                  {backDoc?.backUrl ? (
                    <img src={backDoc.backUrl} alt="Back" className="max-h-full max-w-full object-contain rounded-lg" />
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-12 bg-slate-300 rounded-lg mx-auto mb-2 flex items-center justify-center">
                        <ShieldCheck className="w-6 h-6 text-slate-500" />
                      </div>
                      <p className="text-xs text-on-surface-variant">No image</p>
                    </div>
                  )}
                </DocCard>
              </div>
            </div>

            {/* Selfie */}
            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-4">Selfie Verification</h3>
              <div className="bg-surface-container-low rounded-xl p-4 flex items-center gap-5">
                {selfieDoc?.frontUrl ? (
                  <img src={selfieDoc.frontUrl} alt="Selfie" className="w-20 h-24 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className="w-20 h-24 bg-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <div className="w-10 h-10 rounded-full bg-slate-400 mb-1" />
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-medium text-on-surface">Biometric Match</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold">
                      {selfieDoc ? 'Verified' : 'Pending'}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {selfieDoc ? 'Liveness check passed. Face matches document.' : 'Selfie not provided.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Details column */}
          <div className="space-y-5">
            {/* Document metadata */}
            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-4">Document Details</h3>
              <div className="space-y-3 text-sm">
                {[
                  ['Doc Type',    frontDoc?.documentType || 'N/A'],
                  ['Country',     'Tunisia (TN)'],
                  ['Status',      user?.kycStatus || 'UNKNOWN'],
                  ['Submitted',   frontDoc ? new Date(frontDoc.createdAt).toLocaleDateString() : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="text-on-surface-variant">{k}</span>
                    <span className={`font-medium ${v.startsWith('✓') ? 'text-emerald-600' : 'text-on-surface'}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action buttons */}
            {!status && user?.kycStatus === 'SUBMITTED' && (
              <div className="bg-surface-container-lowest rounded-xl shadow-card p-6 space-y-3">
                <h3 className="text-sm font-semibold text-on-surface mb-4">Admin Decision</h3>
                <button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="w-full py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  {actionLoading ? 'Saving…' : 'Approve KYC'}
                </button>
                <button
                  onClick={() => setShowRejectModal(true)}
                  disabled={actionLoading}
                  className="w-full py-3 bg-error text-white font-semibold rounded-xl hover:bg-error/90 transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-50"
                >
                  <X className="w-4 h-4" /> Reject KYC
                </button>
              </div>
            )}

            {status && (
              <div className={`rounded-xl p-6 ${status === 'approved' ? 'bg-emerald-50' : 'bg-error-container'}`}>
                <p className={`font-semibold text-sm ${status === 'approved' ? 'text-emerald-700' : 'text-on-error-container'}`}>
                  {status === 'approved' ? '✓ KYC has been approved. User notified.' : '✕ KYC has been rejected. User notified.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {showRejectModal && (
        <KycRejectionModal
          onClose={() => setShowRejectModal(false)}
          onConfirm={handleReject}
        />
      )}
    </div>
  )
}
