/**
 * Face Verification API Service
 * Communicates with the Node.js backend which proxies to the Python AI service.
 */

import Constants from 'expo-constants';
import { authTokens } from './client';

// Resolves the same way as client.ts — uses EXPO_PUBLIC_API_URL env var if set
import { Platform } from 'react-native';

const devServerHost = Constants.expoGoConfig?.debuggerHost?.split(':')[0]
  || Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(':')[0];

const LOCAL_API_URL = Platform.select({
  android: `http://${devServerHost || '10.0.2.2'}:4000`,
  default: `http://${devServerHost || 'localhost'}:4000`,
});

const API_BASE: string =
  process.env.EXPO_PUBLIC_API_URL
  ?? (Constants.expoConfig?.extra?.apiUrl as string | undefined)
  ?? (__DEV__ ? LOCAL_API_URL : 'https://api.bridger.app');

async function getAuthHeaders(): Promise<Record<string, string>> {
  const header = await authTokens.getAuthHeader();
  return header;
}

function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 60000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
}

// ── Types ──────────────────────────────────────────────────────

export interface QualityInfo {
  passed: boolean;
  blur_score: number;
  brightness: number;
  face_size: number;
  face_count: number;
  issues: string[];
}

export interface LivenessInfo {
  is_live: boolean;
  score: number;
  checks: Record<string, number>;
}

export type VerificationStatus = 'no_face_detected' | 'face_mismatch' | 'verified';

export interface FaceCaptureResponse {
  success: boolean;
  status?: VerificationStatus;
  message: string;
  embedding?: number[];
  quality?: QualityInfo;
  liveness?: LivenessInfo;
}

export interface IDUploadResponse {
  success: boolean;
  status?: VerificationStatus;
  message: string;
  embedding?: number[];
  face_confidence?: number;
  document_face_bbox?: number[];
  id_number?: string;
  birthday?: string;
}

export interface CompareResponse {
  verified: boolean;
  confidence: number;
  message: string;
  status: VerificationStatus;
  result?: 'APPROVED' | 'MANUAL_REVIEW' | 'REJECTED';
}

// ── API Calls ──────────────────────────────────────────────────

export const faceVerificationAPI = {
  /**
   * Upload selfie for face capture, quality checks, and liveness detection.
   */
  async captureFace(imageUri: string): Promise<FaceCaptureResponse> {
    const headers = await getAuthHeaders();
    const formData = new FormData();

    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'selfie.jpg',
    } as any);

    const response = await fetchWithTimeout(`${API_BASE}/verify/capture-face`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to process selfie');
    }

    return response.json();
  },

  /**
   * Upload ID document for face extraction.
   */
  async uploadID(imageUri: string): Promise<IDUploadResponse> {
    const headers = await getAuthHeaders();
    const formData = new FormData();

    formData.append('image', {
      uri: imageUri,
      type: 'image/jpeg',
      name: 'document.jpg',
    } as any);

    const response = await fetchWithTimeout(`${API_BASE}/verify/upload-id`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Failed to process document');
    }

    return response.json();
  },

  /**
   * Compare face embeddings from selfie and ID document.
   */
  async compareFaces(
    faceEmbedding: number[],
    idEmbedding: number[],
    idNumber?: string | null
  ): Promise<CompareResponse> {
    const headers = await getAuthHeaders();

    const response = await fetchWithTimeout(`${API_BASE}/verify/compare`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        face_embedding: faceEmbedding,
        id_embedding: idEmbedding,
        id_number: idNumber || undefined,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));

      // 409 = another account is already registered with this ID card number.
      // Throw a structured error so VerificationResultScreen can show the
      // "account already exists → log in instead" UI.
      if (response.status === 409) {
        const err: any = new Error(
          errorBody.message || 'An account already exists with this ID card number. Please log in instead.'
        );
        err.isDuplicateId = true;
        err.code          = errorBody.code || 'DUPLICATE_ID_DOCUMENT';
        throw err;
      }

      throw new Error(errorBody.message || 'Verification failed');
    }

    return response.json();
  },
};
