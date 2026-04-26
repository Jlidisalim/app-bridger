/**
 * Internal-only routes — called by trusted backend services (e.g. baileys-server).
 * All routes require the INTERNAL_API_SECRET header.
 */
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../config/db';
import logger from '../utils/logger';

const router = Router();

function requireInternalSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    // Internal secret not configured — reject to avoid open endpoints
    return res.status(503).json({ error: 'Internal API not configured' });
  }
  if (req.headers['x-internal-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

/**
 * POST /internal/whatsapp-log
 * Records the result of a WhatsApp OTP send attempt from baileys-server.
 * Body: { to, message, status, error?, retries? }
 */
router.post('/whatsapp-log', requireInternalSecret, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { to, message, status, error, retries = 0 } = req.body;
    if (!to || !message || !status) {
      return res.status(400).json({ error: 'to, message, and status are required' });
    }

    await prisma.whatsappLog.create({
      data: { to, message, status, error: error ?? null, retries },
    });

    logger.info('[Internal] WhatsApp log recorded', { to: `...${String(to).slice(-4)}`, status });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
