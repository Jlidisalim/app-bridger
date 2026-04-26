// Deals Routes — with push notifications at every status change
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { generateDealQR, verifyDealQR } from '../services/qrService';
import { validate } from '../middleware/validate';
import { createDealSchema, updateDealSchema, dealFiltersSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { sendPushNotification, sendPushToMultiple } from '../services/pushService';
import { releaseEscrowForCancellation } from '../services/paymentService';
import { getIO } from '../services/websocket';
import { saveBuffer, saveRawBuffer, getUploadUrl, sanitizeFilename, ALLOWED_MIME_TYPES, MAX_FILES_PER_REQUEST } from '../services/uploadService';
import logger from '../utils/logger';

// Multer for deal image uploads
const dealImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'));
  },
});

// Multer for cancel-evidence uploads (images + videos)
const CANCEL_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'];
const cancelEvidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) || CANCEL_VIDEO_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image (JPEG/PNG/WebP/GIF) or video (MP4/MOV/WebM) files are allowed'));
    }
  },
});

/** Decode a base64 data URI and save to uploads/deal/. Returns server URL or null. */
async function saveBase64Image(dataUri: string): Promise<string | null> {
  const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!match) return null;
  const mimetype = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  try {
    return await saveBuffer(buffer, mimetype, 'deal', `img_${Date.now()}`);
  } catch {
    return null;
  }
}

const router = Router();

// ─── helper: fire-and-forget push (never blocks the response) ─────────────
function push(
  userId: string,
  title: string,
  body: string,
  data: { type: string; [key: string]: any }
): void {
  sendPushNotification(userId, title, body, data).catch((e) =>
    logger.error('Push failed', { error: String(e) })
  );
}
function pushMany(
  userIds: string[],
  title: string,
  body: string,
  data: { type: string; [key: string]: any }
): void {
  sendPushToMultiple(userIds, title, body, data).catch((e) =>
    logger.error('PushMany failed', { error: String(e) })
  );
}

// GET /deals — List deals with filters
router.get('/', authenticate, validate(dealFiltersSchema, 'query'), async (req: any, res, next) => {
  try {
    const {
      page = 1, limit = 20, status,
      fromCity, toCity, fromCountry, toCountry, minPrice, maxPrice,
      packageSize, sortBy = 'createdAt', sortOrder = 'desc',
    } = req.validated || req.query;

    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where: any = {};
    if (status)      where.status = status;
    if (fromCity)    where.fromCity    = { contains: fromCity };
    if (toCity)      where.toCity      = { contains: toCity };
    if (fromCountry) where.fromCountry = { contains: fromCountry };
    if (toCountry)   where.toCountry   = { contains: toCountry };
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }
    if (packageSize) where.packageSize = packageSize;

    const orderBy: any = { [sortBy as string]: sortOrder };

    const [items, total] = await Promise.all([
      prisma.deal.findMany({
        where, skip, take, orderBy,
        include: {
          sender:  { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, verified: true } },
          traveler:{ select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, verified: true } },
        },
      }),
      prisma.deal.count({ where }),
    ]);

    const itemsWithImages = items.map((deal: any) => ({
      ...deal,
      images: deal.images ? JSON.parse(deal.images) : [],
    }));

    res.json({ items: itemsWithImages, total, page: Number(page), limit: Number(limit), hasMore: skip + take < total });
  } catch (error) { next(error); }
});

