// User Routes
import { Router } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateProfileSchema, updatePushTokenSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { notifyAdminNewDispute } from '../services/adminNotificationService';
import { saveBuffer, saveRawBuffer } from '../services/uploadService';
import { verifyOTP } from '../services/otpService';
import logger from '../utils/logger';

// Multer: store in memory, validate MIME type, enforce 10MB limit
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const kycUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and PDF files are allowed for KYC documents'));
    }
  },
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter(_req, file, cb) {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, and WebP files are allowed for avatars'));
    }
  },
});

const router = Router();

// GET /users/me - Get current user
router.get('/me', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      profilePhoto: user.profilePhoto,
      verified: user.verified,
      kycStatus: user.kycStatus,
      walletBalance: user.walletBalance,
      rating: user.rating,
      completionRate: user.completionRate,
      totalDeals: user.totalDeals,
      memberSince: user.createdAt.toISOString(),
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/** Accept any URL (https, http, or local /uploads/ path) for avatar fields */
function isValidAvatarUrl(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  return v.startsWith('https://') || v.startsWith('http://') || v.startsWith('/uploads/');
}

// PATCH /users/me - Update current user
router.patch('/me', authenticate, validate(updateProfileSchema), async (req: any, res, next) => {
  try {
    const { name, email, avatar, profilePhoto } = req.validated || req.body;

    if (avatar !== undefined && !isValidAvatarUrl(avatar)) {
      return res.status(400).json({ error: 'avatar must be a URL. Upload the image first via POST /users/me/avatar.' });
    }
    if (profilePhoto !== undefined && !isValidAvatarUrl(profilePhoto)) {
      return res.status(400).json({ error: 'profilePhoto must be a URL. Upload the image first via POST /users/me/avatar.' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (email !== undefined) updateData.email = email;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (profilePhoto !== undefined) updateData.profilePhoto = profilePhoto;

    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    res.json({
      id: user.id,
      phone: user.phone,
      name: user.name,
      avatar: user.profilePhoto || user.avatar,
      profilePhoto: user.profilePhoto,
      kycStatus: user.kycStatus,
      walletBalance: user.walletBalance,
      rating: user.rating,
      totalDeals: user.totalDeals,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// POST /users/me/kyc - Submit KYC documents (multipart/form-data)
// Fields: documentType (PASSPORT|ID_CARD|DRIVING_LICENSE), frontImage (file), backImage (file, optional)
router.post(
  '/me/kyc',
  authenticate,
  kycUpload.fields([
    { name: 'frontImage', maxCount: 1 },
    { name: 'backImage',  maxCount: 1 },
  ]),
  async (req: any, res, next) => {
    try {
      const { documentType } = req.body;
      const VALID_TYPES = ['PASSPORT', 'ID_CARD', 'DRIVING_LICENSE'];
      if (!VALID_TYPES.includes(documentType)) {
        return res.status(400).json({ error: `documentType must be one of: ${VALID_TYPES.join(', ')}` });
      }

      const files = req.files as Record<string, Express.Multer.File[]>;
      const frontFile = files?.frontImage?.[0];
      if (!frontFile) {
        return res.status(400).json({ error: 'frontImage is required' });
      }

      // Save front image to uploads/kyc/
      const frontUrl = frontFile.mimetype === 'application/pdf'
        ? await saveRawBuffer(frontFile.buffer, 'kyc', `${Date.now()}_front_${req.user.id}.pdf`)
        : await saveBuffer(frontFile.buffer, frontFile.mimetype, 'kyc', `front_${req.user.id}`);

      // Save back image if provided
      let backUrl: string | undefined;
      const backFile = files?.backImage?.[0];
      if (backFile) {
        backUrl = backFile.mimetype === 'application/pdf'
          ? await saveRawBuffer(backFile.buffer, 'kyc', `${Date.now()}_back_${req.user.id}.pdf`)
          : await saveBuffer(backFile.buffer, backFile.mimetype, 'kyc', `back_${req.user.id}`);
      }

      // Store KYC document record and update user status atomically
      const kycDoc = await prisma.$transaction(async (tx) => {
        const doc = await tx.kycDocument.create({
          data: {
            userId: req.user.id,
            documentType,
            frontUrl,
            backUrl: backUrl ?? null,
            status: 'PENDING',
          },
        });
        await tx.user.update({
          where: { id: req.user.id },
          data: { kycStatus: 'SUBMITTED' },
        });
        return doc;
      });

      // Fire admin notification (non-blocking)
      notifyAdminNewDispute({
        id: kycDoc.id,
        dealId: '',
        reason: `KYC document submitted: ${documentType}`,
        slaDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        filerId: req.user.id,
      } as any).catch((e: any) =>
        logger.error('KYC admin notification failed', { error: String(e) })
      );

      logger.info('KYC documents saved locally', { userId: req.user.id, documentType, kycDocId: kycDoc.id });

      res.json({ success: true, kycStatus: 'SUBMITTED', documentId: kycDoc.id });
    } catch (error: any) {
      if (error.message?.includes('Only JPEG')) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  }
);

// PATCH /users/me/push-token - Update push token
router.patch('/me/push-token', authenticate, validate(updatePushTokenSchema), async (req: any, res, next) => {
  try {
    const { pushToken } = req.validated || req.body;

    await prisma.user.update({
      where: { id: req.user.id },
      data: { pushToken },
    });

    res.json({ message: 'Push token updated' });
  } catch (error) {
    next(error);
  }
});

// GET /users/me/stats - Get user statistics (MUST be before /:id)
router.get('/me/stats', authenticate, async (req: any, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const [sentDeals, traveledDeals, completedDeals] = await Promise.all([
      prisma.deal.count({ where: { senderId: req.user.id } }),
      prisma.deal.count({ where: { travelerId: req.user.id } }),
      prisma.deal.count({ where: { OR: [{ senderId: req.user.id }, { travelerId: req.user.id }], status: 'COMPLETED' } }),
    ]);

    res.json({
      rating: user.rating,
      totalDeals: user.totalDeals,
      sentDeals,
      traveledDeals,
      completedDeals,
      memberSince: user.createdAt.toISOString(),
      walletBalance: user.walletBalance,
    });
  } catch (error) {
    next(error);
  }
});

// POST /users/me/avatar - Upload avatar image (multipart/form-data, field: "avatar")
// Also accepts JSON body with avatarUrl / profilePhoto for backward compatibility.
router.post(
  '/me/avatar',
  authenticate,
  avatarUpload.single('avatar'),
  async (req: any, res, next) => {
    try {
      const updateData: any = {};

      if (req.file) {
        // Multipart file upload — save to uploads/avatar/
        const url = await saveBuffer(req.file.buffer, req.file.mimetype, 'avatar', req.user.id);
        updateData.avatar = url;
        updateData.profilePhoto = url;
      } else {
        // JSON body fallback (avatarUrl / profilePhoto as pre-hosted URLs)
        const { avatarUrl, profilePhoto } = req.body;
        if (avatarUrl) updateData.avatar = avatarUrl;
        if (profilePhoto) updateData.profilePhoto = profilePhoto;

        if (!avatarUrl && !profilePhoto) {
          return res.status(400).json({ error: 'Send an image file (field: avatar) or provide avatarUrl / profilePhoto in the body' });
        }
      }

      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: updateData,
      });

      res.json({ avatar: user.avatar, profilePhoto: user.profilePhoto });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================
// User blocking
// ============================================

// GET /users/me/blocks - List users the current user has blocked
router.get('/me/blocks', authenticate, async (req: any, res, next) => {
  try {
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: req.user.id },
      include: {
        blocked: {
          select: { id: true, name: true, avatar: true, profilePhoto: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(blocks.map((b) => ({
      id: b.id,
      blockedId: b.blockedId,
      user: b.blocked,
      createdAt: b.createdAt.toISOString(),
    })));
  } catch (error) {
    next(error);
  }
});

// POST /users/:id/block - Block a user
router.post('/:id/block', authenticate, async (req: any, res, next) => {
  try {
    const blockedId = req.params.id;
    if (blockedId === req.user.id) {
      return res.status(400).json({ error: 'You cannot block yourself' });
    }
    const target = await prisma.user.findUnique({ where: { id: blockedId } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const block = await prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: req.user.id, blockedId } },
      create: { blockerId: req.user.id, blockedId },
      update: {},
    });

    res.json({ success: true, block: { id: block.id, blockedId, createdAt: block.createdAt.toISOString() } });
  } catch (error) {
    next(error);
  }
});

// DELETE /users/:id/block - Unblock a user
router.delete('/:id/block', authenticate, async (req: any, res, next) => {
  try {
    const blockedId = req.params.id;
    await prisma.userBlock.deleteMany({
      where: { blockerId: req.user.id, blockedId },
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /users/:id/block - Check whether the current user has blocked / is blocked by another
router.get('/:id/block', authenticate, async (req: any, res, next) => {
  try {
    const otherId = req.params.id;
    const [iBlocked, theyBlocked] = await Promise.all([
      prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: req.user.id, blockedId: otherId } },
      }),
      prisma.userBlock.findUnique({
        where: { blockerId_blockedId: { blockerId: otherId, blockedId: req.user.id } },
      }),
    ]);
    res.json({
      blockedByMe: !!iBlocked,
      blockedByThem: !!theyBlocked,
      anyBlock: !!(iBlocked || theyBlocked),
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// User reporting
// ============================================

const VALID_REPORT_REASONS = [
  'SPAM', 'SCAM', 'HARASSMENT', 'INAPPROPRIATE', 'FAKE_LISTING', 'IMPERSONATION', 'OTHER',
];

// POST /users/:id/report - File a report against a user
router.post('/:id/report', authenticate, async (req: any, res, next) => {
  try {
    const reportedId = req.params.id;
    const { reason, description, chatRoomId } = req.body || {};

    if (reportedId === req.user.id) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }
    if (!reason || !VALID_REPORT_REASONS.includes(reason)) {
      return res.status(400).json({ error: `reason must be one of: ${VALID_REPORT_REASONS.join(', ')}` });
    }
    if (description !== undefined && description !== null && typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be a string' });
    }
    if (typeof description === 'string' && description.length > 2000) {
      return res.status(400).json({ error: 'description must be 2000 characters or fewer' });
    }

    const target = await prisma.user.findUnique({ where: { id: reportedId } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    const report = await prisma.userReport.create({
      data: {
        reporterId: req.user.id,
        reportedId,
        reason,
        description: description || null,
        chatRoomId: chatRoomId || null,
        status: 'PENDING',
      },
    });

    logger.info('User report filed', {
      reportId: report.id,
      reporterId: req.user.id,
      reportedId,
      reason,
    });

    res.json({
      success: true,
      report: {
        id: report.id,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt.toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Account deletion (GDPR / right-to-erasure)
// ============================================

// Aggressive rate limit on the destructive endpoint to defeat brute-force or
// hijacked-token attacks: 5 attempts per 15 minutes per IP, per user.
const deleteAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  // Key by user id when present, otherwise IP — prevents one user from being
  // locked out by another sharing a NAT address.
  keyGenerator: (req: any) => `delete-account:${req.user?.id || req.ip}`,
  message: { error: 'Too many account-deletion attempts. Please wait 15 minutes and try again.' },
});

const DELETE_PHRASE = 'DELETE';

// States that *must* finish before an account can be removed.  Open financial
// or fulfilment obligations to other users would otherwise become orphaned.
const BLOCKING_DEAL_STATES = ['MATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'DISPUTED'];

// DELETE /users/me — Permanently delete the current user.
// Body: { confirm: "DELETE", acknowledge: true, otp?: "123456" }
//
// Workflow:
//   1. Validate confirmation phrase and explicit acknowledgement.
//   2. (Optional but recommended) re-verify ownership of the phone number
//      by checking a freshly issued OTP.  Skipped if the env flag
//      REQUIRE_OTP_FOR_DELETE is "false" — useful for tests.
//   3. Refuse if the user has open deals/disputes that affect counterparties.
//   4. Refuse if the wallet has a non-zero balance (forces explicit withdrawal
//      first to avoid silently torching user funds).
//   5. Inside a single transaction:
//        a) sanitise PII on the User row (name, email, avatar, push token,
//           face embedding, KYC status, ID document number) so the soft-tomb-
//           stoned row leaks nothing if recoverable from backups.
//        b) cascade-delete dependent rows (sessions, kyc docs, blocks, reports,
//           notifications, push tokens, chat memberships, face scans).
//        c) unlink — but DO NOT delete — historical Deals/Trips/Reviews/
//           Transactions because they are referenced by other users and we
//           cannot lawfully erase counter-party records.  Counterparty-facing
//           views show "Deleted user" instead.
//        d) finally `prisma.user.delete()` cascades the rest per schema rules.
//   6. Write an AuditLog entry capturing who, when, and from where.
router.delete('/me', authenticate, deleteAccountLimiter, async (req: any, res, next) => {
  try {
    const { confirm, acknowledge, otp } = req.body || {};

    // ── Step 1: confirmation gating ────────────────────────────────────────
    if (typeof confirm !== 'string' || confirm.trim().toUpperCase() !== DELETE_PHRASE) {
      return res.status(400).json({
        error: `Confirmation phrase missing. Please send {"confirm": "${DELETE_PHRASE}"}.`,
      });
    }
    if (acknowledge !== true) {
      return res.status(400).json({
        error: 'You must explicitly acknowledge that account deletion is permanent. Send {"acknowledge": true}.',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // ── Step 2: re-prove phone-number ownership via OTP ────────────────────
    // Some operators run without an SMS provider in dev — they can opt out by
    // setting REQUIRE_OTP_FOR_DELETE=false in their .env.  Never disable in prod.
    const otpRequired = (process.env.REQUIRE_OTP_FOR_DELETE ?? 'true') !== 'false';
    if (otpRequired) {
      if (!otp || typeof otp !== 'string') {
        return res.status(400).json({
          error: 'A current SMS verification code is required to delete your account.',
          requiresOtp: true,
        });
      }
      try {
        const ok = await verifyOTP(user.phone, otp);
        if (!ok) {
          return res.status(401).json({ error: 'Invalid verification code.' });
        }
      } catch (e: any) {
        return res.status(401).json({ error: e?.message || 'Verification failed.' });
      }
    }

    // ── Step 3: refuse while obligations to counterparties remain ──────────
    const openDeals = await prisma.deal.count({
      where: {
        OR: [{ senderId: user.id }, { travelerId: user.id }],
        status: { in: BLOCKING_DEAL_STATES },
      },
    });
    if (openDeals > 0) {
      return res.status(409).json({
        error: 'Account cannot be deleted while you have active deals. Complete or cancel them first.',
        openDeals,
      });
    }

    const openDisputes = await prisma.dispute.count({
      where: {
        OR: [{ filerId: user.id }, { againstId: user.id }],
        status: { in: ['OPENED', 'EVIDENCE_SUBMITTED', 'ADMIN_REVIEWING'] },
      },
    });
    if (openDisputes > 0) {
      return res.status(409).json({
        error: 'Account cannot be deleted while you have unresolved disputes.',
        openDisputes,
      });
    }

    // ── Step 4: refuse while funds remain ──────────────────────────────────
    const wallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    const liveBalance = (wallet?.availableBalance ?? wallet?.balance ?? user.walletBalance ?? 0)
                      + (wallet?.pendingBalance ?? 0);
    if (liveBalance > 0.0001) {
      return res.status(409).json({
        error: 'Withdraw your wallet balance before deleting your account.',
        balance: liveBalance,
      });
    }

    // Snapshot before destruction — used both for the audit log and to short-
    // circuit observers (websocket/notification fan-out) downstream.
    const phoneSuffix = user.phone ? `***${user.phone.slice(-4)}` : 'unknown';
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const auditMeta = JSON.stringify({
      phoneSuffix,
      ip,
      userAgent: req.headers['user-agent'] || null,
      kycStatus: user.kycStatus,
      faceVerificationStatus: user.faceVerificationStatus,
    });

    // ── Step 5: atomic sanitise + tombstone ────────────────────────────────
    // We do NOT `prisma.user.delete()` because Deal.sender / Dispute.filer /
    // Dispute.against are configured with `onDelete: Restrict` for legal /
    // audit reasons — the counterparty's history must remain intact.  Instead
    // we strip every PII column and free up the unique phone slot so the row
    // is effectively erased from the user's perspective while still satisfying
    // the FK constraints.
    await prisma.$transaction(async (tx) => {
      // a) sanitise PII — name, contact, biometrics, identifiers.
      const tombstonedPhone = `deleted_${user.id}_${crypto.randomBytes(4).toString('hex')}`;
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: 'Deleted user',
          email: null,
          avatar: null,
          profilePhoto: null,
          pushToken: null,
          pushTokenUpdatedAt: null,
          faceEmbedding: null,
          faceVerificationStatus: 'PENDING',
          faceVerifiedAt: null,
          faceConfidenceScore: null,
          idDocumentNumber: null,
          phone: tombstonedPhone,        // free up the unique phone for re-signup
          verified: false,
          banned: true,
          reasonForBan: 'Account deleted by user',
          kycDocumentsLegacy: null,
          stripeConnectAccountId: null,
          stripeAccountStatus: null,
        },
      });

      // b) hard-delete rows that have no business surviving the user.
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.kycDocument.deleteMany({ where: { userId: user.id } });
      await tx.faceScan.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.notificationSettings.deleteMany({ where: { userId: user.id } });
      await tx.userBlock.deleteMany({
        where: { OR: [{ blockerId: user.id }, { blockedId: user.id }] },
      });
      await tx.userReport.deleteMany({
        where: { OR: [{ reporterId: user.id }, { reportedId: user.id }] },
      });
      await tx.chatParticipant.deleteMany({ where: { userId: user.id } });
      await tx.trustScore.deleteMany({ where: { userId: user.id } });
      await tx.wallet.deleteMany({ where: { userId: user.id } });

      // c) detach future-facing artefacts from the user without deleting the
      //    counterparty-visible record.  Trips that haven't been matched yet
      //    can be cancelled outright.
      await tx.trip.updateMany({
        where: { travelerId: user.id, status: 'OPEN' },
        data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: 'Account deleted' },
      });

      // d) write the audit log (anonymised — userId null, entityId retained
      //    so admins can trace the request without re-identifying the person).
      await tx.auditLog.create({
        data: {
          userId: null,
          entityType: 'USER',
          entityId: user.id,
          action: 'DELETE',
          ipAddress: typeof ip === 'string' ? ip.slice(0, 64) : null,
          metadata: auditMeta,
        },
      });
    });

    logger.info('User account deleted', {
      userId: user.id,
      phoneSuffix,
      ip,
    });

    return res.json({
      success: true,
      deletedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    // Prisma will throw P2003 if a Restrict FK still holds a reference — surface
    // a useful error rather than 500.
    if (error?.code === 'P2003') {
      return res.status(409).json({
        error: 'Account is referenced by other records and cannot be removed yet. Please contact support.',
      });
    }
    logger.error('Account deletion failed', { error: String(error?.message || error) });
    next(error);
  }
});

// GET /users/:id - Get public profile (parameterized - MUST be last)
router.get('/:id', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        name: true,
        avatar: true,
        rating: true,
        totalDeals: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      ...user,
      createdAt: user.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
