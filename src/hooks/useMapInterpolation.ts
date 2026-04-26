// Smoothly advances the plane marker between server pushes (every ~30s).
// On each tick, we project the last real position forward by velocity * elapsed.

import { useEffect, useRef } from 'react';
import { useTrackingStore, selectDeal } from '../store/tracking.store';
import { advance } from '../utils/geo';
import { TRACKING } from '../constants/tracking';

export function useMapInterpolation(dealId: string, enabled: boolean): void {
  const setInterpolated = useTrackingStore((s) => s.setInterpolatedPosition);

  // Use store ref for the current position; we reread on each tick.
  const stateRef = useRef(useTrackingStore.getState().byDeal[dealId]);
  useEffect(() => {
    const unsub = useTrackingStore.subscribe((s) => {
      stateRef.current = s.byDeal[dealId];
    });
    return unsub;
  }, [dealId]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const deal = stateRef.current;
      const real = deal?.flight.currentPosition;
      if (!real) return;
      if (real.onGround) {
        setInterpolated(dealId, real);
        return;
      }
      if (real.isStale) return;

      const elapsedMs = Date.now() - real.updatedAt;
      if (elapsedMs <= 0) {
        setInterpolated(dealId, real);
        return;
      }
      const distM = (real.velocityMs * elapsedMs) / 1000;
      const moved = advance({ lat: real.lat, lng: real.lng }, distM, real.headingDeg);
      setInterpolated(dealId, {
        ...real,
        lat: moved.lat,
        lng: moved.lng,
      });
    }, TRACKING.INTERPOLATION_TICK_MS);

    return () => clearInterval(id);
  }, [dealId, enabled, setInterpolated]);
}