// POST /deals — Create a new deal
router.post('/', authenticate, validate(createDealSchema), async (req: any, res, next) => {
  try {
    const {
      title, description, fromCity, toCity, fromCountry, toCountry,
      packageSize, isFragile = false, itemValue, weight, price, currency = 'USD', pickupDate, deliveryDate, images,
      receiverName, receiverPhone,
    } = req.validated || req.body;

    // Process images: decode base64 data URIs → save to uploads/deal/ → store server URLs
    let processedImages: string[] = [];
    if (Array.isArray(images) && images.length > 0) {
      const results = await Promise.all(
        images.map(async (img: string) => {
          if (typeof img !== 'string') return null;
          if (img.startsWith('data:image/')) {
            return saveBase64Image(img);
          }
          // Already a server URL or https URL — keep as-is
          if (img.startsWith('http://') || img.startsWith('https://') || img.startsWith('/uploads/')) {
            return img;
          }
          return null; // local file:// URIs cannot be read server-side
        })
      );
      processedImages = results.filter((u): u is string => u !== null);
    }

    const deal = await prisma.deal.create({
      data: {
        senderId: req.user.id,
        title, description, fromCity, toCity, fromCountry, toCountry,
        packageSize, isFragile, itemValue, weight, price, currency,
        pickupDate:  pickupDate  ? new Date(pickupDate)  : null,
        deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
        images: processedImages.length > 0 ? JSON.stringify(processedImages) : null,
        receiverName:  receiverName  || null,
        receiverPhone: receiverPhone || null,
      },
      include: { sender: { select: { id: true, name: true, avatar: true, rating: true } } },
    });

    // Ensure images are always returned as a parsed array (not a JSON string)
    const dealWithImages = {
      ...deal,
      images: deal.images ? (() => {
        try { return JSON.parse(deal.images); } catch { return []; }
      })() : [],
    };

    // Broadcast to all connected clients so their feed updates in real-time
    try { getIO()?.emit('new_deal_posted', { dealId: deal.id }); } catch {}

    res.json(dealWithImages);
  } catch (error) { next(error); }
});

// POST /deals/upload-images — Upload deal images, returns array of server URLs
// Use this before creating a deal to get persistent cross-device URLs.
router.post(
  '/upload-images',
  authenticate,
  dealImageUpload.array('images', MAX_FILES_PER_REQUEST),
  async (req: any, res, next) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No images provided' });
      }
      const urls = await Promise.all(
        files.map((f) => saveBuffer(f.buffer, f.mimetype, 'deal', `img_${Date.now()}`))
      );
      res.json({ urls });
    } catch (error: any) {
      next(error);
    }
  }
);

// POST /deals/upload-cancel-evidence — upload images/videos for cancel proof, returns URLs
router.post(
  '/upload-cancel-evidence',
  authenticate,
  cancelEvidenceUpload.array('files', MAX_FILES_PER_REQUEST),
  async (req: any, res, next) => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: 'No files provided' });
      }
      const urls = await Promise.all(
        files.map((f) => {
          const isVideo = CANCEL_VIDEO_MIME.includes(f.mimetype);
          if (isVideo) {
            const ext = f.mimetype === 'video/quicktime' ? '.mov'
              : f.mimetype === 'video/webm' ? '.webm'
              : f.mimetype === 'video/x-m4v' ? '.m4v' : '.mp4';
            const filename = `${Date.now()}_${sanitizeFilename(f.originalname || 'video')}${ext}`;
            return saveRawBuffer(f.buffer, 'cancel', filename);
          }
          return saveBuffer(f.buffer, f.mimetype, 'cancel', `file_${Date.now()}`);
        })
      );
      res.json({ urls });
    } catch (error: any) {
      next(error);
    }
  }
);

// POST /deals/search
router.post('/search', authenticate, async (req: any, res, next) => {
  try {
    const { query, fromCity, toCity, fromCountry, toCountry, minPrice, maxPrice, page = 1, limit = 20 } = req.body;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);
    const where: any = { status: 'OPEN' };

    if (query) {
      where.OR = [
        { title:       { contains: query } },
        { description: { contains: query } },
        { fromCity:    { contains: query } },
        { toCity:      { contains: query } },
        { fromCountry: { contains: query } },
        { toCountry:   { contains: query } },
      ];
    }
    if (fromCity)    where.fromCity    = { contains: fromCity };
    if (toCity)      where.toCity      = { contains: toCity };
    if (fromCountry) where.fromCountry = { contains: fromCountry };
    if (toCountry)   where.toCountry   = { contains: toCountry };
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price.gte = Number(minPrice);
      if (maxPrice) where.price.lte = Number(maxPrice);
    }

const [items, total] = await Promise.all([
      prisma.deal.findMany({
        where, skip, take, orderBy: { createdAt: 'desc' },
        include: { sender: { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, verified: true } } },
      }),
      prisma.deal.count({ where }),
    ]);

    const itemsWithImages = items.map((deal: any) => ({
      ...deal,
      images: deal.images ? JSON.parse(deal.images) : [],
    }));

    res.json({ items: itemsWithImages, total, page: Number(page), limit: Number(limit), hasMore: skip + take < total });
  } catch (error) { next(error); }
});

