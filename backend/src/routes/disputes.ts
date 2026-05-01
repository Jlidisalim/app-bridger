// Dispute Routes — comprehensive File Dispute Management System
//
// Lifecycle:
//   OPENED → EVIDENCE_SUBMITTED → ADMIN_REVIEWING
//   → RESOLVED_FILER_WIN | RESOLVED_AGAINST_WIN | RESOLVED_SPLIT | CLOSED
//
// Every state transition, evidence submission, and message exchange is:
//   1. Validated server-side via Zod schemas
//   2. Persisted in the relational DB (Dispute, DisputeEvidence,
//      DisputeMessage, DisputeTimelineEvent)
//   3. Audit-logged in AuditLog
//   4. Broadcast in real-time over Socket.IO

import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';
import { validate } from '../middleware/validate';
import {
  createDisputeSchema,
  submitEvidenceSchema,
  sendDisputeMessageSchema,
  disputeFiltersSchema,
} from '../validators/auth';
import { prisma } from '../config/db';
import { getIO } from '../services/websocket';
import { notifyAdminNewDispute } from '../services/adminNotificationService';
import {
  saveBuffer,
  saveRawBuffer,
  sanitizeFilename,
  getUploadUrl,
  ALLOWED_MIME_TYPES,
  MAX_FILES_PER_REQUEST,
} from '../services/uploadService';
import logger from '../utils/logger';

const router = Router();

// Allowed mime types for dispute evidence/attachments — images, videos, PDF
const EVIDENCE_VIDEO_MIME = ['video/mp4', 'video/quicktime', 'video/webm'];
const EVIDENCE_DOC_MIME   = ['application/pdf'];

const evidenceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: MAX_FILES_PER_REQUEST },
  fileFilter(_req, file, cb) {
    if (
      ALLOWED_MIME_TYPES.includes(file.mimetype) ||
      EVIDENCE_VIDEO_MIME.includes(file.mimetype) ||
      EVIDENCE_DOC_MIME.includes(file.mimetype)
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WebP, GIF, MP4, MOV, WebM, or PDF files are allowed'));
    }
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

const RESOLVED_STATES = new Set([
  'RESOLVED_FILER_WIN',
  'RESOLVED_AGAINST_WIN',
  'RESOLVED_SPLIT',
  'CLOSED',
]);

function actorRole(dispute: { filerId: string; againstId: string }, userId: string, isAdmin = false): string {
  if (isAdmin) return 'ADMIN';
  if (dispute.filerId === userId) return 'FILER';
  if (dispute.againstId === userId) return 'AGAINST';
  return 'SYSTEM';
}

function progressFor(status: string): number {
  const map: Record<string, number> = {
    OPENED: 10,
    EVIDENCE_SUBMITTED: 40,
    ADMIN_REVIEWING: 70,
    RESOLVED_FILER_WIN: 100,
    RESOLVED_AGAINST_WIN: 100,
    RESOLVED_SPLIT: 100,
    CLOSED: 100,
  };
  return map[status] ?? 0;
}

async function recordTimeline(
  tx: any,
  args: {
    disputeId: string;
    eventType: string;
    actorId: string | null;
    actorRole: string;
    description: string;
    metadata?: Record<string, unknown>;
  },
) {
  return tx.disputeTimelineEvent.create({
    data: {
      disputeId: args.disputeId,
      eventType: args.eventType,
      actorId: args.actorId,
      actorRole: args.actorRole,
      description: args.description,
      metadata: args.metadata ? JSON.stringify(args.metadata) : null,
    },
  });
}

async function recordAudit(
  tx: any,
  args: {
    userId: string | null;
    entityId: string;
    action: string;
    metadata?: Record<string, unknown>;
    ipAddress?: string;
  },
) {
  return tx.auditLog.create({
    data: {
      userId: args.userId,
      entityId: args.entityId,
      entityType: 'DISPUTE',
      action: args.action,
      ipAddress: args.ipAddress ?? null,
      metadata: args.metadata ? JSON.stringify(args.metadata) : null,
    },
  });
}

function emitToDispute(disputeId: string, filerId: string, againstId: string, event: string, payload: any) {
  const io = getIO();
  if (!io) return;
  io.to(`dispute:${disputeId}`).emit(event, payload);
  io.to(`user:${filerId}`).emit(event, payload);
  io.to(`user:${againstId}`).emit(event, payload);
}

// ── GET /disputes — list user's disputes (optionally filtered by dealId) ────
router.get('/', authenticate, validate(disputeFiltersSchema, 'query'), async (req: any, res, next) => {
  try {
    const { dealId, status, page, limit } = req.validated;
    const skip = (page - 1) * limit;

    const where: any = {
      OR: [{ filerId: req.user.id }, { againstId: req.user.id }],
    };
    if (dealId) where.dealId = dealId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.dispute.findMany({
        where,
        include: {
          deal: { select: { id: true, title: true, fromCity: true, toCity: true, price: true, currency: true } },
          filer: { select: { id: true, name: true, avatar: true, profilePhoto: true } },
          against: { select: { id: true, name: true, avatar: true, profilePhoto: true } },
          _count: { select: { evidences: true, messages: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.dispute.count({ where }),
    ]);

    res.json({
      items: items.map((d) => ({ ...d, progress: progressFor(d.status) })),
      page,
      limit,
      total,
      hasMore: skip + items.length < total,
    });
  } catch (error) { next(error); }
});

// ── POST /disputes — open a new dispute ─────────────────────────────────────
router.post('/', authenticate, validate(createDisputeSchema), async (req: any, res, next) => {
  try {
    const { dealId, disputeType, reason, description } = req.validated;

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

    // Block duplicate open disputes for this deal by the same filer
    const existingOpen = await prisma.dispute.findFirst({
      where: {
        dealId,
        filerId: req.user.id,
        status: { notIn: Array.from(RESOLVED_STATES) },
      },
    });
    if (existingOpen) {
      return res.status(409).json({
        error: 'You already have an open dispute on this deal',
        disputeId: existingOpen.id,
      });
    }

    const slaDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000);

    const dispute = await prisma.$transaction(async (tx) => {
      const created = await tx.dispute.create({
        data: {
          dealId,
          filerId: req.user.id,
          againstId,
          disputeType,
          reason,
          description: description ?? null,
          slaDeadline,
        },
      });

      await tx.deal.update({ where: { id: dealId }, data: { status: 'DISPUTED' } });

      await recordTimeline(tx, {
        disputeId: created.id,
        eventType: 'OPENED',
        actorId: req.user.id,
        actorRole: 'FILER',
        description: `Dispute opened (${disputeType.replace(/_/g, ' ').toLowerCase()})`,
        metadata: { reason, disputeType },
      });

      // System welcome message in the dispute thread
      await tx.disputeMessage.create({
        data: {
          disputeId: created.id,
          senderId: null,
          senderRole: 'SYSTEM',
          content:
            'Dispute opened. Please add any supporting evidence and use this thread ' +
            'to communicate. A Bridger mediator will review within 72 hours.',
        },
      });

      await recordAudit(tx, {
        userId: req.user.id,
        entityId: created.id,
        action: 'CREATE',
        metadata: { dealId, disputeType, reason },
        ipAddress: req.ip,
      });

      return created;
    });

    notifyAdminNewDispute({
      id: dispute.id,
      dealId: dispute.dealId,
      reason: dispute.reason,
      slaDeadline: dispute.slaDeadline,
      filerId: dispute.filerId,
    }).catch((e) => logger.error('Admin dispute notification failed', { error: String(e) }));

    emitToDispute(dispute.id, dispute.filerId, dispute.againstId, 'dispute_opened', {
      disputeId: dispute.id,
      dealId: dispute.dealId,
      filerId: dispute.filerId,
      againstId: dispute.againstId,
      status: dispute.status,
    });

    res.status(201).json(dispute);
  } catch (error) { next(error); }
});

// ── GET /disputes/:id — full details (info dashboard) ───────────────────────
router.get('/:id', authenticate, async (req: any, res, next) => {
  try {
    const dispute = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      include: {
        deal: true,
        filer: { select: { id: true, name: true, avatar: true, profilePhoto: true, phone: true } },
        against: { select: { id: true, name: true, avatar: true, profilePhoto: true, phone: true } },
        evidences: { orderBy: { createdAt: 'asc' } },
        _count: { select: { messages: true, timeline: true } },
      },
    });

    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (
      dispute.filerId !== req.user.id &&
      dispute.againstId !== req.user.id &&
      !req.user.isAdmin
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    res.json({ ...dispute, progress: progressFor(dispute.status) });
  } catch (error) { next(error); }
});

// ── GET /disputes/:id/timeline — chronological event log ────────────────────
router.get('/:id/timeline', authenticate, async (req: any, res, next) => {
  try {
    const dispute = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      select: { id: true, filerId: true, againstId: true },
    });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (
      dispute.filerId !== req.user.id &&
      dispute.againstId !== req.user.id &&
      !req.user.isAdmin
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const events = await prisma.disputeTimelineEvent.findMany({
      where: { disputeId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      items: events.map((e) => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
      })),
    });
  } catch (error) { next(error); }
});

