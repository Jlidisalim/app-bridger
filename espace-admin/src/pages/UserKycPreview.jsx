import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, X, AlertTriangle, ShieldCheck, ChevronDown, Loader2, AlertCircle, FileText, MapPin, User as UserIcon, Camera, ExternalLink } from 'lucide-react'
import api from '../services/api'

// Document-type grouping. Anything not matched falls under "Other".
const DOC_TYPE_META = {
  ID_CARD:         { label: 'Identity Card',        icon: ShieldCheck, group: 'identity' },
  PASSPORT:        { label: 'Passport',             icon: ShieldCheck, group: 'identity' },
  DRIVING_LICENSE: { label: 'Driving License',      icon: ShieldCheck, group: 'identity' },
  FRONT:           { label: 'ID — Front',           icon: ShieldCheck, group: 'identity' },
  BACK:            { label: 'ID — Back',            icon: ShieldCheck, group: 'identity' },
  SELFIE:          { label: 'Selfie',               icon: Camera,      group: 'selfie' },
  PROOF_OF_ADDRESS:{ label: 'Proof of Address',     icon: MapPin,      group: 'address' },
  UTILITY_BILL:    { label: 'Utility Bill',         icon: MapPin,      group: 'address' },
  BANK_STATEMENT:  { label: 'Bank Statement',       icon: FileText,    group: 'address' },
}

const STATUS_BADGE = {
  APPROVED: 'bg-emerald-100 text-emerald-700',
  PENDING:  'bg-amber-100 text-amber-700',
  SUBMITTED:'bg-amber-100 text-amber-700',
  REJECTED: 'bg-red-100 text-red-700',
}

