/**
 * MODULE B — PRICE ESTIMATION ML
 *
 * Primary: Proxies to the Python ML service (/predict/price) which runs
 *   an XGBoost model trained on real deal data.
 *
 * Fallback: Local linear regression trained on historical PricingDataPoint rows
 *   + 200 synthetic seed rows. Used when the Python service is unreachable.
 *
 * Features: distance(km), weight(kg), volume(cm³), urgent(0|1),
 *           dayOfWeek(0-6), hourOfDay(0-23)
 */

import config from '../../config/env';
import { prisma } from '../../config/db';
import logger from '../../utils/logger';

// ── Python ML service proxy ────────────────────────────────────────────────
export async function predictPriceViaPython(
  distanceKm: number,
  weightKg: number,
  category = 'GENERAL',
  urgency = 'NORMAL'
): Promise<PriceEstimate | null> {
  try {
    const res = await fetch(`${config.mlService.url}/predict/price`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        distance_km: distanceKm,
        weight_kg: weightKg,
        category,
        urgency,
      }),
      signal: AbortSignal.timeout(3000), // 3s timeout — fall back if slow
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      estimated_price: number;
      min_price: number;
      max_price: number;
      confidence: number;
    };

    return {
      estimatedPrice: data.estimated_price,
      minPrice: data.min_price,
      maxPrice: data.max_price,
      confidence: data.confidence,
    };
  } catch {
    return null; // silently fall through to local model
  }
}

// ── Haversine distance ─────────────────────────────────────────────────────
export function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Linear Regression (Normal Equations) ──────────────────────────────────
// β = (XᵀX)⁻¹ Xᵀy  —  implemented for small feature counts without a matrix lib

type Row = number[]; // [bias=1, distance, weight, volume, urgent, dayOfWeek, hour]

interface ModelState {
  coefficients: number[]; // [β0, β1, β2, β3, β4, β5, β6]
  trained: boolean;
  trainedOn: number;
}

const model: ModelState = {
  coefficients: [20, 0.04, 6, 0.001, 12, 0.3, 0.2], // initial reasonable defaults
  trained: false,
  trainedOn: 0,
};

/** Matrix multiply A (m×n) × B (n×p) → C (m×p) */
function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, n = B.length, p = B[0].length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: p }, (_, j) =>
      A[i].reduce((s, _, k) => s + A[i][k] * B[k][j], 0)
    )
  );
}

/** Transpose matrix */
function transpose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map(row => row[j]));
}

/** Invert a small square matrix using Gauss-Jordan elimination */
function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const aug = A.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) return null; // singular
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
    }
  }
  return aug.map(row => row.slice(n));
}

/** Build feature row: [1, distance, weight, volume, urgent, dayOfWeek, hour] */
function featureRow(
  distance: number,
  weight: number,
  volume: number,
  urgent: number,
  now?: Date
): Row {
  const d = now ?? new Date();
  return [1, distance, weight, volume, urgent, d.getDay(), d.getHours()];
}

/** Train / retrain model from provided (X, y) pairs using normal equations */
function fitModel(X: Row[], y: number[]): boolean {
  try {
    const Xt = transpose(X);
    const XtX = matMul(Xt, X);
    const XtXinv = invertMatrix(XtX);
    if (!XtXinv) {
      logger.warn('Pricing model: XtX is singular, keeping defaults', { module: 'pricing' });
      return false;
    }
    const XtY = matMul(Xt, y.map(v => [v]));
    const beta = matMul(XtXinv, XtY).map(r => r[0]);
    model.coefficients = beta;
    model.trained = true;
    model.trainedOn = X.length;
    logger.info('Pricing model trained', { module: 'pricing', rows: X.length, coefficients: beta.map(b => +b.toFixed(4)) });
    return true;
  } catch (err) {
    logger.error('Pricing model fit failed', { module: 'pricing', error: String(err) });
    return false;
  }
}

// ── Synthetic seed data ────────────────────────────────────────────────────
/** Generate 200 synthetic training rows that approximate real-world delivery pricing */
function generateSeedData(): { X: Row[]; y: number[] } {
  const X: Row[] = [];
  const y: number[] = [];

  // Seeded pseudo-random for reproducibility
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return (seed >>> 0) / 0xffffffff;
  };

  for (let i = 0; i < 200; i++) {
    const distance = 50 + rand() * 6000;   // 50–6050 km
    const weight   = 0.1 + rand() * 19.9;  // 0.1–20 kg
    const volume   = rand() * 50000;        // 0–50 000 cm³
    const urgent   = rand() > 0.7 ? 1 : 0;
    const day      = Math.floor(rand() * 7);
    const hour     = Math.floor(rand() * 24);

    // Ground-truth pricing formula + noise
    const truePrice =
      18 +
      0.03 * distance +
      5.5 * weight +
      0.0008 * volume +
      14 * urgent +
      (day === 0 || day === 6 ? 3 : 0) + // weekend surcharge
      (hour >= 22 || hour <= 5 ? 2 : 0) + // night surcharge
      (rand() - 0.5) * 8; // ±4 noise

    X.push([1, distance, weight, volume, urgent, day, hour]);
    y.push(Math.max(5, truePrice));
  }
  return { X, y };
}

