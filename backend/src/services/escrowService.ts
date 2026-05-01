// Escrow service — secure, double-spend-proof fund movement for shipments and trips.
//
// Balance model (per user):
//   Wallet.availableBalance  — spendable funds ("Available Balance")
//   Wallet.pendingBalance    — funds locked in escrow ("Blocked Balance")
//   Wallet.balance           — total = available + pending (kept in sync)
//   User.walletBalance       — mirror of availableBalance for legacy reads
//
// Invariants enforced inside an interactive `prisma.$transaction`:
//   1. availableBalance never goes negative.
//   2. Holding moves money available → pending atomically.
//   3. Releasing moves money sender.pending → traveler.available atomically.
//   4. Refunding moves money sender.pending → sender.available atomically.
//   5. Each Deal has at most one ACTIVE ESCROW_HOLD (idempotency on hold/release).

import { Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

type Tx = Prisma.TransactionClient;

// Reconcile wallet drift: many legacy paths (Stripe webhooks, refunds,
// dispute payouts, dev simulators) update User.walletBalance without
// touching the Wallet row. Treat User.walletBalance as the legacy source
// of truth for spendable funds and align Wallet.availableBalance to it
// whenever drift is detected. pendingBalance is preserved as-is.
async function ensureWallet(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { walletBalance: true },
  });
  if (!user) throw new AppError('User not found', 404);
  const userBalance = Number(user.walletBalance);

  const existing = await tx.wallet.findUnique({ where: { userId } });
  if (existing) {
    const available = Number(existing.availableBalance);
    if (Math.abs(available - userBalance) > 0.0001) {
      const pending = Number(existing.pendingBalance);
      logger.warn('Reconciling wallet drift', {
        userId, walletAvailable: available, userWalletBalance: userBalance,
      });
      return tx.wallet.update({
        where: { userId },
        data: {
          availableBalance: userBalance,
          balance: userBalance + pending,
        },
      });
    }
    return existing;
  }

  return tx.wallet.create({
    data: {
      userId,
      balance: userBalance,
      availableBalance: userBalance,
      pendingBalance: 0,
    },
  });
}

/** Read available balance from the canonical source (wallet table), creating it lazily. */
export async function getAvailableBalance(userId: string): Promise<number> {
  const wallet = await prisma.$transaction((tx) => ensureWallet(tx, userId));
  return Number(wallet.availableBalance);
}

/** Pre-flight check: sender has at least `amount` available to spend. */
export async function assertSenderCanAfford(userId: string, amount: number): Promise<void> {
  if (amount <= 0) throw new AppError('Amount must be greater than zero', 400);
  const available = await getAvailableBalance(userId);
  if (available < amount) {
    throw new AppError(
      `Insufficient available balance: required ${amount}, available ${available}`,
      400
    );
  }
}

interface HoldResult {
  escrowTxId: string;
  amount: number;
  senderAvailable: number;
  senderBlocked: number;
}

/**
 * Move `amount` from sender.available → sender.pending and stamp it to a deal.
 * Idempotent: if an active ESCROW_HOLD already exists for this deal, returns it.
 * Throws AppError(400) on insufficient funds.
 */
export async function holdEscrow(params: {
  senderId: string;
  dealId: string;
  amount: number;
  currency?: string;
}): Promise<HoldResult> {
  const { senderId, dealId, amount } = params;
  const currency = params.currency || 'USD';
  if (amount <= 0) throw new AppError('Escrow amount must be greater than zero', 400);

  return prisma.$transaction(async (tx) => {
    // Idempotency: an active hold for this deal already exists?
    const existing = await tx.transaction.findFirst({
      where: { dealId, type: 'ESCROW_HOLD', status: { in: ['PENDING', 'COMPLETED'] } },
    });
    if (existing) {
      const wallet = await ensureWallet(tx, senderId);
      return {
        escrowTxId: existing.id,
        amount: Number(existing.amount),
        senderAvailable: Number(wallet.availableBalance),
        senderBlocked: Number(wallet.pendingBalance),
      };
    }

    const wallet = await ensureWallet(tx, senderId);
    const available = Number(wallet.availableBalance);
    if (available < amount) {
      throw new AppError(
        `Insufficient available balance: required ${amount}, available ${available}`,
        400
      );
    }

    // Atomically debit available, credit pending. Total `balance` is unchanged.
    const updatedWallet = await tx.wallet.update({
      where: { userId: senderId },
      data: {
        availableBalance: { decrement: amount },
        pendingBalance: { increment: amount },
      },
    });

    // Mirror availableBalance into the legacy User.walletBalance field so any
    // code path still reading it sees the post-hold spendable amount.
    await tx.user.update({
      where: { id: senderId },
      data: { walletBalance: { decrement: amount } },
    });

    const escrowTx = await tx.transaction.create({
      data: {
        userId: senderId,
        dealId,
        type: 'ESCROW_HOLD',
        amount,
        currency,
        status: 'COMPLETED',
        metadata: JSON.stringify({ heldAt: new Date().toISOString() }),
      },
    });

    logger.info('Escrow held', { dealId, senderId, amount });

    return {
      escrowTxId: escrowTx.id,
      amount,
      senderAvailable: Number(updatedWallet.availableBalance),
      senderBlocked: Number(updatedWallet.pendingBalance),
    };
  });
}

