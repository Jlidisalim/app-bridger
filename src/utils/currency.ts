// Maps a phone dial code to its primary currency.
// Used to display the correct symbol in pricing inputs based on the user's country.

import { useAppStore } from '../store/useAppStore';

export interface Currency {
  code: string;   // ISO 4217 code, e.g. "TND"
  symbol: string; // Display symbol — often the ISO code for currencies without a unique glyph
}

export const DEFAULT_CURRENCY: Currency = { code: 'USD', symbol: '$' };

// Dial code (without the leading "+") → currency
const DIAL_CODE_TO_CURRENCY: Record<string, Currency> = {
  // North America
  '1': { code: 'USD', symbol: '$' },
  // Europe — Eurozone
  '33': { code: 'EUR', symbol: '€' }, // France
  '49': { code: 'EUR', symbol: '€' }, // Germany
  '39': { code: 'EUR', symbol: '€' }, // Italy
  '34': { code: 'EUR', symbol: '€' }, // Spain
  '31': { code: 'EUR', symbol: '€' }, // Netherlands
  '32': { code: 'EUR', symbol: '€' }, // Belgium
  '351': { code: 'EUR', symbol: '€' }, // Portugal
  '353': { code: 'EUR', symbol: '€' }, // Ireland
  '43': { code: 'EUR', symbol: '€' }, // Austria
  '30': { code: 'EUR', symbol: '€' }, // Greece
  '358': { code: 'EUR', symbol: '€' }, // Finland
  '352': { code: 'EUR', symbol: '€' }, // Luxembourg
  '356': { code: 'EUR', symbol: '€' }, // Malta
  '357': { code: 'EUR', symbol: '€' }, // Cyprus
  '386': { code: 'EUR', symbol: '€' }, // Slovenia
  '421': { code: 'EUR', symbol: '€' }, // Slovakia
  '372': { code: 'EUR', symbol: '€' }, // Estonia
  '371': { code: 'EUR', symbol: '€' }, // Latvia
  '370': { code: 'EUR', symbol: '€' }, // Lithuania
  '377': { code: 'EUR', symbol: '€' }, // Monaco
  '378': { code: 'EUR', symbol: '€' }, // San Marino
  '423': { code: 'EUR', symbol: '€' }, // Liechtenstein (CHF officially, EUR accepted)
  // Europe — non-Euro
  '44': { code: 'GBP', symbol: '£' }, // UK
  '41': { code: 'CHF', symbol: 'CHF' }, // Switzerland
  '46': { code: 'SEK', symbol: 'kr' }, // Sweden
  '47': { code: 'NOK', symbol: 'kr' }, // Norway
  '45': { code: 'DKK', symbol: 'kr' }, // Denmark
  '48': { code: 'PLN', symbol: 'zł' }, // Poland
  '420': { code: 'CZK', symbol: 'Kč' }, // Czech Republic
  '36': { code: 'HUF', symbol: 'Ft' }, // Hungary
  '40': { code: 'RON', symbol: 'lei' }, // Romania
  '359': { code: 'BGN', symbol: 'лв' }, // Bulgaria
  '385': { code: 'EUR', symbol: '€' }, // Croatia (joined Eurozone 2023)
  '354': { code: 'ISK', symbol: 'kr' }, // Iceland
  '355': { code: 'ALL', symbol: 'L' }, // Albania
  '381': { code: 'RSD', symbol: 'дин' }, // Serbia
  '382': { code: 'EUR', symbol: '€' }, // Montenegro
  '387': { code: 'BAM', symbol: 'KM' }, // Bosnia
  '389': { code: 'MKD', symbol: 'ден' }, // North Macedonia
  '380': { code: 'UAH', symbol: '₴' }, // Ukraine
  '375': { code: 'BYN', symbol: 'Br' }, // Belarus
  '373': { code: 'MDL', symbol: 'L' }, // Moldova
  '7': { code: 'RUB', symbol: '₽' }, // Russia / Kazakhstan (KZT)
  // MENA
  '216': { code: 'TND', symbol: 'TND' }, // Tunisia
  '212': { code: 'MAD', symbol: 'MAD' }, // Morocco
  '213': { code: 'DZD', symbol: 'DZD' }, // Algeria
  '218': { code: 'LYD', symbol: 'LYD' }, // Libya
  '20': { code: 'EGP', symbol: 'EGP' }, // Egypt
  '249': { code: 'SDG', symbol: 'SDG' }, // Sudan
  '971': { code: 'AED', symbol: 'AED' }, // UAE
  '966': { code: 'SAR', symbol: 'SAR' }, // Saudi Arabia
  '974': { code: 'QAR', symbol: 'QAR' }, // Qatar
  '973': { code: 'BHD', symbol: 'BHD' }, // Bahrain
  '965': { code: 'KWD', symbol: 'KWD' }, // Kuwait
  '968': { code: 'OMR', symbol: 'OMR' }, // Oman
  '962': { code: 'JOD', symbol: 'JOD' }, // Jordan
  '961': { code: 'LBP', symbol: 'LBP' }, // Lebanon
  '963': { code: 'SYP', symbol: 'SYP' }, // Syria
  '964': { code: 'IQD', symbol: 'IQD' }, // Iraq
  '967': { code: 'YER', symbol: 'YER' }, // Yemen
  '972': { code: 'ILS', symbol: '₪' }, // Israel
  '970': { code: 'ILS', symbol: '₪' }, // Palestine
  '98': { code: 'IRR', symbol: '﷼' }, // Iran
  '90': { code: 'TRY', symbol: '₺' }, // Turkey
  // Sub-Saharan Africa
  '234': { code: 'NGN', symbol: '₦' }, // Nigeria
  '27': { code: 'ZAR', symbol: 'R' }, // South Africa
  '254': { code: 'KES', symbol: 'KSh' }, // Kenya
  '255': { code: 'TZS', symbol: 'TSh' }, // Tanzania
  '256': { code: 'UGX', symbol: 'USh' }, // Uganda
  '233': { code: 'GHS', symbol: '₵' }, // Ghana
  '251': { code: 'ETB', symbol: 'Br' }, // Ethiopia
  '221': { code: 'XOF', symbol: 'CFA' }, // Senegal
  '225': { code: 'XOF', symbol: 'CFA' }, // Côte d'Ivoire
  '237': { code: 'XAF', symbol: 'FCFA' }, // Cameroon
  // Asia
  '81': { code: 'JPY', symbol: '¥' }, // Japan
  '82': { code: 'KRW', symbol: '₩' }, // South Korea
  '86': { code: 'CNY', symbol: '¥' }, // China
  '852': { code: 'HKD', symbol: 'HK$' }, // Hong Kong
  '853': { code: 'MOP', symbol: 'MOP' }, // Macau
  '886': { code: 'TWD', symbol: 'NT$' }, // Taiwan
  '91': { code: 'INR', symbol: '₹' }, // India
  '92': { code: 'PKR', symbol: 'Rs' }, // Pakistan
  '880': { code: 'BDT', symbol: '৳' }, // Bangladesh
  '94': { code: 'LKR', symbol: 'Rs' }, // Sri Lanka
  '977': { code: 'NPR', symbol: 'Rs' }, // Nepal
  '60': { code: 'MYR', symbol: 'RM' }, // Malaysia
  '62': { code: 'IDR', symbol: 'Rp' }, // Indonesia
  '63': { code: 'PHP', symbol: '₱' }, // Philippines
  '65': { code: 'SGD', symbol: 'S$' }, // Singapore
  '66': { code: 'THB', symbol: '฿' }, // Thailand
  '84': { code: 'VND', symbol: '₫' }, // Vietnam
  '95': { code: 'MMK', symbol: 'K' }, // Myanmar
  '855': { code: 'KHR', symbol: '៛' }, // Cambodia
  '856': { code: 'LAK', symbol: '₭' }, // Laos
  // Oceania
  '61': { code: 'AUD', symbol: 'A$' }, // Australia
  '64': { code: 'NZD', symbol: 'NZ$' }, // New Zealand
  // Latin America
  '52': { code: 'MXN', symbol: 'MX$' }, // Mexico
  '55': { code: 'BRL', symbol: 'R$' }, // Brazil
  '54': { code: 'ARS', symbol: '$' }, // Argentina
  '56': { code: 'CLP', symbol: '$' }, // Chile
  '57': { code: 'COP', symbol: '$' }, // Colombia
  '51': { code: 'PEN', symbol: 'S/' }, // Peru
  '58': { code: 'VES', symbol: 'Bs' }, // Venezuela
  '598': { code: 'UYU', symbol: '$U' }, // Uruguay
  '595': { code: 'PYG', symbol: '₲' }, // Paraguay
  '591': { code: 'BOB', symbol: 'Bs' }, // Bolivia
  '593': { code: 'USD', symbol: '$' }, // Ecuador (uses USD)
};

