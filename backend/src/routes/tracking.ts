// Tracking REST endpoints — mounted at /tracking, all require auth.
//
//   POST /tracking/activate          (traveler) — start gps or flight tracking
//   POST /tracking/deactivate        (traveler) — stop tracking
//   POST /tracking/switch-mode       (traveler) — switch gps↔flight
//   POST /tracking/gps-position      (traveler) — HTTP fallback for ws push
//   GET  /tracking/:dealId           (sender|traveler) — current session
//   GET  /tracking/:dealId/history   (sender|traveler) — position log
//   GET  /tracking/credits           (any auth) — remaining OpenSky credits

import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import {
  activateTracking,
  deactivateTracking,
  switchMode,
  pushGPSPosition,
  getTrackingSession,
  getPositionHistory,
  serializeSession,
  HttpError,
} from '../services/tracking/tracking.service';
import { getLastKnownCredits, getRemainingCredits } from '../services/opensky/opensky.service';
import { openskyTokens } from '../services/opensky/opensky.token';

const router = Router();

const activateSchema = z.object({
  dealId:   z.string().min(1),
  mode:     z.enum(['gps', 'flight']),
  callsign: z.string().min(2).max(10).optional(),
});

const dealIdSchema = z.object({ dealId: z.string().min(1) });

const switchSchema = z.object({
  dealId:   z.string().min(1),
  newMode:  z.enum(['gps', 'flight']),
  callsign: z.string().min(2).max(10).optional(),
});

const gpsSchema = z.object({
  dealId:    z.string().min(1),
  lat:       z.number().min(-90).max(90),
  lng:       z.number().min(-180).max(180),
  accuracy:  z.number().min(0),
  heading:   z.number().nullable().optional(),
  speed:     z.number().nullable().optional(),
  altitude:  z.number().nullable().optional(),
  timestamp: z.number().int().positive().optional(),
});

function userId(req: AuthRequest): string {
  if (!req.user?.id) throw new HttpError(401, 'Unauthenticated');
  return req.user.id;
}

function handleError(err: unknown, res: Response, next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: 'Invalid input', details: err.errors });
  }
  next(err);
}

router.post('/activate', async (req: AuthRequest, res, next) => {
  try {
    const input = activateSchema.parse(req.body);
    const session = await activateTracking(userId(req), input);
    res.json({ ok: true, session: serializeSession(session) });
  } catch (err) { handleError(err, res, next); }
});

router.post('/deactivate', async (req: AuthRequest, res, next) => {
  try {
    const { dealId } = dealIdSchema.parse(req.body);
    const session = await deactivateTracking(userId(req), dealId);
    res.json({ ok: true, session: serializeSession(session) });
  } catch (err) { handleError(err, res, next); }
});

router.post('/switch-mode', async (req: AuthRequest, res, next) => {
  try {
    const input = switchSchema.parse(req.body);
    await switchMode(userId(req), input.dealId, input.newMode, input.callsign);
    res.json({ ok: true });
  } catch (err) { handleError(err, res, next); }
});

router.post('/gps-position', async (req: AuthRequest, res, next) => {
  try {
    const input = gpsSchema.parse(req.body);
    const { dealId, ...pos } = input;
    const session = await pushGPSPosition(userId(req), dealId, pos);
    res.json({ ok: true, session: serializeSession(session) });
  } catch (err) { handleError(err, res, next); }
});

router.get('/credits', async (req: AuthRequest, res, next) => {
  try {
    if (!openskyTokens.isConfigured()) {
      return res.json({ configured: false, credits: null });
    }
    const credits = getLastKnownCredits() ?? await getRemainingCredits();
    res.json({ configured: true, credits });
  } catch (err) { next(err); }
});

router.get('/:dealId', async (req: AuthRequest, res, next) => {
  try {
    const session = await getTrackingSession(userId(req), req.params.dealId);
    res.json({ session });
  } catch (err) { handleError(err, res, next); }
});

router.get('/:dealId/history', async (req: AuthRequest, res, next) => {
  try {
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const points = await getPositionHistory(userId(req), req.params.dealId, limit);
    res.json({ points });
  } catch (err) { handleError(err, res, next); }
});

export default router;
