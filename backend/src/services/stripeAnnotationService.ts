/**
 * Stripe annotation service.
 *
 * Single responsibility: when a Stripe event signals a failed payment or a
 * processed refund, append a structured reason note to the Stripe object's
 * metadata (and description, when the object supports it), and mirror the
 * same note onto the local Transaction row. An AuditLog entry is recorded
 * for traceability.
 *
 * Idempotency: the Stripe event.id is stored under metadata.bridger_event_ids
 * (semicolon-separated). If the same event id is already present we skip the
 * write, since Stripe will retry deliveries on 5xx responses.
 */
import Stripe from 'stripe';
import { prisma } from '../config/db';
import config from '../config/env';
import logger from '../utils/logger';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

// Stripe metadata values are capped at 500 characters per key.
const MAX_METADATA_VALUE = 500;
// Stripe description (PaymentIntent/Charge) is capped at 350 characters.
const MAX_DESCRIPTION = 350;

export type StripeObjectKind = 'payment_intent' | 'charge' | 'refund';

export interface AnnotationInput {
  /** Stripe event.id — used for idempotency. */
  eventId: string;
  /** Which Stripe API to call. */
  objectKind: StripeObjectKind;
  /** Stripe object id (pi_*, ch_*, re_*). */
  objectId: string;
  /** Existing metadata on the Stripe object (so we can detect prior annotations). */
  existingMetadata?: Record<string, string> | null;
  /** Existing description on the Stripe object (PaymentIntent / Charge only). */
  existingDescription?: string | null;
  /** "FAILURE" or "REFUND" — drives the metadata key prefix. */
  reasonType: 'FAILURE' | 'REFUND';
  /** Stripe-provided machine code (e.g. "card_declined", "requested_by_customer"). */
  reasonCode?: string | null;
  /** Human-readable explanation extracted from the event. */
  reasonMessage: string;
  /** Optional refund/charge amount in major units, for the description line. */
  amount?: number | null;
  currency?: string | null;
}

export interface AnnotationResult {
  annotated: boolean;
  skipped: 'duplicate' | 'stripe_error' | null;
  note: string;
}

/**
 * Annotate a Stripe object and mirror the note to the matching Transaction.
 * Never throws — webhooks must always 2xx so Stripe doesn't enter retry loops
 * for transient annotation problems. Failures are logged.
 */
