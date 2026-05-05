// Trip Cleanup Job
//
// Permanently removes trips whose departure date passed more than
// TRIP_EXPIRY_GRACE_DAYS ago and that never reached a "confirmed" state
// (MATCHED or COMPLETED). OPEN and CANCELLED trips that age out are deleted;
// MATCHED / COMPLETED trips are preserved as historical records.
//
// Wake interval is intentionally low (hourly). The query is indexed on
// departureDate and status so the scan stays cheap even with many trips.

import { prisma } from '../config/db';
import logger from '../utils/logger';

export const TRIP_EXPIRY_GRACE_DAYS = 5;
const RUN_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let timer: NodeJS.Timeout | null = null;

export async function runTripCleanupOnce(): Promise<number> {
  const cutoff = new Date(Date.now() - TRIP_EXPIRY_GRACE_DAYS * 24 * 60 * 60 * 1000);
  try {
    const result = await prisma.trip.deleteMany({
      where: {
        departureDate: { lt: cutoff },
        status: { notIn: ['MATCHED', 'COMPLETED'] },
      },
    });
    if (result.count > 0) {
      logger.info('Trip cleanup removed expired trips', {
        count: result.count,
        cutoff: cutoff.toISOString(),
      });
    }
    return result.count;
  } catch (err) {
    logger.error('Trip cleanup failed', { error: String(err) });
    return 0;
  }
}

export function startTripCleanupJob(): void {
  if (timer) return;
  // Run once at startup so trips that aged out while the server was down
  // are cleaned up promptly, then on the regular interval.
  runTripCleanupOnce().catch(() => {});
  timer = setInterval(() => {
    runTripCleanupOnce().catch(() => {});
  }, RUN_INTERVAL_MS);
}

export function stopTripCleanupJob(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
