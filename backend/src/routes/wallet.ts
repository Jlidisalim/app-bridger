// Wallet Routes
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { depositSchema, withdrawSchema, walletFiltersSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { getIO } from '../services/websocket';
import { createWithdrawal, createStripeConnectOnboardingUrl } from '../services/paymentService';
import logger from '../utils/logger';

const router = Router();

// GET /wallet - Get wallet info
router.get('/', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get or create wallet
    let wallet = await prisma.wallet.findUnique({
      where: { userId: req.user.id },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          userId: req.user.id,
          balance: user.walletBalance,
          availableBalance: user.walletBalance,
        },
      });
    }

    const recentTransactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    res.json({
      balance: wallet.balance,
      // Funds locked in active escrow holds (shipments / accepted trips).
      blockedBalance: wallet.pendingBalance,
      pendingBalance: wallet.pendingBalance,
      availableBalance: wallet.availableBalance,
      currency: wallet.currency,
      recentTransactions,
    });
  } catch (error) {
    next(error);
  }
});

// GET /wallet/transactions - Get transaction history
router.get('/transactions', authenticate, async (req: any, res, next) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = { userId: req.user.id };
    if (type) where.type = type;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + take < total
    });
  } catch (error) {
    next(error);
  }
});

// POST /wallet/deposit - Create deposit
router.post('/deposit', authenticate, validate(depositSchema), async (req: any, res, next) => {
  try {
    const { amount, currency = 'USD' } = req.validated || req.body;
    // Dev bypass is ONLY active in development. In production the Stripe key must be present and live.
    const isProduction = process.env.NODE_ENV === 'production';
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
    if (isProduction && !stripeKey.startsWith('sk_live_')) {
      throw new Error('Production requires a live Stripe secret key (sk_live_...)');
    }
    const isDev = !isProduction && (process.env.NODE_ENV === 'development' || !stripeKey);

    if (isDev) {
      // DEV MODE: skip Stripe entirely — update balance immediately so deposit works without webhook
      const devRef = `dev_${Date.now()}`;
      const [newWallet] = await prisma.$transaction([
        prisma.wallet.upsert({
          where: { userId: req.user.id },
          update: {
            balance:          { increment: amount },
            availableBalance: { increment: amount },
          },
          create: {
            userId:           req.user.id,
            balance:          amount,
            availableBalance: amount,
          },
        }),
        prisma.user.update({
          where: { id: req.user.id },
          data:  { walletBalance: { increment: amount } },
        }),
        prisma.transaction.create({
          data: {
            userId:    req.user.id,
            type:      'DEPOSIT',
            amount,
            currency,
            status:    'COMPLETED',
            stripeId:  devRef,
          },
        }),
      ]);
      logger.info(`[DEV] Wallet deposit simulated`, { amount, currency, ref: devRef });
      return res.json({
        clientSecret: `pi_dev_${Date.now()}_secret`,
        devMode: true,
        newBalance: newWallet.balance,
        message: `[DEV] Deposit of ${amount} ${currency} applied immediately`,
      });
    }

    // PRODUCTION: create real Stripe PaymentIntent
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount:   Math.round(amount * 100),
      currency: currency.toLowerCase(),
      metadata: { userId: req.user.id },
    });

    await prisma.transaction.create({
      data: {
        userId:   req.user.id,
        type:     'DEPOSIT',
        amount,
        currency,
        status:   'PENDING',
        stripeId: paymentIntent.id,
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    next(error);
  }
});

// POST /wallet/dev-webhook-simulate — DEV ONLY: manually trigger Stripe webhook flow
// Useful for testing the full payment completion path without a real Stripe account.
// FIX: Added authenticate middleware — unauthenticated users could previously credit any wallet.
router.post('/dev-webhook-simulate', authenticate, async (req: any, res, next) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const { userId, amount = 10 } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { walletBalance: { increment: amount } } }),
      prisma.transaction.create({
        data: { userId, type: 'DEPOSIT', amount, status: 'COMPLETED', stripeId: `sim_${Date.now()}` },
      }),
    ]);

    res.json({ success: true, message: `Simulated webhook: +${amount} credited to ${userId}` });
  } catch (error) { next(error); }
});

