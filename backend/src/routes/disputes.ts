// Dispute Routes — full state machine with admin notifications
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate } from '../middleware/validate';
import { createDisputeSchema, submitEvidenceSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { getIO } from '../services/websocket';
import { notifyAdminNewDispute } from '../services/adminNotificationService';
import logger from '../utils/logger';

const router = Router();

// ── Dispute status flow ────────────────────────────────────────────────────
// OPENED → EVIDENCE_SUBMITTED → ADMIN_REVIEWING
// → RESOLVED_FILER_WIN | RESOLVED_AGAINST_WIN | RESOLVED_SPLIT | CLOSED

// GET /disputes — list user's disputes
router.get('/', authenticate, async (req: any, res, next) => {
  try {
    const disputes = await prisma.dispute.findMany({
      where: {
        OR: [{ filerId: req.user.id }, { againstId: req.user.id }],
      },
      include: {
        deal: { select: { id: true, title: true, fromCity: true, toCity: true } },
        evidences: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(disputes);
  } catch (error) { next(error); }
});

// POST /disputes — open a new dispute
router.post('/', authenticate, validate(createDisputeSchema), async (req: any, res, next) => {
  try {
    const { dealId, reason, description } = req.validated || req.body;

    const deal = await prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const isSender = deal.senderId === req.user.id;
    const isTraveler = deal.travelerId === req.user.id;
    if (!isSender && !isTraveler) {
      return res.status(403).json({ error: 'Not a participant in this deal' });
    }

    const againstId = isSender ? deal.travelerId : deal.senderId;
    if (!againstId) {
      return res.status(400).json({ error: 'Cannot file dispute — deal has no matched counterparty' });
    }

    // Freeze the deal
    await prisma.deal.update({ where: { id: dealId }, data: { status: 'DISPUTED' } });

    const slaDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h

    const dispute = await prisma.dispute.create({
      data: {
        dealId,
        filerId: req.user.id,
        againstId,
        reason,
        description: description ?? null,
        slaDeadline,
      },
    });

    // Alert admins (fire-and-forget)
    notifyAdminNewDispute({
      id: dispute.id,
      dealId: dispute.dealId,
      reason: dispute.reason,
      slaDeadline: dispute.slaDeadline,
      filerId: dispute.filerId,
    }).catch((e) => logger.error('Admin dispute notification failed', { error: String(e) }));

    res.status(201).json(dispute);
  } catch (error) { next(error); }
});

// GET /disputes/:id — get dispute details
router.get('/:id', authenticate, async (req: any, res, next) => {
  try {
    const dispute = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      include: {
        deal: true,
        filer: { select: { id: true, name: true, avatar: true } },
        against: { select: { id: true, name: true, avatar: true } },
        evidences: { orderBy: { createdAt: 'asc' } },
      },
    });

    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (dispute.filerId !== req.user.id && dispute.againstId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const progressMap: Record<string, number> = {
      OPENED: 10,
      EVIDENCE_SUBMITTED: 40,
      ADMIN_REVIEWING: 70,
      RESOLVED_FILER_WIN: 100,
      RESOLVED_AGAINST_WIN: 100,
      RESOLVED_SPLIT: 100,
      CLOSED: 100,
    };

    res.json({ ...dispute, progress: progressMap[dispute.status] ?? 0 });
  } catch (error) { next(error); }
});

// POST /disputes/:id/evidence — submit evidence
router.post('/:id/evidence', authenticate, validate(submitEvidenceSchema), async (req: any, res, next) => {
  try {
    const { type = 'TEXT', content, url } = req.body;

    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    const isParticipant = dispute.filerId === req.user.id || dispute.againstId === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    if (dispute.status === 'RESOLVED_FILER_WIN'
      || dispute.status === 'RESOLVED_AGAINST_WIN'
      || dispute.status === 'RESOLVED_SPLIT'
      || dispute.status === 'CLOSED') {
      return res.status(400).json({ error: 'Dispute is already resolved' });
    }

    if (!content && !url) {
      return res.status(400).json({ error: 'content or url is required' });
    }

    const evidence = await prisma.disputeEvidence.create({
      data: {
        disputeId: dispute.id,
        uploaderId: req.user.id,
        type,
        content: content ?? null,
        url: url ?? null,
      },
    });

    // Advance state: once both parties have submitted, move to ADMIN_REVIEWING
    const evidenceCount = await prisma.disputeEvidence.count({ where: { disputeId: dispute.id } });
    const newStatus = evidenceCount >= 2 ? 'ADMIN_REVIEWING' : 'EVIDENCE_SUBMITTED';

    await prisma.dispute.update({
      where: { id: dispute.id },
      data: { status: newStatus },
    });

    res.status(201).json({ evidence, status: newStatus });
  } catch (error) { next(error); }
});

// POST /disputes/:id/mediator — escalate to admin review (any participant can escalate)
router.post('/:id/mediator', authenticate, async (req: any, res, next) => {
  try {
    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    const isParticipant = dispute.filerId === req.user.id || dispute.againstId === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    if (dispute.status.startsWith('RESOLVED') || dispute.status === 'CLOSED') {
      return res.status(400).json({ error: 'Dispute is already resolved' });
    }

    // Update dispute status + create AdminTask atomically
    const [, task] = await prisma.$transaction([
      prisma.dispute.update({
        where: { id: req.params.id },
        data:  { status: 'ADMIN_REVIEWING' },
      }),
      prisma.adminTask.create({
        data: {
          type:        'DISPUTE_REVIEW',
          referenceId: req.params.id,
          status:      'OPEN',
          notes:       `Dispute escalated by user ${req.user.id}. Deal: ${dispute.dealId}`,
        },
      }),
    ]);

    // Notify all connected admins in real-time
    const io = getIO();
    if (io) {
      io.to('admin_room').emit('new_admin_task', {
        taskId:     task.id,
        type:       task.type,
        disputeId:  req.params.id,
        dealId:     dispute.dealId,
        createdAt:  task.createdAt,
      });
    }

    logger.info('Dispute escalated to admin', { disputeId: req.params.id, taskId: task.id });

    res.json({ success: true, message: 'Admin has been notified and will review within 24h', taskId: task.id });
  } catch (error) { next(error); }
});

// GET /admin/tasks — list open admin tasks (admin-only)
router.get('/admin/tasks', authenticate, async (req: any, res, next) => {
  const { requireAdmin } = await import('../middleware/requireAdmin');
  // Inline guard
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  try {
    const { status = 'OPEN', page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const [tasks, total] = await Promise.all([
      prisma.adminTask.findMany({
        where: status ? { status: String(status) } : {},
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit),
      }),
      prisma.adminTask.count({ where: status ? { status: String(status) } : {} }),
    ]);
    res.json({ tasks, total, page: Number(page), hasMore: skip + Number(limit) < total });
  } catch (error) { next(error); }
});

// PATCH /admin/tasks/:id/assign — assign a task to an admin
router.patch('/admin/tasks/:id/assign', authenticate, async (req: any, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  try {
    const { assignedTo } = req.body;
    const task = await prisma.adminTask.update({
      where: { id: req.params.id },
      data:  { assignedTo: assignedTo || req.user.id, status: 'IN_PROGRESS' },
    });
    res.json(task);
  } catch (error) { next(error); }
});

// PATCH /disputes/:id/resolve — admin-only resolution (requireAdmin enforced)
// All DB mutations run inside a prisma.$transaction to guarantee atomicity.
router.patch('/:id/resolve', authenticate, requireAdmin, async (req: any, res, next) => {
  try {
    const { outcome, resolution } = req.body;
    // outcome: FILER_WIN | AGAINST_WIN | SPLIT | CLOSED

    const VALID_OUTCOMES = ['FILER_WIN', 'AGAINST_WIN', 'SPLIT', 'CLOSED'] as const;
    if (!VALID_OUTCOMES.includes(outcome)) {
      return res.status(400).json({ error: `outcome must be one of: ${VALID_OUTCOMES.join(', ')}` });
    }
    if (!resolution || resolution.length < 5) {
      return res.status(400).json({ error: 'resolution text required (min 5 chars)' });
    }

    const dispute = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      include: { deal: true },
    });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    // Idempotency: return 409 if already resolved
    if (dispute.status.startsWith('RESOLVED') || dispute.status === 'CLOSED') {
      return res.status(409).json({ error: 'Dispute already resolved' });
    }

    const updatedStatus = `RESOLVED_${outcome}` as string;
    const dealAmount = dispute.deal?.price ?? 0;

    // ── Atomic transaction: update dispute + deal + wallet balances ──────────
    const updated = await prisma.$transaction(async (tx) => {
      // 1. Resolve the dispute
      const resolvedDispute = await tx.dispute.update({
        where: { id: req.params.id },
        data: {
          status: updatedStatus,
          resolution,
          resolvedById: req.user.id,
        },
      });

      // 2. Update the deal status
      if (outcome !== 'CLOSED') {
        const dealStatus = outcome === 'FILER_WIN' ? 'CANCELLED' : 'COMPLETED';
        await tx.deal.update({
          where: { id: dispute.dealId },
          data: { status: dealStatus },
        });
      }

      // 3. Award funds based on outcome
      if (outcome === 'FILER_WIN' && dealAmount > 0) {
        // Refund sender (filer is typically the sender)
        await tx.user.update({
          where: { id: dispute.filerId },
          data: { walletBalance: { increment: dealAmount } },
        });
        await tx.transaction.create({
          data: {
            userId: dispute.filerId,
            dealId: dispute.dealId,
            type: 'REFUND',
            amount: dealAmount,
            status: 'COMPLETED',
            metadata: JSON.stringify({ reason: 'dispute_filer_win', disputeId: dispute.id }),
          },
        });
      } else if (outcome === 'AGAINST_WIN' && dealAmount > 0) {
        // Release escrow to traveler (againstId is traveler)
        await tx.user.update({
          where: { id: dispute.againstId },
          data: { walletBalance: { increment: dealAmount } },
        });
        await tx.transaction.create({
          data: {
            userId: dispute.againstId,
            dealId: dispute.dealId,
            type: 'ESCROW_RELEASE',
            amount: dealAmount,
            status: 'COMPLETED',
            metadata: JSON.stringify({ reason: 'dispute_against_win', disputeId: dispute.id }),
          },
        });
      } else if (outcome === 'SPLIT' && dealAmount > 0) {
        const half = dealAmount / 2;
        await tx.user.update({ where: { id: dispute.filerId }, data: { walletBalance: { increment: half } } });
        await tx.user.update({ where: { id: dispute.againstId }, data: { walletBalance: { increment: half } } });
        await tx.transaction.createMany({
          data: [
            { userId: dispute.filerId, dealId: dispute.dealId, type: 'REFUND', amount: half, status: 'COMPLETED', metadata: JSON.stringify({ reason: 'dispute_split', disputeId: dispute.id }) },
            { userId: dispute.againstId, dealId: dispute.dealId, type: 'ESCROW_RELEASE', amount: half, status: 'COMPLETED', metadata: JSON.stringify({ reason: 'dispute_split', disputeId: dispute.id }) },
          ],
        });
      }

      return resolvedDispute;
    });

    // Notify both parties via socket (after transaction commits)
    const io = getIO();
    if (io) {
      const payload = { disputeId: dispute.id, outcome, resolution };
      io.to(`user:${dispute.filerId}`).emit('dispute_resolved', payload);
      io.to(`user:${dispute.againstId}`).emit('dispute_resolved', payload);
    }

    logger.info('Dispute resolved', {
      disputeId: dispute.id,
      outcome,
      resolvedBy: req.user.id,
    });

    res.json(updated);
  } catch (error) { next(error); }
});

export default router;
