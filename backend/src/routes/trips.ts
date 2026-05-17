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
import { sendPushNotification, sendPushToMultiple } from '../services/pushService';
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
    const { fromCity, toCity, fromCountry, toCountry, departureDate, departureTime, flightNumber, transportType, maxWeight, price, currency, negotiable } = req.validated || req.body;

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
        transportType: transportType || 'PLANE',
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

// fire-and-forget push helpers
function push(userId: string, title: string, body: string, data: { type: string; [k: string]: any }) {
  sendPushNotification(userId, title, body, data).catch((e) => logger.error('Push failed', { error: String(e) }));
}
function pushMany(userIds: string[], title: string, body: string, data: { type: string; [k: string]: any }) {
  sendPushToMultiple(userIds, title, body, data).catch((e) => logger.error('PushMany failed', { error: String(e) }));
}

// POST /trips/:id/accept — Sender REQUESTS a Traveler's trip.
// This no longer auto-matches: it creates a PENDING TripRequest with the
// sender's proposed shipment details. The traveler must approve it via
// POST /trips/:id/requests/:requestId/accept before any escrow is held.
//
// Body (all optional except amount):
//   {
//     title?, description?, packageSize?, weight?, itemValue?, isFragile?,
//     receiverName?, receiverPhone?,
//     amount?: number,           // total transaction amount; defaults to trip.price
//     message?: string,          // free-text note from sender to traveler
//   }
router.post('/:id/accept', authenticate, async (req: any, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: { traveler: { select: { id: true, name: true } } },
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.status !== 'OPEN') return res.status(400).json({ error: 'Trip is not open' });
    if (trip.travelerId === req.user.id) return res.status(400).json({ error: 'Cannot request your own trip' });

    const proposedPrice = Number(req.body?.amount ?? trip.price);
    if (!(proposedPrice > 0)) return res.status(400).json({ error: 'amount must be greater than zero' });

    // Verify the sender can afford it BEFORE creating the pending request,
    // so we never collect a request the sender couldn't honor once accepted.
    try {
      await assertSenderCanAfford(req.user.id, proposedPrice);
    } catch (e: any) {
      return res.status(e?.status === 400 ? 402 : 500).json({ error: e?.message || 'Insufficient balance' });
    }

    const {
      title, description, packageSize = 'MEDIUM', weight, itemValue,
      isFragile = false, receiverName, receiverPhone, message,
    } = req.body || {};

    const existing = await prisma.tripRequest.findUnique({
      where: { tripId_requesterId: { tripId: trip.id, requesterId: req.user.id } },
    });
    if (existing && (existing.status === 'PENDING' || existing.status === 'ACCEPTED')) {
      return res.status(409).json({ error: 'You already have an active request on this trip' });
    }

    const requestData = {
      proposedPrice,
      message: message ?? null,
      title: title || null,
      description: description || null,
      packageSize: packageSize || null,
      weight: weight ?? null,
      itemValue: itemValue ?? null,
      isFragile: !!isFragile,
      receiverName: receiverName || null,
      receiverPhone: receiverPhone || null,
    };

    const request = existing
      ? await prisma.tripRequest.update({
          where: { id: existing.id },
          data: { ...requestData, status: 'PENDING', decidedAt: null },
        })
      : await prisma.tripRequest.create({
          data: { tripId: trip.id, requesterId: req.user.id, ...requestData },
        });

    // Notify the traveler that a sender wants to use their trip.
    const sender = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true },
    });
    push(
      trip.travelerId,
      '🙋 New Shipment Request',
      `${sender?.name ?? 'A sender'} wants to ship on your ${trip.fromCity} → ${trip.toCity} trip`,
      { type: 'trip_request_received', tripId: trip.id, requestId: request.id, screen: 'TripRequests' },
    );

    res.json({ request, tripStatus: trip.status });
  } catch (error) {
    next(error);
  }
});

// GET /trips/:id/requests — Traveler lists requests for their trip.
router.get('/:id/requests', authenticate, async (req: any, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.travelerId !== req.user.id) {
      return res.status(403).json({ error: 'Only the traveler can view requests for this trip' });
    }
    const requests = await prisma.tripRequest.findMany({
      where: { tripId: trip.id },
      include: {
        requester: { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, verified: true, totalDeals: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: requests });
  } catch (error) { next(error); }
});

