/**
 * Admin Authentication Routes
 *
 * Identical OTP delivery to the regular /auth/otp/* flow (same WHATSAPP_PROVIDER,
 * same Twilio WhatsApp sandbox) with one extra gate: the phone must belong to a
 * user with isAdmin=true before an OTP is even generated.
 *
 * POST /auth/admin/otp/send   — validate admin phone, then call generateOTP()
 * POST /auth/admin/otp/verify — call verifyOTP(), then issue JWT with isAdmin:true
 */

import { Router } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import config from '../config/env';
import { normalizePhone } from '../utils/phone';
import { authRateLimiter } from '../middleware/security';
import { generateOTP, verifyOTP } from '../services/otpService';
import logger from '../utils/logger';

const router = Router();

// ── POST /auth/admin/otp/send ────────────────────────────────────────────────

router.post('/admin/otp/send', authRateLimiter, async (req: any, res, next) => {
  try {
    const rawPhone = req.body?.phone;
    if (!rawPhone) return res.status(400).json({ error: 'phone is required' });

    let phone: string;
    try { phone = normalizePhone(rawPhone); }
    catch { return res.status(400).json({ error: 'Invalid phone number format' }); }

    // Only pre-registered admin accounts can request an OTP.
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isAdmin) {
      logger.warn(`[Admin Auth] Rejected OTP request for non-admin ...${phone.slice(-4)}`);
      return res.status(403).json({ error: 'This number is not authorised for admin access.' });
    }

    if ((user as any).banned) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    // Delegate to the shared OTP service — uses WHATSAPP_PROVIDER (twilio sandbox etc.)
    const code = await generateOTP(phone);

    // In dev mode the code is returned so it can be auto-filled in the UI
    if (config.server.nodeEnv === 'development') {
      return res.json({ message: 'OTP sent.', code });
    }

    return res.json({ message: 'OTP sent.' });
  } catch (err: any) {
    if (err.status === 429) return res.status(429).json({ error: err.message });
    next(err);
  }
});

// ── POST /auth/admin/otp/verify ──────────────────────────────────────────────

router.post('/admin/otp/verify', authRateLimiter, async (req: any, res, next) => {
  try {
    const { phone: rawPhone, code } = req.body || {};
    if (!rawPhone || !code) return res.status(400).json({ error: 'phone and code are required' });

    let phone: string;
    try { phone = normalizePhone(rawPhone); }
    catch { return res.status(400).json({ error: 'Invalid phone number format' }); }

    // Verify OTP (handles dev bypass 111111, DB check, expiry, attempts)
    try {
      await verifyOTP(phone, code);
    } catch (otpErr: any) {
      return res.status(otpErr.status || 400).json({ error: otpErr.message });
    }

    // Re-validate admin + banned at verify time
    const user = await prisma.user.findUnique({ where: { phone } });
    if (!user || !user.isAdmin) {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    if ((user as any).banned) {
      return res.status(403).json({ error: 'This account has been suspended.' });
    }

    // Update last login timestamp
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() } as any,
    });

    // Create session
    const rawAccess  = crypto.randomBytes(32).toString('hex');
    const rawRefresh = crypto.randomBytes(32).toString('hex');
    const expiresAt  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const session = await prisma.session.create({
      data: { userId: user.id, token: rawAccess, refreshToken: rawRefresh, expiresAt },
    });

    const accessToken = jwt.sign(
      { userId: user.id, sessionId: session.id, isAdmin: true },
      config.jwt.secret,
      { expiresIn: config.jwt.expiry } as jwt.SignOptions,
    );

    const refreshToken = jwt.sign(
      { userId: user.id, sessionId: session.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiry } as jwt.SignOptions,
    );

    // Audit log (non-blocking)
    prisma.auditLog.create({
      data: {
        userId: user.id,
        entityId: user.id,
        entityType: 'USER',
        action: 'ADMIN_LOGIN',
        ipAddress: req.ip,
        metadata: JSON.stringify({ maskedPhone: phone.slice(-4).padStart(phone.length, '*') }),
      },
    }).catch(() => {});

    logger.info(`[Admin Auth] Login success for ...${phone.slice(-4)}`);

    return res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        avatar: user.avatar,
        isAdmin: true,
        lastLoginAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
