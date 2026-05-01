import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import config from '../config/env';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

const stripe = new Stripe(config.stripe.secretKey, {
  apiVersion: '2023-10-16',
});

export async function createDepositIntent(
  userId: string,
  amount: number,
  currency: string = 'USD'
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  // Create Stripe PaymentIntent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: currency.toLowerCase(),
    metadata: {
      userId,
      type: 'deposit',
    },
  });

  // Create pending transaction
  await prisma.transaction.create({
    data: {
      userId,
      type: 'DEPOSIT',
      amount,
      currency,
      status: 'PENDING',
      stripeId: paymentIntent.id,
    },
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

export async function createWithdrawal(
  userId: string,
  amount: number,
  currency: string = 'USD'
): Promise<{ withdrawalId: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) throw new AppError('User not found', 404);

  // Withdraw against available balance (escrowed funds are not withdrawable).
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  const available = wallet ? Number(wallet.availableBalance) : Number(user.walletBalance);
  if (available < amount) throw new AppError('Insufficient available balance', 400);

  // Require a Stripe Connect account to be linked before allowing withdrawals
  if (!user.stripeConnectAccountId) {
    throw new AppError(
      'Bank account not linked. Please complete payout onboarding in Profile → Payout Settings before withdrawing.',
      400
    );
  }

  // Atomically deduct balance + create transaction record. Wallet.availableBalance
  // and Wallet.balance must stay in sync with User.walletBalance.
  const ops: Prisma.PrismaPromise<any>[] = [
    prisma.transaction.create({
      data: { userId, type: 'WITHDRAWAL', amount, currency, status: 'PENDING' },
    }),
    prisma.user.update({
      where: { id: userId },
      data: { walletBalance: { decrement: amount } },
    }),
  ];
  if (wallet) {
    ops.push(prisma.wallet.update({
      where: { userId },
      data: {
        balance: { decrement: amount },
        availableBalance: { decrement: amount },
      },
    }));
  }
  const [transaction] = await prisma.$transaction(ops);

  // Initiate payout via Stripe Connect
  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // cents
      currency: currency.toLowerCase(),
      destination: user.stripeConnectAccountId,
      transfer_group: `withdrawal_${userId}_${transaction.id}`,
    }, {
      idempotencyKey: `withdrawal_${transaction.id}`, // FIX: prevent duplicate payouts on network retry
    });

    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: 'COMPLETED', stripeId: transfer.id },
    });

    logger.info(`Withdrawal completed for user ${userId}`, {
      transferId: transfer.id,
      amount,
      currency,
    });
  } catch (stripeError: any) {
    // Stripe failed — refund the balance and mark transaction failed
    const rollback: Prisma.PrismaPromise<any>[] = [
      prisma.transaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', metadata: JSON.stringify({ error: stripeError.message }) },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
      }),
    ];
    if (wallet) {
      rollback.push(prisma.wallet.update({
        where: { userId },
        data: {
          balance: { increment: amount },
          availableBalance: { increment: amount },
        },
      }));
    }
    await prisma.$transaction(rollback);
    logger.error(`Stripe transfer failed for user ${userId}`, { error: stripeError.message });
    throw new AppError(`Payout failed: ${stripeError.message}`, 500);
  }

  return { withdrawalId: transaction.id };
}

/**
 * Onboard a user to Stripe Connect Express (for payouts).
 * Returns the URL to redirect the user to for bank account setup.
 */
export async function createStripeConnectOnboardingUrl(
  userId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('User not found', 404);

  let accountId = user.stripeConnectAccountId;

  if (!accountId) {
    // Create a new Express account
    const account = await stripe.accounts.create({
      type: 'express',
      metadata: { userId },
    });
    accountId = account.id;
    await prisma.user.update({
      where: { id: userId },
      data: { stripeConnectAccountId: accountId },
    });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  });

  return link.url;
}

export async function handleWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { userId, type } = paymentIntent.metadata;

      if (type === 'deposit') {
        // Find the pending transaction
        const transaction = await prisma.transaction.findFirst({
          where: {
            stripeId: paymentIntent.id,
            status: 'PENDING',
          },
        });

        if (transaction) {
          // Update transaction to completed
          await prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'COMPLETED' },
          });

          // Add to user wallet
          await prisma.user.update({
            where: { id: userId },
            data: {
              walletBalance: {
                increment: Number(transaction.amount),
              },
            },
          });
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      const { userId } = paymentIntent.metadata;

      // Find and update failed transaction
      await prisma.transaction.updateMany({
        where: {
          stripeId: paymentIntent.id,
          status: 'PENDING',
        },
        data: { status: 'FAILED' },
      });
      break;
    }

    default:
      logger.warn(`Unhandled event type: ${event.type}`);
  }
}

