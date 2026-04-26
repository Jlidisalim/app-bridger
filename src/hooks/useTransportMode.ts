// Derives the current transport mode (walking / car / flight) from the
// tracking store. Flight mode always wins when the session is in flight
// mode and the plane isn't on the ground.

import { useMemo } from 'react';
import { useTrackingStore, selectDeal } from '../store/tracking.store';

export type TransportMode = 'walking' | 'car' | 'flight';

export function detectTransportMode(
  speedMs: number | null,
  altitudeM: number | null,
  isFlightModeActive: boolean,
  onGround: boolean,
): TransportMode {
  if (isFlightModeActive && !onGround) return 'flight';
  if (isFlightModeActive && onGround) return 'car';
  const speedKmh = (speedMs ?? 0) * 3.6;
  if (speedKmh < 7) return 'walking';
  return 'car';
}

interface Result {
  mode:        TransportMode;
  speedMs:     number;
  speedKmh:    number;
  altitudeM:   number | null;
  headingDeg:  number;
  onGround:    boolean;
  isStale:     boolean;
  updatedAt:   number | null;
}

export function useTransportMode(dealId: string): Result {
  const state = useTrackingStore(selectDeal(dealId));

  return useMemo<Result>(() => {
    if (state.mode === 'flight') {
      const p = state.flight.interpolatedPosition ?? state.flight.currentPosition;
      const onGround = p?.onGround ?? false;
      return {
        mode:       detectTransportMode(p?.velocityMs ?? 0, p?.altitudeM ?? null, true, onGround),
        speedMs:    p?.velocityMs ?? 0,
        speedKmh:   p?.velocityKmh ?? 0,
        altitudeM:  p?.altitudeM ?? null,
        headingDeg: p?.headingDeg ?? 0,
        onGround,
        isStale:    p?.isStale ?? false,
        updatedAt:  p?.updatedAt ?? null,
      };
    }

    const p = state.gps.currentPosition ?? state.gps.lastKnownPosition;
    const speedMs = p?.speed ?? 0;
    return {
      mode:       detectTransportMode(speedMs, p?.altitude ?? null, false, true),
      speedMs,
      speedKmh:   speedMs * 3.6,
      altitudeM:  p?.altitude ?? null,
      headingDeg: p?.heading ?? 0,
      onGround:   true,
      isStale:    state.gps.signalLostAt !== null,
      updatedAt:  p?.updatedAt ?? null,
    };
  }, [
    state.mode,
    state.gps.currentPosition,
    state.gps.lastKnownPosition,
    state.gps.signalLostAt,
    state.flight.currentPosition,
    state.flight.interpolatedPosition,
  ]);
}
