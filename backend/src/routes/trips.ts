// Trip Routes
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createTripSchema, updateTripSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { getIO } from '../services/websocket';

const router = Router();

// GET /trips - List trips with filters
router.get('/', authenticate, async (req: any, res, next) => {
  try {
    const { page = 1, limit = 20, fromCity, toCity, status, minPrice, maxPrice } = req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where: any = {};
    if (fromCity) where.fromCity = { contains: String(fromCity) };
    if (toCity) where.toCity = { contains: String(toCity) };
    if (status) where.status = status;
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }

    const [items, total] = await Promise.all([
      prisma.trip.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          traveler: { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, kycStatus: true, verified: true } },
        },
      }),
      prisma.trip.count({ where }),
    ]);

    res.json({ items, total, page: Number(page), limit: Number(limit), hasMore: skip + take < total });
  } catch (error) {
    next(error);
  }
});

// GET /trips/popular-routes - Popular routes (must be before /:id)
router.get('/popular-routes', async (_req, res, next) => {
  try {
    const routes = await prisma.trip.groupBy({
      by: ['fromCity', 'toCity'],
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    res.json(routes.map(r => ({
      from: r.fromCity,
      to: r.toCity,
      count: r._count.id,
    })));
  } catch (error) {
    next(error);
  }
});

// POST /trips - Create trip
router.post('/', authenticate, validate(createTripSchema), async (req: any, res, next) => {
  try {
    const { fromCity, toCity, fromCountry, toCountry, departureDate, departureTime, flightNumber, maxWeight, price, currency, negotiable } = req.validated || req.body;

    const trip = await prisma.trip.create({
      data: {
        travelerId: req.user.id,
        fromCity,
        toCity,
        fromCountry: fromCountry || '',
        toCountry: toCountry || '',
        departureDate: departureDate ? new Date(departureDate) : null,
        departureTime: departureTime || null,
        flightNumber: flightNumber || null,
        maxWeight: maxWeight || 1.0,
        price,
        currency: currency || 'USD',
        negotiable: negotiable || false,
      },
    });

    // Broadcast so all connected clients can refresh their trip feed
    try { getIO()?.emit('new_trip_posted', { tripId: trip.id }); } catch {}

    res.status(201).json(trip);
  } catch (error) {
    next(error);
  }
});

// GET /trips/:id - Get single trip
router.get('/:id', authenticate, async (req: any, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: {
        traveler: { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, kycStatus: true, totalDeals: true, verified: true } },
      },
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json(trip);
  } catch (error) {
    next(error);
  }
});

// PATCH /trips/:id - Update trip
router.patch('/:id', authenticate, validate(updateTripSchema), async (req: any, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (trip.travelerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // Whitelist updatable fields to prevent mass assignment
    const { fromCity, toCity, fromCountry, toCountry, departureDate, departureTime, flightNumber, maxWeight, price, currency, negotiable } = req.body;
    const updateData: Record<string, any> = {};
    if (fromCity !== undefined) updateData.fromCity = fromCity;
    if (toCity !== undefined) updateData.toCity = toCity;
    if (fromCountry !== undefined) updateData.fromCountry = fromCountry;
    if (toCountry !== undefined) updateData.toCountry = toCountry;
    if (departureDate !== undefined) updateData.departureDate = departureDate ? new Date(departureDate) : null;
    if (departureTime !== undefined) updateData.departureTime = departureTime;
    if (flightNumber !== undefined) updateData.flightNumber = flightNumber;
    if (maxWeight !== undefined) updateData.maxWeight = maxWeight;
    if (price !== undefined) updateData.price = price;
    if (currency !== undefined) updateData.currency = currency;
    if (negotiable !== undefined) updateData.negotiable = negotiable;

    const updated = await prisma.trip.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// DELETE /trips/:id - Cancel trip
// Body (optional): { reason: string, evidence: string[] }
router.delete('/:id', authenticate, async (req: any, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (trip.travelerId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: 'A cancellation reason of at least 10 characters is required.' });
    }
    const evidenceArr = Array.isArray(req.body?.evidence)
      ? req.body.evidence.filter((u: any) => typeof u === 'string').slice(0, 10)
      : [];

    await prisma.trip.update({
      where: { id: req.params.id },
      data: {
        status:          'CANCELLED',
        cancelledById:   req.user.id,
        cancelledByRole: 'TRAVELER',
        cancelReason:    reason.slice(0, 1000),
        cancelEvidence:  evidenceArr.length ? JSON.stringify(evidenceArr) : null,
        cancelledAt:     new Date(),
      },
    });

    res.json({ message: 'Trip cancelled', cancelledByRole: 'TRAVELER' });
  } catch (error) {
    next(error);
  }
});

export default router;
