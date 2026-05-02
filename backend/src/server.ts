// Bridger Backend Server Entry Point
import dotenv from 'dotenv';

dotenv.config();

import config from './config/env';
import logger from './utils/logger';

import * as Sentry from '@sentry/node';

if (config.server.sentryDsn) {
  Sentry.init({
    dsn: config.server.sentryDsn,
    environment: config.server.nodeEnv,
    tracesSampleRate: config.server.nodeEnv === 'production' ? 0.2 : 1.0,
  });
  logger.info('Sentry initialised');
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import path from 'path';

import authRoutes         from './routes/auth';
import adminAuthRoutes    from './routes/adminAuth';
import userRoutes         from './routes/users';
import dealRoutes         from './routes/deals';
import walletRoutes       from './routes/wallet';
import chatRoutes         from './routes/chat';
import notificationRoutes from './routes/notifications';
import verificationRoutes from './routes/verification';
import tripRoutes         from './routes/trips';
import disputeRoutes      from './routes/disputes';
import reviewRoutes       from './routes/reviews';
import searchRoutes       from './routes/search';
import mlRoutes           from './routes/ml';
import seedRoutes         from './routes/seed';
import internalRoutes     from './routes/internal';
import adminRoutes        from './routes/admin';
import trackingRoutes     from './routes/tracking';

import { authenticate } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import { initWebSocket } from './services/websocket';
import { prisma } from './config/db';
import { initPricingModel } from './ml/pricing/pricingModel';
import { initReviewClassifier } from './ml/reviews/reviewML';

const mlStatus: Record<string, 'ok' | 'error' | 'initializing'> = {
  pricing:  'initializing',
  reviews:  'initializing',
};

export { prisma };

const app = express();
const httpServer = createServer(app);

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: config.server.allowedOrigins,
  credentials: true,
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Admin dashboard makes many parallel requests — give it a generous separate limit
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/admin', adminLimiter);

// Raise body limit so base64-encoded deal images (can be several MB) aren't
// rejected as "payload too large" — without this, deals post with empty images
// and only the sender sees the photos via their local store.
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Serve uploaded files (avatar, deal, face, kyc) from backend/uploads/
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve static legal documents (terms, privacy) from backend/public/legal/
// — kept here so the same backend deploy ships the agreements that the mobile
// app links to from the Profile screen.
app.use(
  '/legal',
  express.static(path.join(__dirname, '../public/legal'), {
    extensions: ['html'],
    maxAge: '1d',
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  }),
);

app.get('/health/ml', (_req, res) => {
  const allOk = Object.values(mlStatus).every(v => v === 'ok');
  const anyError = Object.values(mlStatus).some(v => v === 'error');
  res.status(anyError ? 503 : allOk ? 200 : 206).json({
    status: anyError ? 'degraded' : allOk ? 'ok' : 'initializing',
    modules: mlStatus,
    timestamp: new Date().toISOString(),
  });
});

import { getFaceCircuitState } from './services/faceVerificationService';
app.get('/health/face-service', (_req, res) => {
  const circuit = getFaceCircuitState();
  const ok = circuit.state === 'CLOSED';
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    circuit: circuit.state,
    consecutiveFailures: circuit.failures,
    openedAt: circuit.openedAt ? new Date(circuit.openedAt).toISOString() : null,
  });
});

