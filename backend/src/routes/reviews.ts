// Review Routes — with ML sentiment + fraud analysis
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate } from '../middleware/validate';
import { createReviewSchema } from '../validators/auth';
import { prisma } from '../config/db';
import logger from '../utils/logger';
import { analyzeReview } from '../ml/reviews/reviewML';
import { sendPushNotification } from '../services/pushService';

const router = Router();

// POST /reviews — Create a review (calls ML analysis first)
router.post('/', authenticate, validate(createReviewSchema), async (req: any, res, next) => {
  try {
    const { dealId, targetId, rating, comment } = req.validated || req.body;
    const authorId = req.user.id;

    if (authorId === targetId) {
      return res.status(400).json({ error: 'Cannot review yourself' });
    }

    // Verify deal exists and is completed
    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });
    if (deal.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Can only review completed deals' });
    }

    // Verify author is part of the deal
    if (deal.senderId !== authorId && deal.travelerId !== authorId) {
      return res.status(403).json({ error: 'Not authorized to review this deal' });
    }

    // Verify target is the other party
    if (deal.senderId !== targetId && deal.travelerId !== targetId) {
      return res.status(400).json({ error: 'Target must be the other party in the deal' });
    }

    // ── ML analysis ────────────────────────────────────────────────────────
    let sentiment: string | undefined;
    let fraudScore: number | undefined;
    let flagged = false;
    let status = 'approved';

    try {
      const analysis = await analyzeReview({
        reviewText: comment,
        rating,
        userId: authorId,
        targetId,
      });
      sentiment  = analysis.sentiment;
      fraudScore = analysis.fraudScore;
      flagged    = analysis.flagged;
      status     = analysis.status;

      if (flagged) {
        logger.warn('Review flagged for moderation', {
          module: 'reviews',
          authorId,
          targetId,
          fraudScore,
          reason: analysis.reason,
        });
      }
    } catch (mlErr) {
      // ML failure must NOT block review creation — degrade gracefully
      logger.error('ML review analysis failed (non-blocking)', {
        module: 'reviews',
        error: String(mlErr),
      });
    }

    // Persist
    const review = await prisma.review.create({
      data: {
        dealId,
        authorId,
        targetId,
        rating,
        comment,
        sentiment,
        fraudScore,
        flagged,
        status,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    // Recalculate target user's average rating (only approved reviews)
    const aggregation = await prisma.review.aggregate({
      where: { targetId, status: 'approved' },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.user.update({
      where: { id: targetId },
      data: { rating: aggregation._avg.rating ?? 0 },
    });

    // Push notification to reviewee
    try {
      await sendPushNotification(
        targetId,
        '⭐ New Review',
        `You received a ${rating}-star review`,
        { type: 'review', reviewId: review.id, screen: 'Profile' }
      );
    } catch { /* non-blocking */ }

    logger.info(`Review created for deal ${dealId} by ${authorId} [status=${status}]`);
    res.status(201).json(review);
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'You have already reviewed this deal' });
    }
    next(error);
  }
});

// GET /reviews/user/:userId — Get all reviews for a user (approved only by default)
router.get('/user/:userId', authenticate, async (req: any, res, next) => {
  try {
    const { page = 1, limit = 20, includeModerated = 'false' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    // Admin or self can see moderated reviews
    const showAll =
      includeModerated === 'true' &&
      (req.user.id === req.params.userId);

    const where: any = { targetId: req.params.userId };
    if (!showAll) where.status = 'approved';

    const [items, total, avgData] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          deal:   { select: { id: true, title: true } },
        },
        skip,
        take,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.review.count({ where }),
      prisma.review.aggregate({
        where: { targetId: req.params.userId, status: 'approved' },
        _avg: { rating: true },
        _count: true,
      }),
    ]);

    res.json({
      items,
      total,
      page: Number(page),
      limit: Number(limit),
      hasMore: skip + take < total,
      averageRating: Math.round((avgData._avg.rating ?? 0) * 10) / 10,
      reviewCount: avgData._count,
    });
  } catch (error) {
    next(error);
  }
});

// GET /reviews/delivery/:dealId — Get review for a specific deal
router.get('/delivery/:dealId', authenticate, async (req: any, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { dealId: req.params.dealId },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        target: { select: { id: true, name: true, avatar: true } },
      },
    });
    res.json(reviews);
  } catch (error) {
    next(error);
  }
});

// PATCH /reviews/:id/moderate — Admin: approve or reject flagged review
router.patch('/:id/moderate', authenticate, requireAdmin, async (req: any, res, next) => {
  try {
    const { action } = req.body; // 'approve' | 'reject'
    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approve" or "reject"' });
    }

    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) return res.status(404).json({ error: 'Review not found' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const updated = await prisma.review.update({
      where: { id: req.params.id },
      data: { status: newStatus, flagged: false },
    });

    // Re-calculate rating if status changed
    if (newStatus === 'approved' || review.status === 'approved') {
      const agg = await prisma.review.aggregate({
        where: { targetId: review.targetId, status: 'approved' },
        _avg: { rating: true },
      });
      await prisma.user.update({
        where: { id: review.targetId! },
        data: { rating: agg._avg.rating ?? 0 },
      });
    }

    logger.info(`Review ${req.params.id} moderated: ${newStatus}`);
    res.json(updated);
  } catch (error) {
    next(error);
  }
});

// GET /reviews/flagged — Get all flagged reviews (admin only)
router.get('/flagged', authenticate, requireAdmin, async (_req, res, next) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { flagged: true },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        target: { select: { id: true, name: true, avatar: true } },
        deal:   { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items: reviews, count: reviews.length });
  } catch (error) {
    next(error);
  }
});

export default router;