// ── POST /disputes/:id/evidence — submit text/url evidence (JSON) ──────────
router.post('/:id/evidence', authenticate, validate(submitEvidenceSchema), async (req: any, res, next) => {
  try {
    const { type, content, url } = req.validated;

    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    const isParticipant = dispute.filerId === req.user.id || dispute.againstId === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    if (RESOLVED_STATES.has(dispute.status)) {
      return res.status(400).json({ error: 'Dispute is already resolved' });
    }

    const role = actorRole(dispute, req.user.id);

    const result = await prisma.$transaction(async (tx) => {
      const evidence = await tx.disputeEvidence.create({
        data: {
          disputeId: dispute.id,
          uploaderId: req.user.id,
          type,
          content: content ?? null,
          url: url ?? null,
        },
      });

      // Advance state once evidence has been submitted (don't downgrade once
      // the dispute is already in admin review).
      const evidenceCount = await tx.disputeEvidence.count({ where: { disputeId: dispute.id } });
      let newStatus = dispute.status;
      if (dispute.status === 'OPENED') {
        newStatus = 'EVIDENCE_SUBMITTED';
      }
      if (evidenceCount >= 2 && dispute.status !== 'ADMIN_REVIEWING') {
        newStatus = 'ADMIN_REVIEWING';
      }
      if (newStatus !== dispute.status) {
        await tx.dispute.update({ where: { id: dispute.id }, data: { status: newStatus } });
      }

      await recordTimeline(tx, {
        disputeId: dispute.id,
        eventType: 'EVIDENCE_ADDED',
        actorId: req.user.id,
        actorRole: role,
        description: `${role === 'FILER' ? 'Filer' : 'Respondent'} submitted ${type.toLowerCase()} evidence`,
        metadata: { evidenceId: evidence.id, type },
      });

      if (newStatus !== dispute.status) {
        await recordTimeline(tx, {
          disputeId: dispute.id,
          eventType: newStatus,
          actorId: null,
          actorRole: 'SYSTEM',
          description:
            newStatus === 'ADMIN_REVIEWING'
              ? 'Both parties submitted evidence — escalated to admin review'
              : 'Evidence submitted',
        });
      }

      await recordAudit(tx, {
        userId: req.user.id,
        entityId: dispute.id,
        action: 'ADD_EVIDENCE',
        metadata: { evidenceId: evidence.id, type },
        ipAddress: req.ip,
      });

      return { evidence, status: newStatus };
    });

    emitToDispute(dispute.id, dispute.filerId, dispute.againstId, 'dispute_evidence_added', {
      disputeId: dispute.id,
      evidence: result.evidence,
      status: result.status,
    });

    res.status(201).json(result);
  } catch (error) { next(error); }
});

