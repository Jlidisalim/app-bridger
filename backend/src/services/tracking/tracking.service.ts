// Tracking session orchestrator.
// Owns the TrackingSession Prisma row and emits Socket.io events into the deal room.
// Flight polling is delegated to flightPoller.

import { prisma } from '../../config/db';
import { getIO } from '../websocket';
import logger from '../../utils/logger';
import { dealRoom, TRACKING_EVENTS } from './tracking.events';
import type {
  ActivateTrackingInput,
  GPSPositionPayload,
  TrackingMode,
} from './tracking.types';
import {
  startFlightPolling,
  stopFlightPolling,
} from './flightPoller';
import config from '../../config/env';
import type { FlightPosition } from '../opensky/opensky.types';
import type { LatLng } from './geo.utils';

// --- Access control helpers --------------------------------------------------
async function loadDealForUser(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new HttpError(404, 'Deal not found');
  const isParticipant = deal.senderId === userId || deal.travelerId === userId;
  if (!isParticipant) throw new HttpError(403, 'Not a participant of this deal');
  return deal;
}

async function loadDealForTraveler(dealId: string, userId: string) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new HttpError(404, 'Deal not found');
  if (deal.travelerId !== userId) throw new HttpError(403, 'Only the traveler can update tracking');
  return deal;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

// --- Public API --------------------------------------------------------------
export async function activateTracking(
  userId: string,
  input: ActivateTrackingInput,
) {
  const deal = await loadDealForTraveler(input.dealId, userId);

  if (input.mode === 'flight' && !input.callsign) {
    throw new HttpError(400, 'callsign is required for flight mode');
  }

  const session = await prisma.trackingSession.upsert({
    where: { dealId: deal.id },
    create: {
      dealId:         deal.id,
      mode:           input.mode,
      gpsActive:      input.mode === 'gps',
      flightActive:   input.mode === 'flight',
      flightCallsign: input.callsign ?? null,
    },
    update: {
      mode:           input.mode,
      gpsActive:      input.mode === 'gps',
      flightActive:   input.mode === 'flight',
      flightCallsign: input.callsign ?? null,
      gpsLostAt:      input.mode === 'gps' ? null : undefined,
    },
  });

  if (input.mode === 'flight' && input.callsign) {
    startFlightPolling({ dealId: deal.id, callsign: input.callsign });
  } else {
    stopFlightPolling(deal.id);
  }

  emitToDeal(deal.id, TRACKING_EVENTS.ACTIVATED, {
    dealId: deal.id,
    mode:   input.mode,
    session: serializeSession(session),
  });

  return session;
}

export async function deactivateTracking(userId: string, dealId: string) {
  const deal = await loadDealForTraveler(dealId, userId);
  stopFlightPolling(deal.id);

  const session = await prisma.trackingSession.upsert({
    where: { dealId: deal.id },
    create: { dealId: deal.id, mode: 'idle' },
    update: { mode: 'idle', gpsActive: false, flightActive: false },
  });

  emitToDeal(deal.id, TRACKING_EVENTS.DEACTIVATED, { dealId: deal.id });
  return session;
}

export async function switchMode(
  userId: string,
  dealId: string,
  newMode: 'gps' | 'flight',
  callsign?: string,
) {
  const deal = await loadDealForTraveler(dealId, userId);
  const prev = await prisma.trackingSession.findUnique({ where: { dealId: deal.id } });

  const oldMode = (prev?.mode as TrackingMode) ?? 'idle';
  await activateTracking(userId, { dealId: deal.id, mode: newMode, callsign });
  emitToDeal(deal.id, TRACKING_EVENTS.MODE_SWITCHED, {
    dealId: deal.id,
    oldMode,
    newMode,
  });
}

