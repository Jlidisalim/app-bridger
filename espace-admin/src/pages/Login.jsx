/**
 * Login.jsx — connected to the real backend OTP auth system.
 *
 * Changes from the original:
 * - Replaced email+password fields with a phone-number input (backend is
 *   OTP-only; there are no passwords).
 * - Implemented a 2-step flow: Step 1 sends the OTP, Step 2 verifies it.
 * - In development mode the backend returns the OTP code in the response
 *   body — it is shown inline so testers don't need WhatsApp.
 * - If the verified account is not an admin, an error is shown and the
 *   session is not stored.
 * - On success the user is navigated to /dashboard.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, ShieldCheck, Zap, ArrowRight, Info, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export default function Login() {
  const navigate  = useNavigate()
  const { sendOtp, verifyOtp } = useAuthStore()

  const [phone,   setPhone]   = useState('')
  const [code,    setCode]    = useState('')
  const [step,    setStep]    = useState(1)   // 1 = phone, 2 = otp code
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [devCode, setDevCode] = useState('')  // shown in dev mode only

  // ── Step 1: send OTP ───────────────────────────────────────────────────
  async function handleSendOtp(e) {
    e.preventDefault()
    if (!phone.trim()) { setError('Please enter your phone number.'); return }
    setLoading(true)
    setError('')
    try {
      const res = await sendOtp(phone.trim())
      if (res.code) {
        setDevCode(String(res.code))
        setCode(String(res.code))   // auto-fill the input in dev mode
      }
      setStep(2)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP. Check the phone number and try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 2: verify OTP + admin gate ───────────────────────────────────
  async function handleVerify(e) {
    e.preventDefault()
    if (!code.trim()) { setError('Please enter the 6-digit code.'); return }
    setLoading(true)
    setError('')
    try {
      await verifyOtp(phone.trim(), code.trim())
      navigate('/dashboard')
    } catch (err) {
      // Surface the "not an admin" message clearly
      setError(err.message || err.response?.data?.error || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6 md:p-12 overflow-hidden relative">
      {/* Background blobs */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 monolith-gradient opacity-[0.07]" />
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary-container rounded-full blur-[120px] opacity-20" />
        <div className="absolute top-1/2 -right-48 w-[600px] h-[600px] bg-secondary-container rounded-full blur-[160px] opacity-10" />
      </div>

      <main className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 overflow-hidden rounded-xl shadow-[0_32px_64px_rgba(30,58,138,0.08)] bg-surface-container-lowest">

        {/* ── Left Panel ─────────────────────────────────── */}
        <div className="hidden lg:flex lg:col-span-7 monolith-gradient p-14 flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-12">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary-container" />
              </div>
              <span className="text-2xl font-black tracking-tight text-white uppercase">Bridger</span>
            </div>
            <h1 className="text-[2.6rem] font-semibold text-white leading-tight mb-6 max-w-sm">
              Secure Administrative Gateway
            </h1>
            <p className="text-on-primary-container text-base leading-relaxed max-w-xs">
              Access the intelligent monolith. Manage risk, analytics, and institutional portfolios with high-authority oversight.
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-8">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-on-primary-container opacity-60 mb-1">System Status</p>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-secondary-container" />
                <span className="text-sm text-white font-medium">Operational</span>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase text-on-primary-container opacity-60 mb-1">Auth Protocol</p>
              <span className="text-sm text-white font-medium">SMS OTP · JWT · TLS 1.3</span>
            </div>
          </div>

          <div className="absolute top-1/4 right-0 translate-x-1/3 opacity-[0.07] pointer-events-none select-none">
            <ShieldCheck className="w-[300px] h-[300px] text-white" />
          </div>
        </div>

        {/* ── Right Form ─────────────────────────────────── */}
        <div className="col-span-1 lg:col-span-5 p-10 md:p-14 flex flex-col justify-center">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-8 h-8 monolith-gradient rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-black tracking-tight text-primary uppercase">Bridger</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-on-surface mb-1">Admin Login</h2>
            <p className="text-sm text-on-surface-variant">
              {step === 1
                ? 'Enter your registered admin phone number to receive a login code via SMS.'
                : 'Enter the 6-digit code sent to your phone via SMS.'}
            </p>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-6">
            {[1, 2].map(n => (
              <div key={n} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors
                  ${step > n ? 'bg-emerald-500 text-white' : step === n ? 'monolith-gradient text-white' : 'bg-surface-container text-on-surface-variant'}`}>
                  {step > n ? <CheckCircle2 className="w-3.5 h-3.5" /> : n}
                </div>
                <span className={`text-xs font-medium ${step === n ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                  {n === 1 ? 'Phone' : 'Verify OTP'}
                </span>
                {n < 2 && <div className="w-8 h-px bg-surface-container-high mx-1" />}
              </div>
            ))}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Dev-mode OTP hint */}
          {devCode && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 mb-4">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span><strong>Dev mode — OTP code:</strong> {devCode}</span>
            </div>
          )}

          {step === 1 ? (
            /* ── STEP 1: Phone number ─────────────────────── */
            <form onSubmit={handleSendOtp} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                  <input
                    type="tel"
                    placeholder="+216 71 000 000"
                    value={phone}
                    onChange={e => { setPhone(e.target.value); setError('') }}
                    className="w-full pl-11 pr-4 py-3.5 bg-surface-container-low border-none rounded-xl focus:ring-2 focus:ring-primary-container/20 text-on-surface placeholder:text-outline text-sm outline-none transition-all"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant flex items-center gap-1 italic">
                  <Info className="w-3 h-3" /> Include country code, e.g. +216 for Tunisia.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full monolith-gradient text-white font-semibold py-3.5 rounded-xl shadow-[0_12px_24px_rgba(30,58,138,0.2)] hover:shadow-[0_16px_32px_rgba(30,58,138,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending Code…</>
                  : <>Send OTP Code <ArrowRight className="w-4 h-4" /></>
                }
              </button>
            </form>
          ) : (
            /* ── STEP 2: OTP code ─────────────────────────── */
            <form onSubmit={handleVerify} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold tracking-[0.12em] uppercase text-on-surface-variant">
                  OTP Verification Code
                </label>
                <div className="relative">
                  <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-outline" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6 - d i g i t   c o d e"
                    value={code}
                    onChange={e => { setCode(e.target.value.replace(/\D/g, '')); setError('') }}
                    className="w-full pl-11 pr-4 py-3.5 bg-surface-container-low border-none rounded-xl focus:ring-2 focus:ring-primary-container/20 text-on-surface placeholder:text-outline text-sm font-mono tracking-[0.4em] outline-none transition-all"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-on-surface-variant flex items-center gap-1 italic">
                  <Info className="w-3 h-3" /> SMS sent to {phone}. Valid for 5 minutes.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full monolith-gradient text-white font-semibold py-3.5 rounded-xl shadow-[0_12px_24px_rgba(30,58,138,0.2)] hover:shadow-[0_16px_32px_rgba(30,58,138,0.3)] active:scale-[0.98] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</>
                  : <>Authenticate Account <ArrowRight className="w-4 h-4" /></>
                }
              </button>

              <button
                type="button"
                onClick={() => { setStep(1); setCode(''); setError(''); setDevCode('') }}
                className="w-full text-sm text-on-surface-variant hover:text-on-surface transition-colors text-center"
              >
                ← Change phone number
              </button>
            </form>
          )}

          <footer className="mt-10 text-center">
            <p className="text-xs text-on-surface-variant opacity-60">
              Proprietary system of Bridger Monolith. Unauthorized access is strictly prohibited and monitored.
            </p>
            <div className="flex justify-center gap-6 mt-3">
              <a href="#" className="text-xs text-outline hover:text-primary transition-colors">Privacy Policy</a>
              <a href="#" className="text-xs text-outline hover:text-primary transition-colors">Contact Security</a>
            </div>
          </footer>
        </div>
      </main>

      {/* Restricted Area toast */}
      <div className="fixed bottom-8 left-8 hidden lg:flex z-20 bg-white/80 backdrop-blur-xl p-4 rounded-xl shadow-xl items-center gap-3 max-w-xs">
        <div className="w-9 h-9 rounded-full bg-error-container flex items-center justify-center text-on-error-container flex-shrink-0">
          <ShieldCheck className="w-4 h-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-on-surface">Restricted Area</p>
          <p className="text-xs text-on-surface-variant">Login events are logged with your IP and metadata.</p>
        </div>
      </div>
    </div>
  )
}
