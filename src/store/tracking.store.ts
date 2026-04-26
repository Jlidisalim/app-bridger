// Per-deal tracking state, shared between the Explore preview and the full-screen
// tracking screen. Designed so updates to a single deal don't invalidate other
// deals' selectors (state is keyed by dealId).

import { create } from 'zustand';
import type {
  FlightPosition,
  GPSPosition,
  LatLng,
  TrackingDealState,
  TrackingMode,
  TrackingSessionDTO,
} from '../types/tracking';
import { TRACKING } from '../constants/tracking';

const emptyDeal = (dealId: string): TrackingDealState => ({
  dealId,
  mode: 'idle',
  gps: {
    isActive: false,
    currentPosition: null,
    lastKnownPosition: null,
    positionHistory: [],
    permissionStatus: 'undetermined',
    signalLostAt: null,
  },
  flight: {
    isActive: false,
    icao24: null,
    callsign: null,
    currentPosition: null,
    interpolatedPosition: null,
    positionHistory: [],
    routePath: [],
    lastPollAt: null,
  },
  smartSwitch: { pendingPrompt: false },
});

// Stable per-dealId fallback for selectDeal. Without this, the selector
// returns a new object reference every render when the dealId isn't in the
// store, which causes Zustand to re-render infinitely (esp. right after
// resetDeal() wipes the key on Stop tracking).
const emptyDealCache = new Map<string, TrackingDealState>();
const getEmptyDeal = (dealId: string): TrackingDealState => {
  const cached = emptyDealCache.get(dealId);
  if (cached) return cached;
  const fresh = emptyDeal(dealId);
  emptyDealCache.set(dealId, fresh);
  return fresh;
};

interface TrackingStore {
  byDeal: Record<string, TrackingDealState>;

  ensure(dealId: string): TrackingDealState;
  hydrateFromSession(dto: TrackingSessionDTO): void;
  setMode(dealId: string, mode: TrackingMode): void;

  // GPS
  setGPSPermission(dealId: string, status: 'granted' | 'denied' | 'undetermined'): void;
  activateGPS(dealId: string): void;
  deactivateGPS(dealId: string): void;
  pushGPSPosition(dealId: string, p: GPSPosition): void;
  markGPSLost(dealId: string, at: number): void;
  clearGPSLost(dealId: string): void;

  // Flight
  activateFlight(dealId: string, callsign: string): void;
  deactivateFlight(dealId: string): void;
  pushFlightPosition(dealId: string, p: FlightPosition): void;
  setInterpolatedPosition(dealId: string, p: FlightPosition | null): void;
  setFlightRoute(dealId: string, path: LatLng[]): void;

  // Smart switch
  promptSmartSwitch(dealId: string): void;
  dismissSmartSwitch(dealId: string): void;

  resetDeal(dealId: string): void;
}

const updateDeal = (
  state: TrackingStore,
  dealId: string,
  fn: (d: TrackingDealState) => TrackingDealState,
): Pick<TrackingStore, 'byDeal'> => {
  const prev = state.byDeal[dealId] ?? getEmptyDeal(dealId);
  return { byDeal: { ...state.byDeal, [dealId]: fn(prev) } };
};

