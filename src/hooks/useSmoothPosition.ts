// Smoothly interpolates between real GPS / OpenSky ticks so the marker
// never teleports. Runs a 300ms timer that dead-reckons from the latest
// known point using speed + heading. Only forwards a state update when
// the projected position has moved far enough to matter.

import { useEffect, useRef, useState } from 'react';
import { deadReckon, isMeaningfulMove, shortestRotation, TrackPoint } from '../utils/interpolation';

interface SmoothState {
  lat:     number;
  lng:     number;
  heading: number;
}

interface Options {
  tickMs?: number;
  enabled?: boolean;
}

export function useSmoothPosition(
  target: { lat: number; lng: number; heading: number; speedMs: number; updatedAt: number } | null,
  opts: Options = {},
): SmoothState | null {
  const { tickMs = 300, enabled = true } = opts;
  const [state, setState] = useState<SmoothState | null>(() =>
    target ? { lat: target.lat, lng: target.lng, heading: target.heading } : null,
  );
  const latestRef = useRef<TrackPoint | null>(null);

  // Whenever the real target changes, snap heading using shortest path so
  // the visual doesn't spin, and seed the dead-reckoning input.
  useEffect(() => {
    if (!target) {
      latestRef.current = null;
      return;
    }
    latestRef.current = {
      lat:       target.lat,
      lng:       target.lng,
      heading:   target.heading,
      speedMs:   target.speedMs,
      timestamp: target.updatedAt,
    };
    setState((prev) => {
      if (!prev) return { lat: target.lat, lng: target.lng, heading: target.heading };
      return {
        lat:     target.lat,
        lng:     target.lng,
        heading: shortestRotation(prev.heading, target.heading),
      };
    });
  }, [target?.lat, target?.lng, target?.heading, target?.speedMs, target?.updatedAt]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const last = latestRef.current;
      if (!last) return;
      const projected = deadReckon(last);
      setState((prev) => {
        if (!prev) return { lat: projected.lat, lng: projected.lng, heading: last.heading };
        if (!isMeaningfulMove(prev, projected)) return prev;
        return {
          lat:     projected.lat,
          lng:     projected.lng,
          heading: prev.heading,
        };
      });
    }, tickMs);
    return () => clearInterval(id);
  }, [enabled, tickMs]);

  return state;
}
