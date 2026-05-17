// In-process vessel poller.
// Each active boat-tracking session has one timer that polls AISHub by MMSI at
// the configured interval. AIS positions can be infrequent (vessels in port may
// only update every few minutes), so a longer poll interval is sensible.

import logger from '../../utils/logger';
import config from '../../config/env';
import { prisma } from '../../config/db';
import {
  getVesselByMmsi,
  AISHubError,
  AISHubNotConfiguredError,
} from '../aishub/aishub.service';
import {
  applyVesselUpdate,
  markVesselNotFound,
  markVesselPollMeta,
} from './tracking.service';

interface PollState {
  dealId:        string;
  mmsi:          number;
  notFoundCount: number;
  timer:         NodeJS.Timeout;
}

const active = new Map<string, PollState>();

export function startVesselPolling(input: { dealId: string; mmsi: number }): void {
  stopVesselPolling(input.dealId);

  const state: PollState = {
    dealId:        input.dealId,
    mmsi:          input.mmsi,
    notFoundCount: 0,
    timer:         setTimeout(() => {}, 0),
  };

  const tick = async () => {
    try {
      await pollOnce(state);
      if (active.has(state.dealId)) {
        state.timer = setTimeout(tick, config.aishub.pollIntervalMs);
      }
    } catch (err) {
      if (err instanceof AISHubNotConfiguredError) {
        logger.warn('AISHub not configured — stopping vessel polling', { dealId: state.dealId });
        stopVesselPolling(state.dealId);
        return;
      }
      const wait = Math.min(120_000, config.aishub.pollIntervalMs * 2);
      logger.warn('Vessel poll failed; backing off', {
        dealId: state.dealId,
        waitMs: wait,
        error:  err instanceof Error ? err.message : String(err),
      });
      if (active.has(state.dealId)) {
        state.timer = setTimeout(tick, wait);
      }
    }
  };

  active.set(input.dealId, state);
  state.timer = setTimeout(tick, 0);
}

export function stopVesselPolling(dealId: string): void {
  const s = active.get(dealId);
  if (!s) return;
  clearTimeout(s.timer);
  active.delete(dealId);
}

export function stopAllVesselPolling(): void {
  for (const dealId of Array.from(active.keys())) stopVesselPolling(dealId);
}

async function pollOnce(state: PollState): Promise<void> {
  const session = await prisma.trackingSession.findUnique({ where: { dealId: state.dealId } });
  if (!session || !session.boatActive) {
    stopVesselPolling(state.dealId);
    return;
  }

  await markVesselPollMeta(state.dealId);

  let position;
  try {
    position = await getVesselByMmsi(state.mmsi);
  } catch (err) {
    if (err instanceof AISHubError) {
      logger.info('AISHub error during vessel poll', {
        dealId: state.dealId,
        mmsi:   state.mmsi,
        error:  err.message,
      });
      return;
    }
    throw err;
  }

  if (!position) {
    state.notFoundCount += 1;
    logger.info('Vessel not visible on AIS', {
      dealId:  state.dealId,
      mmsi:    state.mmsi,
      attempt: state.notFoundCount,
    });
    if (state.notFoundCount >= 5) {
      await markVesselNotFound(state.dealId, state.mmsi);
    }
    return;
  }

  state.notFoundCount = 0;
  await applyVesselUpdate(state.dealId, position);
}

// Restart vessel polling for any sessions active at server start.
export async function restoreActiveVesselPolls(): Promise<void> {
  try {
    const rows = await prisma.trackingSession.findMany({
      where: { boatActive: true, boatMmsi: { not: null } },
      select: { dealId: true, boatMmsi: true },
    });
    for (const row of rows) {
      if (!row.boatMmsi) continue;
      startVesselPolling({ dealId: row.dealId, mmsi: Number(row.boatMmsi) });
    }
    if (rows.length) {
      logger.info('Restored vessel polling sessions', { count: rows.length });
    }
  } catch (err) {
    logger.error('Failed to restore vessel polls', { error: String(err) });
  }
}
