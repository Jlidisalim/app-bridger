// Auth Routes
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { generateOTP, verifyOTP } from '../services/otpService';
import { normalizePhone } from '../utils/phone';
import { authRateLimiter } from '../middleware/security';
import { prisma } from '../config/db';
import { redis } from '../config/redis';
import config from '../config/env';
import { validate } from '../middleware/validate';
import { sendOtpSchema, verifyOtpSchema } from '../validators/auth';
import logger from '../utils/logger';

const router = Router();

// ── OTP brute-force lockout ───────────────────────────────────────────────────
// FIX: Uses Redis for multi-instance safety. Falls back to in-memory only when
// Redis is unavailable.

const LOCKOUT_MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_S   = 15 * 60; // 15 min in seconds
const LOCKOUT_WINDOW_S     = 15 * 60;

// In-memory fallback (used only when Redis is down)
interface LockoutEntry { count: number; lockedUntil: number | null; resetAt: number; }
const otpLockoutMap = new Map<string, LockoutEntry>();
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of otpLockoutMap.entries()) {
    if (entry.resetAt < now && (!entry.lockedUntil || entry.lockedUntil < now)) {
      otpLockoutMap.delete(key);
    }
  }
}, 10 * 60 * 1000);

async function checkOtpLockout(phone: string): Promise<{ locked: boolean; lockedUntil?: number }> {
  const lockKey = `otp_lockout:${phone}`;
  try {
    const locked = await redis.get(lockKey);
    if (locked) {
      const ttl = await redis.ttl(lockKey);
      return { locked: true, lockedUntil: Date.now() + ttl * 1000 };
    }
    return { locked: false };
  } catch {
    // Redis down — fall back to in-memory
    const entry = otpLockoutMap.get(lockKey);
    if (entry?.lockedUntil && Date.now() < entry.lockedUntil) {
      return { locked: true, lockedUntil: entry.lockedUntil };
    }
    return { locked: false };
  }
}

async function recordFailedOtpAttempt(phone: string): Promise<void> {
  const countKey = `otp_fail_count:${phone}`;
  const lockKey  = `otp_lockout:${phone}`;
  try {
    const count = await redis.incr(countKey);
    if (count === 1) await redis.expire(countKey, LOCKOUT_WINDOW_S);
    if (count >= LOCKOUT_MAX_ATTEMPTS) {
      await redis.setex(lockKey, LOCKOUT_DURATION_S, '1');
      await redis.del(countKey);
    }
  } catch {
    // Redis down — fall back to in-memory
    const key = `otp_lockout:${phone}`;
    const now = Date.now();
    const entry = otpLockoutMap.get(key);
    if (!entry || now > entry.resetAt) {
      otpLockoutMap.set(key, { count: 1, lockedUntil: null, resetAt: now + LOCKOUT_WINDOW_S * 1000 });
      return;
    }
    entry.count += 1;
    if (entry.count >= LOCKOUT_MAX_ATTEMPTS) {
      entry.lockedUntil = now + LOCKOUT_DURATION_S * 1000;
    }
  }
}

async function clearOtpAttempts(phone: string): Promise<void> {
  try {
    await redis.del(`otp_fail_count:${phone}`);
    await redis.del(`otp_lockout:${phone}`);
  } catch {}
  otpLockoutMap.delete(`otp_lockout:${phone}`);
}

// POST /auth/otp/send - Send OTP to phone
router.post('/otp/send', authRateLimiter, validate(sendOtpSchema), async (req: any, res, next) => {
  try {
    const { phone } = req.validated || req.body;

    // Normalize phone number
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Generate and send OTP
    const code = await generateOTP(normalizedPhone);

    // In development, include the code in the response so you can test
    // without checking the terminal or receiving a WhatsApp message
    if (process.env.NODE_ENV === 'development') {
      return res.json({ message: 'OTP sent successfully', code });
    }

    res.json({ message: 'OTP sent successfully' });
  } catch (error: any) {
    if (error.status === 429) {
      return res.status(429).json({ error: error.message });
    }
    next(error);
  }
});

