import { useMemo } from 'react';
import { calculateFees, type FeeBreakdown } from '../utils/feeEngine';
import { formatAmount, useUserCurrency } from '../utils/currency';

export interface FeeBreakdownFormatted extends FeeBreakdown {
  fmt: {
    dealPrice: string;
    senderFlatFee: string;
    senderTotalCost: string;
    travelerServiceFee: string;
    travelerNetPayout: string;
    platformGrossRevenue: string;
    adminKapiFee: string;
    platformNetRevenue: string;
    travelerFeeRatePct: string;
    adminKapiRatePct: string;
  };
}

/**
 * React hook — returns a fully typed, pre-formatted fee breakdown for a deal price.
 * Re-computes only when `dealPrice` or the user's currency changes.
 */
export const useFeeBreakdown = (dealPrice: number): FeeBreakdownFormatted => {
  const currency = useUserCurrency();

  return useMemo(() => {
    const b = calculateFees(dealPrice);
    const f = (n: number) => formatAmount(n, currency);
    const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

    return {
      ...b,
      fmt: {
        dealPrice:            f(b.dealPrice),
        senderFlatFee:        f(b.senderFlatFee),
        senderTotalCost:      f(b.senderTotalCost),
        travelerServiceFee:   f(b.travelerServiceFee),
        travelerNetPayout:    f(b.travelerNetPayout),
        platformGrossRevenue: f(b.platformGrossRevenue),
        adminKapiFee:         f(b.adminKapiFee),
        platformNetRevenue:   f(b.platformNetRevenue),
        travelerFeeRatePct:   pct(b.travelerFeeRate),
        adminKapiRatePct:     pct(b.adminKapiRate),
      },
    };
  }, [dealPrice, currency]);
};