export async function annotateStripeAndTransaction(
  input: AnnotationInput,
): Promise<AnnotationResult> {
  const note = buildNote(input);

  // ── Idempotency check ─────────────────────────────────────────────────────
  const priorEventIds = String(input.existingMetadata?.bridger_event_ids ?? '')
    .split(';')
    .filter(Boolean);
  if (priorEventIds.includes(input.eventId)) {
    return { annotated: false, skipped: 'duplicate', note };
  }
  const nextEventIds = [...priorEventIds, input.eventId].slice(-10).join(';');

  // ── Build the metadata patch ──────────────────────────────────────────────
  const keyPrefix = input.reasonType === 'FAILURE' ? 'bridger_failure' : 'bridger_refund';
  const metadataPatch: Record<string, string> = {
    [`${keyPrefix}_reason`]: truncate(note, MAX_METADATA_VALUE),
    [`${keyPrefix}_code`]: truncate(input.reasonCode ?? 'unspecified', MAX_METADATA_VALUE),
    [`${keyPrefix}_at`]: new Date().toISOString(),
    bridger_event_ids: nextEventIds,
  };

  // ── Patch the Stripe object ───────────────────────────────────────────────
  let annotated = false;
  try {
    if (input.objectKind === 'payment_intent') {
      await stripe.paymentIntents.update(input.objectId, {
        metadata: metadataPatch,
        description: appendToDescription(input.existingDescription, note),
      });
    } else if (input.objectKind === 'charge') {
      await stripe.charges.update(input.objectId, {
        metadata: metadataPatch,
        description: appendToDescription(input.existingDescription, note),
      });
    } else {
      // Refund objects do not accept a description field.
      await stripe.refunds.update(input.objectId, { metadata: metadataPatch });
    }
    annotated = true;
  } catch (err: any) {
    logger.warn('Stripe annotation failed', {
      objectKind: input.objectKind,
      objectId: input.objectId,
      error: err.message,
    });
    // Continue: we still want to mirror to our DB so the admin panel sees it.
  }

  // ── Mirror to Transaction row ─────────────────────────────────────────────
  await mirrorToTransaction(input, note).catch(err => {
    logger.warn('Transaction annotation mirror failed', {
      objectId: input.objectId,
      error: err.message,
    });
  });

  // ── Audit log ─────────────────────────────────────────────────────────────
  await prisma.auditLog
    .create({
      data: {
        entityType: 'TRANSACTION',
        entityId: input.objectId,
        action: input.reasonType === 'FAILURE' ? 'STRIPE_FAILURE_ANNOTATED' : 'STRIPE_REFUND_ANNOTATED',
        metadata: JSON.stringify({
          eventId: input.eventId,
          objectKind: input.objectKind,
          reasonCode: input.reasonCode ?? null,
          note,
          stripeUpdateSucceeded: annotated,
        }),
      },
    })
    .catch(err => logger.warn('Audit log write failed', { error: err.message }));

  return {
    annotated,
    skipped: annotated ? null : 'stripe_error',
    note,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildNote(input: AnnotationInput): string {
  const stamp = new Date().toISOString();
  const verb = input.reasonType === 'FAILURE' ? 'Payment failed' : 'Refund processed';
  const code = input.reasonCode ? ` [${input.reasonCode}]` : '';
  const amt =
    input.amount != null
      ? ` · ${Number(input.amount).toFixed(2)} ${(input.currency ?? 'USD').toUpperCase()}`
      : '';
  return `[${stamp}] ${verb}${code}${amt}: ${input.reasonMessage}`;
}

function appendToDescription(existing: string | null | undefined, note: string): string {
  const base = (existing ?? '').trim();
  // The most recent annotation goes last so it stays visible in dashboards
  // that truncate from the end.
  const combined = base ? `${base}\n${note}` : note;
  return truncate(combined, MAX_DESCRIPTION);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

/**
 * Find the local Transaction by Stripe id and append the note to its metadata.
 * The Transaction.metadata column stores a JSON string; we parse, append a
 * "notes" array, and write it back.
 */
async function mirrorToTransaction(input: AnnotationInput, note: string): Promise<void> {
  const tx = await prisma.transaction.findFirst({
    where: { stripeId: input.objectId },
  });
  if (!tx) return;

  const parsed = parseTxMetadata(tx.metadata);
  const notes = Array.isArray(parsed.notes) ? parsed.notes : [];
  // Idempotency: skip if this event already wrote a note here.
  if (notes.some((n: any) => n?.eventId === input.eventId)) return;

  notes.push({
    eventId: input.eventId,
    type: input.reasonType,
    code: input.reasonCode ?? null,
    message: input.reasonMessage,
    note,
    at: new Date().toISOString(),
  });

  await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      metadata: JSON.stringify({
        ...parsed,
        notes,
        lastReasonCode: input.reasonCode ?? parsed.lastReasonCode ?? null,
        lastReasonMessage: input.reasonMessage,
      }),
    },
  });
}

function parseTxMetadata(raw: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : { raw };
  } catch {
    return { raw };
  }
}

// ── Convenience extractors used by the webhook ──────────────────────────────

export function extractPaymentIntentFailure(pi: Stripe.PaymentIntent): {
  reasonCode: string | null;
  reasonMessage: string;
} {
  const err = pi.last_payment_error;
  return {
    reasonCode: err?.code ?? err?.decline_code ?? null,
    reasonMessage:
      err?.message ?? `PaymentIntent ${pi.id} failed without a last_payment_error payload.`,
  };
}

export function extractChargeFailure(ch: Stripe.Charge): {
  reasonCode: string | null;
  reasonMessage: string;
} {
  return {
    reasonCode: ch.failure_code ?? ch.outcome?.reason ?? null,
    reasonMessage:
      ch.failure_message ??
      ch.outcome?.seller_message ??
      `Charge ${ch.id} failed without a failure_message payload.`,
  };
}

export function extractRefundReason(refund: Stripe.Refund): {
  reasonCode: string | null;
  reasonMessage: string;
} {
  // Stripe refund.reason is an enum: 'duplicate' | 'fraudulent' |
  // 'requested_by_customer' | 'expired_uncaptured_charge'. failure_reason is
  // present when the refund itself fails.
  const failure = refund.failure_reason;
  if (failure) {
    return {
      reasonCode: `refund_failed:${failure}`,
      reasonMessage: `Refund ${refund.id} failed: ${failure}.`,
    };
  }
  const code = refund.reason ?? 'unspecified';
  const human: Record<string, string> = {
    duplicate: 'Duplicate charge.',
    fraudulent: 'Charge flagged as fraudulent.',
    requested_by_customer: 'Refund requested by the customer.',
    expired_uncaptured_charge: 'Authorization expired before capture.',
  };
  return {
    reasonCode: code,
    reasonMessage: human[code] ?? `Refund ${refund.id} processed (reason: ${code}).`,
  };
}
