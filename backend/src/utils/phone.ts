import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js';

export function normalizePhone(raw: string): string {
  // Remove all non-digit characters except leading +
  const cleaned = raw.replace(/[^\d+]/g, '');
  
  // Try to parse as a phone number
  const parsed = parsePhoneNumberFromString(cleaned);
  
  if (!parsed || !isValidPhoneNumber(cleaned)) {
    throw new Error('Invalid phone number');
  }
  
  return parsed.format('E.164'); // Returns +1234567890 format
}

export function formatPhoneForDisplay(raw: string): string {
  try {
    const normalized = normalizePhone(raw);
    const parsed = parsePhoneNumberFromString(normalized);
    if (parsed) {
      return parsed.format('INTERNATIONAL');
    }
    return raw;
  } catch {
    return raw;
  }
}

export function maskPhone(phone: string): string {
  try {
    const normalized = normalizePhone(phone);
    // Show only last 4 digits: +1 *** *** 1234
    const last4 = normalized.slice(-4);
    return `+*** *** ${last4}`;
  } catch {
    return '*** *** ****';
  }
}