// POST /deals/pricing-suggestion
router.post('/pricing-suggestion', authenticate, async (req: any, res, next) => {
  try {
    const { from, to, weight } = req.body;
    const similarDeals = await prisma.deal.findMany({
      where: {
        fromCity: { contains: from || '' },
        toCity:   { contains: to   || '' },
        status: { in: ['OPEN', 'MATCHED', 'COMPLETED'] },
      },
      select: { price: true },
      take: 50,
    });

    if (similarDeals.length > 0) {
      const prices = similarDeals.map(d => d.price).sort((a, b) => a - b);
      const min    = prices[0];
      const max    = prices[prices.length - 1];
      const median = prices[Math.floor(prices.length / 2)];
      return res.json({ min, max, median, confidence: Math.min(0.9, 0.5 + similarDeals.length * 0.02) });
    }

    const basePrice   = 35;
    const weightFactor = (weight || 0.5) * 10;
    const min = Math.round(basePrice);
    const max = Math.round(basePrice + weightFactor + 10);
    res.json({ min, max, median: Math.round((min + max) / 2), confidence: 0.7 });
  } catch (error) { next(error); }
});

// GET /deals/:id
router.get('/:id', authenticate, async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: {
        sender:   { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, totalDeals: true, verified: true } },
        traveler: { select: { id: true, name: true, avatar: true, profilePhoto: true, rating: true, totalDeals: true, verified: true } },
        trackingEvents: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Ensure images are always returned as a parsed array (not a JSON string)
    const images = deal.images ? (() => {
      try { return JSON.parse(deal.images); } catch { return []; }
    })() : [];

    res.json({ ...deal, images });
  } catch (error) { next(error); }
});

// PATCH /deals/:id
router.patch('/:id', authenticate, validate(updateDealSchema), async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal)                          return res.status(404).json({ error: 'Deal not found' });
    if (deal.senderId !== req.user.id)  return res.status(403).json({ error: 'Not authorized' });
    if (deal.status !== 'OPEN')         return res.status(400).json({ error: 'Can only update OPEN deals' });

    const { title, description, price, currency, pickupDate, deliveryDate, packageSize, weight } = req.body;
    const updateData: Record<string, any> = {};
    if (title       !== undefined) updateData.title       = title;
    if (description !== undefined) updateData.description = description;
    if (price       !== undefined) updateData.price       = price;
    if (currency    !== undefined) updateData.currency    = currency;
    if (pickupDate  !== undefined) updateData.pickupDate  = pickupDate ? new Date(pickupDate) : null;
    if (deliveryDate !== undefined) updateData.deliveryDate = deliveryDate ? new Date(deliveryDate) : null;
    if (packageSize !== undefined) updateData.packageSize = packageSize;
    if (weight      !== undefined) updateData.weight      = weight;

    const updated = await prisma.deal.update({
      where: { id: req.params.id },
      data: updateData,
      include: { sender: { select: { id: true, name: true, avatar: true, rating: true } } },
    });

    res.json(updated);
  } catch (error) { next(error); }
});

// POST /deals/:id/status — Update deal status and create tracking event
const validStatuses = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED'];
router.post('/:id/status', authenticate, async (req: any, res, next) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: 'Status is required' });
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const isSender = deal.senderId === req.user.id;
    const isTraveler = deal.travelerId === req.user.id;
    if (!isSender && !isTraveler) return res.status(403).json({ error: 'Not authorized' });

    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({ where: { id: req.params.id }, data: { status } }),
      prisma.trackingEvent.create({ data: { dealId: deal.id, status, actor: req.user.id } }),
    ]);

    const otherPartyId = isSender ? deal.travelerId : deal.senderId;
    if (otherPartyId) {
      push(otherPartyId, `Deal ${status}`, `Your deal status is now ${status}`, { type: 'deal_status', dealId: deal.id, screen: 'Tracking' });
    }

    res.json(updatedDeal);
  } catch (error) { next(error); }
});

