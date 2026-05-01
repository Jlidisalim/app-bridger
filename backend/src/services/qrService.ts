import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { AppError } from '../middleware/errorHandler';
import logger from '../utils/logger';

// FIX 11: Replace hardcoded URL with env var
const QR_BASE_URL = process.env.QR_BASE_URL || 'https://bridger.app/verify';

/**
 * Generate a QR code for a deal.
 * - rawSecret is embedded in the QR code (shown to user via URL or QR image)
 * - hashedSecret is stored in DB — attacker with DB access cannot forge codes
 */
export async function generateDealQR(
  dealId: string,
  _userId: string
): Promise<{ qrCode: string; qrSecret: string }> {
  // FIX 11: Generate raw secret, store only the bcrypt hash
  const rawSecret = crypto.randomBytes(32).toString('hex');
  const hashedSecret = await bcrypt.hash(rawSecret, 12);

  const qrUrl = `${QR_BASE_URL}/${dealId}`;

  await prisma.deal.update({
    where: { id: dealId },
    data: {
      qrCode: qrUrl,
      qrSecret: hashedSecret,  // store hash, never plaintext
    },
  });

  logger.info(`QR generated for deal ${dealId}`);

  return {
    qrCode: qrUrl,
    qrSecret: rawSecret,  // raw secret goes into QR code / returned to caller
  };
}

/**
 * Verify a QR scan by comparing the submitted raw secret against the stored hash.
 */
export async function verifyDealQR(
  dealId: string,
  submittedSecret: string,
  actorId: string
): Promise<{ verified: boolean; message: string }> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: {
      sender: true,
      traveler: true,
    },
  });

  if (!deal) throw new AppError('Deal not found', 404);

  if (!deal.qrSecret) {
    throw new AppError('QR code not yet generated for this deal', 400);
  }

  // FIX 11: Compare raw submitted secret against bcrypt hash in DB
  const isValid = await bcrypt.compare(submittedSecret, deal.qrSecret);
  if (!isValid) {
    logger.warn(`Invalid QR scan attempt for deal ${dealId} by actor ${actorId}`);
    throw new AppError('Invalid QR code', 400);
  }

  if (deal.status === 'MATCHED') {
    // Pickup flow: traveler scans sender's QR
    if (deal.travelerId !== actorId) {
      throw new AppError('Only the assigned traveler can scan this QR code', 403);
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: { status: 'PICKED_UP' },
    });

    await prisma.trackingEvent.create({
      data: {
        dealId,
        status: 'PICKED_UP',
        actor: actorId,
        note: 'Package picked up by traveler',
      },
    });

    return { verified: true, message: 'Package picked up successfully' };
  }

  if (deal.status === 'IN_TRANSIT') {
    // Delivery flow: sender scans traveler's QR
    if (deal.senderId !== actorId) {
      throw new AppError('Only the sender can verify delivery', 403);
    }

    await prisma.deal.update({
      where: { id: dealId },
      data: { status: 'DELIVERED' },
    });

    await prisma.trackingEvent.create({
      data: {
        dealId,
        status: 'DELIVERED',
        actor: actorId,
        note: 'Package delivered and confirmed',
      },
    });

    return { verified: true, message: 'Delivery confirmed successfully' };
  }

  return {
    verified: false,
    message: `Deal in status ${deal.status} is not scannable`,
  };
}
