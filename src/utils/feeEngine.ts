/**
 * Bridger Fee Engine
 *
 * Universal transaction cost model — two-sided marketplace with admin layer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * MATHEMATICAL MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Symbols
 *  ───────
 *  P          = agreed deal price between sender and traveler  (USD)
 *  F_s        = SENDER_FLAT_FEE   = $2.00   (fixed, charged at deal creation)
 *  r_t        = TRAVELER_FEE_RATE = 0.08    (8%, charged at package completion)
 *  k          = ADMIN_KAPI_RATE             (admin operating-cost rate, default 1.5%)
 *
 *  ─── Sender (charged at deal creation / match) ───────────────────────────
 *
 *    senderTotalCost = P + F_s
 *    senderFlatFee   = F_s = $2.00                                … (1)
 *
 *  ─── Traveler (charged at package completion) ─────────────────────────────
 *
 *    travelerServiceFee = P × r_t = P × 0.08                     … (2)
 *    travelerNetPayout  = P − travelerServiceFee
 *                       = P × (1 − r_t)
 *                       = P × 0.92                               … (3)
 *
 *  ─── Platform gross revenue ───────────────────────────────────────────────
 *
 *    platformGross = F_s + travelerServiceFee
 *                  = 2.00 + P × 0.08                             … (4)
 *
 *  ─── Admin Kapi layer (analytics / operating cost deduction) ─────────────
 *
 *    adminKapiFee  = platformGross × k
 *                  = (2.00 + 0.08P) × k                          … (5)
 *
 *    platformNet   = platformGross − adminKapiFee
 *                  = platformGross × (1 − k)
 *                  = (2.00 + 0.08P) × (1 − k)                   … (6)
 *
 *  ─── Universal formulas (closed form) ────────────────────────────────────
 *
 *    senderTotalCost(P)  = P + 2.00
 *    travelerNetPayout(P)= 0.92 × P
 *    platformGross(P)    = 2.00 + 0.08 × P
 *    adminKapiFee(P)     = (2.00 + 0.08P) × k
 *    platformNet(P)      = (2.00 + 0.08P) × (1 − k)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Fixed fee charged to the sender when a deal is created or matched. */
export const SENDER_FLAT_FEE = 2.00;

/** Percentage of the deal price charged to the traveler on package completion. */
export const TRAVELER_FEE_RATE = 0.08;

/** Admin Kapi rate: platform operating/gateway cost deducted from gross revenue. */
export const ADMIN_KAPI_RATE = 0.015;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FeeBreakdown {
  /** Agreed deal price P */
  dealPrice: number;

  // ── Sender (at deal creation) ──────────────────────────────────────────────
  /** Fixed $2.00 platform charge on the sender */
  senderFlatFee: number;
  /** Total amount the sender actually pays = P + $2.00 */
  senderTotalCost: number;

  // ── Traveler (at completion) ───────────────────────────────────────────────
  /** 8% of P deducted from the traveler's earnings */
  travelerServiceFee: number;
  /** Amount the traveler receives after the 8% deduction = P × 0.92 */
  travelerNetPayout: number;

  // ── Platform revenue ───────────────────────────────────────────────────────
  /** Total platform revenue before Admin Kapi = $2.00 + (P × 8%) */
  platformGrossRevenue: number;

  // ── Admin Kapi layer ───────────────────────────────────────────────────────
  /** Admin Kapi cost deducted from platform gross = platformGross × k */
  adminKapiFee: number;
  /** Net revenue retained by the platform after Admin Kapi */
  platformNetRevenue: number;

  // ── Rates used (for display) ───────────────────────────────────────────────
  travelerFeeRate: number;
  adminKapiRate: number;
}

// ─── Core calculation ─────────────────────────────────────────────────────────

/**
 * Calculate the full transaction cost breakdown for a given deal price.
 *
 * @param dealPrice  The agreed price P between sender and traveler.
 * @returns          Typed breakdown covering all parties and the Admin Kapi layer.
 */
export const calculateFees = (dealPrice: number): FeeBreakdown => {
  const P = Math.max(0, dealPrice);

  // ── (1) Sender ──────────────────────────────────────────────────────────────
  const senderFlatFee     = SENDER_FLAT_FEE;                    // $2.00
  const senderTotalCost   = r2(P + senderFlatFee);              // P + 2.00

  // ── (2)(3) Traveler ─────────────────────────────────────────────────────────
  const travelerServiceFee = r2(P * TRAVELER_FEE_RATE);         // P × 0.08
  const travelerNetPayout  = r2(P - travelerServiceFee);        // P × 0.92

  // ── (4) Platform gross ──────────────────────────────────────────────────────
  const platformGrossRevenue = r2(senderFlatFee + travelerServiceFee); // 2 + 0.08P

  // ── (5)(6) Admin Kapi ───────────────────────────────────────────────────────
  const adminKapiFee        = r2(platformGrossRevenue * ADMIN_KAPI_RATE);
  const platformNetRevenue  = r2(platformGrossRevenue - adminKapiFee);

  return {
    dealPrice:            P,
    senderFlatFee,
    senderTotalCost,
    travelerServiceFee,
    travelerNetPayout,
    platformGrossRevenue,
    adminKapiFee,
    platformNetRevenue,
    travelerFeeRate:  TRAVELER_FEE_RATE,
    adminKapiRate:    ADMIN_KAPI_RATE,
  };
};

// ─── Admin Kapi analytics helper ─────────────────────────────────────────────

export interface AdminKapiAnalytics {
  totalDeals: number;
  totalGrossRevenue: number;
  totalAdminKapiFees: number;
  totalNetRevenue: number;
  /** Net revenue margin after Admin Kapi (0–1) */
  netMargin: number;
}

/**
 * Aggregate Admin Kapi analytics across a set of deal prices.
 * Feed this into your dashboard / analytics pipeline.
 */
export const aggregateAdminKapi = (dealPrices: number[]): AdminKapiAnalytics => {
  const breakdowns = dealPrices.map(calculateFees);

  const totalGrossRevenue = r2(breakdowns.reduce((s, b) => s + b.platformGrossRevenue, 0));
  const totalAdminKapiFees = r2(breakdowns.reduce((s, b) => s + b.adminKapiFee, 0));
  const totalNetRevenue = r2(totalGrossRevenue - totalAdminKapiFees);

  return {
    totalDeals:        dealPrices.length,
    totalGrossRevenue,
    totalAdminKapiFees,
    totalNetRevenue,
    netMargin:         totalGrossRevenue > 0
      ? r2(totalNetRevenue / totalGrossRevenue)
      : 0,
  };
};

// ─── Convenience re-exports (backwards-compat shims) ─────────────────────────

/** @deprecated  Use calculateFees(price).platformNetRevenue instead. */
export const calculateCommission = (price: number) => {
  const b = calculateFees(price);
  return {
    commission:      b.platformGrossRevenue,
    takeHome:        b.travelerNetPayout,
    commissionRate:  b.travelerFeeRate,
  };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Round to 2 decimal places (banker-safe). */
const r2 = (n: number): number => Math.round(n * 100) / 100;
