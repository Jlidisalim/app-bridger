/**
 * QR Code Utilities for Bridger
 * 
 * Handles QR code data generation and parsing for delivery verification.
 * Uses HMAC-SHA256 for cryptographic signatures.
 */

import CryptoJS from 'crypto-js';

// Use a shared secret — in production this should come from a secure config
const QR_SECRET = 'bridger-qr-hmac-secret-key-2026';

export interface QRCodeData {
  dealId: string;
  type: 'delivery_confirmation' | 'pickup_confirmation';
  route: string;
  senderId?: string;
  travelerId?: string;
  amount?: number;
  timestamp: string;
  expiresAt: string;
  signature: string;
}

/**
 * Generate QR code data for a delivery
 */
export const generateQRData = (params: {
  dealId: string;
  route: string;
  senderId?: string;
  travelerId?: string;
  amount?: number;
  type?: 'delivery_confirmation' | 'pickup_confirmation';
}): string => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const data: QRCodeData = {
    dealId: params.dealId,
    type: params.type || 'delivery_confirmation',
    route: params.route,
    senderId: params.senderId,
    travelerId: params.travelerId,
    amount: params.amount,
    timestamp: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    signature: generateHMACSignature(params.dealId, now.toISOString()),
  };

  return JSON.stringify(data);
};

/**
 * Parse QR code data from a scanned string
 */
export const parseQRData = (qrString: string): QRCodeData | null => {
  try {
    const data = JSON.parse(qrString) as QRCodeData;
    
    // Validate required fields
    if (!data.dealId || !data.type || !data.timestamp) {
      console.error('Invalid QR data: missing required fields');
      return null;
    }

    // Check expiration
    if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
      console.error('QR code has expired');
      return null;
    }

    return data;
  } catch (error) {
    console.error('Failed to parse QR data:', error);
    return null;
  }
};

/**
 * Validate QR code data integrity using HMAC verification
 */
export const validateQRData = (data: QRCodeData): boolean => {
  // Check expiration
  if (new Date(data.expiresAt) < new Date()) {
    return false;
  }

  // Verify HMAC signature
  const expectedSignature = generateHMACSignature(data.dealId, data.timestamp);
  return data.signature === expectedSignature;
};

/**
 * Generate HMAC-SHA256 signature for QR data integrity
 */
const generateHMACSignature = (dealId: string, timestamp: string): string => {
  const message = `${dealId}:${timestamp}`;
  return CryptoJS.HmacSHA256(message, QR_SECRET).toString(CryptoJS.enc.Hex);
};

/**
 * Generate a collection link for the receiver
 * This would be a deep link in production
 */
export const generateCollectionLink = (dealId: string): string => {
  return `bridger://collect/${dealId}`;
};
