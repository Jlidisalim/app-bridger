// User Routes
import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { updateProfileSchema, updatePushTokenSchema } from '../validators/auth';
import { prisma } from '../config/db';
import { notifyAdminNewDispute } from '../services/adminNotificationService';
import { saveBuffer, saveRawBuffer } from '../services/uploadService';
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
