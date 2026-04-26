/**
 * OTP Service — Twilio Verify API (primary) + DB-based fallback
 *
 * Flow:
 *   1. generateOTP(phone)  → calls Twilio Verify "start" (POST /v2/Verifications)
 *   2. verifyOTP(phone, code) → calls Twilio Verify "check" (POST /v2/VerificationCheck)
 *
 * If TWILIO_VERIFY_SERVICE_SID is not set, falls back to self-managed OTP
 * (generate code locally, store in DB, send via WhatsApp provider).
 */

import crypto from 'crypto';
import { prisma } from '../config/db';
import config from '../config/env';
import { normalizePhone } from '../utils/phone';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';
import { redis } from '../config/redis';

// ─── Twilio Client ──────────────────────────────────────────────────────────
let _twilioClient: any = null;
function getTwilioClient() {
  if (_twilioClient) return _twilioClient;
  const { accountSid, authToken } = config.twilio;
  if (!accountSid || accountSid.startsWith('ACxxxxxx') || !authToken || authToken === 'your_twilio_auth_token') return null;
  const twilio = require('twilio');
  _twilioClient = twilio(accountSid, authToken);
  return _twilioClient;
}

const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID || '';
const VERIFY_CHANNEL = process.env.TWILIO_VERIFY_CHANNEL || 'sms'; // "sms" or "whatsapp"
const USE_TWILIO_VERIFY = !!VERIFY_SID;

// ─── WhatsApp provider for DB-fallback mode ─────────────────────────────────
const WA_PROVIDER = process.env.WHATSAPP_PROVIDER || 'none';

async function sendViaTwilioWA(to: string, message: string): Promise<void> {
  const twilio = getTwilioClient();
  if (!twilio) throw new Error('Twilio not configured');
  const from = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';
  const waTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const contentSid = process.env.TWILIO_CONTENT_SID;
  const codeMatch = message.match(/\b(\d{6})\b/);
  const code = codeMatch ? codeMatch[1] : '';
  if (contentSid && code) {
    await twilio.messages.create({ from, to: waTo, contentSid, contentVariables: JSON.stringify({ '1': code }) });
  } else {
    await twilio.messages.create({ body: message, from, to: waTo });
  }
  logger.info(`[Twilio WA] OTP sent to ...${to.slice(-4)}`);
}

async function sendViaMeta(to: string, message: string): Promise<void> {
  const token = process.env.META_WA_TOKEN;
  const phoneId = process.env.META_WA_PHONE_ID;
  if (!token || !phoneId) throw new Error('Meta Cloud API not configured');
  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'text', text: { body: message } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) { const errBody: any = await res.json().catch(() => ({})); throw new Error(errBody.error?.message || `Meta API ${res.status}`); }
  logger.info(`[Meta WA] OTP sent to ...${to.slice(-4)}`);
}

