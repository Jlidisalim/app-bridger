/**
 * MODULE A — SMART MATCHING ML (Sender ↔ Traveler)
 *
 * Given a deal (package delivery request), ranks available trips/travelers
 * by a composite compatibility score (0–1) using a weighted feature vector.
 *
 * No external ML dependencies — pure TypeScript math.
 */

import { prisma } from '../../config/db';
import logger from '../../utils/logger';
import { redis } from '../../config/redis';

const MATCHING_MODEL_VERSION = '1';
const CACHE_TTL_SECONDS = 300; // 5 minutes

// ── Feature weights (must sum to 1.0) ─────────────────────────────────────
const WEIGHTS = {
  route:    0.35,  // origin/destination overlap
  rating:   0.20,  // traveler star rating
  history:  0.10,  // completed deals experience
  capacity: 0.15,  // can carry the package weight
  time:     0.10,  // departure time proximity
  price:    0.05,  // price compatibility
  trust:    0.05,  // verification level
} as const;

// ── Types ──────────────────────────────────────────────────────────────────
export interface MatchResult {
  travelerId: string;
  tripId: string;
  score: number;           // 0–1
  explanation: string[];   // human-readable factors
  traveler: {
    id: string;
    name: string | null;
    avatar: string | null;
    profilePhoto: string | null;
    rating: number;
    totalDeals: number;
    verified: boolean;
  };
  trip: {
    id: string;
    fromCity: string;
    toCity: string;
    departureDate: Date | null;
    maxWeight: number;
    price: number;
    currency: string;
    negotiable: boolean;
  };
}

// ── Feature extractors ─────────────────────────────────────────────────────

/** 0–1: route city string overlap */
function routeScore(
  dealFrom: string, dealTo: string,
  tripFrom: string, tripTo: string
): number {
  const normalize = (s: string) => s.toLowerCase().trim();
  const df = normalize(dealFrom);
  const dt = normalize(dealTo);
  const tf = normalize(tripFrom);
  const tt = normalize(tripTo);

  const fromMatch = df === tf || tf.includes(df) || df.includes(tf);
  const toMatch   = dt === tt || tt.includes(dt) || dt.includes(tt);

  if (fromMatch && toMatch) return 1.0;
  if (fromMatch)            return 0.6;
  if (toMatch)              return 0.3;

  // Partial country/region overlap via first word
  const dfWord = df.split(/[\s,]+/)[0];
  const dtWord = dt.split(/[\s,]+/)[0];
  const tfWord = tf.split(/[\s,]+/)[0];
  const ttWord = tt.split(/[\s,]+/)[0];
  if (dfWord === tfWord || dtWord === ttWord) return 0.15;

  return 0.0;
}

/** 0–1: rating normalised from 0–5 star scale */
function ratingScore(rating: number): number {
  return Math.max(0, Math.min(rating / 5, 1));
}

/** 0–1: logarithmic normalisation on completed deals */
function historyScore(totalDeals: number): number {
  if (totalDeals <= 0) return 0;
  return Math.min(Math.log10(totalDeals + 1) / Math.log10(51), 1); // caps at 50 deals
}

/** 0 or 1: hard capacity constraint */
function capacityScore(packageWeight: number | null, tripMaxWeight: number): number {
  if (packageWeight === null || packageWeight === undefined) return 0.8; // unknown weight - partial credit
  return packageWeight <= tripMaxWeight ? 1.0 : 0.0;
}

/** 0–1: exponential decay on hours difference between pickup and departure */
function timeScore(dealPickup: Date | null, tripDeparture: Date | null): number {
  if (!dealPickup || !tripDeparture) return 0.5; // no date info — neutral
  const diffMs   = Math.abs(tripDeparture.getTime() - dealPickup.getTime());
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays <= 1)  return 1.0;
  if (diffDays <= 3)  return 0.75;
  if (diffDays <= 7)  return 0.5;
  if (diffDays <= 14) return 0.25;
  return 0.1;
}

/** 0–1: how well trip price fits within deal budget */
function priceScore(dealPrice: number, tripPrice: number, negotiable: boolean): number {
  if (negotiable) return 0.9; // negotiable trips get near-full credit
  if (tripPrice <= dealPrice) return 1.0;
  const overage = (tripPrice - dealPrice) / dealPrice; // 0.2 = 20% over
  if (overage <= 0.1)  return 0.85;
  if (overage <= 0.25) return 0.6;
  if (overage <= 0.5)  return 0.3;
  return 0.1;
}

/** 0–1: KYC + face verification trust level */
function trustScore(kycStatus: string, faceStatus: string, verified: boolean): number {
  let score = 0;
  if (verified)                        score += 0.3;
  if (kycStatus === 'APPROVED')        score += 0.4;
  if (faceStatus === 'VERIFIED')       score += 0.3;
  return Math.min(score, 1.0);
}

// ── Main scoring function ──────────────────────────────────────────────────

