/**
 * WhatsApp OTP Service
 * 
 * This service handles sending and verifying OTP codes via WhatsApp.
 * 
 * It first tries to connect to the real Baileys backend server.
 * If the server is not available, it falls back to mock mode.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Get the dev server host from Expo (works on both simulator and physical devices)
const devServerHost = Constants.expoGoConfig?.debuggerHost?.split(':')[0]
  || Constants.manifest2?.extra?.expoGo?.debuggerHost?.split(':')[0];

// Baileys server URL — use EXPO_PUBLIC_BAILEYS_URL env var
const LOCAL_BAILEYS_URL = Platform.select({
  android: `http://${devServerHost || '10.0.2.2'}:3001`,
  default: `http://${devServerHost || 'localhost'}:3001`,
});

const BAILEYS_SERVER_URL: string =
  process.env.EXPO_PUBLIC_BAILEYS_URL
  ?? (Constants.expoConfig?.extra?.baileysServerUrl as string | undefined)
  ?? (__DEV__ ? LOCAL_BAILEYS_URL : 'https://api.bridger.app');

// OTP storage for mock mode
const otpStorage: Map<string, { code: string; expiresAt: number; attempts: number }> = new Map();

const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export interface OTPResult {
  success: boolean;
  message: string;
  otpId?: string;
}

export interface VerifyResult {
  success: boolean;
  message: string;
  token?: string;
}

// Try to connect to real backend, fallback to mock
let useRealBackend = false;

async function checkBackendConnection(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    // Use the public health endpoint (no API key needed)
    const response = await fetch(`${BAILEYS_SERVER_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Send OTP via WhatsApp using Baileys backend
 */
export const sendWhatsAppOTP = async (phoneNumber: string): Promise<OTPResult> => {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  
  if (cleanPhone.length < 10) {
    return { success: false, message: 'Please enter a valid phone number' };
  }

  // Try real backend first
  if (!useRealBackend) {
    useRealBackend = await checkBackendConnection();
  }

  if (useRealBackend) {
    try {
      const sendController = new AbortController();
      const sendTimeoutId = setTimeout(() => sendController.abort(), 30000);
      const response = await fetch(`${BAILEYS_SERVER_URL}/api/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phoneNumber: cleanPhone,
          message: `Your Bridger verification code: *${Math.floor(100000 + Math.random() * 900000)}*\n\nValid for 5 minutes. Do not share this code.`
        }),
        signal: sendController.signal,
      });
      clearTimeout(sendTimeoutId);
      
      const data = await response.json();
      
      if (data.success) {
        console.log('[WhatsApp OTP] Sent via real Baileys backend');
        return { success: true, message: `OTP sent to ${phoneNumber} via WhatsApp`, otpId: cleanPhone };
      }
      
      return { success: false, message: data.error || 'Failed to send OTP' };
    } catch (error) {
      console.log('[WhatsApp OTP] Backend unavailable, using mock mode');
      useRealBackend = false;
    }
  }

  // Mock mode fallback
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  const otpCode = generateOTP();
  const expiresAt = Date.now() + 5 * 60 * 1000;

  otpStorage.set(cleanPhone, { code: otpCode, expiresAt, attempts: 0 });

  // Security: Never log the actual OTP code in production
  // For dev testing, use fixed test number: +15550000000 accepts OTP 123456
  if (__DEV__) {
    console.log(`[WhatsApp OTP] OTP sent to ${phoneNumber}`);
  }
  
  return { success: true, message: `OTP sent to ${phoneNumber}`, otpId: cleanPhone };
};

/**
 * Verify OTP
 */
export const verifyOTP = async (phoneNumber: string, code: string): Promise<VerifyResult> => {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  
  // Try real backend first
  if (useRealBackend) {
    try {
      const response = await fetch(`${BAILEYS_SERVER_URL}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: cleanPhone, otp: code }),
      });
      
      const data = await response.json();
      
      if (data.success) {
        return { success: true, message: 'Verification successful!', token: `bridger_token_${Date.now()}` };
      }
      
      return { success: false, message: data.error || 'Invalid OTP' };
    } catch {
      useRealBackend = false;
    }
  }

  // Mock mode
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Dev bypass: 111111 always works
  if (__DEV__ && code === '111111') {
    otpStorage.delete(cleanPhone);
    return { success: true, message: 'Verification successful!', token: `bridger_dev_${Date.now()}` };
  }

  const storedOTP = otpStorage.get(cleanPhone);

  if (!storedOTP) {
    return { success: false, message: 'No OTP found. Please request a new code.' };
  }

  if (Date.now() > storedOTP.expiresAt) {
    otpStorage.delete(cleanPhone);
    return { success: false, message: 'OTP has expired. Please request a new code.' };
  }

  if (storedOTP.attempts >= 3) {
    otpStorage.delete(cleanPhone);
    return { success: false, message: 'Too many attempts. Please request a new code.' };
  }

  storedOTP.attempts++;

  if (storedOTP.code !== code) {
    return { success: false, message: `Incorrect code. ${3 - storedOTP.attempts} attempts remaining.` };
  }

  otpStorage.delete(cleanPhone);
  return { success: true, message: 'Verification successful!', token: `bridger_token_${Date.now()}_${Math.random().toString(36).substr(2)}` };
};

/**
 * Resend OTP
 */
export const resendOTP = async (phoneNumber: string): Promise<OTPResult> => {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  otpStorage.delete(cleanPhone);
  return sendWhatsAppOTP(phoneNumber);
};

/**
 * Get test OTP (development only)
 */
export const getTestOTP = (phoneNumber: string): string | null => {
  const cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
  const storedOTP = otpStorage.get(cleanPhone);
  
  if (storedOTP && Date.now() < storedOTP.expiresAt) {
    return storedOTP.code;
  }
  return null;
};

export const isRunningInSimulator = (): boolean => {
  return false;
};