// ── POST /disputes/:id/evidence/upload — upload an evidence file (multipart) ─
// Accepts a single `file` field; optional `caption` text body field.
router.post(
  '/:id/evidence/upload',
  authenticate,
  evidenceUpload.single('file'),
  async (req: any, res, next) => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: 'file is required' });

      const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
      if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

      const isParticipant = dispute.filerId === req.user.id || dispute.againstId === req.user.id;
      if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

      if (RESOLVED_STATES.has(dispute.status)) {
        return res.status(400).json({ error: 'Dispute is already resolved' });
      }

      // Determine logical type + persist file to disk
      let evidenceType: 'PHOTO' | 'VIDEO' | 'DOCUMENT';
      let url: string;
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        evidenceType = 'PHOTO';
        url = await saveBuffer(file.buffer, file.mimetype, 'dispute', `ev_${Date.now()}`);
      } else if (EVIDENCE_VIDEO_MIME.includes(file.mimetype)) {
        evidenceType = 'VIDEO';
        const ext = file.mimetype === 'video/mp4' ? '.mp4'
          : file.mimetype === 'video/webm' ? '.webm'
          : '.mov';
        const filename = `ev_${Date.now()}_${sanitizeFilename(file.originalname || 'video').split('.')[0]}${ext}`;
        url = await saveRawBuffer(file.buffer, 'dispute', filename);
      } else {
        evidenceType = 'DOCUMENT';
        const filename = `ev_${Date.now()}_${sanitizeFilename(file.originalname || 'doc.pdf')}`;
        url = await saveRawBuffer(file.buffer, 'dispute', filename);
      }

      const role = actorRole(dispute, req.user.id);
      const caption = typeof req.body.caption === 'string' ? req.body.caption.slice(0, 500) : null;

      const result = await prisma.$transaction(async (tx) => {
        const evidence = await tx.disputeEvidence.create({
          data: {
            disputeId: dispute.id,
            uploaderId: req.user.id,
            type: evidenceType,
            url,
            content: caption,
            fileName: sanitizeFilename(file.originalname || ''),
            fileSize: file.size,
            mimeType: file.mimetype,
          },
        });

        const evidenceCount = await tx.disputeEvidence.count({ where: { disputeId: dispute.id } });
        let newStatus = dispute.status;
        if (dispute.status === 'OPENED') newStatus = 'EVIDENCE_SUBMITTED';
        if (evidenceCount >= 2 && dispute.status !== 'ADMIN_REVIEWING') newStatus = 'ADMIN_REVIEWING';
        if (newStatus !== dispute.status) {
          await tx.dispute.update({ where: { id: dispute.id }, data: { status: newStatus } });
        }

        await recordTimeline(tx, {
          disputeId: dispute.id,
          eventType: 'EVIDENCE_ADDED',
          actorId: req.user.id,
          actorRole: role,
          description: `${role === 'FILER' ? 'Filer' : 'Respondent'} uploaded ${evidenceType.toLowerCase()} evidence`,
          metadata: { evidenceId: evidence.id, type: evidenceType, fileName: evidence.fileName },
        });

        if (newStatus !== dispute.status) {
          await recordTimeline(tx, {
            disputeId: dispute.id,
            eventType: newStatus,
            actorId: null,
            actorRole: 'SYSTEM',
            description:
              newStatus === 'ADMIN_REVIEWING'
                ? 'Both parties submitted evidence — escalated to admin review'
                : 'Evidence submitted',
          });
        }

        await recordAudit(tx, {
          userId: req.user.id,
          entityId: dispute.id,
          action: 'UPLOAD_EVIDENCE',
          metadata: { evidenceId: evidence.id, type: evidenceType, mimeType: file.mimetype, size: file.size },
          ipAddress: req.ip,
        });

        return { evidence, status: newStatus };
      });

      emitToDispute(dispute.id, dispute.filerId, dispute.againstId, 'dispute_evidence_added', {
        disputeId: dispute.id,
        evidence: result.evidence,
        status: result.status,
      });

      res.status(201).json(result);
    } catch (error) { next(error); }
  },
);