// ── Bootstrap ─────────────────────────────────────────────────────────────
/**
 * Called on server start.
 * 1. Loads PricingDataPoint rows from DB.
 * 2. If fewer than 50 real rows, seeds the DB with synthetic data.
 * 3. Fits model on all available rows.
 */
export async function initPricingModel(): Promise<void> {
  let rows = await prisma.pricingDataPoint.findMany({ orderBy: { createdAt: 'asc' } });

  if (rows.length < 50) {
    logger.info('Pricing model: seeding DB with synthetic data', { module: 'pricing' });
    const { X, y } = generateSeedData();
    await prisma.pricingDataPoint.createMany({
      data: X.map((row, i) => ({
        distance: row[1],
        weight:   row[2],
        volume:   row[3],
        urgent:   row[4] === 1,
        price:    y[i],
      })),
    });
    rows = await prisma.pricingDataPoint.findMany({ orderBy: { createdAt: 'asc' } });
  }

  const X = rows.map(r => featureRow(r.distance, r.weight, r.volume, r.urgent ? 1 : 0));
  const y = rows.map(r => r.price);
  fitModel(X, y);
}

// ── Prediction ─────────────────────────────────────────────────────────────
export interface PriceEstimate {
  estimatedPrice: number;
  minPrice: number;
  maxPrice: number;
  confidence: number;  // 0–1 based on training data density
}

export function predictPriceLocal(
  distanceKm: number,
  weightKg: number,
  volumeCm3: number,
  urgent: boolean
): PriceEstimate {
  const row = featureRow(distanceKm, weightKg, volumeCm3, urgent ? 1 : 0);
  const estimated = row.reduce((sum, v, i) => sum + v * model.coefficients[i], 0);
  // FIX: Guard against NaN/Infinity propagation from bad coefficients
  const clipped = Number.isFinite(estimated) ? Math.max(5, estimated) : 35; // fallback to $35 base price

  const confidence = model.trained
    ? Math.min(0.92, 0.55 + model.trainedOn * 0.002)
    : 0.55;

  const spread = clipped * 0.15;

  return {
    estimatedPrice: Math.round(clipped * 100) / 100,
    minPrice:       Math.round(Math.max(5, clipped - spread) * 100) / 100,
    maxPrice:       Math.round((clipped + spread) * 100) / 100,
    confidence:     Math.round(confidence * 100) / 100,
  };
}

/** Public entry point: try Python ML service first, fall back to local linear regression */
export async function predictPrice(
  distanceKm: number,
  weightKg: number,
  volumeCm3: number,
  urgent: boolean,
  category = 'GENERAL'
): Promise<PriceEstimate> {
  const pythonResult = await predictPriceViaPython(
    distanceKm,
    weightKg,
    category,
    urgent ? 'EXPRESS' : 'NORMAL'
  );

  if (pythonResult) {
    logger.debug('Pricing from Python ML service', { module: 'pricing', distanceKm, weightKg });
    return pythonResult;
  }

  logger.warn('Python ML service unavailable — using local linear regression fallback', { module: 'pricing' });
  return predictPriceLocal(distanceKm, weightKg, volumeCm3, urgent);
}

/** Persist an accepted price back to the training table (continuous learning) */
export async function recordAcceptedPrice(
  distanceKm: number,
  weightKg: number,
  volumeCm3: number,
  urgent: boolean,
  acceptedPrice: number
): Promise<void> {
  await prisma.pricingDataPoint.create({
    data: { distance: distanceKm, weight: weightKg, volume: volumeCm3, urgent, price: acceptedPrice },
  });
  // Lightweight incremental retrain (every 10 new accepted prices)
  const count = await prisma.pricingDataPoint.count();
  if (count % 10 === 0) {
    const rows = await prisma.pricingDataPoint.findMany({ orderBy: { createdAt: 'asc' } });
    const X = rows.map(r => featureRow(r.distance, r.weight, r.volume, r.urgent ? 1 : 0));
    const y = rows.map(r => r.price);
    fitModel(X, y);
  }
}

/** Self-test — uses synchronous local model (predictPriceLocal) to avoid async issues */
export function selfTest(): boolean {
  try {
    const est = predictPriceLocal(500, 2, 5000, false);
    return (
      typeof est.estimatedPrice === 'number' &&
      Number.isFinite(est.estimatedPrice) &&
      est.estimatedPrice > 0 &&
      est.minPrice <= est.estimatedPrice &&
      est.estimatedPrice <= est.maxPrice
    );
  } catch {
    return false;
  }
}
