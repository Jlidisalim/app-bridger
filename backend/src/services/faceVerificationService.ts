import axios from 'axios';
import FormData from 'form-data';
import config from '../config/env';
import { prisma } from '../config/db';
import logger from '../utils/logger';

const FACE_API = config.faceService.url;

// ── Feature flag ─────────────────────────────────────────────────────────────
// Mock embeddings are ONLY allowed when explicitly opted in via env var.
// NODE_ENV alone is NOT sufficient — prevents accidental mock usage in prod.
const ALLOW_MOCK = process.env.ENABLE_MOCK_FACE_VERIFICATION === 'true';

// ── Circuit Breaker ───────────────────────────────────────────────────────────
const CB_FAILURE_THRESHOLD = 5;    // open after N consecutive failures
const CB_RESET_TIMEOUT_MS  = 60_000; // try again after 60 s (half-open)

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

let cbState: CircuitState = 'CLOSED';
let cbFailures = 0;
let cbOpenedAt = 0;

function recordCircuitSuccess(): void {
  if (cbState !== 'CLOSED') {
    logger.info('[FaceVerification] Circuit CLOSED — service recovered');
  }
  cbState    = 'CLOSED';
  cbFailures = 0;
}

function recordCircuitFailure(): void {
  cbFailures += 1;
  if (cbFailures >= CB_FAILURE_THRESHOLD) {
    if (cbState === 'CLOSED' || cbState === 'HALF_OPEN') {
      cbState    = 'OPEN';
      cbOpenedAt = Date.now();
      logger.error(`[FaceVerification] Circuit OPEN after ${cbFailures} consecutive failures`);
    }
  }
}

function checkCircuit(): void {
  if (cbState === 'CLOSED') return;

  if (cbState === 'OPEN') {
    if (Date.now() - cbOpenedAt >= CB_RESET_TIMEOUT_MS) {
      cbState = 'HALF_OPEN';
      logger.info('[FaceVerification] Circuit HALF_OPEN — allowing one test request');
      return; // allow through
    }
    throw new Error('Face verification service unavailable (circuit open). Please try again later.');
  }
  // HALF_OPEN: allow one test request through (handled by caller)
}

export function getFaceCircuitState(): { state: CircuitState; failures: number; openedAt: number } {
  return { state: cbState, failures: cbFailures, openedAt: cbOpenedAt };
}

type VerificationStatus = 'no_face_detected' | 'face_mismatch' | 'verified';

interface FaceCaptureResult {
  success: boolean;
  status?: VerificationStatus;
  message: string;
  embedding?: number[];
  quality?: {
    passed: boolean;
    blur_score: number;
    brightness: number;
    face_size: number;
    face_count: number;
    issues: string[];
  };
  liveness?: {
    is_live: boolean;
    score: number;
    checks: Record<string, number>;
  };
}

interface IDUploadResult {
  success: boolean;
  status?: VerificationStatus;
  message: string;
  embedding?: number[];
  face_confidence?: number;
  document_face_bbox?: number[];
  id_number?: string | null;
  birthday?: string | null;
}

interface CompareResult {
  verified: boolean;
  confidence: number;
  message: string;
  status: VerificationStatus;
}

// Mock embeddings — only used in dev when ENABLE_MOCK_FACE_VERIFICATION=true
function generateMockEmbedding(seed: number): number[] {
  const embedding = new Array(512);
  let x = seed;
  for (let i = 0; i < 512; i++) {
    x = ((x * 1103515245 + 12345) & 0x7fffffff);
    embedding[i] = (x / 0x7fffffff) * 2 - 1;
  }
  return embedding;
}

function generateNoisyEmbedding(base: number[], noiseSeed: number, noiseLevel = 0.15): number[] {
  const noise = generateMockEmbedding(noiseSeed);
  return base.map((v, i) => v + noise[i] * noiseLevel);
}