// POST /trips/:id/requests/:requestId/accept — Traveler accepts one sender's request.
// Creates the matched Deal, holds the sender's escrow, marks the trip MATCHED,
// auto-rejects sibling pending requests, opens the chat room.
router.post('/:id/requests/:requestId/accept', authenticate, async (req: any, res, next) => {
  try {
    const { id: tripId, requestId } = req.params;
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.travelerId !== req.user.id) return res.status(403).json({ error: 'Only the traveler can accept requests' });
    if (trip.status !== 'OPEN') return res.status(400).json({ error: 'Trip is not open' });

    const request = await prisma.tripRequest.findUnique({ where: { id: requestId } });
    if (!request || request.tripId !== tripId) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: `Request is ${request.status.toLowerCase()}` });

    // Re-verify the requesting sender can still afford it at accept-time:
    // their balance might have drifted between request and acceptance.
    try {
      await assertSenderCanAfford(request.requesterId, Number(request.proposedPrice));
    } catch (e: any) {
      return res.status(e?.status === 400 ? 402 : 500).json({ error: e?.message || 'Sender no longer has sufficient balance' });
    }

    // Create the matched deal (do not yet flip the trip; we want to claim
    // the OPEN→MATCHED transition atomically before holding escrow so we
    // don't double-charge if two travelers ever bypassed the role guard).
    const deal = await prisma.deal.create({
      data: {
        senderId: request.requesterId,
        travelerId: trip.travelerId,
        title: request.title || `${trip.fromCity} → ${trip.toCity}`,
        description: request.description,
        fromCity: trip.fromCity,
        toCity: trip.toCity,
        fromCountry: trip.fromCountry,
        toCountry: trip.toCountry,
        packageSize: request.packageSize || 'MEDIUM',
        isFragile: request.isFragile,
        itemValue: request.itemValue ?? null,
        weight: request.weight ?? null,
        price: Number(request.proposedPrice),
        currency: trip.currency || 'USD',
        status: 'MATCHED',
        receiverName: request.receiverName,
        receiverPhone: request.receiverPhone,
      },
    });

    try {
      await holdEscrow({
        senderId: request.requesterId,
        dealId: deal.id,
        amount: Number(request.proposedPrice),
        currency: trip.currency || 'USD',
      });
    } catch (e: any) {
      await prisma.deal.delete({ where: { id: deal.id } }).catch(() => {});
      return res.status(e?.status === 400 ? 402 : 500).json({ error: e?.message || 'Failed to hold escrow' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const tripUpdate = await tx.trip.updateMany({
        where: { id: trip.id, status: 'OPEN' },
        data: { status: 'MATCHED' },
      });
      if (tripUpdate.count === 0) return null;

      await tx.tripRequest.update({
        where: { id: request.id },
        data: { status: 'ACCEPTED', decidedAt: new Date() },
      });
      const siblings = await tx.tripRequest.findMany({
        where: { tripId: trip.id, status: 'PENDING', NOT: { id: request.id } },
        select: { id: true, requesterId: true },
      });
      if (siblings.length > 0) {
        await tx.tripRequest.updateMany({
          where: { id: { in: siblings.map((s) => s.id) } },
          data: { status: 'REJECTED', decidedAt: new Date() },
        });
      }
      return { siblings };
    });

    if (!result) {
      await refundEscrowToSender(deal.id, 'Trip no longer available — race condition').catch(() => {});
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
          participants: { createMany: { data: [{ userId: request.requesterId }, { userId: trip.travelerId }] } },
        },
      }).catch(() => {});
    }

    push(request.requesterId, '✅ Request Accepted', `The traveler accepted your shipment on ${trip.fromCity} → ${trip.toCity}.`, {
      type: 'trip_request_accepted', tripId: trip.id, requestId: request.id, dealId: deal.id, screen: 'DealDetails',
    });
    if (result.siblings.length > 0) {
      pushMany(
        result.siblings.map((s) => s.requesterId),
        '😞 Request Declined',
        'The traveler chose another sender for this trip.',
        { type: 'trip_request_rejected', tripId: trip.id, screen: 'Explore' },
      );
    }

    res.json({ success: true, deal });
  } catch (error) {
    next(error);
  }
});

// POST /trips/:id/requests/:requestId/reject — Traveler rejects a single request.
router.post('/:id/requests/:requestId/reject', authenticate, async (req: any, res, next) => {
  try {
    const { id: tripId, requestId } = req.params;
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (trip.travelerId !== req.user.id) return res.status(403).json({ error: 'Only the traveler can reject requests' });

    const request = await prisma.tripRequest.findUnique({ where: { id: requestId } });
    if (!request || request.tripId !== tripId) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: `Request is ${request.status.toLowerCase()}` });

    const updated = await prisma.tripRequest.update({
      where: { id: request.id },
      data: { status: 'REJECTED', decidedAt: new Date() },
    });

    push(request.requesterId, '😞 Request Declined', 'The traveler declined your shipment request.', {
      type: 'trip_request_rejected', tripId, requestId, screen: 'Explore',
    });

    res.json({ success: true, request: updated });
  } catch (error) {
    next(error);
  }
});

// POST /trips/:id/requests/:requestId/withdraw — Requesting sender cancels their pending request.
router.post('/:id/requests/:requestId/withdraw', authenticate, async (req: any, res, next) => {
  try {
    const { id: tripId, requestId } = req.params;
    const request = await prisma.tripRequest.findUnique({ where: { id: requestId } });
    if (!request || request.tripId !== tripId) return res.status(404).json({ error: 'Request not found' });
    if (request.requesterId !== req.user.id) return res.status(403).json({ error: 'You can only withdraw your own request' });
    if (request.status !== 'PENDING') return res.status(400).json({ error: `Request is ${request.status.toLowerCase()}` });

    const updated = await prisma.tripRequest.update({
      where: { id: request.id },
      data: { status: 'WITHDRAWN', decidedAt: new Date() },
    });

    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { travelerId: true } });
    if (trip) {
      push(trip.travelerId, 'Request withdrawn', 'A sender withdrew their request on your trip.', {
        type: 'trip_request_withdrawn', tripId, requestId, screen: 'TripRequests',
      });
    }

    res.json({ success: true, request: updated });
  } catch (error) {
    next(error);
  }
});

// GET /trips/my-requests/sent — Requests the current user has sent on others' trips.
router.get('/my-requests/sent', authenticate, async (req: any, res, next) => {
  try {
    const requests = await prisma.tripRequest.findMany({
      where: { requesterId: req.user.id },
      include: {
        trip: {
          include: {
            traveler: { select: { id: true, name: true, avatar: true, profilePhoto: true, verified: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: requests });
  } catch (error) { next(error); }
});

export default router;
