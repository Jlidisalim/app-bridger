/**
 * ML API Routes
 *
 * POST /ml/match                → ranked traveler list for a deal
 * GET  /ml/estimate-price       → price estimate from route + package attrs
 * POST /ml/analyze-review       → sentiment + fraud analysis
 * GET  /ml/health               → quick inference check on all 3 modules
 * POST /ml/record-accepted-price → persist accepted price for continuous learning
 */

import { Router } from 'express';
import { authenticate, optionalAuth } from '../middleware/auth';
import { mlRateLimiter, searchRateLimiter } from '../middleware/security';
import { rankTripsForDeal, selfTest as matchSelfTest } from '../ml/matching/matchingModel';
import {
  predictPrice,
  haversineKm,
  recordAcceptedPrice,
  selfTest as priceSelfTest,
} from '../ml/pricing/pricingModel';
import {
  analyzeReview,
  retrainFromDatabase,
  selfTest as reviewSelfTest,
} from '../ml/reviews/reviewML';
import logger from '../utils/logger';

const router = Router();

// ── POST /ml/match ─────────────────────────────────────────────────────────
/**
 * Body: { requestId: string }
 * Returns ranked list: [{ travelerId, tripId, score, explanation, traveler, trip }]
 */
router.post('/match', authenticate, mlRateLimiter, async (req: any, res, next) => {
  try {
    const { requestId } = req.body;
    if (!requestId || typeof requestId !== 'string' || requestId.trim().length === 0) {
      return res.status(400).json({ error: 'requestId must be a non-empty string' });
    }

    const results = await rankTripsForDeal(requestId.trim());
    logger.info('ML match completed', {
      module: 'matching',
      dealId: requestId,
      matchCount: results.length,
    });
    res.json({ dealId: requestId, matches: results, count: results.length });
  } catch (error: any) {
    logger.error('ML match error', { module: 'matching', error: String(error) });
    if (error.message?.includes('not found')) {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

// ── GET /ml/estimate-price ─────────────────────────────────────────────────
/**
 * Query: fromLat, fromLng, toLat, toLng, weight, volume?, urgent?
 * Returns: { estimatedPrice, minPrice, maxPrice, confidence, distanceKm }
 */
router.get('/estimate-price', optionalAuth, mlRateLimiter, async (req, res, next) => {
  try {
    const {
      fromLat, fromLng, toLat, toLng,
      weight = '1',
      volume = '0',
      urgent = 'false',
    } = req.query as Record<string, string>;

    if (!fromLat || !fromLng || !toLat || !toLng) {
      return res.status(400).json({ error: 'fromLat, fromLng, toLat, toLng are required' });
    }

    const lat1 = parseFloat(fromLat);
    const lon1 = parseFloat(fromLng);
    const lat2 = parseFloat(toLat);
    const lon2 = parseFloat(toLng);
    const weightKg = parseFloat(weight);
    const volumeCm3 = parseFloat(volume);

    if ([lat1, lon1, lat2, lon2].some(isNaN)) {
      return res.status(400).json({ error: 'Coordinates must be valid numbers' });
    }
    if (lat1 < -90 || lat1 > 90 || lat2 < -90 || lat2 > 90) {
      return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
    }
    if (lon1 < -180 || lon1 > 180 || lon2 < -180 || lon2 > 180) {
      return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
    }
    if (isNaN(weightKg) || weightKg <= 0 || weightKg > 50) {
      return res.status(400).json({ error: 'weight must be a positive number up to 50kg' });
    }
    if (isNaN(volumeCm3) || volumeCm3 < 0) {
      return res.status(400).json({ error: 'volume must be a non-negative number' });
    }

    const distanceKm = haversineKm(lat1, lon1, lat2, lon2);
    const estimate   = await predictPrice(
      distanceKm,
      weightKg,
      volumeCm3,
      urgent === 'true' || urgent === '1'
    );

    logger.info('Price estimate generated', {
      module: 'pricing',
      distanceKm: Math.round(distanceKm),
      weightKg,
      estimatedPrice: estimate.estimatedPrice,
      confidence: estimate.confidence,
    });

    res.json({ ...estimate, distanceKm: Math.round(distanceKm) });
  } catch (error) {
    logger.error('ML price estimate error', { module: 'pricing', error: String(error) });
    next(error);
  }
});

// ── POST /ml/analyze-review ────────────────────────────────────────────────
/**
 * Body: { reviewText?, rating, userId, travelerId }
 * Returns: { sentiment, sentimentConfidence, fraudScore, flagged, status, reason, signals }
 */
router.post('/analyze-review', optionalAuth, mlRateLimiter, async (req, res, next) => {
  try {
    const { reviewText, rating, userId, travelerId } = req.body;

    if (!userId || !travelerId || rating === undefined) {
      return res.status(400).json({ error: 'userId, travelerId, and rating are required' });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'rating must be between 1 and 5' });
    }

    const analysis = await analyzeReview({ reviewText, rating, userId, targetId: travelerId });
    res.json(analysis);
  } catch (error) {
    logger.error('ML review analysis error', { module: 'reviews', error: String(error) });
    next(error);
  }
});

// ── POST /ml/record-accepted-price ─────────────────────────────────────────
/**
 * Body: { distanceKm, weightKg, volumeCm3, urgent, acceptedPrice }
 * Called after a deal price is confirmed by the sender.
 */
router.post('/record-accepted-price', authenticate, async (req, res, next) => {
  try {
    const { distanceKm, weightKg, volumeCm3 = 0, urgent = false, acceptedPrice } = req.body;

    if (!distanceKm || !weightKg || !acceptedPrice) {
      return res.status(400).json({ error: 'distanceKm, weightKg, acceptedPrice are required' });
    }

    await recordAcceptedPrice(
      parseFloat(distanceKm),
      parseFloat(weightKg),
      parseFloat(volumeCm3),
      Boolean(urgent),
      parseFloat(acceptedPrice)
    );

    res.json({ recorded: true });
  } catch (error) {
    logger.error('ML record price error', { module: 'pricing', error: String(error) });
    next(error);
  }
});

// ── POST /ml/retrain-reviews ───────────────────────────────────────────────
/**
 * Admin-only: re-seed the in-memory Naive Bayes classifier from approved DB reviews.
 */
router.post('/retrain-reviews', authenticate, async (req: any, res, next) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  try {
    const { added } = await retrainFromDatabase();
    res.json({ success: true, samplesAdded: added });
  } catch (error) {
    logger.error('Review retrain error', { module: 'reviews', error: String(error) });
    next(error);
  }
});

// ── GET /ml/health ─────────────────────────────────────────────────────────
/**
 * Returns: { matching, pricing, reviews, allOk, timestamp }
 * Each field is "ok" | "error"
 */
router.get('/health', async (_req, res) => {
  const [matchOk, priceOk, reviewOk] = await Promise.all([
    Promise.resolve(matchSelfTest()),
    Promise.resolve(priceSelfTest()),
    Promise.resolve(reviewSelfTest()),
  ]);

  const status = {
    matching: matchOk  ? 'ok' : 'error',
    pricing:  priceOk  ? 'ok' : 'error',
    reviews:  reviewOk ? 'ok' : 'error',
    allOk:    matchOk && priceOk && reviewOk,
    timestamp: new Date().toISOString(),
  };

  res.status(status.allOk ? 200 : 207).json(status);
});

export default router;
