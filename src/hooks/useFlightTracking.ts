// Flight mode is server-driven: the backend's flightPoller hits OpenSky and
// pushes updates over the socket. This hook is sender-side glue that derives
// "is the data fresh?" / "when was the last poll?" from the store.

import { useTrackingStore, selectDeal } from '../store/tracking.store';

export function useFlightTracking(dealId: string) {
  const state = useTrackingStore(selectDeal(dealId));
  const flight = state.flight;

  const lastPollAt = flight.lastPollAt;
  const ageMs = lastPollAt ? Date.now() - lastPollAt : null;
  const isFresh = ageMs !== null && ageMs < 90_000; // 30s poll cadence + 60s grace

  return {
    isActive:             flight.isActive,
    callsign:             flight.callsign,
    icao24:               flight.icao24,
    currentPosition:      flight.currentPosition,
    interpolatedPosition: flight.interpolatedPosition ?? flight.currentPosition,
    routePath:            flight.routePath,
    lastPollAt,
    ageMs,
    isFresh,
  };
}
