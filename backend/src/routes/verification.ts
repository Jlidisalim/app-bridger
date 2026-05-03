import { Router, Response } from 'express';
import multer from 'multer';
import { AuthRequest, authenticate, optionalAuth } from '../middleware/auth';
import { faceVerificationService } from '../services/faceVerificationService';
import { faceCaptureLimiter } from '../middleware/security';
import { saveBuffer } from '../services/uploadService';
import logger from '../utils/logger';

const router = Router();

// Configure multer for in-memory file handling (no disk storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * POST /verify/capture-face
 * Upload a selfie for face detection, quality checks, liveness, and embedding extraction.
 */
router.post(
  '/capture-face',
  optionalAuth,
  faceCaptureLimiter,  // 3 req/min per user — face ML is CPU-intensive
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image provided' });
      }

      // Save selfie to uploads/face/ (non-blocking — don't fail the request)
      saveBuffer(req.file.buffer, req.file.mimetype, 'face', `selfie_${Date.now()}`)
        .catch((e) => logger.warn('Face selfie save failed', { error: String(e) }));

      const result = await faceVerificationService.captureFace(
        req.file.buffer,
        req.file.mimetype
      );

      return res.json(result);
    } catch (error: any) {
      logger.error('Face capture error:', error.message);
      if (error.response?.data) {
        return res.status(error.response.status || 500).json(error.response.data);
      }
      return res.status(500).json({
        success: false,
        status: 'no_face_detected',
        message: 'Face verification service unavailable',
      });
    }
  }
);

/**
 * POST /verify/upload-id
 * Upload an ID document for face extraction and embedding.
 */
router.post(
  '/upload-id',
  optionalAuth,
  upload.single('image'),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No image provided' });
      }

      // Save ID document to uploads/face/ (non-blocking)
      saveBuffer(req.file.buffer, req.file.mimetype, 'face', `id_${Date.now()}`)
        .catch((e) => logger.warn('ID document save failed', { error: String(e) }));

      const result = await faceVerificationService.uploadID(
        req.file.buffer,
        req.file.mimetype
      );

      return res.json(result);
    } catch (error: any) {
      logger.error('ID upload error:', error.message);
      if (error.response?.data) {
        return res.status(error.response.status || 500).json(error.response.data);
      }
      return res.status(500).json({
        success: false,
        status: 'no_face_detected',
        message: 'Face verification service unavailable',
      });
    }
  }
);

/**
 * POST /verify/compare
 * Compare face embedding from selfie with face embedding from ID document.
 * Stores the result in the database.
 */
router.post(
  '/compare',
  authenticate,  // FIX: Require auth so we can save verification result to the correct user
  async (req: AuthRequest, res: Response) => {
    try {
      const { face_embedding, id_embedding, id_number } = req.body;

      if (!face_embedding || !id_embedding) {
        return res.status(400).json({
          success: false,
          message: 'Both face_embedding and id_embedding are required',
        });
      }

      if (!Array.isArray(face_embedding) || face_embedding.length !== 512) {
        return res.status(400).json({
          success: false,
          message: 'face_embedding must be an array of 512 numbers',
        });
      }

      if (!Array.isArray(id_embedding) || id_embedding.length !== 512) {
        return res.status(400).json({
          success: false,
          message: 'id_embedding must be an array of 512 numbers',
        });
      }

      const result = await faceVerificationService.compareFaces(
        face_embedding,
        id_embedding
      );

      // Save verification result + extracted ID number to database.
      // saveVerificationResult throws a 409 error (DUPLICATE_ID_DOCUMENT) if
      // another user is already registered with the same ID card number.
      // Returns the tiered KYC decision (APPROVED / MANUAL_REVIEW / REJECTED).
      const decision = await faceVerificationService.saveVerificationResult(
        req.user!.id,
        face_embedding,
        result.verified,
        result.confidence,
        id_number || null
      );

      return res.json({
        ...result,
        kycStatus: decision.status,
        tier:      decision.tier,
      });
    } catch (error: any) {
      // Duplicate ID document — another account already uses this ID card.
      // Return 409 with a structured payload so the mobile client can show
      // a clear "account already exists → log in instead" message.
      if (error.code === 'DUPLICATE_ID_DOCUMENT') {
        return res.status(409).json({
          verified: false,
          confidence: 0,
          status: 'duplicate_id',
          code: 'DUPLICATE_ID_DOCUMENT',
          message: error.message,
        });
      }

      logger.error('Face comparison error:', error.message);
      if (error.response?.data) {
        return res.status(error.response.status || 500).json(error.response.data);
      }
      return res.status(500).json({
        verified: false,
        confidence: 0,
        status: 'no_face_detected',
        message: 'Face verification service unavailable',
      });
    }
  }
);

export default router;