export async function pushGPSPosition(
  userId: string,
  dealId: string,
  pos: GPSPositionPayload,
) {
  const deal = await loadDealForTraveler(dealId, userId);

  const prev = await prisma.trackingSession.findUnique({ where: { dealId: deal.id } });
  const wasLost = !!prev?.gpsLostAt;

  const updatedAt = pos.timestamp ? new Date(pos.timestamp) : new Date();

  const session = await prisma.trackingSession.upsert({
    where: { dealId: deal.id },
    create: {
      dealId:         deal.id,
      mode:           'gps',
      gpsActive:      true,
      gpsLat:         pos.lat,
      gpsLng:         pos.lng,
      gpsAccuracyM:   pos.accuracy,
      gpsHeadingDeg:  pos.heading ?? null,
      gpsSpeedMs:     pos.speed ?? null,
      gpsAltitudeM:   pos.altitude ?? null,
      gpsUpdatedAt:   updatedAt,
    },
    update: {
      mode:           'gps',
      gpsActive:      true,
      gpsLat:         pos.lat,
      gpsLng:         pos.lng,
      gpsAccuracyM:   pos.accuracy,
      gpsHeadingDeg:  pos.heading ?? null,
      gpsSpeedMs:     pos.speed ?? null,
      gpsAltitudeM:   pos.altitude ?? null,
      gpsUpdatedAt:   updatedAt,
      gpsLostAt:      null,
    },
  });

  await prisma.positionLog.create({
    data: {
      dealId:     deal.id,
      mode:       'gps',
      lat:        pos.lat,
      lng:        pos.lng,
      altitudeM:  pos.altitude ?? null,
      headingDeg: pos.heading ?? null,
      speedMs:    pos.speed ?? null,
      source:     'device',
      loggedAt:   updatedAt,
    },
  });

  const payload = {
    dealId: deal.id,
    position: {
      lat:       pos.lat,
      lng:       pos.lng,
      accuracy:  pos.accuracy,
      heading:   pos.heading ?? null,
      speed:     pos.speed ?? null,
      altitude:  pos.altitude ?? null,
      updatedAt: updatedAt.getTime(),
    },
  };

  emitToDeal(deal.id, TRACKING_EVENTS.GPS_UPDATE, payload);
  if (wasLost) {
    emitToDeal(deal.id, TRACKING_EVENTS.GPS_RECOVERED, payload);
  }

  return session;
}

// Called by the GPS-loss watchdog (see startGpsWatchdog) when a session goes silent.
export async function handleGPSLost(dealId: string) {
  const session = await prisma.trackingSession.findUnique({ where: { dealId } });
  if (!session?.gpsActive) return;
  if (session.gpsLostAt) return; // already marked

  const lostAt = new Date();
  await prisma.trackingSession.update({
    where: { dealId },
    data:  { gpsLostAt: lostAt },
  });

  emitToDeal(dealId, TRACKING_EVENTS.GPS_LOST, {
    dealId,
    lostAt: lostAt.toISOString(),
  });

  if (session.flightCallsign) {
    emitToDeal(dealId, TRACKING_EVENTS.SUGGEST_FLIGHT, {
      dealId,
      message: `GPS signal lost. Switch to flight tracking for ${session.flightCallsign}?`,
    });
  }
}

export async function getTrackingSession(userId: string, dealId: string) {
  await loadDealForUser(dealId, userId);
  const session = await prisma.trackingSession.findUnique({ where: { dealId } });
  return session ? serializeSession(session) : null;
}

export async function getPositionHistory(
  userId: string,
  dealId: string,
  limit = 50,
) {
  await loadDealForUser(dealId, userId);
  const cap = Math.min(Math.max(limit, 1), 500);
  const rows = await prisma.positionLog.findMany({
    where:   { dealId },
    orderBy: { loggedAt: 'asc' },
    take:    cap,
  });
  return rows.map((r) => ({
    id:         r.id.toString(),
    mode:       r.mode,
    lat:        r.lat,
    lng:        r.lng,
    altitudeM:  r.altitudeM,
    headingDeg: r.headingDeg,
    speedMs:    r.speedMs,
    source:     r.source,
    loggedAt:   r.loggedAt.toISOString(),
  }));
}