// Strip the "+" and any formatting from a dial code string, return just the digits prefix.
const normalizeDialDigits = (input: string): string => input.replace(/[^\d]/g, '');

/**
 * Resolve currency from a phone number or dial code.
 * Accepts "+216 12 345 678", "21612345678", "+1", "1-242", etc.
 * Falls back to DEFAULT_CURRENCY when no prefix matches.
 */
export const getCurrencyFromPhone = (phoneOrDialCode: string | undefined | null): Currency => {
  if (!phoneOrDialCode) return DEFAULT_CURRENCY;
  const digits = normalizeDialDigits(phoneOrDialCode);
  if (!digits) return DEFAULT_CURRENCY;

  // Try longest-prefix match (up to 4 digits) — dial codes vary from 1 to 4 digits.
  for (let len = Math.min(4, digits.length); len >= 1; len--) {
    const prefix = digits.slice(0, len);
    const currency = DIAL_CODE_TO_CURRENCY[prefix];
    if (currency) return currency;
  }
  return DEFAULT_CURRENCY;
};

/**
 * React hook that returns the current user's currency based on their phone prefix.
 * Re-renders the caller whenever the user's phone changes.
 */
export const useUserCurrency = (): Currency => {
  const phone = useAppStore((s) => s.currentUser?.phone || s.phone);
  return getCurrencyFromPhone(phone);
};

/**
 * Format an amount with a prefixed currency symbol.
 * `decimals` defaults to 2. Pass 0 for whole-number displays.
 */
export const formatAmount = (
  amount: number | string | null | undefined,
  currency: Currency,
  decimals = 2,
): string => {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  const safe = Number.isFinite(n as number) ? (n as number) : 0;
  return `${currency.symbol}${safe.toFixed(decimals)}`;
};
