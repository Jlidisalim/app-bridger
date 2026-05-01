/**
 * Pricing Utilities for Bridger
 * 
 * AI-powered pricing suggestions and commission calculations.
 */

// Popular route base prices (mock data - would come from ML model)
const ROUTE_BASE_PRICES: Record<string, number> = {
  'LHR-JFK': 45,
  'JFK-LHR': 45,
  'DXB-BOM': 35,
  'BOM-DXB': 35,
  'CDG-SIN': 55,
  'SIN-CDG': 55,
  'LAX-NRT': 50,
  'NRT-LAX': 50,
  'SFO-LHR': 48,
  'LHR-SFO': 48,
};

// Sender flat fee and traveler service-fee rate — see feeEngine.ts for full model.
export { SENDER_FLAT_FEE, TRAVELER_FEE_RATE, calculateFees } from './feeEngine';

/** @deprecated  The platform now uses a two-sided fee model (see feeEngine.ts).
 *  This constant is kept only so existing callers don't break at compile time. */
export const PLATFORM_COMMISSION_RATE = 0.08;

/**
 * Calculate AI-suggested price range based on route and package details
 */
export const getSuggestedPriceRange = (params: {
  from: string;
  to: string;
  weight?: number;
  category?: string;
}): { min: number; max: number; median: number } => {
  const routeKey = `${params.from}-${params.to}`;
  const basePrice = ROUTE_BASE_PRICES[routeKey] || 40;

  // Weight factor (heavier = more expensive)
  const weightFactor = params.weight ? params.weight * 10 : 5;

  // Category factor
  let categoryFactor = 1.0;
  switch (params.category) {
    case 'Electronics':
      categoryFactor = 1.3; // Higher risk
      break;
    case 'Documents':
      categoryFactor = 0.8; // Lower weight/risk
      break;
    case 'Gift':
      categoryFactor = 1.1;
      break;
    case 'Small Parcel':
      categoryFactor = 1.0;
      break;
  }

  const adjustedBase = basePrice * categoryFactor + weightFactor;
  const min = Math.round(adjustedBase * 0.85);
  const max = Math.round(adjustedBase * 1.15);
  const median = Math.round((min + max) / 2);

  return { min, max, median };
};

/**
 * Calculate platform commission — delegates to the fee engine.
 * @deprecated  Use calculateFees() from feeEngine.ts for the full breakdown.
 */
export const calculateCommission = (serviceFee: number): {
  commission: number;
  takeHome: number;
  commissionRate: number;
} => {
  const b = calculateFees(serviceFee);
  return {
    commission:    b.platformGrossRevenue,
    takeHome:      b.travelerNetPayout,
    commissionRate: b.travelerFeeRate,
  };
};

/**
 * Format currency amount
 */
export const formatCurrency = (amount: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

/**
 * Validate price is within acceptable range
 */
export const validatePrice = (price: number): { valid: boolean; message?: string } => {
  if (price <= 0) {
    return { valid: false, message: 'Price must be greater than $0' };
  }
  if (price > 10000) {
    return { valid: false, message: 'Price cannot exceed $10,000' };
  }
  return { valid: true };
};