export async function createEscrowHold(
  userId: string,
  dealId: string,
  amount: number
): Promise<{ escrowId: string }> {
  // Create escrow transaction
  const transaction = await prisma.transaction.create({
    data: {
      userId,
      dealId,
      type: 'ESCROW_HOLD',
      amount,
      status: 'PENDING',
    },
  });

  return { escrowId: transaction.id };
}

/**
 * Release escrow back to the sender when a deal is cancelled.
 * No-ops silently if no escrow exists for this deal.
 */
export async function releaseEscrowForCancellation(
  dealId: string,
  senderId: string
): Promise<void> {
  const escrowTx = await prisma.transaction.findFirst({
    where: { dealId, type: 'ESCROW_HOLD', status: { in: ['PENDING', 'COMPLETED'] } },
  });

  if (!escrowTx) return; // no escrow to release

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: escrowTx.id },
      data: { status: 'REFUNDED' },
    }),
    prisma.transaction.create({
      data: {
        userId: senderId,
        dealId,
        type: 'REFUND',
        amount: escrowTx.amount,
        currency: escrowTx.currency,
        status: 'COMPLETED',
        metadata: JSON.stringify({ reason: 'DEAL_CANCELLED', originalEscrowId: escrowTx.id }),
      },
    }),
    prisma.user.update({
      where: { id: senderId },
      data: { walletBalance: { increment: escrowTx.amount } },
    }),
  ]);

  logger.info(`Escrow released for cancelled deal ${dealId}`, {
    amount: escrowTx.amount,
    senderId,
  });
}

export async function releaseEscrow(
  dealId: string,
  travelerId: string,
  amount: number
): Promise<{ success: true; transactionId: string; releasedAmount: number } | { success: true; alreadyReleased: true }> {
  // ── Pre-transaction validation ────────────────────────────────────────────
  const escrowTx = await prisma.transaction.findFirst({
    where: { dealId, type: 'ESCROW_HOLD' },
    orderBy: { createdAt: 'desc' },
  });

  if (!escrowTx) {
    throw new Error(`No escrow transaction found for deal ${dealId}`);
  }

  // Idempotency: already released
  if (escrowTx.status === 'REFUNDED') {
    return { success: true, alreadyReleased: true };
  }

  if (escrowTx.status !== 'COMPLETED' && escrowTx.status !== 'PENDING') {
    throw new Error(`Escrow is in unexpected status: ${escrowTx.status}`);
  }

  if (Number(escrowTx.amount) <= 0) {
    throw new Error(`Escrow amount must be > 0, got ${escrowTx.amount}`);
  }

  // FIX 2: Validate amount matches deal price
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error(`Deal not found for escrow (dealId=${dealId})`);

  if (Number(escrowTx.amount) !== Number(deal.price)) {
    const mismatchMsg = `Escrow amount mismatch: escrow=${escrowTx.amount}, deal.price=${deal.price} (dealId=${dealId})`;
    logger.error(mismatchMsg, { dealId, escrowAmount: escrowTx.amount, dealPrice: deal.price });
    throw new Error(mismatchMsg);
  }

  const releasedAmount = Number(escrowTx.amount);

  // ── Atomic transaction ────────────────────────────────────────────────────
  const result = await prisma.$transaction(async (tx) => {
    // a. Update escrow status
    await tx.transaction.update({
      where: { id: escrowTx.id },
      data: { status: 'REFUNDED' },
    });

    // b. Create ESCROW_RELEASE record for traveler
    const releaseTx = await tx.transaction.create({
      data: {
        userId: travelerId,
        dealId,
        type: 'ESCROW_RELEASE',
        amount: releasedAmount,
        currency: escrowTx.currency,
        status: 'COMPLETED',
        metadata: JSON.stringify({ escrowTxId: escrowTx.id }),
      },
    });

    // c. Increment traveler wallet + totalDeals
    await tx.user.update({
      where: { id: travelerId },
      data: {
        walletBalance: { increment: releasedAmount },
        totalDeals:    { increment: 1 },
      },
    });

    // d. Mark deal COMPLETED inside same transaction
    await tx.deal.update({
      where: { id: dealId },
      data: { status: 'COMPLETED' },
    });

    return releaseTx;
  });

  // ── Post-transaction socket notifications ─────────────────────────────────
  try {
    const io = (await import('./websocket')).getIO();
    if (io && deal.senderId) {
      io.to(`user:${deal.senderId}`).emit('escrow_released', { dealId, amount: releasedAmount });
    }
    if (io) {
      io.to(`user:${travelerId}`).emit('escrow_released', { dealId, amount: releasedAmount });
    }
  } catch { /* non-blocking */ }

  logger.info(`Escrow released for deal ${dealId}`, { travelerId, amount: releasedAmount, txId: result.id });

  return { success: true, transactionId: result.id, releasedAmount };
}

export function constructWebhookEvent(
  payload: Buffer,
  signature: string
): Stripe.Event {
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    config.stripe.webhookSecret
  );
}
