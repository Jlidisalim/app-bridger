// Shared interpolation helpers for the tracking full screen.
// `shortestRotation` picks the heading delta that minimises visual spin
// (e.g. 350° → 10° becomes +20°, not -340°).

import { advance } from './geo';

export interface TrackPoint {
  lat:      number;
  lng:      number;
  heading:  number;  // degrees, 0 = north
  speedMs:  number;  // metres / second
  timestamp: number; // Date.now() at reception
}

export function shortestRotation(from: number, to: number): number {
  const diff = ((to - from + 540) % 360) - 180;
  return from + diff;
}

// Linear interpolation of lat/lng — fine for short segments (<5km) where
// the great-circle curvature is negligible.
export function lerpLatLng(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  t: number,
): { lat: number; lng: number } {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

// Dead-reckoning: project forward from the last known point using heading
// + speed + elapsed time. This is what the car and flight markers use
// between real GPS / OpenSky updates.
export function deadReckon(
  last: TrackPoint,
  nowMs: number = Date.now(),
): { lat: number; lng: number } {
  const elapsedMs = Math.max(0, nowMs - last.timestamp);
  const distM = (last.speedMs * elapsedMs) / 1000;
  if (distM <= 0) return { lat: last.lat, lng: last.lng };
  return advance({ lat: last.lat, lng: last.lng }, distM, last.heading);
}

// Returns true if the change is worth forwarding to setState — avoids
// micro-renders from float drift.
export function isMeaningfulMove(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  epsilonDeg = 0.00001,
): boolean {
  return Math.abs(a.lat - b.lat) > epsilonDeg || Math.abs(a.lng - b.lng) > epsilonDeg;
}