app.get('/health', async (_req, res) => {
  const checks: Record<string, 'ok' | 'error'> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch {
    checks.database = 'error';
  }

  try {
    const { redis } = await import('./config/redis');
    await redis.get('__health_check__');
    checks.redis = 'ok';
  } catch {
    checks.redis = 'error';
  }

  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json({
    status: allOk ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

app.use('/auth', authRoutes);
app.use('/auth', adminAuthRoutes); // admin-specific OTP routes (/auth/admin/otp/*)

app.use('/users',         authenticate, userRoutes);

// Unauthenticated receiver routes — MUST be registered before the authenticated
// /deals mount, because Express matches in order and `authenticate` would otherwise
// reject receivers (who have no login) with "token required".
app.post('/deals/verify-sender-id', async (req, res, next) => {
  try {
    const { senderId } = req.body;
    if (!senderId) return res.status(400).json({ error: 'senderId is required' });

    const [bySenderId, byCode] = await Promise.all([
      prisma.deal.findMany({
        where: { senderId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, status: true, receiverCode: true },
      }),
      prisma.deal.findMany({
        where: { receiverCode: senderId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, status: true, receiverCode: true },
      }),
    ]);

    const match = [...bySenderId, ...byCode][0];
    if (match) {
      res.json({ valid: true, dealId: match.id, status: match.status });
    } else {
      res.json({ valid: false, error: 'No delivery found for this code' });
    }
  } catch (error) { next(error); }
});

app.post('/deals/receiver-verify', async (req, res, next) => {
  try {
    const { dealId, receiverCode, receiverName, receiverPhone, senderId, whatsappId } = req.body;

    if (!dealId) return res.status(400).json({ error: 'dealId is required' });
    if (!senderId) return res.status(400).json({ error: 'senderId is required' });

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        sender: { select: { id: true, name: true } },
        traveler: { select: { id: true, name: true } },
      },
    });

    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    // The "delivery code" the receiver types can be either the true senderId UUID
    // or the 6-digit receiverCode the sender shared — accept both, like verify-sender-id does.
    if (deal.senderId !== senderId && deal.receiverCode !== senderId) {
      return res.status(403).json({ error: 'Sender ID does not match this deal' });
    }

    if (!['IN_TRANSIT', 'PICKED_UP', 'ESCROW_PAID'].includes(deal.status)) {
      return res.status(400).json({ error: `Deal must be IN_TRANSIT or PICKED_UP to verify (current: ${deal.status})` });
    }

    if (receiverCode && deal.receiverCode && deal.receiverCode !== receiverCode) {
      return res.status(400).json({ error: 'Invalid receiver code' });
    }

    // Figure out which timeline stages are missing so the saved DB timeline
    // shows every step as completed (not just the final DELIVERED one).
    const existingEvents = await prisma.trackingEvent.findMany({
      where: { dealId: deal.id },
      select: { status: true },
    });
    const seen = new Set(existingEvents.map((e) => e.status));
    const receiverNote = receiverName || receiverPhone
      ? `Delivery by ${receiverName || 'receiver'}${receiverPhone ? ` (${receiverPhone})` : ''}`
      : 'Delivery confirmed by receiver';
    const backfill: { status: string; actor: string; note: string }[] = [];
    if (!seen.has('PICKED_UP')) backfill.push({ status: 'PICKED_UP', actor: 'system', note: 'Auto-recorded at delivery confirmation' });
    if (!seen.has('IN_TRANSIT')) backfill.push({ status: 'IN_TRANSIT', actor: 'system', note: 'Auto-recorded at delivery confirmation' });
    backfill.push({ status: 'DELIVERED', actor: 'receiver', note: receiverNote });
    backfill.push({ status: 'COMPLETED', actor: 'system', note: 'Delivery confirmed — escrow released' });

    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({
        where: { id: dealId },
        data: {
          status: 'COMPLETED',
          receiverCode: null,
          deliveryDate: new Date(),
        },
      }),
      ...backfill.map((ev) =>
        prisma.trackingEvent.create({
          data: { dealId: deal.id, status: ev.status, actor: ev.actor, note: ev.note },
        }),
      ),
    ]);

    res.json({ verified: true, message: 'Delivery confirmed', deal: updatedDeal });
  } catch (error: any) {
    next(error);
  }
});

app.use('/deals',         authenticate, dealRoutes);
app.use('/wallet',        walletRoutes);
app.use('/chat',          authenticate, chatRoutes);
app.use('/notifications', authenticate, notificationRoutes);
app.use('/trips',         authenticate, tripRoutes);
app.use('/disputes',      authenticate, disputeRoutes);
app.use('/reviews',       authenticate, reviewRoutes);
app.use('/search',        authenticate, searchRoutes);
app.use('/verify',        verificationRoutes);

app.use('/ml', mlRoutes);

app.use('/seed', seedRoutes);

app.use('/internal', internalRoutes);

app.use('/admin', adminRoutes);

app.use('/tracking', authenticate, trackingRoutes);

app.use(errorHandler);

if (config.server.sentryDsn) {
  app.use(Sentry.Handlers.errorHandler());
}

initWebSocket(httpServer);

const PORT = process.env.PORT || 4000;

async function main() {
  try {
    await prisma.$connect();
    logger.info('Connected to database');

    httpServer.setTimeout(150000);

    Promise.all([
      initPricingModel()
        .then(() => { mlStatus.pricing = 'ok'; })
        .catch((e) => {
          mlStatus.pricing = 'error';
          logger.error('Pricing model init failed', { module: 'pricing', error: String(e) });
          if (config.server.sentryDsn) Sentry.captureException(e, { tags: { module: 'ml-pricing' } });
        }),
      Promise.resolve().then(() => {
        try {
          initReviewClassifier();
          mlStatus.reviews = 'ok';
        } catch (e) {
          mlStatus.reviews = 'error';
          logger.error('Review classifier init failed', { module: 'reviews', error: String(e) });
          if (config.server.sentryDsn) Sentry.captureException(e, { tags: { module: 'ml-reviews' } });
        }
      }),
    ]).then(() => {
      const anyFailed = Object.values(mlStatus).some(v => v === 'error');
      if (anyFailed) {
        logger.warn('Some ML modules failed to initialise', { mlStatus });
      } else {
        logger.info('ML modules initialised', { mlStatus });
      }
    });

    // Start tracking subsystem: watchdog for stale GPS sessions + restore in-flight polls.
    const { startGpsWatchdog } = await import('./services/tracking/tracking.service');
    const { restoreActiveFlightPolls } = await import('./services/tracking/flightPoller');
    startGpsWatchdog();
    restoreActiveFlightPolls().catch((e) =>
      logger.warn('restoreActiveFlightPolls failed', { error: String(e) }),
    );

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: String(error) });
    process.exit(1);
  }
}

main();