// DELETE /deals/:id — cancel a deal (sender OR traveler).
// Body (optional): { reason: string, evidence: string[] }  // evidence = list of media URLs
router.delete('/:id', authenticate, async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const isSender   = deal.senderId   === req.user.id;
    const isTraveler = deal.travelerId === req.user.id;
    if (!isSender && !isTraveler) return res.status(403).json({ error: 'Not authorized' });

    const cancellableStatuses = ['OPEN', 'MATCHED', 'ESCROW_PAID', 'PICKED_UP', 'IN_TRANSIT'];
    if (!cancellableStatuses.includes(deal.status)) {
      return res.status(400).json({ error: `Cannot cancel a deal in status ${deal.status}` });
    }

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length < 10) {
      return res.status(400).json({ error: 'A cancellation reason of at least 10 characters is required.' });
    }
    const evidenceArr = Array.isArray(req.body?.evidence)
      ? req.body.evidence.filter((u: any) => typeof u === 'string').slice(0, 10)
      : [];

    await prisma.$transaction([
      prisma.deal.update({
        where: { id: deal.id },
        data: {
          status:          'CANCELLED',
          cancelledById:   req.user.id,
          cancelledByRole: isSender ? 'SENDER' : 'TRAVELER',
          cancelReason:    reason.slice(0, 1000),
          cancelEvidence:  evidenceArr.length ? JSON.stringify(evidenceArr) : null,
          cancelledAt:     new Date(),
        },
      }),
      prisma.trackingEvent.create({
        data: { dealId: deal.id, status: 'CANCELLED', actor: req.user.id },
      }),
    ]);

    releaseEscrowForCancellation(deal.id, deal.senderId).catch((e) =>
      logger.error('Escrow release failed on cancellation', { dealId: deal.id, error: String(e) })
    );

    const otherPartyId = isSender ? deal.travelerId : deal.senderId;
    if (otherPartyId) {
      push(otherPartyId, 'Deal cancelled',
        `The ${isSender ? 'sender' : 'traveler'} cancelled the deal${reason ? `: ${reason}` : ''}`,
        { type: 'deal_cancelled', dealId: deal.id });
    }

    res.json({ message: 'Deal cancelled', cancelledByRole: isSender ? 'SENDER' : 'TRAVELER' });
  } catch (error) { next(error); }
});

// POST /deals/:id/match — Traveler accepts a deal
router.post('/:id/match', authenticate, async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { sender: { select: { id: true, name: true } } },
    });
    if (!deal)                          return res.status(404).json({ error: 'Deal not found' });
    if (deal.status !== 'OPEN')         return res.status(400).json({ error: 'Deal is not open' });
    if (deal.senderId === req.user.id)  return res.status(400).json({ error: 'Cannot match your own deal' });

    const updatedDeal = await prisma.deal.update({
      where: { id: req.params.id, status: 'OPEN' },
      data: { travelerId: req.user.id, status: 'MATCHED' },
    }).catch(() => null);

    if (!updatedDeal) return res.status(409).json({ error: 'Deal is no longer available' });

    // Create chat room or add traveler to existing one
    const existingRoom = await prisma.chatRoom.findUnique({
      where: { dealId: deal.id },
      include: { participants: true },
    });
    if (!existingRoom) {
      await prisma.chatRoom.create({
        data: {
          dealId: deal.id,
          participants: {
            createMany: { data: [{ userId: deal.senderId }, { userId: req.user.id }] },
          },
        },
      });
    } else {
      // Ensure both sender and new traveler are participants
      const existingIds = existingRoom.participants.map((p: any) => p.userId);
      const toAdd = [deal.senderId, req.user.id].filter((id) => !existingIds.includes(id));
      if (toAdd.length > 0) {
        await prisma.chatParticipant.createMany({
          data: toAdd.map((userId) => ({ chatRoomId: existingRoom.id, userId })),
          skipDuplicates: true,
        });
      }
    }

    // 📦 Push: notify sender that a traveler accepted
    const traveler = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { name: true },
    });
    push(
      deal.senderId,
      '✅ Traveler Found',
      `${traveler?.name ?? 'A traveler'} will carry your package`,
      { type: 'deal_matched', dealId: deal.id, screen: 'DealDetails' }
    );

    res.json(updatedDeal);
  } catch (error) { next(error); }
});

