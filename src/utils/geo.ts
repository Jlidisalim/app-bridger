// Mobile-side geographic helpers used by the interpolation hook and the
// tracking map components. Mirrors backend/src/services/tracking/geo.utils.ts.

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const dφ = toRad(b.lat - a.lat);
  const dλ = toRad(b.lng - a.lng);
  const x =
    Math.sin(dφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(x));
}

export function advance(
  point: { lat: number; lng: number },
  distanceMeters: number,
  bearingDegrees: number,
): { lat: number; lng: number } {
  const d = distanceMeters / EARTH_RADIUS_M;
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

export function greatCircleArc(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
  segments = 50,
): { lat: number; lng: number }[] {
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

  const out: { lat: number; lng: number }[] = [];
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

// Convert {lat, lng} → react-native-maps {latitude, longitude}
export const toLL = (p: { lat: number; lng: number }) =>
  ({ latitude: p.lat, longitude: p.lng });