// ── GET /disputes/:id/messages — paginated thread history ───────────────────
router.get('/:id/messages', authenticate, async (req: any, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const dispute = await prisma.dispute.findUnique({
      where: { id: req.params.id },
      select: { id: true, filerId: true, againstId: true },
    });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
    if (
      dispute.filerId !== req.user.id &&
      dispute.againstId !== req.user.id &&
      !req.user.isAdmin
    ) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const [items, total] = await Promise.all([
      prisma.disputeMessage.findMany({
        where: { disputeId: req.params.id },
        orderBy: { createdAt: 'asc' },
        skip,
        take: Number(limit),
      }),
      prisma.disputeMessage.count({ where: { disputeId: req.params.id } }),
    ]);

    res.json({ items, page: Number(page), limit: Number(limit), total, hasMore: skip + items.length < total });
  } catch (error) { next(error); }
});

// ── POST /disputes/:id/messages — send a text message ──────────────────────
router.post(
  '/:id/messages',
  authenticate,
  validate(sendDisputeMessageSchema),
  async (req: any, res, next) => {
    try {
      const { content } = req.validated;

      const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
      if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

      const isParticipant = dispute.filerId === req.user.id || dispute.againstId === req.user.id;
      if (!isParticipant && !req.user.isAdmin) return res.status(403).json({ error: 'Not authorized' });

      if (RESOLVED_STATES.has(dispute.status)) {
        return res.status(400).json({ error: 'Dispute is already resolved — thread is read-only' });
      }

      const role = actorRole(dispute, req.user.id, req.user.isAdmin);

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.disputeMessage.create({
          data: {
            disputeId: dispute.id,
            senderId: req.user.id,
            senderRole: role,
            content,
          },
        });

        await recordTimeline(tx, {
          disputeId: dispute.id,
          eventType: 'MESSAGE_SENT',
          actorId: req.user.id,
          actorRole: role,
          description: `${role.toLowerCase()} sent a message`,
          metadata: { messageId: created.id, preview: content.slice(0, 80) },
        });

        await recordAudit(tx, {
          userId: req.user.id,
          entityId: dispute.id,
          action: 'SEND_MESSAGE',
          metadata: { messageId: created.id, length: content.length },
          ipAddress: req.ip,
        });

        return created;
      });

      emitToDispute(dispute.id, dispute.filerId, dispute.againstId, 'dispute_message', message);

      res.status(201).json(message);
    } catch (error) { next(error); }
  },
);