function scoreTrip(deal: any, trip: any): { score: number; explanation: string[] } {
  const features = {
    route:    routeScore(deal.fromCity, deal.toCity, trip.fromCity, trip.toCity),
    rating:   ratingScore(trip.traveler.rating),
    history:  historyScore(trip.traveler.totalDeals),
    capacity: capacityScore(deal.weight, trip.maxWeight),
    time:     timeScore(deal.pickupDate, trip.departureDate),
    price:    priceScore(deal.price, trip.price, trip.negotiable),
    trust:    trustScore(
                trip.traveler.kycStatus,
                trip.traveler.faceVerificationStatus,
                trip.traveler.verified
              ),
  };

  const score = Object.entries(WEIGHTS).reduce((sum, [key, w]) => {
    return sum + w * (features as any)[key];
  }, 0);

  // ── Human-readable explanation ──
  const explanation: string[] = [];

  if (features.route === 0) {
    explanation.push('Route does not match');
  } else if (features.route >= 0.9) {
    explanation.push('Exact route match ✓');
  } else {
    explanation.push('Partial route overlap');
  }

  if (trip.traveler.rating >= 4.5) explanation.push(`Top-rated traveler (${trip.traveler.rating.toFixed(1)}★)`);
  if (features.capacity === 0)     explanation.push('⚠ Insufficient capacity for package weight');
  else if (features.capacity === 1) explanation.push(`Can carry ${deal.weight ?? '?'}kg ✓`);

  if (features.time >= 0.9) explanation.push('Departure within 24h of pickup ✓');
  if (trip.negotiable)       explanation.push('Price negotiable');
  if (trip.traveler.verified) explanation.push('Verified traveler ✓');
  if (trip.traveler.kycStatus === 'APPROVED') explanation.push('KYC approved ✓');

  return { score: Math.round(score * 100) / 100, explanation };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Given a dealId, return ranked list of matching trips/travelers.
 * Filters out trips with zero route overlap (score contribution < 0.01).
 */
/** Invalidate cached match results when a trip's status changes. */
export async function invalidateMatchCache(dealId: string): Promise<void> {
  await redis.del(`match:${dealId}:v${MATCHING_MODEL_VERSION}`);
}

export async function rankTripsForDeal(dealId: string): Promise<MatchResult[]> {
  const cacheKey = `match:${dealId}:v${MATCHING_MODEL_VERSION}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as MatchResult[];
    } catch {
      // corrupt cache entry — fall through to recompute
    }
  }

  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: {
      fromCity: true, toCity: true,
      weight: true, price: true,
      pickupDate: true, status: true,
    },
  });

  if (!deal) throw new Error(`Deal ${dealId} not found`);

  const trips = await prisma.trip.findMany({
    where: { status: 'OPEN' },
    include: {
      traveler: {
        select: {
          id: true, name: true, avatar: true, profilePhoto: true,
          rating: true, totalDeals: true, verified: true,
          kycStatus: true, faceVerificationStatus: true,
        },
      },
    },
    take: 200, // consider at most 200 open trips for scoring
  });

  const results: MatchResult[] = trips
    .map((trip) => {
      const { score, explanation } = scoreTrip(deal, trip);
      // Discard trips with no route overlap at all
      const routeContrib = WEIGHTS.route * routeScore(deal.fromCity, deal.toCity, trip.fromCity, trip.toCity);
      if (routeContrib < 0.01) return null;

      return {
        travelerId: trip.travelerId,
        tripId: trip.id,
        score,
        explanation,
        traveler: {
          id: trip.traveler.id,
          name: trip.traveler.name,
          avatar: trip.traveler.avatar,
          profilePhoto: trip.traveler.profilePhoto,
          rating: trip.traveler.rating,
          totalDeals: trip.traveler.totalDeals,
          verified: trip.traveler.verified,
        },
        trip: {
          id: trip.id,
          fromCity: trip.fromCity,
          toCity: trip.toCity,
          departureDate: trip.departureDate,
          maxWeight: trip.maxWeight,
          price: trip.price,
          currency: trip.currency,
          negotiable: trip.negotiable,
        },
      } satisfies MatchResult;
    })
    .filter((r): r is MatchResult => r !== null)
    .sort((a, b) => b.score - a.score);

  logger.info('ML matching completed', {
    module: 'matching',
    dealId,
    candidatesConsidered: trips.length,
    matchesReturned: results.length,
    topScore: results[0]?.score ?? 0,
  });

  // Cache results — fire and forget; a failure here should not affect the response
  redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(results)).catch((err) => {
    logger.warn('[Matching] Failed to cache results', { dealId, error: err?.message });
  });

  return results;
}

/** Self-test: returns true if the model produces valid output */
export async function selfTest(): Promise<boolean> {
  try {
    // Minimal synthetic test — no DB call needed
    const mockDeal = { fromCity: 'Paris', toCity: 'London', weight: 1, price: 50, pickupDate: new Date() };
    const mockTrip = {
      fromCity: 'Paris', toCity: 'London',
      maxWeight: 5, price: 45, negotiable: false, departureDate: new Date(),
      traveler: { rating: 4.5, totalDeals: 10, verified: true, kycStatus: 'APPROVED', faceVerificationStatus: 'VERIFIED' },
    };
    const { score } = scoreTrip(mockDeal, mockTrip);
    return typeof score === 'number' && score >= 0 && score <= 1;
  } catch {
    return false;
  }
}