function metaFor(type) {
  return DOC_TYPE_META[type] || { label: type || 'Document', icon: FileText, group: 'other' }
}

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

  // Group docs so we can render each verification category as its own section.
  const grouped = documents.reduce((acc, d) => {
    const g = metaFor(d.documentType).group
    ;(acc[g] = acc[g] || []).push(d)
    return acc
  }, {})
  const identityDocs = grouped.identity || []
  const selfieDocs   = grouped.selfie   || []
  const addressDocs  = grouped.address  || []
  const otherDocs    = grouped.other    || []

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
            {/* Identity documents — one card per uploaded ID document */}
            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary-container" /> Identity Documents
                <span className="ml-auto text-[11px] text-on-surface-variant font-normal">{identityDocs.length} uploaded</span>
              </h3>

              {identityDocs.length === 0 ? (
                <div className="bg-surface-container-low rounded-xl p-6 text-center text-xs text-on-surface-variant">
                  No identity documents uploaded.
                </div>
              ) : (
                <div className="space-y-4">
                  {identityDocs.map(doc => {
                    const meta = metaFor(doc.documentType)
                    const Icon = meta.icon
                    return (
                      <div key={doc.id} className="bg-surface-container-low rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Icon className="w-4 h-4 text-on-surface-variant" />
                            <p className="text-xs font-bold tracking-wider uppercase text-on-surface">{meta.label}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_BADGE[doc.status] || 'bg-gray-100 text-gray-600'}`}>
                              {doc.status || 'PENDING'}
                            </span>
                          </div>
                          <span className="text-[11px] text-on-surface-variant">
                            {doc.createdAt ? new Date(doc.createdAt).toLocaleString() : '—'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <DocCard title="Front" bg="bg-slate-100">
                            {doc.frontUrl ? (
                              <a href={doc.frontUrl} target="_blank" rel="noreferrer">
                                <img src={doc.frontUrl} alt={`${meta.label} front`} className="max-h-32 max-w-full object-contain rounded-lg" />
                              </a>
                            ) : (
                              <div className="text-xs text-on-surface-variant">No image</div>
                            )}
                          </DocCard>
                          <DocCard title="Back" bg="bg-slate-100">
                            {doc.backUrl ? (
                              <a href={doc.backUrl} target="_blank" rel="noreferrer">
                                <img src={doc.backUrl} alt={`${meta.label} back`} className="max-h-32 max-w-full object-contain rounded-lg" />
                              </a>
                            ) : (
                              <div className="text-xs text-on-surface-variant">N/A</div>
                            )}
                          </DocCard>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Selfie / Biometric */}
            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                <Camera className="w-4 h-4 text-primary-container" /> Selfie & Biometric
              </h3>
              <div className="bg-surface-container-low rounded-xl p-4 flex items-start gap-5">
                {selfieDocs[0]?.frontUrl ? (
                  <a href={selfieDocs[0].frontUrl} target="_blank" rel="noreferrer">
                    <img src={selfieDocs[0].frontUrl} alt="Selfie" className="w-20 h-24 rounded-xl object-cover flex-shrink-0" />
                  </a>
                ) : (
                  <div className="w-20 h-24 bg-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <UserIcon className="w-8 h-8 text-slate-400" />
                  </div>
                )}
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle className={`w-4 h-4 ${user?.faceVerificationStatus === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-500'}`} />
                    <span className="text-sm font-medium text-on-surface">Biometric Match</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      user?.faceVerificationStatus === 'VERIFIED'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {user?.faceVerificationStatus || 'PENDING'}
                    </span>
                  </div>
                  <div className="text-xs text-on-surface-variant space-y-1">
                    <p>Confidence: <span className="font-semibold text-on-surface">{user?.faceConfidenceScore != null ? `${Math.round(user.faceConfidenceScore * 100)}%` : '—'}</span></p>
                    <p>Verified at: <span className="font-semibold text-on-surface">{user?.faceVerifiedAt ? new Date(user.faceVerifiedAt).toLocaleString() : '—'}</span></p>
                  </div>
                </div>
              </div>
            </div>

            {/* Proof of Address */}
            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary-container" /> Proof of Address
                <span className="ml-auto text-[11px] text-on-surface-variant font-normal">{addressDocs.length} uploaded</span>
              </h3>
              {addressDocs.length === 0 ? (
                <div className="bg-surface-container-low rounded-xl p-6 text-center text-xs text-on-surface-variant">
                  No proof-of-address documents on file.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {addressDocs.map(doc => {
                    const meta = metaFor(doc.documentType)
                    return (
                      <DocCard key={doc.id} title={meta.label} bg="bg-slate-100">
                        {doc.frontUrl ? (
                          <a href={doc.frontUrl} target="_blank" rel="noreferrer">
                            <img src={doc.frontUrl} alt={meta.label} className="max-h-28 max-w-full object-contain rounded-lg" />
                          </a>
                        ) : (
                          <div className="text-xs text-on-surface-variant">No image</div>
                        )}
                      </DocCard>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Other / unrecognized documents */}
            {otherDocs.length > 0 && (
              <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
                <h3 className="text-sm font-semibold text-on-surface mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary-container" /> Other Uploads
                </h3>
                <ul className="space-y-2 text-sm">
                  {otherDocs.map(doc => (
                    <li key={doc.id} className="flex items-center justify-between bg-surface-container-low rounded-lg px-3 py-2">
                      <div>
                        <p className="font-medium text-on-surface">{doc.documentType || 'Unknown'}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {doc.status || 'PENDING'} · {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                      {doc.frontUrl && (
                        <a href={doc.frontUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary-container hover:underline text-xs">
                          <ExternalLink className="w-3 h-3" /> View
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Details column — full profile audit */}
          <div className="space-y-5">
            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-4">Profile Audit</h3>
              <div className="space-y-2.5 text-sm">
                {[
                  ['User ID',         user?.id],
                  ['Name',            user?.name],
                  ['Phone',           user?.phone],
                  ['Email',           user?.email],
                  ['ID Number',       user?.idDocumentNumber],
                  ['KYC Status',      user?.kycStatus],
                  ['Face Verify',     user?.faceVerificationStatus],
                  ['Banned',          user?.banned ? 'Yes' : 'No'],
                  ['Member Since',    user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : null],
                  ['Last Login',      user?.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : null],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <span className="text-on-surface-variant flex-shrink-0">{k}</span>
                    <span className="font-medium text-on-surface text-right truncate">{v ?? '—'}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface-container-lowest rounded-xl shadow-card p-6">
              <h3 className="text-sm font-semibold text-on-surface mb-3">Document Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Total Documents</span>
                  <span className="font-semibold text-on-surface">{documents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Identity</span>
                  <span className="font-semibold text-on-surface">{identityDocs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Selfie</span>
                  <span className="font-semibold text-on-surface">{selfieDocs.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Address</span>
                  <span className="font-semibold text-on-surface">{addressDocs.length}</span>
                </div>
                {otherDocs.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-on-surface-variant">Other</span>
                    <span className="font-semibold text-on-surface">{otherDocs.length}</span>
                  </div>
                )}
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