export const faceVerificationService = {
  /**
   * Send selfie image to Python service for face capture processing.
   */
  async captureFace(imageBuffer: Buffer, mimetype: string): Promise<FaceCaptureResult> {
    // Dev mock — only when explicitly enabled
    if (ALLOW_MOCK) {
      logger.warn('[FaceVerification] Using mock embedding (ENABLE_MOCK_FACE_VERIFICATION=true)');
      const mockBase = generateMockEmbedding(42);
      return { success: true, embedding: mockBase, message: 'Mock face captured', status: 'verified' };
    }

    // Production: check circuit breaker before calling Python service
    checkCircuit();

    try {
      const form = new FormData();
      form.append('image', imageBuffer, { filename: 'selfie.jpg', contentType: mimetype });

      const response = await axios.post<FaceCaptureResult>(
        `${FACE_API}/verify/capture-face`,
        form,
        { headers: form.getHeaders(), timeout: 30000 }
      );

      const data = response.data;
      if (!data.success) {
        const msgLower = (data.message || '').toLowerCase();
        if (msgLower.includes('no face') || msgLower.includes('face not found') || msgLower.includes('could not detect')) {
          data.status = 'no_face_detected';
        }
      }

      recordCircuitSuccess();
      return data;
    } catch (error: any) {
      recordCircuitFailure();
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Face verification service is unavailable. Please try again later.');
      }
      throw new Error(error.response?.data?.detail || error.message || 'Face capture failed');
    }
  },

  /**
   * Send ID document image to Python service for face extraction.
   */
  async uploadID(imageBuffer: Buffer, mimetype: string): Promise<IDUploadResult> {
    if (ALLOW_MOCK) {
      const noisyBase = generateNoisyEmbedding(generateMockEmbedding(42), 99);
      return { success: true, embedding: noisyBase, message: 'Mock ID uploaded', status: 'verified' };
    }

    checkCircuit();

    try {
      const form = new FormData();
      form.append('image', imageBuffer, { filename: 'document.jpg', contentType: mimetype });

      const response = await axios.post<IDUploadResult>(
        `${FACE_API}/verify/upload-id`,
        form,
        { headers: form.getHeaders(), timeout: 120000 }  // 2 min — OCR can be slow
      );

      const data = response.data;
      if (!data.success) {
        const msgLower = (data.message || '').toLowerCase();
        if (msgLower.includes('no face') || msgLower.includes('face not found') || msgLower.includes('could not detect')) {
          data.status = 'no_face_detected';
        }
      }

      recordCircuitSuccess();
      return data;
    } catch (error: any) {
      recordCircuitFailure();
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Face verification service is unavailable. Please try again later.');
      }
      throw new Error(error.response?.data?.detail || error.message || 'ID upload failed');
    }
  },

  /**
   * Compare two face embeddings via the Python service.
   */
  async compareFaces(
    faceEmbedding: number[],
    idEmbedding: number[]
  ): Promise<CompareResult> {
    try {
      const response = await axios.post<CompareResult>(
        `${FACE_API}/verify/compare`,
        {
          face_embedding: faceEmbedding,
          id_embedding: idEmbedding,
        },
        { timeout: 10000 }
      );

      const data = response.data;

      // Ensure status field is present
      if (!data.status) {
        data.status = data.verified ? 'verified' : 'face_mismatch';
      }

      return data;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Face verification service is not running. Please start the Python service on port 8000.');
      }
      throw new Error(error.response?.data?.detail || error.message || 'Face comparison failed');
    }
  },

  /**
   * Store face embedding and update verification status in database.
   * Throws a 409 error (DUPLICATE_ID_DOCUMENT) if another user already
   * registered with the same ID card number.
   */
  async saveVerificationResult(
    userId: string,
    embedding: number[],
    verified: boolean,
    confidence: number,
    idNumber?: string | null
  ): Promise<void> {
    // Validate embedding before storing
    if (!Array.isArray(embedding) || embedding.length !== 512) {
      throw new Error('Invalid face embedding: expected 512-dimensional array');
    }

    // Validate embedding values — reject NaN/Infinity before JSON serialization
    if (embedding.some(v => !Number.isFinite(v))) {
      throw new Error('Invalid face embedding: contains NaN or Infinity values');
    }

    // Guard against duplicate ID card registrations.
    // If another user (different userId) already owns this ID number, reject.
    if (idNumber) {
      const existing = await prisma.user.findFirst({
        where: {
          idDocumentNumber: idNumber,
          id: { not: userId },
        },
        select: { id: true },
      });
      if (existing) {
        const err: any = new Error(
          'An account already exists with this ID card number. Please log in instead.'
        );
        err.code   = 'DUPLICATE_ID_DOCUMENT';
        err.status = 409;
        throw err;
      }
    }

    // Store embedding as JSON string (pgvector ALTER can be applied in production separately)
    await prisma.user.update({
      where: { id: userId },
      data: {
        faceEmbedding:          JSON.stringify(embedding),
        faceVerificationStatus: verified ? 'VERIFIED' : 'FAILED',
        faceVerifiedAt:         verified ? new Date() : null,
        faceConfidenceScore:    confidence,
        kycStatus:              verified ? 'APPROVED' : 'REJECTED',
        ...(idNumber ? { idDocumentNumber: idNumber } : {}),
      },
    });

    // Create FaceScan audit record
    await prisma.faceScan.create({
      data: {
        userId,
        scanType: 'VERIFICATION',
        score: confidence,
        verified,
        confidenceScore: confidence,
        failureReason: verified ? null : 'Face mismatch - confidence too low',
      },
    });
  },
};