// POST /deals/:id/pickup — Traveler marks package as picked up
router.post('/:id/pickup', authenticate, async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal)                            return res.status(404).json({ error: 'Deal not found' });
    if (deal.travelerId !== req.user.id)  return res.status(403).json({ error: 'Only traveler can mark as picked up' });

    const qrResult = await generateDealQR(deal.id, req.user.id);

    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({ where: { id: req.params.id }, data: { status: 'PICKED_UP', qrCode: qrResult.qrCode } }),
      prisma.trackingEvent.create({ data: { dealId: deal.id, status: 'PICKED_UP', actor: req.user.id } }),
    ]);

    // 🚀 Push: notify sender that package is on the way
    if (deal.senderId) {
      push(
        deal.senderId,
        '🚀 Package Picked Up',
        'Your package is on the way',
        { type: 'deal_pickup', dealId: deal.id, screen: 'Tracking' }
      );
    }

    res.json({ qrCode: qrResult.qrCode, deal: updatedDeal });
  } catch (error) { next(error); }
});

// POST /deals/:id/verify-qr
router.post('/:id/verify-qr', authenticate, async (req: any, res, next) => {
  try {
    const { qrPayload } = req.body;
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const verification = await verifyDealQR(req.params.id, qrPayload, req.user.id);
    if (!verification.verified) return res.status(400).json({ error: 'Invalid or expired QR code' });

    // verifyDealQR already updates deal status based on current state (MATCHED→PICKED_UP, IN_TRANSIT→DELIVERED)
    const updatedDeal = await prisma.deal.findUnique({ where: { id: req.params.id } });

    res.json({ verified: true, deal: updatedDeal, message: verification.message });
  } catch (error) { next(error); }
});

// POST /deals/:id/deliver — Traveler marks as delivered
router.post('/:id/deliver', authenticate, async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal)                            return res.status(404).json({ error: 'Deal not found' });
    if (deal.travelerId !== req.user.id)  return res.status(403).json({ error: 'Only traveler can mark as delivered' });

    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({ where: { id: req.params.id }, data: { status: 'DELIVERED' } }),
      prisma.trackingEvent.create({ data: { dealId: deal.id, status: 'DELIVERED', actor: req.user.id } }),
    ]);

    // 📦 Push sender: package delivered
    if (deal.senderId) {
      push(
        deal.senderId,
        '📦 Package Delivered',
        'Your package has been delivered. Tap to confirm.',
        { type: 'deal_delivered', dealId: deal.id, screen: 'DealDetails' }
      );
    }

    res.json(updatedDeal);
  } catch (error) { next(error); }
});

// POST /deals/:id/complete — Sender confirms completion
router.post('/:id/complete', authenticate, async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal)                         return res.status(404).json({ error: 'Deal not found' });
    if (deal.senderId !== req.user.id) return res.status(403).json({ error: 'Only sender can complete deal' });

    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({ where: { id: req.params.id }, data: { status: 'COMPLETED' } }),
      prisma.trackingEvent.create({ data: { dealId: deal.id, status: 'COMPLETED', actor: req.user.id } }),
    ]);

    // 🎉 Push BOTH parties: delivery complete + review prompt
    const recipients = [deal.senderId, deal.travelerId].filter(Boolean) as string[];
    pushMany(
      recipients,
      '🎉 Delivery Complete',
      'Tap to leave a review for your experience',
      { type: 'deal_completed', dealId: deal.id, screen: 'DealDetails' }
    );

    res.json(updatedDeal);
  } catch (error) { next(error); }
});