// POST /wallet/withdraw - Create withdrawal (requires Stripe Connect)
router.post('/withdraw', authenticate, validate(withdrawSchema), async (req: any, res, next) => {
  try {
    const { amount, currency = 'USD' } = req.validated || req.body;
    const { withdrawalId } = await createWithdrawal(req.user.id, amount, currency);
    res.json({ message: 'Withdrawal initiated', withdrawalId });
  } catch (error) {
    next(error);
  }
});

// POST /wallet/connect/onboard - Start Stripe Connect onboarding for payouts
router.post('/connect/onboard', authenticate, async (req: any, res, next) => {
  try {
    const { returnUrl, refreshUrl } = req.body;
    if (!returnUrl || !refreshUrl) {
      return res.status(400).json({ error: 'returnUrl and refreshUrl are required' });
    }
    const url = await createStripeConnectOnboardingUrl(req.user.id, returnUrl, refreshUrl);
    res.json({ url });
  } catch (error) {
    next(error);
  }
});

// GET /wallet/connect-status - Get Stripe Connect account status
router.get('/connect-status', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const status = (user as any).stripeAccountStatus || 'NOT_STARTED';
    let dashboardUrl: string | undefined;

    if (status === 'ACTIVE' && (user as any).stripeConnectAccountId && process.env.STRIPE_SECRET_KEY) {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const link = await stripe.accounts.createLoginLink((user as any).stripeConnectAccountId).catch(() => null);
      dashboardUrl = link?.url;
    }

    res.json({ status, dashboardUrl });
  } catch (error) { next(error); }
});

// POST /wallet/payout - Transfer earnings to traveler's Stripe Connect account
router.post('/payout', authenticate, async (req: any, res, next) => {
  try {
    const { dealId } = req.body;
    if (!dealId) return res.status(400).json({ error: 'dealId is required' });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const stripeAccountId  = (user as any).stripeConnectAccountId;
    const stripeAcctStatus = (user as any).stripeAccountStatus;

    if (!stripeAccountId || stripeAcctStatus !== 'ACTIVE') {
      return res.status(400).json({ error: 'Active Stripe Connect account required for payouts' });
    }

    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (deal.travelerId !== req.user.id) return res.status(403).json({ error: 'Only the traveler can request payout' });
    if (deal.status !== 'COMPLETED') return res.status(400).json({ error: 'Deal must be COMPLETED for payout' });

    const payoutAmount = deal.price;

    if (!process.env.STRIPE_SECRET_KEY) {
      // DEV mode: simulate payout
      const result = await prisma.$transaction(async (tx) => {
        const payoutTx = await tx.transaction.create({
          data: {
            userId: req.user.id,
            dealId,
            type: 'ESCROW_RELEASE',
            amount: payoutAmount,
            status: 'COMPLETED',
            stripeId: `dev_payout_${Date.now()}`,
          },
        });
        await tx.user.update({ where: { id: req.user.id }, data: { walletBalance: { increment: payoutAmount } } });
        return payoutTx;
      });
      return res.json({ success: true, payoutId: result.stripeId, amount: payoutAmount });
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const transfer = await stripe.transfers.create({
      amount: Math.round(payoutAmount * 100),
      currency: (deal.currency || 'USD').toLowerCase(),
      destination: stripeAccountId,
      metadata: { dealId, userId: req.user.id },
    }, {
      idempotencyKey: `payout_${dealId}_${req.user.id}`, // FIX: prevent duplicate payouts on retry
    });

    await prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId: req.user.id,
          dealId,
          type: 'ESCROW_RELEASE',
          amount: payoutAmount,
          status: 'COMPLETED',
          stripeId: transfer.id,
        },
      });
      await tx.user.update({ where: { id: req.user.id }, data: { walletBalance: { increment: payoutAmount } } });
    });

    res.json({ success: true, payoutId: transfer.id, amount: payoutAmount });
  } catch (error) { next(error); }
});

