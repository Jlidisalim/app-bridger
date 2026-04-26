// Phone Number Normalization Utility
// Uses libphonenumber-js to normalize phone numbers to E.164 format
// This should be used EVERYWHERE a phone number enters the system

/**
 * Normalizes a phone number to E.164 format
 * E.g., "+1 234 567 8900" -> "+12345678900"
 * E.g., "234 567 8900" -> "+12345678900" (assumes US)
 * 
 * @param raw - The raw phone number string
 * @returns The normalized phone number in E.164 format
 * @throws Error if the phone number is invalid
 */
export function normalizePhoneNumber(raw: string): string {
  // Import dynamically to avoid issues with SSR/Expo Go
  let parsePhoneNumber: any;
  
  try {
    // Try to use libphonenumber-js if available
    const libphonenumber = require('libphonenumber-js');
    parsePhoneNumber = libphonenumber.parsePhoneNumberFromString;
  } catch {
    // Fallback: manual normalization if libphonenumber-js not available
    return normalizePhoneNumberFallback(raw);
  }
  
  if (!parsePhoneNumber) {
    return normalizePhoneNumberFallback(raw);
  }
  
  // Try to parse with default country (US)
  let parsed = parsePhoneNumber(raw, 'US');
  
  // If that fails, try without default country
  if (!parsed?.isValid()) {
    parsed = parsePhoneNumber(raw);
  }
  
  if (!parsed?.isValid()) {
    throw new Error('Invalid phone number');
  }
  
  return parsed.format('E.164');
}

/**
 * Fallback phone normalization when libphonenumber-js is not available
 */
function normalizePhoneNumberFallback(raw: string): string {
  // Remove all non-digit characters except leading +
  let cleaned = raw.replace(/[^\d+]/g, '');
  
  // If it starts with +, it's already in international format
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // If it starts with country code (like 1 for US), add +
  if (cleaned.length >= 3 && /^[1-9]\d{0,2}$/.test(cleaned.substring(0, 3))) {
    return '+' + cleaned;
  }
  
  // Assume it's a US number without country code
  if (cleaned.length === 10) {
    return '+1' + cleaned;
  }
  
  // If nothing else works, just add + prefix
  return '+' + cleaned;
}

/**
 * Masks a phone number for display/logging
 * E.g., "+12345678900" -> "+1 *** *** 8900"
 * 
 * @param phone - The phone number to mask
 * @returns The masked phone number
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return '****';
  
  // Just show last 4 digits
  return `***${phone.slice(-4)}`;
}

/**
 * Formats a phone number for display
 * E.g., "+12345678900" -> "(234) 567-8900"
 * 
 * @param phone - The phone number to format
 * @returns The formatted phone number
 */
export function formatPhoneNumber(phone: string): string {
  try {
    const normalized = normalizePhoneNumber(phone);
    const digits = normalized.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    return phone;
  } catch {
    return phone;
  }
}