async function sendViaBaileys(to: string, message: string): Promise<void> {
  const res = await fetch(`${config.baileys.url}/api/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': config.baileys.apiKey },
    body: JSON.stringify({ phoneNumber: to, message }),
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await res.json()) as { success: boolean; error?: string };
  if (!json.success) throw new Error(json.error || 'Baileys send failed');
  logger.info(`[Baileys] OTP sent to ...${to.slice(-4)}`);
}

// Plain SMS via Twilio — uses TWILIO_SMS_FROM (falls back to TWILIO_PHONE_NUMBER).
// Set WHATSAPP_PROVIDER=twilio-sms in .env to use this path.
async function sendViaTwilioSMS(to: string, message: string): Promise<void> {
  const twilio = getTwilioClient();
  if (!twilio) throw new Error('Twilio not configured');
  const from = process.env.TWILIO_SMS_FROM || config.twilio.phoneNumber;
  if (!from) throw new Error('TWILIO_SMS_FROM / TWILIO_PHONE_NUMBER not set');
  await twilio.messages.create({ body: message, from, to });
  logger.info(`[Twilio SMS] OTP sent to ...${to.slice(-4)}`);
}

async function sendOTPMessage(to: string, message: string): Promise<void> {
  if (WA_PROVIDER === 'none') { logger.info(`[OTP] Provider=none — skipping delivery`); return; }
  try {
    switch (WA_PROVIDER) {
      case 'twilio-sms': await sendViaTwilioSMS(to, message); break;
      case 'twilio':     await sendViaTwilioWA(to, message); break;
      case 'meta':       await sendViaMeta(to, message); break;
      case 'baileys':    await sendViaBaileys(to, message); break;
      default: throw new Error(`Unknown WHATSAPP_PROVIDER: ${WA_PROVIDER}`);
    }
    await prisma.whatsappLog.create({ data: { to, message, status: 'sent', retries: 0 } }).catch(() => {});
  } catch (err: any) {
    logger.error(`[OTP] ${WA_PROVIDER} failed: ${err.message}`);
    await prisma.whatsappLog.create({ data: { to, message, status: 'failed', error: err.message, retries: 1 } }).catch(() => {});
  }
}

// ─── Rate limiting ──────────────────────────────────────────────────────────
const WINDOW_SECONDS = Math.floor((config.otp.rateLimitWindowMs || 60_000) / 1000);
const MAX_REQUESTS = config.otp.rateLimitMax || 5;
interface RateEntry { count: number; resetAt: number }
const rateMapFallback = new Map<string, RateEntry>();
setInterval(() => { const now = Date.now(); for (const [k, e] of rateMapFallback.entries()) { if (e.resetAt < now) rateMapFallback.delete(k); } }, 5 * 60_000);

export async function clearOtpRateLimit(phone: string): Promise<void> {
  await redis.del(`otp_rate:${phone}`);
  rateMapFallback.delete(phone);
}

async function checkAndIncrementRateLimit(phone: string): Promise<void> {
  try {
    const count = await redis.incr(`otp_rate:${phone}`);
    if (count === 1) await redis.expire(`otp_rate:${phone}`, WINDOW_SECONDS);
    if (count > MAX_REQUESTS) {
      const ttl = await redis.ttl(`otp_rate:${phone}`);
      logger.warn(`[OTP] Rate limit exceeded for ...${phone.slice(-4)} — retry in ${ttl}s`);
      throw new AppError(`Too many OTP requests. Try again in ${ttl} seconds.`, 429);
    }
    return;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
  }
  const now = Date.now();
  const entry = rateMapFallback.get(phone);
  if (!entry || now > entry.resetAt) { rateMapFallback.set(phone, { count: 1, resetAt: now + WINDOW_SECONDS * 1000 }); return; }
  if (entry.count >= MAX_REQUESTS) throw new AppError('Too many OTP requests. Wait 1 minute.', 429);
  entry.count += 1;
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate / send OTP.
 * - If Twilio Verify SID configured → uses Twilio Verify API (no code returned to client in prod)
 * - Otherwise → generates code locally, stores in DB, sends via WhatsApp provider
 */
export async function generateOTP(phoneRaw: string): Promise<string> {
  let phone: string;
  try { phone = normalizePhone(phoneRaw); } catch { throw new AppError('Invalid phone number format', 400); }

  await checkAndIncrementRateLimit(phone);

  // ── Path A: Twilio Verify API ──────────────────────────────────────────
  if (USE_TWILIO_VERIFY) {
    const twilio = getTwilioClient();
    if (!twilio) throw new AppError('Twilio credentials not configured', 500);

    try {
      const verification = await twilio.verify.v2
        .services(VERIFY_SID)
        .verifications.create({ to: phone, channel: VERIFY_CHANNEL });

      logger.info(`[Twilio Verify] OTP sent to ...${phone.slice(-4)} via ${VERIFY_CHANNEL} (status: ${verification.status})`);

      // Twilio manages the code — we don't know it. Return empty string.
      // In dev mode, return a hint so the app knows to wait for SMS.
      return '';
    } catch (err: any) {
      logger.error(`[Twilio Verify] Failed: ${err.message}`);
      // Fall through to DB-based OTP if Verify fails
      logger.warn('[Twilio Verify] Falling back to DB-based OTP');
    }
  }

  // ── Path B: Self-managed OTP (DB + WhatsApp provider) ──────────────────
  await prisma.oTP.updateMany({ where: { phone, verified: false }, data: { verified: true } });

  const code = crypto.randomInt(100000, 999999).toString();
  await prisma.oTP.create({
    data: { phone, code, expiresAt: new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000) },
  });

  logger.info(`[OTP] ============================`);
  logger.info(`[OTP] Code for ${phone}: ${code}`);
  logger.info(`[OTP] ============================`);

  sendOTPMessage(phone, `Your Bridger verification code: *${code}*\n\nValid for ${config.otp.expiryMinutes} minutes. Do not share this code.`).catch((err: any) => {
    logger.error(`[OTP] Unhandled send error: ${err?.message}`);
  });

  return code;
}

/**
 * Verify OTP.
 * - If Twilio Verify SID configured → calls Twilio Verify "check" API
 * - Otherwise → checks code against DB
 */
export async function verifyOTP(phoneRaw: string, code: string): Promise<boolean> {
  let phone: string;
  try { phone = normalizePhone(phoneRaw); } catch { throw new AppError('Invalid phone number format', 400); }

  // Dev bypass
  if (config.server.nodeEnv === 'development' && process.env.ENABLE_DEV_OTP === 'true' && code === '111111') {
    await prisma.oTP.updateMany({ where: { phone, verified: false }, data: { verified: true } });
    return true;
  }

  // ── Path A: Twilio Verify Check ────────────────────────────────────────
  if (USE_TWILIO_VERIFY) {
    const twilio = getTwilioClient();
    if (!twilio) throw new AppError('Twilio credentials not configured', 500);

    try {
      const check = await twilio.verify.v2
        .services(VERIFY_SID)
        .verificationChecks.create({ to: phone, code });

      if (check.status === 'approved') {
        logger.info(`[Twilio Verify] Code verified for ...${phone.slice(-4)}`);
        return true;
      }

      logger.warn(`[Twilio Verify] Check failed: status=${check.status}`);
      throw new AppError('Invalid verification code', 400);
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      logger.error(`[Twilio Verify] Check error: ${err.message}`);
      // Don't fall back for verify — if Twilio sent the code, only Twilio can check it
      throw new AppError('Verification failed. Please try again.', 400);
    }
  }

  // ── Path B: DB-based check ─────────────────────────────────────────────
  const otp = await prisma.oTP.findFirst({
    where: { phone, verified: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!otp) throw new AppError('OTP expired or not found', 400);
  if (otp.attempts >= config.otp.maxAttempts) {
    await prisma.oTP.update({ where: { id: otp.id }, data: { verified: true } });
    throw new AppError('Too many failed attempts', 429);
  }
  if (otp.code !== code) {
    await prisma.oTP.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new AppError('Invalid OTP code', 400);
  }

  await prisma.oTP.update({ where: { id: otp.id }, data: { verified: true } });
  return true;
}

export async function getTestOTP(phone: string): Promise<string | null> {
  if (phone === '+15550000000' || phone === '15550000000') return '123456';
  return null;
}