// POST /auth/otp/verify - Verify OTP and create session
// Rate-limited (same limiter as send) + per-phone brute-force lockout
router.post('/otp/verify', authRateLimiter, validate(verifyOtpSchema), async (req: any, res, next) => {
  try {
    const { phone, code } = req.validated || req.body;

    // Normalize phone
    let normalizedPhone: string;
    try {
      normalizedPhone = normalizePhone(phone);
    } catch (err) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check per-phone lockout BEFORE hitting the DB
    const lockout = await checkOtpLockout(normalizedPhone);
    if (lockout.locked) {
      return res.status(423).json({
        error: 'Account temporarily locked. Too many failed attempts. Try again in 15 minutes.',
        lockedUntil: lockout.lockedUntil,
      });
    }

    // Verify OTP — on failure record an attempt
    try {
      await verifyOTP(normalizedPhone, code);
    } catch (otpError: any) {
      // Only count as a lockout-worthy failure if the code was wrong (not expired)
      if (otpError.status === 400) {
        await recordFailedOtpAttempt(normalizedPhone);
        const newLockout = await checkOtpLockout(normalizedPhone);
        if (newLockout.locked) {
          return res.status(423).json({
            error: 'Too many failed attempts. Account locked for 15 minutes.',
            lockedUntil: newLockout.lockedUntil,
          });
        }
      }
      return res.status(otpError.status || 400).json({ error: otpError.message });
    }

    // Success — clear lockout counter
    await clearOtpAttempts(normalizedPhone);

    // Find or create user
    let user = await prisma.user.findUnique({
      where: { phone: normalizedPhone },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { phone: normalizedPhone },
      });
    }

    // Create session
    const accessToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        refreshToken,
        expiresAt,
      },
    });

    // Generate JWT
    const jwtSecret = config.jwt.secret;
    const jwtRefreshSecret = config.jwt.refreshSecret;
    const jwtExpiry = config.jwt.expiry;
    const jwtRefreshExpiry = config.jwt.refreshExpiry;

    const sessionData = await prisma.session.findFirst({ where: { token: accessToken } });

    if (!sessionData) {
      return res.status(500).json({ error: 'Session creation failed' });
    }

    const token = jwt.sign(
      { userId: user.id, sessionId: sessionData.id, isAdmin: (user as any).isAdmin ?? false },
      jwtSecret,
      { expiresIn: jwtExpiry } as jwt.SignOptions
    );

    // FIX 7: Use real session UUID (not the raw accessToken string) as sessionId in refresh JWT
    const refreshTokenJwt = jwt.sign(
      { userId: user.id, sessionId: sessionData.id },
      jwtRefreshSecret,
      { expiresIn: jwtRefreshExpiry } as jwt.SignOptions
    );

    res.json({
      accessToken: token,
      refreshToken: refreshTokenJwt,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        avatar: user.avatar,
        profilePhoto: user.profilePhoto,
        kycStatus: user.kycStatus,
        walletBalance: user.walletBalance,
        rating: user.rating,
        totalDeals: user.totalDeals,
        isAdmin: (user as any).isAdmin ?? false,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    if (error.status === 400 || error.status === 429) {
      return res.status(error.status).json({ error: error.message });
    }
    next(error);
  }
});

// POST /auth/refresh - Refresh access token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // FIX 7: Decode refresh JWT — payload now contains { userId, sessionId: session.id }
    interface RefreshTokenPayload { userId: string; sessionId: string; }
    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as RefreshTokenPayload;

    // Look up session by UUID (not by token string)
    const session = await prisma.session.findUnique({
      where: { id: decoded.sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Extra check: session must belong to the claimed user
    if (session.userId !== decoded.userId) {
      return res.status(401).json({ error: 'Session mismatch' });
    }

    // Generate new tokens
    const newAccessToken = crypto.randomBytes(32).toString('hex');
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.update({
      where: { id: session.id },
      data: {
        token: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt,
      },
    });

    const accessToken = jwt.sign(
      { userId: session.userId, sessionId: session.id, isAdmin: (session.user as any).isAdmin ?? false },
      config.jwt.secret,
      { expiresIn: config.jwt.expiry } as jwt.SignOptions
    );

    // FIX 7: Refresh token carries { userId, sessionId: session.id } — never the raw token string
    const refreshTokenJwt = jwt.sign(
      { userId: session.userId, sessionId: session.id },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiry } as jwt.SignOptions
    );

    res.json({
      accessToken,
      refreshToken: refreshTokenJwt,
    });
  } catch (error) {
    next(error);
  }
});

// POST /auth/logout - Logout and delete session
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token required' });
    }

    const token = authHeader.slice(7);
    try {
      const decoded = jwt.verify(token, config.jwt.secret) as any;
      // FIX: Only delete the CURRENT session, not all sessions for the user.
      // This prevents logging out on one device from logging out all devices.
      if (decoded.sessionId) {
        await prisma.session.delete({
          where: { id: decoded.sessionId },
        }).catch(() => {});
      }
    } catch (err) {
      // Token invalid/expired — try to decode without verification to still revoke session
      try {
        const decoded = jwt.decode(token) as any;
        if (decoded?.sessionId) {
          await prisma.session.delete({ where: { id: decoded.sessionId } }).catch(() => {});
        }
      } catch {}
    }

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