export const useTrackingStore = create<TrackingStore>((set, get) => ({
  byDeal: {},

  ensure(dealId) {
    const existing = get().byDeal[dealId];
    if (existing) return existing;
    const fresh = emptyDeal(dealId);
    set((s) => ({ byDeal: { ...s.byDeal, [dealId]: fresh } }));
    return fresh;
  },

  hydrateFromSession(dto) {
    if (!dto || !dto.dealId) return;
    const gps = dto.gps ?? ({} as Partial<TrackingSessionDTO['gps']>);
    const flight = dto.flight ?? ({} as Partial<TrackingSessionDTO['flight']>);
    set((s) =>
      updateDeal(s, dto.dealId, (d) => ({
        ...d,
        mode: dto.mode ?? d.mode,
        gps: {
          ...d.gps,
          isActive: gps.isActive ?? d.gps.isActive,
          signalLostAt: gps.lostAt ?? null,
          currentPosition:
            gps.lat != null && gps.lng != null
              ? {
                  lat: gps.lat,
                  lng: gps.lng,
                  accuracy: gps.accuracyM ?? 0,
                  heading: gps.headingDeg ?? null,
                  speed: gps.speedMs ?? null,
                  altitude: gps.altitudeM ?? null,
                  updatedAt: gps.updatedAt ?? Date.now(),
                }
              : d.gps.currentPosition,
        },
        flight: {
          ...d.flight,
          isActive: flight.isActive ?? d.flight.isActive,
          callsign: flight.callsign ?? d.flight.callsign,
          icao24: flight.icao24 ?? d.flight.icao24,
          lastPollAt: flight.lastPollAt ?? d.flight.lastPollAt,
          currentPosition:
            flight.lat != null && flight.lng != null && flight.callsign
              ? {
                  icao24: flight.icao24 ?? '',
                  callsign: flight.callsign,
                  lat: flight.lat,
                  lng: flight.lng,
                  altitudeM: flight.altitudeM ?? 0,
                  velocityMs: flight.velocityMs ?? 0,
                  velocityKmh: Math.round((flight.velocityMs ?? 0) * 3.6),
                  headingDeg: flight.headingDeg ?? 0,
                  verticalRate: flight.verticalRate ?? 0,
                  onGround: flight.onGround ?? false,
                  isStale: flight.isStale ?? false,
                  updatedAt: flight.updatedAt ?? Date.now(),
                }
              : d.flight.currentPosition,
        },
      })),
    );
  },

  setMode(dealId, mode) {
    set((s) => updateDeal(s, dealId, (d) => ({ ...d, mode })));
  },

  setGPSPermission(dealId, status) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({ ...d, gps: { ...d.gps, permissionStatus: status } })),
    );
  },

  activateGPS(dealId) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({
        ...d,
        mode: 'gps',
        gps: { ...d.gps, isActive: true, signalLostAt: null },
        flight: { ...d.flight, isActive: false, interpolatedPosition: null },
        smartSwitch: { pendingPrompt: false },
      })),
    );
  },

  deactivateGPS(dealId) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({
        ...d,
        gps: { ...d.gps, isActive: false },
      })),
    );
  },

  pushGPSPosition(dealId, p) {
    set((s) =>
      updateDeal(s, dealId, (d) => {
        const history = [...d.gps.positionHistory, p].slice(-TRACKING.HISTORY_TRAIL_LIMIT);
        return {
          ...d,
          gps: {
            ...d.gps,
            currentPosition: p,
            lastKnownPosition: p,
            positionHistory: history,
            signalLostAt: null,
          },
        };
      }),
    );
  },

  markGPSLost(dealId, at) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({
        ...d,
        gps: { ...d.gps, signalLostAt: at },
        smartSwitch: { pendingPrompt: !!d.flight.callsign },
      })),
    );
  },

  clearGPSLost(dealId) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({
        ...d,
        gps: { ...d.gps, signalLostAt: null },
        smartSwitch: { pendingPrompt: false },
      })),
    );
  },

  activateFlight(dealId, callsign) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({
        ...d,
        mode: 'flight',
        flight: { ...d.flight, isActive: true, callsign },
        gps: { ...d.gps, isActive: false },
        smartSwitch: { pendingPrompt: false },
      })),
    );
  },

  deactivateFlight(dealId) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({
        ...d,
        flight: { ...d.flight, isActive: false, interpolatedPosition: null },
      })),
    );
  },

  pushFlightPosition(dealId, p) {
    set((s) =>
      updateDeal(s, dealId, (d) => {
        const history = [...d.flight.positionHistory, p].slice(-50);
        return {
          ...d,
          flight: {
            ...d.flight,
            icao24: p.icao24 || d.flight.icao24,
            currentPosition: p,
            interpolatedPosition: p,
            positionHistory: history,
            lastPollAt: Date.now(),
          },
        };
      }),
    );
  },

  setInterpolatedPosition(dealId, p) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({
        ...d,
        flight: { ...d.flight, interpolatedPosition: p },
      })),
    );
  },

  setFlightRoute(dealId, path) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({ ...d, flight: { ...d.flight, routePath: path } })),
    );
  },

  promptSmartSwitch(dealId) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({ ...d, smartSwitch: { pendingPrompt: true } })),
    );
  },

  dismissSmartSwitch(dealId) {
    set((s) =>
      updateDeal(s, dealId, (d) => ({ ...d, smartSwitch: { pendingPrompt: false } })),
    );
  },

  resetDeal(dealId) {
    // Reset to a stable empty entry (keyed) instead of deleting. Deleting the
    // key forced selectDeal to return a fresh emptyDeal() on every read,
    // producing new references and an infinite re-render loop.
    emptyDealCache.delete(dealId);
    const fresh = getEmptyDeal(dealId);
    set((s) => ({ byDeal: { ...s.byDeal, [dealId]: fresh } }));
  },
}));

// Selector helper — returns the deal state, falling back to a stable empty
// entry so reference identity is preserved across renders.
export const selectDeal = (dealId: string) => (s: TrackingStore): TrackingDealState =>
  s.byDeal[dealId] ?? getEmptyDeal(dealId);
