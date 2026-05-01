// In-process flight poller.
// Each active flight-tracking session has one timer that polls OpenSky at the
// configured interval. We resolve the icao24 once (4-credit query), then poll
// by icao24 (1 credit per poll).

import logger from '../../utils/logger';
import config from '../../config/env';
import { prisma } from '../../config/db';
import {
  resolveFlightByCallsign,
  getFlightByIcao24,
  getLiveTrack,
  OpenSkyRateLimitError,
} from '../opensky/opensky.service';
import { applyFlightUpdate, markFlightNotFound, markPollMeta } from './tracking.service';
import type { LatLng } from './geo.utils';

interface PollState {
  dealId:        string;
  callsign:      string;
  icao24:        string | null;
  routeFetched:  boolean;
  notFoundCount: number;
  timer:         NodeJS.Timeout;
}

const active = new Map<string, PollState>();

export function startFlightPolling(input: { dealId: string; callsign: string }): void {
  stopFlightPolling(input.dealId);

  const state: PollState = {
    dealId:        input.dealId,
    callsign:      input.callsign,
    icao24:        null,
    routeFetched:  false,
    notFoundCount: 0,
    timer:         setTimeout(() => {}, 0),
  };

  // First tick immediately, then every pollIntervalMs.
  const tick = async () => {
    try {
      await pollOnce(state);
      if (active.has(state.dealId)) {
        state.timer = setTimeout(tick, config.opensky.pollIntervalMs);
      }
    } catch (err) {
      const wait = err instanceof OpenSkyRateLimitError
        ? (err.retryAfterSec + 5) * 1000
        : Math.min(60_000, config.opensky.pollIntervalMs * 2);
      logger.warn('Flight poll failed; backing off', {
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

export function stopFlightPolling(dealId: string): void {
  const s = active.get(dealId);
  if (!s) return;
  clearTimeout(s.timer);
  active.delete(dealId);
}

export function stopAllFlightPolling(): void {
  for (const dealId of Array.from(active.keys())) stopFlightPolling(dealId);
}

async function pollOnce(state: PollState): Promise<void> {
  // Verify session is still flight-active; otherwise stop.
  const session = await prisma.trackingSession.findUnique({ where: { dealId: state.dealId } });
  if (!session || !session.flightActive) {
    stopFlightPolling(state.dealId);
    return;
  }

  await markPollMeta(state.dealId);

  let position;
  if (state.icao24) {
    position = await getFlightByIcao24(state.icao24);
  } else {
    const resolved = await resolveFlightByCallsign(state.callsign);
    if (resolved) {
      state.icao24 = resolved.icao24;
      position     = resolved.position;
      // Persist resolved icao24 immediately so future polls go cheap.
      await prisma.trackingSession.update({
        where: { dealId: state.dealId },
        data:  { flightIcao24: resolved.icao24 },
      }).catch(() => {});
    }
  }

  if (!position) {
    state.notFoundCount += 1;
    logger.info('Flight not visible', {
      dealId: state.dealId,
      callsign: state.callsign,
      attempt: state.notFoundCount,
    });
    if (state.notFoundCount >= 5) {
      await markFlightNotFound(state.dealId, state.callsign);
    }
    return;
  }

  state.notFoundCount = 0;

  let routePath: LatLng[] | undefined;
  if (!state.routeFetched && state.icao24) {
    state.routeFetched = true;
    try {
      const track = await getLiveTrack(state.icao24);
      if (track?.path?.length) {
        routePath = track.path
          .filter(([, lat, lng]) => lat !== null && lng !== null)
          .map(([, lat, lng]) => ({ lat: lat as number, lng: lng as number }));
      }
    } catch (err) {
      logger.warn('getLiveTrack failed; continuing without route', {
        dealId: state.dealId,
        error:  err instanceof Error ? err.message : String(err),
      });
    }
  }

  await applyFlightUpdate(state.dealId, position, routePath);
}

// Restart poll loops for any sessions that were active at server start.
// Called once on boot so a server restart doesn't drop in-flight tracking.
export async function restoreActiveFlightPolls(): Promise<void> {
  try {
    const rows = await prisma.trackingSession.findMany({
      where: { flightActive: true, flightCallsign: { not: null } },
      select: { dealId: true, flightCallsign: true },
    });
    for (const row of rows) {
      if (!row.flightCallsign) continue;
      startFlightPolling({ dealId: row.dealId, callsign: row.flightCallsign });
    }
    if (rows.length) {
      logger.info('Restored flight polling sessions', { count: rows.length });
    }
  } catch (err) {
    logger.error('Failed to restore flight polls', { error: String(err) });
  }
}
