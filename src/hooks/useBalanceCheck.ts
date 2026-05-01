import { useAppStore } from '../store/useAppStore';

export interface BalanceCheckResult {
  walletBalance: number;
  isInsufficient: (price: number) => boolean;
  shortfall: (price: number) => number;
}

export const useBalanceCheck = (): BalanceCheckResult => {
  const walletBalance = useAppStore((s) => s.walletBalance);

  return {
    walletBalance,
    isInsufficient: (price: number) => walletBalance < price,
    shortfall: (price: number) => Math.max(0, price - walletBalance),
  };
};