// GET /deals/:id/tracking
router.get('/:id/tracking', authenticate, async (req, res, next) => {
  try {
    const events = await prisma.trackingEvent.findMany({
      where: { dealId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json(events);
  } catch (error) { next(error); }
});

// ── Receiver Confirmation Flow ─────────────────────────────────────────────
// The sender shares a 6-digit receiver code with the person receiving the package.
// The receiver displays this code as a QR on their screen.
// The traveler scans the QR code from the receiver's phone to confirm delivery.

// POST /deals/:id/generate-receiver-code — Generate a receiver confirmation code
router.post('/:id/generate-receiver-code', authenticate, async (req: any, res, next) => {
  try {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (deal.senderId !== req.user.id) return res.status(403).json({ error: 'Only the sender can generate a receiver code' });

    // Generate a 6-digit confirmation code
    const crypto = require('crypto');
    const receiverCode = crypto.randomInt(100000, 999999).toString();

    await prisma.deal.update({
      where: { id: req.params.id },
      data: { receiverCode },
    });

    // Notify sender about the code
    push(deal.senderId, '📋 Receiver Code', `Share this code with your receiver: ${receiverCode}`, {
      type: 'receiver_code', dealId: deal.id, screen: 'Tracking',
    });

    res.json({ receiverCode, message: 'Share this code with your receiver. They will show it to the traveler.' });
  } catch (error) { next(error); }
});

// POST /deals/:id/verify-receiver-code — Traveler scans the receiver's QR to confirm delivery
router.post('/:id/verify-receiver-code', authenticate, async (req: any, res, next) => {
  try {
    const { receiverCode } = req.body;
    if (!receiverCode) return res.status(400).json({ error: 'receiverCode is required' });

    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (deal.travelerId !== req.user.id) return res.status(403).json({ error: 'Only the traveler can verify the receiver code' });
    if (!['IN_TRANSIT', 'PICKED_UP'].includes(deal.status)) {
      return res.status(400).json({ error: `Deal must be IN_TRANSIT or PICKED_UP to verify receiver code (current: ${deal.status})` });
    }
    if (!deal.receiverCode) return res.status(400).json({ error: 'No receiver code has been generated for this deal' });
    if (deal.receiverCode !== receiverCode) return res.status(400).json({ error: 'Invalid receiver code' });

    // Code matches — mark as DELIVERED
    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({
        where: { id: req.params.id },
        data: { status: 'DELIVERED', receiverCode: null }, // clear code after use
      }),
      prisma.trackingEvent.create({
        data: { dealId: deal.id, status: 'DELIVERED', actor: req.user.id, note: 'Delivery confirmed by receiver code scan' },
      }),
    ]);

    // Notify sender
    if (deal.senderId) {
      push(deal.senderId, '📦 Delivered!', 'Your package has been delivered and confirmed by the receiver.', {
        type: 'deal_delivered', dealId: deal.id, screen: 'DealDetails',
      });
    }

    res.json({ verified: true, deal: updatedDeal, message: 'Delivery confirmed successfully' });
  } catch (error) { next(error); }
});

// POST /deals/verify-sender-id — Verify sender ID (or receiver code) exists in the system
// Called before the receiver proceeds to scan QR code
router.post('/verify-sender-id', async (req: any, res, next) => {
  try {
    const { senderId } = req.body;

    console.log('=== verify-sender-id called ===');
    console.log('Input senderId:', senderId);
    console.log('Input type:', typeof senderId);

    if (!senderId) return res.status(400).json({ error: 'senderId is required' });

    // Try to find by senderId (UUID) - without status filter
    let deals = await prisma.deal.findMany({
      where: {
        senderId: senderId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, receiverCode: true },
    });

    console.log('Deals found by senderId:', deals?.length);

    // Also search by receiverCode (6-digit code) - without status filter
    let dealsByCode = await prisma.deal.findMany({
      where: {
        receiverCode: senderId,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, status: true, receiverCode: true },
    });

    console.log('Deals found by receiverCode:', dealsByCode?.length);

    // Get sample receiverCodes to debug
    const sampleDeals = await prisma.deal.findMany({
      take: 3,
      orderBy: { createdAt: 'desc' },
      select: { id: true, receiverCode: true, status: true },
    });
    console.log('Sample deals in DB:', sampleDeals);

    // Combine results
    const allDeals = [...(deals || []), ...(dealsByCode || [])];

    if (allDeals.length > 0) {
      res.json({ valid: true, dealId: allDeals[0].id, status: allDeals[0].status });
    } else {
      res.json({ valid: false, error: 'No delivery found for this code' });
    }
  } catch (error) { next(error); }
});

// POST /deals/receiver-verify — Unauthenticated receiver verification
// Allows a receiver to confirm delivery by scanning the traveler's QR code
// WITHOUT needing a login or signup. Takes receiver name, phone, and QR data.
router.post('/receiver-verify', async (req: any, res, next) => {
  try {
    const { dealId, receiverCode, receiverName, receiverPhone, senderId, whatsappId } = req.body;

    if (!dealId) return res.status(400).json({ error: 'dealId is required' });
    if (!senderId) return res.status(400).json({ error: 'senderId is required' });

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        sender: { select: { id: true, name: true } },
        traveler: { select: { id: true, name: true } },
      },
    });

    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Validate: the "delivery code" can be either the sender's UUID or the 6-digit receiverCode
    if (deal.senderId !== senderId && deal.receiverCode !== senderId) {
      return res.status(403).json({ error: 'Sender ID does not match this deal' });
    }

    if (!['IN_TRANSIT', 'PICKED_UP', 'ESCROW_PAID'].includes(deal.status)) {
      return res.status(400).json({
        error: `Deal must be IN_TRANSIT or PICKED_UP to verify (current: ${deal.status})`,
      });
    }

    if (receiverCode && deal.receiverCode && deal.receiverCode !== receiverCode) {
      return res.status(400).json({ error: 'Invalid receiver code' });
    }

    // Backfill any missing timeline stages so the saved DB timeline shows
    // every step as completed, not just the final DELIVERED one.
    const existingEvents = await prisma.trackingEvent.findMany({
      where: { dealId: deal.id },
      select: { status: true },
    });
    const seen = new Set(existingEvents.map((e) => e.status));
    const receiverNote = `Delivery confirmed by receiver${receiverName ? `: ${receiverName}` : ''}${receiverPhone ? ` (${receiverPhone}${whatsappId ? `, WA: ${whatsappId}` : ''})` : ''} (sender: ${senderId})`;
    const backfill: { status: string; actor: string; note: string }[] = [];
    if (!seen.has('PICKED_UP')) backfill.push({ status: 'PICKED_UP', actor: 'system', note: 'Auto-recorded at delivery confirmation' });
    if (!seen.has('IN_TRANSIT')) backfill.push({ status: 'IN_TRANSIT', actor: 'system', note: 'Auto-recorded at delivery confirmation' });
    backfill.push({ status: 'DELIVERED', actor: 'receiver', note: receiverNote });
    backfill.push({ status: 'COMPLETED', actor: 'system', note: 'Delivery confirmed — escrow released' });

    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({
        where: { id: dealId },
        data: {
          status: 'COMPLETED',
          receiverCode: null,
          deliveryDate: new Date(),
        },
      }),
      ...backfill.map((ev) =>
        prisma.trackingEvent.create({
          data: { dealId: deal.id, status: ev.status, actor: ev.actor, note: ev.note },
        }),
      ),
    ]);

    // Notify sender
    if (deal.senderId) {
      push(deal.senderId, '📦 Delivered!', `Your package has been delivered and confirmed${receiverName ? ` by ${receiverName}` : ''}.`, {
        type: 'deal_delivered', dealId: deal.id, screen: 'DealDetails',
      });
    }

    // Notify traveler
    if (deal.travelerId) {
      push(deal.travelerId, '📦 Delivery Confirmed', `${receiverName ? `Receiver ${receiverName}` : 'The receiver'} confirmed the delivery.`, {
        type: 'deal_delivered', dealId: deal.id, screen: 'DealDetails',
      });
    }

    res.json({
      verified: true,
      message: 'Delivery confirmed successfully',
      route: deal.fromCity && deal.toCity ? `${deal.fromCity} → ${deal.toCity}` : undefined,
      dealId: deal.id,
    });
  } catch (error) { next(error); }
});

