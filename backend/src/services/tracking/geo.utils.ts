// Geographic helpers used by both backend (route generation) and shared types.

export interface LatLng { lat: number; lng: number; }

const R = 6_371_000; // Earth radius in meters

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

// Haversine distance between two coords, meters.
export function haversineMeters(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lng - a.lng);
  const x =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

// Initial bearing from a → b in degrees (clockwise from north).
export function bearingDeg(a: LatLng, b: LatLng): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dλ = toRad(b.lng - a.lng);
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Advance a coord by `distanceMeters` along `bearingDegrees`.
export function advance(point: LatLng, distanceMeters: number, bearingDegrees: number): LatLng {
  const d = distanceMeters / R;
  const θ = toRad(bearingDegrees);
  const φ1 = toRad(point.lat);
  const λ1 = toRad(point.lng);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(d) * Math.cos(φ1),
      Math.cos(d) - Math.sin(φ1) * Math.sin(φ2),
    );
  return { lat: toDeg(φ2), lng: ((toDeg(λ2) + 540) % 360) - 180 };
}

// Great-circle interpolation between two points, returns N waypoints inclusive.
export function greatCircleArc(a: LatLng, b: LatLng, segments = 50): LatLng[] {
  const φ1 = toRad(a.lat);
  const λ1 = toRad(a.lng);
  const φ2 = toRad(b.lat);
  const λ2 = toRad(b.lng);
  const Δ = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
    ),
  );

  if (Δ === 0) return [a, b];

  const out: LatLng[] = [];
  for (let i = 0; i <= segments; i++) {
    const f = i / segments;
    const A = Math.sin((1 - f) * Δ) / Math.sin(Δ);
    const B = Math.sin(f * Δ) / Math.sin(Δ);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λi = Math.atan2(y, x);
    out.push({ lat: toDeg(φi), lng: toDeg(λi) });
  }
  return out;
}