interface ReleaseResult {
  released: boolean;
  alreadyReleased?: true;
  amount: number;
  travelerId?: string;
  travelerAvailable?: number;
}

/**
 * Release a deal's escrow to the traveler. Moves money sender.pending → traveler.available.
 * Idempotent: if the hold was already released or refunded, returns alreadyReleased=true.
 */
export async function releaseEscrowToTraveler(dealId: string): Promise<ReleaseResult> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new AppError('Deal not found', 404);
  if (!deal.travelerId) throw new AppError('Deal has no assigned traveler', 400);

  return prisma.$transaction(async (tx) => {
    const escrowTx = await tx.transaction.findFirst({
      where: { dealId, type: 'ESCROW_HOLD' },
      orderBy: { createdAt: 'desc' },
    });

    if (!escrowTx) {
      // No hold was ever created. Nothing to release.
      return { released: false, alreadyReleased: true, amount: 0 };
    }
    if (escrowTx.status === 'REFUNDED') {
      return { released: false, alreadyReleased: true, amount: Number(escrowTx.amount) };
    }
    if (escrowTx.status !== 'COMPLETED' && escrowTx.status !== 'PENDING') {
      throw new AppError(`Escrow in unexpected status: ${escrowTx.status}`, 409);
    }

    const amount = Number(escrowTx.amount);
    const senderId = escrowTx.userId;
    const travelerId = deal.travelerId!;

    // Drain pending from sender (the funds are leaving the system on this side).
    const senderWallet = await ensureWallet(tx, senderId);
    if (Number(senderWallet.pendingBalance) < amount) {
      throw new AppError(
        `Sender pending balance ${senderWallet.pendingBalance} < escrow ${amount}`,
        409
      );
    }
    await tx.wallet.update({
      where: { userId: senderId },
      data: {
        pendingBalance: { decrement: amount },
        balance: { decrement: amount },
      },
    });

    // Credit traveler's available + total balance.
    await ensureWallet(tx, travelerId);
    const travelerWallet = await tx.wallet.update({
      where: { userId: travelerId },
      data: {
        availableBalance: { increment: amount },
        balance: { increment: amount },
      },
    });
    await tx.user.update({
      where: { id: travelerId },
      data: {
        walletBalance: { increment: amount },
        totalDeals: { increment: 1 },
      },
    });

    // Mark hold as released and write the matching credit record.
    await tx.transaction.update({
      where: { id: escrowTx.id },
      data: { status: 'REFUNDED', metadata: JSON.stringify({ releasedTo: travelerId, releasedAt: new Date().toISOString() }) },
    });
    await tx.transaction.create({
      data: {
        userId: travelerId,
        dealId,
        type: 'ESCROW_RELEASE',
        amount,
        currency: escrowTx.currency,
        status: 'COMPLETED',
        metadata: JSON.stringify({ escrowTxId: escrowTx.id }),
      },
    });

    logger.info('Escrow released to traveler', { dealId, travelerId, amount });

    return {
      released: true,
      amount,
      travelerId,
      travelerAvailable: Number(travelerWallet.availableBalance),
    };
  });
}

/**
 * Return a deal's escrow to the sender (cancellation, failed delivery).
 * Moves money sender.pending → sender.available. Idempotent.
 */
export async function refundEscrowToSender(dealId: string, reason: string): Promise<ReleaseResult> {
  return prisma.$transaction(async (tx) => {
    const escrowTx = await tx.transaction.findFirst({
      where: { dealId, type: 'ESCROW_HOLD' },
      orderBy: { createdAt: 'desc' },
    });
    if (!escrowTx) return { released: false, alreadyReleased: true, amount: 0 };
    if (escrowTx.status === 'REFUNDED') {
      return { released: false, alreadyReleased: true, amount: Number(escrowTx.amount) };
    }

    const amount = Number(escrowTx.amount);
    const senderId = escrowTx.userId;

    const senderWallet = await ensureWallet(tx, senderId);
    if (Number(senderWallet.pendingBalance) < amount) {
      throw new AppError(
        `Sender pending balance ${senderWallet.pendingBalance} < escrow ${amount}`,
        409
      );
    }

    await tx.wallet.update({
      where: { userId: senderId },
      data: {
        pendingBalance: { decrement: amount },
        availableBalance: { increment: amount },
      },
    });
    await tx.user.update({
      where: { id: senderId },
      data: { walletBalance: { increment: amount } },
    });

    await tx.transaction.update({
      where: { id: escrowTx.id },
      data: { status: 'REFUNDED' },
    });
    await tx.transaction.create({
      data: {
        userId: senderId,
        dealId,
        type: 'REFUND',
        amount,
        currency: escrowTx.currency,
        status: 'COMPLETED',
        metadata: JSON.stringify({ reason, originalEscrowId: escrowTx.id }),
      },
    });

    logger.info('Escrow refunded to sender', { dealId, senderId, amount, reason });

    return { released: true, amount };
  });
}
