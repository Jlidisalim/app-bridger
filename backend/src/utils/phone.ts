import { parsePhoneNumberFromString, isValidPhoneNumber } from 'libphonenumber-js';

export function normalizePhone(raw: string): string {
  // Remove all non-digit characters except leading +
  const cleaned = raw.replace(/[^\d+]/g, '');

  // Try strict country-rule parsing first; fall back to permissive E.164 shape
  // ("+" + 8–15 digits) so test/fake numbers are accepted.
  const parsed = parsePhoneNumberFromString(cleaned);
  if (parsed && isValidPhoneNumber(cleaned)) {
    return parsed.format('E.164');
  }

  if (/^\+\d{8,15}$/.test(cleaned)) {
    return cleaned;
  }

  throw new Error('Invalid phone number');
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