// --- Flight push helpers (called by the poller) ------------------------------
export async function applyFlightUpdate(
  dealId: string,
  position: FlightPosition,
  routePath?: LatLng[],
) {
  await prisma.trackingSession.update({
    where: { dealId },
    data: {
      flightLat:          position.lat,
      flightLng:          position.lng,
      flightAltitudeM:    position.altitudeM,
      flightHeadingDeg:   position.headingDeg,
      flightVelocityMs:   position.velocityMs,
      flightVerticalRate: position.verticalRate,
      flightOnGround:     position.onGround,
      flightStale:        position.isStale,
      flightIcao24:       position.icao24,
      flightUpdatedAt:    new Date(position.updatedAt),
      flightLastPollAt:   new Date(),
    },
  });

  await prisma.positionLog.create({
    data: {
      dealId,
      mode:       'flight',
      lat:        position.lat,
      lng:        position.lng,
      altitudeM:  position.altitudeM,
      headingDeg: position.headingDeg,
      speedMs:    position.velocityMs,
      source:     'opensky',
      loggedAt:   new Date(position.updatedAt),
    },
  });

  emitToDeal(dealId, TRACKING_EVENTS.FLIGHT_UPDATE, {
    dealId,
    position,
    routePath,
  });
}

export async function markFlightNotFound(dealId: string, callsign: string) {
  emitToDeal(dealId, TRACKING_EVENTS.FLIGHT_NOT_FOUND, { dealId, callsign });
}

export async function markPollMeta(dealId: string) {
  await prisma.trackingSession.update({
    where: { dealId },
    data:  { flightLastPollAt: new Date() },
  }).catch(() => {});
}

// --- Watchdog: scans for stale GPS sessions ---------------------------------
// Runs every 30s. If a gps-active session hasn't reported in
// gpsLossThresholdMs, mark it lost and notify.
let watchdog: NodeJS.Timeout | null = null;
export function startGpsWatchdog(): void {
  if (watchdog) return;
  watchdog = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - config.opensky.gpsLossThresholdMs);
      const stale = await prisma.trackingSession.findMany({
        where: {
          gpsActive:    true,
          gpsLostAt:    null,
          OR: [
            { gpsUpdatedAt: { lt: cutoff } },
            { gpsUpdatedAt: null },
          ],
        },
        select: { dealId: true, gpsUpdatedAt: true },
      });
      for (const s of stale) {
        if (!s.gpsUpdatedAt) continue; // never reported — don't false-alarm
        await handleGPSLost(s.dealId);
      }
    } catch (err) {
      logger.error('GPS watchdog error', { error: String(err) });
    }
  }, 30_000);
}

export function stopGpsWatchdog(): void {
  if (watchdog) clearInterval(watchdog);
  watchdog = null;
}

// --- Internals ---------------------------------------------------------------
function emitToDeal(dealId: string, event: string, payload: unknown): void {
  const io = getIO();
  if (!io) return;
  io.to(dealRoom(dealId)).emit(event, payload);
}

export function serializeSession(s: any) {
  return {
    dealId: s.dealId,
    mode:   s.mode,
    gps: {
      isActive:     s.gpsActive,
      lat:          s.gpsLat,
      lng:          s.gpsLng,
      accuracyM:    s.gpsAccuracyM,
      headingDeg:   s.gpsHeadingDeg,
      speedMs:      s.gpsSpeedMs,
      altitudeM:    s.gpsAltitudeM,
      updatedAt:    s.gpsUpdatedAt?.getTime?.() ?? null,
      lostAt:       s.gpsLostAt?.getTime?.() ?? null,
    },
    flight: {
      isActive:      s.flightActive,
      callsign:      s.flightCallsign,
      icao24:        s.flightIcao24,
      lat:           s.flightLat,
      lng:           s.flightLng,
      altitudeM:     s.flightAltitudeM,
      headingDeg:    s.flightHeadingDeg,
      velocityMs:    s.flightVelocityMs,
      verticalRate:  s.flightVerticalRate,
      onGround:      s.flightOnGround,
      isStale:       s.flightStale,
      updatedAt:     s.flightUpdatedAt?.getTime?.() ?? null,
      lastPollAt:    s.flightLastPollAt?.getTime?.() ?? null,
    },
  };
}