// ── POST /disputes/:id/messages/attachment — send a file attachment ────────
router.post(
  '/:id/messages/attachment',
  authenticate,
  evidenceUpload.single('file'),
  async (req: any, res, next) => {
    try {
      const file = req.file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ error: 'file is required' });

      const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
      if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

      const isParticipant = dispute.filerId === req.user.id || dispute.againstId === req.user.id;
      if (!isParticipant && !req.user.isAdmin) return res.status(403).json({ error: 'Not authorized' });

      if (RESOLVED_STATES.has(dispute.status)) {
        return res.status(400).json({ error: 'Dispute is already resolved — thread is read-only' });
      }

      let attachmentType: 'image' | 'video' | 'document';
      let url: string;
      if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        attachmentType = 'image';
        url = await saveBuffer(file.buffer, file.mimetype, 'dispute', `msg_${Date.now()}`);
      } else if (EVIDENCE_VIDEO_MIME.includes(file.mimetype)) {
        attachmentType = 'video';
        const ext = file.mimetype === 'video/mp4' ? '.mp4'
          : file.mimetype === 'video/webm' ? '.webm'
          : '.mov';
        const filename = `msg_${Date.now()}_${sanitizeFilename(file.originalname || 'video').split('.')[0]}${ext}`;
        url = await saveRawBuffer(file.buffer, 'dispute', filename);
      } else {
        attachmentType = 'document';
        const filename = `msg_${Date.now()}_${sanitizeFilename(file.originalname || 'doc')}`;
        url = await saveRawBuffer(file.buffer, 'dispute', filename);
      }

      const role = actorRole(dispute, req.user.id, req.user.isAdmin);
      const caption = typeof req.body.caption === 'string' ? req.body.caption.slice(0, 500) : null;

      const message = await prisma.$transaction(async (tx) => {
        const created = await tx.disputeMessage.create({
          data: {
            disputeId: dispute.id,
            senderId: req.user.id,
            senderRole: role,
            content: caption,
            attachmentUrl: url,
            attachmentType,
            attachmentName: sanitizeFilename(file.originalname || ''),
            attachmentSize: file.size,
          },
        });

        await recordTimeline(tx, {
          disputeId: dispute.id,
          eventType: 'MESSAGE_SENT',
          actorId: req.user.id,
          actorRole: role,
          description: `${role.toLowerCase()} sent a ${attachmentType} attachment`,
          metadata: { messageId: created.id, attachmentType, fileName: created.attachmentName },
        });

        await recordAudit(tx, {
          userId: req.user.id,
          entityId: dispute.id,
          action: 'SEND_ATTACHMENT',
          metadata: {
            messageId: created.id,
            attachmentType,
            mimeType: file.mimetype,
            size: file.size,
          },
          ipAddress: req.ip,
        });

        return created;
      });

      emitToDispute(dispute.id, dispute.filerId, dispute.againstId, 'dispute_message', message);

      res.status(201).json(message);
    } catch (error) { next(error); }
  },
);

// ── POST /disputes/:id/mediator — escalate to admin review ──────────────────
router.post('/:id/mediator', authenticate, async (req: any, res, next) => {
  try {
    const dispute = await prisma.dispute.findUnique({ where: { id: req.params.id } });
    if (!dispute) return res.status(404).json({ error: 'Dispute not found' });

    const isParticipant = dispute.filerId === req.user.id || dispute.againstId === req.user.id;
    if (!isParticipant) return res.status(403).json({ error: 'Not authorized' });

    if (RESOLVED_STATES.has(dispute.status)) {
      return res.status(400).json({ error: 'Dispute is already resolved' });
    }

    const role = actorRole(dispute, req.user.id);

    const [, task] = await prisma.$transaction([
      prisma.dispute.update({
        where: { id: req.params.id },
        data: { status: 'ADMIN_REVIEWING' },
      }),
      prisma.adminTask.create({
        data: {
          type: 'DISPUTE_REVIEW',
          referenceId: req.params.id,
          status: 'OPEN',
          notes: `Dispute escalated by user ${req.user.id}. Deal: ${dispute.dealId}`,
        },
      }),
      prisma.disputeTimelineEvent.create({
        data: {
          disputeId: dispute.id,
          eventType: 'ESCALATED',
          actorId: req.user.id,
          actorRole: role,
          description: `${role === 'FILER' ? 'Filer' : 'Respondent'} escalated to mediator`,
        },
      }),
      prisma.disputeMessage.create({
        data: {
          disputeId: dispute.id,
          senderId: null,
          senderRole: 'SYSTEM',
          content:
            'A Bridger mediator has been notified and will review this dispute within 24 hours.',
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: req.user.id,
          entityId: dispute.id,
          entityType: 'DISPUTE',
          action: 'ESCALATE',
          ipAddress: req.ip ?? null,
        },
      }),
    ]);

    const io = getIO();
    if (io) {
      io.to('admin_room').emit('new_admin_task', {
        taskId: task.id,
        type: task.type,
        disputeId: req.params.id,
        dealId: dispute.dealId,
        createdAt: task.createdAt,
      });
    }
    emitToDispute(dispute.id, dispute.filerId, dispute.againstId, 'dispute_escalated', {
      disputeId: dispute.id,
      taskId: task.id,
      status: 'ADMIN_REVIEWING',
    });

    logger.info('Dispute escalated to admin', { disputeId: req.params.id, taskId: task.id });

    res.json({
      success: true,
      message: 'Admin has been notified and will review within 24h',
      taskId: task.id,
    });
  } catch (error) { next(error); }
});

