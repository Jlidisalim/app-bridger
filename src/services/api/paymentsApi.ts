import { apiClient } from './client';

export interface BalanceData {
  balance: number;
  availableBalance?: number;
  pendingBalance?: number;
}

export interface DepositPayload {
  card?: {
    number: string;
    expiry: string;
    cvv: string;
    holder: string;
  };
  phone?: string;
}

export interface D17InitData {
  sessionId: string;
}

export interface FlouciInitData {
  paymentUrl: string;
  paymentId: string;
}

export const paymentsApi = {
  getBalance: async (): Promise<{ success: boolean; data?: BalanceData; error?: string }> => {
    try {
      const response = await apiClient.get<BalanceData>('/wallet');
      return response;
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to get balance' };
    }
  },

  deposit: async (
    amount: number,
    method: 'card' | 'd17' | 'flouci',
    payload: DepositPayload
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiClient.post<{ transactionId: string }>('/payments/deposit', {
        amount,
        method,
        ...payload,
      });
      return response;
    } catch (e: any) {
      return { success: false, error: e?.message || 'Deposit failed' };
    }
  },

  initD17Payment: async (
    amount: number,
    phone: string
  ): Promise<{ success: boolean; data?: D17InitData; error?: string }> => {
    try {
      const response = await apiClient.post<D17InitData>('/payments/d17/init', {
        amount,
        phone,
      });
      return response;
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to initiate D17 payment' };
    }
  },

  confirmD17Payment: async (
    sessionId: string,
    code: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiClient.post<{ transactionId: string }>('/payments/d17/confirm', {
        sessionId,
        code,
      });
      return response;
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to confirm D17 payment' };
    }
  },

  initFlouciPayment: async (
    amount: number,
    phone: string
  ): Promise<{ success: boolean; data?: FlouciInitData; error?: string }> => {
    try {
      const response = await apiClient.post<FlouciInitData>('/payments/flouci/init', {
        amount,
        phone,
      });
      return response;
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to initiate Flouci payment' };
    }
  },

  verifyFlouciPayment: async (
    paymentId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiClient.post<{ transactionId: string }>(
        `/payments/flouci/verify/${paymentId}`,
        {}
      );
      return response;
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to verify Flouci payment' };
    }
  },
};

export default paymentsApi;