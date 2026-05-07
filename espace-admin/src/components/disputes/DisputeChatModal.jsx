import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, ArrowRight, Loader2, MessageSquare, Send, Shield, User, X,
} from 'lucide-react'
import api, { resolveMediaUrl } from '../../services/api'

const POLL_INTERVAL_MS = 5_000
const PROMPT_TEMPLATES = [
  'Hello — I\'m the moderator assigned to this dispute. Could you walk me through what happened, in chronological order?',
  'Could each of you share the evidence (photos, receipts, screenshots) that supports your account of events?',
  'Based on what\'s been shared so far, here\'s the next step I\'d like us to take:',
  'To resolve this fairly, I need one more clarification:',
  'Thank you for the details. I\'ll review the evidence and follow up with a proposed resolution shortly.',
]

/**
 * DisputeChatModal — full-screen conversational UI for the moderator.
 *
 * Responsibilities:
 *  - Load and poll the dispute message thread (GET /disputes/:id/messages).
 *  - Send admin messages (POST /disputes/:id/messages).
 *  - Display participants (filer + respondent) so the admin knows who they're addressing.
 *  - Offer step-by-step prompt templates to structure the dialogue.
 *
 * Auto-assignment is handled by the parent before this modal opens.
 */
export default function DisputeChatModal({ dispute, currentAdminId, onClose, onAssigned }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(null)

  const listRef = useRef(null)
  const composerRef = useRef(null)

  const disputeId = dispute.id
  const isAssignedToMe = dispute.assignedTo === currentAdminId
  const isResolved = String(dispute.status || '').startsWith('RESOLVED_') || dispute.status === 'CLOSED'

  // ── Fetch + poll thread ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load(initial = false) {
      try {
        if (initial) setLoading(true)
        const r = await api.get(`/disputes/${disputeId}/messages`, { params: { page: 1, limit: 100 } })
        if (cancelled) return
        setMessages(r.data.items || [])
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err.response?.data?.error || 'Could not load conversation.')
      } finally {
        if (!cancelled && initial) setLoading(false)
      }
    }

    load(true)
    const id = setInterval(() => load(false), POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [disputeId])

  // Lock body scroll & ESC-to-close
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  // Autoscroll to latest when messages change
  useEffect(() => {
    if (!listRef.current) return
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length])

  // Focus composer on open
  useEffect(() => { composerRef.current?.focus() }, [])

  async function send() {
    const content = draft.trim()
    if (!content || sending || isResolved) return
    setSending(true)
    setSendError(null)
    try {
      const r = await api.post(`/disputes/${disputeId}/messages`, { content })
      setMessages(prev => [...prev, r.data])
      setDraft('')
    } catch (err) {
      setSendError(err.response?.data?.error || 'Message failed to send.')
    } finally {
      setSending(false)
    }
  }

  function onComposerKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex">
      <div className="flex-1 bg-black/50" onClick={onClose} />
      <aside
        role="dialog"
        aria-label="Dispute conversation"
        className="w-full max-w-2xl bg-surface-container-lowest shadow-2xl flex flex-col animate-slide-in-right"
      >
        <ChatHeader
          dispute={dispute}
          isAssignedToMe={isAssignedToMe}
          onAssigned={onAssigned}
          onClose={onClose}
        />

        {/* Message list */}
        <div ref={listRef} className="flex-1 overflow-y-auto bg-surface-container-low/40 px-4 py-4 space-y-3">
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-primary opacity-50" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 text-xs bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5" /> {error}
            </div>
          ) : messages.length === 0 ? (
            <EmptyThread dispute={dispute} />
          ) : (
            messages.map(m => (
              <MessageBubble key={m.id} message={m} dispute={dispute} />
            ))
          )}
        </div>

        {/* Templates */}
        {!isResolved && (
          <div className="border-t border-surface-container-high px-4 py-2 bg-surface-container-lowest">
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1.5">
              Step-by-step prompts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PROMPT_TEMPLATES.map((t, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setDraft(t); composerRef.current?.focus() }}
                  className="text-[11px] px-2 py-1 rounded-md border border-surface-container-high bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface transition-colors"
                  title={t}
                >
                  Step {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Composer */}
        <div className="border-t border-surface-container-high p-3 bg-surface-container-lowest">
          {sendError && (
            <div className="flex items-center gap-2 text-[11px] bg-red-50 border border-red-200 text-red-700 rounded-md px-2 py-1 mb-2">
              <AlertCircle className="w-3 h-3" /> {sendError}
            </div>
          )}
          {isResolved ? (
            <p className="text-xs text-on-surface-variant italic px-2 py-3 text-center">
              This dispute is resolved — the thread is read-only.
            </p>
          ) : (
            <div className="flex gap-2">
              <textarea
                ref={composerRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={onComposerKeyDown}
                placeholder="Type your message to the parties… (Enter to send, Shift+Enter for newline)"
                rows={2}
                maxLength={2000}
                disabled={sending}
                className="flex-1 px-3 py-2 text-sm bg-surface-container border border-surface-container-high rounded-lg focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none disabled:opacity-60"
              />
              <button
                type="button"
                onClick={send}
                disabled={!draft.trim() || sending}
                className="self-end px-4 py-2 text-sm font-semibold rounded-lg monolith-gradient text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Send
              </button>
            </div>
          )}
          <p className="text-[10px] text-on-surface-variant/70 mt-1.5 px-1">
            Visible to {dispute.filer?.name || 'the filer'} and {dispute.against?.name || 'the respondent'}. Every message is recorded in the dispute audit log.
          </p>
        </div>
      </aside>
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function ChatHeader({ dispute, isAssignedToMe, onClose }) {
  return (
    <div className="border-b border-surface-container-high bg-surface-container-lowest">
      <div className="flex items-start justify-between gap-3 px-5 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> Dispute conversation
          </p>
          <p className="text-sm font-semibold text-on-surface truncate mt-0.5">
            #{dispute.id.slice(-6)} · {dispute.deal?.fromCity || '—'} <ArrowRight className="w-3 h-3 inline" /> {dispute.deal?.toCity || '—'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex-shrink-0"
          aria-label="Close conversation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-5 pb-3 flex flex-wrap items-center gap-2">
        <PartyChip role="Filer"      user={dispute.filer}   tone="bg-blue-50 text-blue-700 border-blue-200" />
        <PartyChip role="Respondent" user={dispute.against} tone="bg-amber-50 text-amber-700 border-amber-200" />
        {isAssignedToMe ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
            <Shield className="w-3 h-3" /> Moderating as you
          </span>
        ) : dispute.assignedTo ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Shield className="w-3 h-3" /> Assigned · {dispute.assignedAdmin?.name || 'admin'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function PartyChip({ role, user, tone }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${tone}`}>
      <User className="w-3 h-3" />
      {role}: {user?.name || '—'}
    </span>
  )
}

function EmptyThread({ dispute }) {
  return (
    <div className="py-10 text-center">
      <MessageSquare className="w-8 h-8 mx-auto text-on-surface-variant/30 mb-2" />
      <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
        No messages yet. Open the dialogue with {dispute.filer?.name || 'the filer'} and {dispute.against?.name || 'the respondent'} —
        use the step-by-step prompts below to structure the conversation.
      </p>
    </div>
  )
}

function MessageBubble({ message, dispute }) {
  const role = message.senderRole
  const isAdmin  = role === 'ADMIN'
  const isSystem = role === 'SYSTEM'
  const isFiler  = role === 'FILER'

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="text-[11px] text-on-surface-variant bg-surface-container border border-surface-container-high rounded-full px-3 py-1 italic max-w-[80%] text-center">
          {message.content}
        </div>
      </div>
    )
  }

  const senderName =
    isAdmin ? 'Moderator (you)' :
    isFiler ? (dispute.filer?.name || 'Filer') :
              (dispute.against?.name || 'Respondent')

  const align     = isAdmin ? 'items-end' : 'items-start'
  const bubbleTone =
    isAdmin ? 'bg-primary text-white border-transparent'
    : isFiler ? 'bg-blue-50 border-blue-200 text-on-surface'
              : 'bg-amber-50 border-amber-200 text-on-surface'

  return (
    <div className={`flex flex-col ${align} gap-1`}>
      <p className="text-[10px] font-semibold text-on-surface-variant px-1">
        {senderName} · {formatTime(message.createdAt)}
      </p>
      <div className={`max-w-[78%] rounded-2xl border px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed ${bubbleTone}`}>
        {message.content}
        {message.attachmentUrl && (
          <a
            href={resolveMediaUrl(message.attachmentUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className={`block mt-1.5 text-[11px] underline ${isAdmin ? 'text-white/90' : 'text-primary'}`}
          >
            {message.attachmentName || 'Attachment'}
          </a>
        )}
      </div>
    </div>
  )
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}