// ── GET /admin/tasks (admin-only) ──────────────────────────────────────────
router.get('/admin/tasks', authenticate, async (req: any, res, next) => {
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

// ── PATCH /admin/tasks/:id/assign ──────────────────────────────────────────
router.patch('/admin/tasks/:id/assign', authenticate, async (req: any, res, next) => {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Forbidden. Admin access required.' });
  try {
    const { assignedTo } = req.body;
    const task = await prisma.adminTask.update({
      where: { id: req.params.id },
      data: { assignedTo: assignedTo || req.user.id, status: 'IN_PROGRESS' },
    });
    res.json(task);
  } catch (error) { next(error); }
});

// ── PATCH /disputes/:id/resolve — admin resolution ─────────────────────────
router.patch('/:id/resolve', authenticate, requireAdmin, async (req: any, res, next) => {
  try {
    const { outcome, resolution } = req.body;

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

    if (RESOLVED_STATES.has(dispute.status)) {
      return res.status(409).json({ error: 'Dispute already resolved' });
    }

    const updatedStatus = `RESOLVED_${outcome}` as string;
    const dealAmount = dispute.deal?.price ?? 0;

    const updated = await prisma.$transaction(async (tx) => {
      const resolvedDispute = await tx.dispute.update({
        where: { id: req.params.id },
        data: {
          status: updatedStatus,
          resolution,
          resolvedById: req.user.id,
        },
      });

      if (outcome !== 'CLOSED') {
        const dealStatus = outcome === 'FILER_WIN' ? 'CANCELLED' : 'COMPLETED';
        await tx.deal.update({ where: { id: dispute.dealId }, data: { status: dealStatus } });
      }

      if (outcome === 'FILER_WIN' && dealAmount > 0) {
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

      await recordTimeline(tx, {
        disputeId: dispute.id,
        eventType: outcome === 'CLOSED' ? 'CLOSED' : 'RESOLVED',
        actorId: req.user.id,
        actorRole: 'ADMIN',
        description:
          outcome === 'CLOSED'
            ? 'Dispute closed by admin'
            : `Dispute resolved: ${outcome.replace(/_/g, ' ').toLowerCase()}`,
        metadata: { outcome, resolution, awarded: dealAmount },
      });

      await tx.disputeMessage.create({
        data: {
          disputeId: dispute.id,
          senderId: req.user.id,
          senderRole: 'ADMIN',
          content:
            `Resolution: ${outcome.replace(/_/g, ' ').toLowerCase()}.\n${resolution}`,
        },
      });

      await recordAudit(tx, {
        userId: req.user.id,
        entityId: dispute.id,
        action: 'RESOLVE',
        metadata: { outcome, awarded: dealAmount, resolution },
        ipAddress: req.ip,
      });

      return resolvedDispute;
    });

    emitToDispute(dispute.id, dispute.filerId, dispute.againstId, 'dispute_resolved', {
      disputeId: dispute.id,
      outcome,
      resolution,
      status: updatedStatus,
    });

    logger.info('Dispute resolved', {
      disputeId: dispute.id,
      outcome,
      resolvedBy: req.user.id,
    });

    res.json(updated);
  } catch (error) { next(error); }
});

export default router;