// POST /deals/:id/counter
router.post('/:id/counter', authenticate, async (req: any, res, next) => {
  try {
    const { price } = req.body;
    if (!price || price < 0) return res.status(400).json({ error: 'Valid price is required' });

    const deal = await prisma.deal.findUnique({ where: { id: req.params.id } });
    if (!deal)              return res.status(404).json({ error: 'Deal not found' });
    if (deal.status !== 'OPEN') return res.status(400).json({ error: 'Deal is not open for negotiation' });

    await prisma.trackingEvent.create({
      data: {
        dealId: deal.id,
        status: 'COUNTER_OFFER',
        note: JSON.stringify({ price, offeredBy: req.user.id }),
        actor: req.user.id,
      },
    });

    // Push the other party about the counter offer
    const otherId = deal.senderId === req.user.id ? deal.travelerId : deal.senderId;
    if (otherId) {
      push(otherId, '💬 Counter Offer', `New price offer: ${price}`, {
        type: 'counter_offer', dealId: deal.id, screen: 'DealDetails',
      });
    }

    res.json({ success: true, counterPrice: price });
  } catch (error) { next(error); }
});

// ── Reservation Flow ──────────────────────────────────────────────────────
// POST /deals/:id/approve-reservation
// The receiver enters the traveler ID (sent via WhatsApp), then scans
// the traveler's QR code. This endpoint validates both and confirms delivery.
router.post('/:id/approve-reservation', authenticate, async (req: any, res, next) => {
  try {
    const { travelerId, qrData } = req.body;
    if (!travelerId) return res.status(400).json({ error: 'travelerId is required' });
    if (!qrData) return res.status(400).json({ error: 'qrData from QR scan is required' });

    const deal = await prisma.deal.findUnique({
      where: { id: req.params.id },
      include: { sender: { select: { id: true, name: true } } },
    });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Only the sender (or receiver if they have access) can approve
    if (deal.senderId !== req.user.id) {
      return res.status(403).json({ error: 'Only the sender can approve a reservation' });
    }

    // Validate deal is in a state that allows approval
    if (!['PICKED_UP', 'IN_TRANSIT'].includes(deal.status)) {
      return res.status(400).json({ error: `Deal must be PICKED_UP or IN_TRANSIT (current: ${deal.status})` });
    }

    // Validate travelerId matches the deal's assigned traveler
    if (deal.travelerId !== travelerId) {
      return res.status(400).json({ error: 'Traveler ID does not match the assigned traveler for this deal' });
    }

    // Parse and validate QR data
    let qrPayload: any;
    try {
      qrPayload = typeof qrData === 'string' ? JSON.parse(qrData) : qrData;
    } catch {
      return res.status(400).json({ error: 'Invalid QR code data' });
    }

    // Verify QR belongs to this deal
    if (qrPayload.dealId && qrPayload.dealId !== deal.id) {
      return res.status(400).json({ error: 'QR code does not belong to this deal' });
    }

    // If there's a qrSecret in the QR, verify it against stored hash
    if (qrPayload.secret && deal.qrSecret) {
      const bcrypt = require('bcrypt');
      const valid = await bcrypt.compare(qrPayload.secret, deal.qrSecret);
      if (!valid) return res.status(400).json({ error: 'Invalid QR code secret' });
    }

    // All checks passed — mark as DELIVERED
    const [updatedDeal] = await prisma.$transaction([
      prisma.deal.update({
        where: { id: deal.id },
        data: { status: 'DELIVERED' },
      }),
      prisma.trackingEvent.create({
        data: {
          dealId: deal.id,
          status: 'DELIVERED',
          actor: req.user.id,
          note: `Reservation approved. Traveler ${travelerId} confirmed via QR scan.`,
        },
      }),
    ]);

    // Notify both parties
    push(deal.senderId, '✅ Delivery Confirmed', 'Package has been delivered and verified.', {
      type: 'reservation_approved', dealId: deal.id, screen: 'DealDetails',
    });
    if (deal.travelerId) {
      push(deal.travelerId, '✅ Delivery Confirmed', 'The sender has confirmed receiving the package.', {
        type: 'reservation_approved', dealId: deal.id, screen: 'DealDetails',
      });
    }

    res.json({
      success: true,
      deal: updatedDeal,
      message: 'Reservation approved. Delivery confirmed.',
    });
  } catch (error) { next(error); }
});

export default router;