// POST /wallet/connect-webhook - Stripe Connect account.updated webhook
router.post('/connect-webhook', async (req, res, next) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe not configured' });

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

    let event: any;
    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        return res.status(400).json({ error: `Webhook error: ${err.message}` });
      }
    } else {
      event = req.body; // Dev: trust raw payload
    }

    if (event.type === 'account.updated') {
      const account = event.data.object;
      const stripeAccountId = account.id;

      const user = await prisma.user.findFirst({ where: { stripeConnectAccountId: stripeAccountId } as any });
      if (user) {
        let newStatus = 'PENDING';
        if (account.charges_enabled && account.details_submitted) newStatus = 'ACTIVE';
        else if (!account.charges_enabled && account.requirements?.disabled_reason) newStatus = 'RESTRICTED';

        await prisma.user.update({
          where: { id: user.id },
          data: { stripeAccountStatus: newStatus } as any,
        });
      }
    }

    res.json({ received: true });
  } catch (error) { next(error); }
});

// POST /wallet/refund - Request a refund for a deal
router.post('/refund', authenticate, async (req: any, res, next) => {
  try {
    const { dealId, reason } = req.body;
    if (!dealId || typeof reason !== 'string' || reason.length < 5) {
      return res.status(400).json({ error: 'dealId and reason (min 5 chars) are required' });
    }

    // Verify deal exists and belongs to requesting user
    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        transactions: {
          where: { type: 'DEPOSIT', status: 'COMPLETED' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const isSender   = deal.senderId === req.user.id;
    const isTraveler = deal.travelerId === req.user.id;
    if (!isSender && !isTraveler) {
      return res.status(403).json({ error: 'Not a participant in this deal' });
    }

    // Refundable states
    const refundableStatuses = ['DISPUTED', 'CANCELLED'];
    if (!refundableStatuses.includes(deal.status)) {
      return res.status(400).json({ error: `Deal in status ${deal.status} is not refundable` });
    }

    const originalTx = deal.transactions[0];
    const refundAmount = deal.price;

    // DEV mode: skip Stripe, apply immediately
    if (!process.env.STRIPE_SECRET_KEY) {
      const result = await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: req.user.id },
          data: { walletBalance: { increment: refundAmount } },
        });
        const refundTx = await tx.transaction.create({
          data: {
            userId: req.user.id,
            dealId,
            type: 'REFUND',
            amount: refundAmount,
            currency: deal.currency || 'USD',
            status: 'COMPLETED',
            stripeId: `dev_refund_${Date.now()}`,
            metadata: JSON.stringify({ reason }),
          },
        });
        await tx.deal.update({
          where: { id: dealId },
          data: { status: 'REFUNDED' as any },
        });
        return refundTx;
      });

      const io = getIO();
      if (io) {
        const payload = { dealId, refundAmount, reason };
        io.to(`user:${deal.senderId}`).emit('refund_processed', payload);
        if (deal.travelerId) io.to(`user:${deal.travelerId}`).emit('refund_processed', payload);
      }

      return res.json({ success: true, refundId: result.stripeId, amount: refundAmount });
    }

    // Production: call Stripe refund API
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const stripeRefund = await stripe.refunds.create({
      payment_intent: originalTx?.stripeId,
      amount: Math.round(refundAmount * 100),
    }).catch((err: any) => {
      const msg = err?.raw?.message || err.message || 'Stripe refund failed';
      if (msg.includes('already been refunded')) throw Object.assign(new Error('This charge has already been refunded'), { status: 409 });
      if (msg.includes('expired')) throw Object.assign(new Error('Charge window has expired for refunds'), { status: 400 });
      throw err;
    });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.user.id },
        data: { walletBalance: { increment: refundAmount } },
      });
      await tx.transaction.create({
        data: {
          userId: req.user.id,
          dealId,
          type: 'REFUND',
          amount: refundAmount,
          currency: deal.currency || 'USD',
          status: 'COMPLETED',
          stripeId: stripeRefund.id,
          metadata: JSON.stringify({ reason }),
        },
      });
      await tx.deal.update({
        where: { id: dealId },
        data: { status: 'REFUNDED' as any },
      });
    });

    const io = getIO();
    if (io) {
      const payload = { dealId, refundAmount, reason };
      io.to(`user:${deal.senderId}`).emit('refund_processed', payload);
      if (deal.travelerId) io.to(`user:${deal.travelerId}`).emit('refund_processed', payload);
    }

    res.json({ success: true, refundId: stripeRefund.id, amount: refundAmount });
  } catch (error: any) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    next(error);
  }
});

