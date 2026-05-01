// Trip Routes
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { createTripSchema, updateTripSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { getIO } from '../services/websocket';
import {
  assertSenderCanAfford,
  holdEscrow,
  refundEscrowToSender,
} from '../services/escrowService';
import { sendPushNotification } from '../services/pushService';
import logger from '../utils/logger';

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

// POST /trips/:id/accept — Sender accepts a Traveler's trip.
// Verifies the sender can afford the trip price, creates a matched Deal,
// and immediately blocks the funds in escrow. The blocked amount is
// released to the traveler when the deal is marked COMPLETED.
//
// Body (optional):
//   {
//     title?: string,            // shipment title (defaults to trip route)
//     description?: string,
//     packageSize?: string,      // SMALL|MEDIUM|LARGE|EXTRA_LARGE (default MEDIUM)
//     weight?: number,
//     itemValue?: number,
//     isFragile?: boolean,
//     receiverName?: string,
//     receiverPhone?: string,
//     amount?: number,           // total transaction amount; defaults to trip.price
//   }
router.post('/:id/accept', authenticate, async (req: any, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: { traveler: { select: { id: true, name: true } } },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status !== 'OPEN') return res.status(400).json({ error: 'Trip is not open' });
    if (trip.travelerId === req.user.id) return res.status(400).json({ error: 'Cannot accept your own trip' });

    const requestedAmount = Number(req.body?.amount ?? trip.price);
    if (!(requestedAmount > 0)) return res.status(400).json({ error: 'amount must be greater than zero' });

    // 1. Verify the sender's available balance covers the total transaction amount.
    try {
      await assertSenderCanAfford(req.user.id, requestedAmount);
    } catch (e: any) {
      return res.status(e?.status === 400 ? 402 : 500).json({ error: e?.message || 'Insufficient balance' });
    }

    const {
      title,
      description,
      packageSize = 'MEDIUM',
      weight,
      itemValue,
      isFragile = false,
      receiverName,
      receiverPhone,
    } = req.body || {};

    // 2. Create the matched deal and 3. block the funds atomically. If any
    //    step fails after the deal is created, undo it to prevent orphans.
    const deal = await prisma.deal.create({
      data: {
        senderId: req.user.id,
        travelerId: trip.travelerId,
        title: title || `${trip.fromCity} → ${trip.toCity}`,
        description: description || null,
        fromCity: trip.fromCity,
        toCity: trip.toCity,
        fromCountry: trip.fromCountry,
        toCountry: trip.toCountry,
        packageSize,
        isFragile: !!isFragile,
        itemValue: itemValue ?? null,
        weight: weight ?? null,
        price: requestedAmount,
        currency: trip.currency || 'USD',
        status: 'MATCHED',
        receiverName: receiverName || null,
        receiverPhone: receiverPhone || null,
      },
    });

    try {
      await holdEscrow({
        senderId: req.user.id,
        dealId: deal.id,
        amount: requestedAmount,
        currency: trip.currency || 'USD',
      });
    } catch (e: any) {
      await prisma.deal.delete({ where: { id: deal.id } }).catch(() => {});
      return res.status(e?.status === 400 ? 402 : 500).json({ error: e?.message || 'Failed to block funds' });
    }

    // Mark the trip as matched so it cannot be accepted twice.
    const matchedTrip = await prisma.trip.update({
      where: { id: trip.id, status: 'OPEN' },
      data: { status: 'MATCHED' },
    }).catch(() => null);

    if (!matchedTrip) {
      // Race condition: another sender accepted between our check and update.
      // Refund and roll back the deal.
      await refundEscrowToSender(deal.id, 'Trip already matched — race condition').catch(() => {});
      await prisma.deal.delete({ where: { id: deal.id } }).catch(() => {});
      return res.status(409).json({ error: 'Trip is no longer available' });
    }

    // Open / extend the chat room linked to this trip.
    const existingRoom = await prisma.chatRoom.findUnique({
      where: { tripId: trip.id },
      include: { participants: true },
    });
    if (!existingRoom) {
      await prisma.chatRoom.create({
        data: {
          dealId: deal.id,
          participants: { createMany: { data: [{ userId: req.user.id }, { userId: trip.travelerId }] } },
        },
      }).catch(() => {});
    }

    // Notify the traveler.
    sendPushNotification(
      trip.travelerId,
      '✅ Trip Accepted',
      `A sender has accepted your trip ${trip.fromCity} → ${trip.toCity}`,
      { type: 'trip_accepted', tripId: trip.id, dealId: deal.id, screen: 'DealDetails' },
    ).catch((e) => logger.error('Push failed', { error: String(e) }));

    res.json({ success: true, deal, trip: matchedTrip });
  } catch (error) {
    next(error);
  }
});

export default router;