// POST /wallet/webhook - Stripe webhook
router.post('/webhook', async (req, res, next) => {
  try {
    const isDev = process.env.NODE_ENV === 'development';

    // FIX 12: Never skip verification in non-development environments
    if (!isDev && !process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe not configured' });
    }
    if (!isDev && !process.env.STRIPE_WEBHOOK_SECRET) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be set in production');
    }

    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
    const sig = req.headers['stripe-signature'];

    let event: any;
    if (!isDev) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
      } catch (err: any) {
        return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
      }
    } else {
      // Dev: parse raw body without signature verification (log warning)
      const logger = require('../utils/logger').default;
      logger.warn('[DEV] Stripe webhook signature verification skipped');
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }

    const io = getIO();

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const userId = paymentIntent.metadata?.userId;
        if (userId) {
          const amount = paymentIntent.amount / 100;
          await prisma.$transaction([
            prisma.user.update({
              where: { id: userId },
              data: { walletBalance: { increment: amount } },
            }),
            prisma.transaction.updateMany({
              where: { userId, status: 'PENDING', type: 'DEPOSIT' },
              data: { status: 'COMPLETED', stripeId: paymentIntent.id },
            }),
          ]);
          if (io) io.to(`user:${userId}`).emit('deposit_confirmed', { amount });
        }
        break;
      }

      // FIX 12: Handle charge.refunded
      case 'charge.refunded': {
        const charge = event.data.object;
        const paymentIntentId = charge.payment_intent as string;
        if (paymentIntentId) {
          await prisma.transaction.updateMany({
            where: { stripeId: paymentIntentId, status: 'COMPLETED' },
            data: { status: 'REFUNDED' },
          });
          const tx = await prisma.transaction.findFirst({ where: { stripeId: paymentIntentId } });
          if (tx && io) {
            io.to(`user:${tx.userId}`).emit('refund_processed', { stripeId: paymentIntentId });
          }
        }
        break;
      }

      // FIX 12: Handle transfer.failed
      case 'transfer.failed': {
        const transfer = event.data.object;
        const transferId = transfer.id as string;
        const failedTx = await prisma.transaction.findFirst({
          where: { stripeId: transferId, type: 'ESCROW_RELEASE' },
        });
        if (failedTx) {
          await prisma.$transaction([
            prisma.transaction.update({
              where: { id: failedTx.id },
              data: {
                status: 'FAILED',
                metadata: JSON.stringify({ failureReason: transfer.failure_message }),
              },
            }),
            // Re-credit the traveler
            prisma.user.update({
              where: { id: failedTx.userId },
              data: { walletBalance: { increment: Number(failedTx.amount) } },
            }),
            // Admin task for investigation
            prisma.adminTask.create({
              data: {
                type: 'TRANSFER_FAILED',
                referenceId: transferId,
                status: 'OPEN',
                notes: `Stripe transfer ${transferId} failed: ${transfer.failure_message}`,
              },
            }),
          ]);
          if (io) {
            io.to(`user:${failedTx.userId}`).emit('transfer_failed', {
              amount: failedTx.amount,
              message: 'Your payout failed. Your balance has been restored. Contact support.',
            });
          }
        }
        break;
      }

      // FIX 12: Handle account.updated (Stripe Connect)
      case 'account.updated': {
        const account = event.data.object;
        const stripeAccountId = account.id as string;
        const user = await prisma.user.findFirst({
          where: { stripeConnectAccountId: stripeAccountId } as any,
        });
        if (user) {
          let newStatus = 'PENDING';
          if (account.charges_enabled && account.payouts_enabled) newStatus = 'ACTIVE';
          else if (account.requirements?.disabled_reason) newStatus = 'RESTRICTED';
          else if (!account.details_submitted) newStatus = 'PENDING';

          await prisma.user.update({
            where: { id: user.id },
            data: { stripeAccountStatus: newStatus } as any,
          });

          if (io) {
            io.to(`user:${user.id}`).emit('stripe_account_updated', { status: newStatus });
          }
        }
        break;
      }

      default: {
        const logger = require('../utils/logger').default;
        logger.debug(`Unhandled Stripe webhook event: ${event.type}`);
      }
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
});

export default router;
