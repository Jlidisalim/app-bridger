// Bridger Stripe Payment Service
// Handles escrow payments, deposits, and withdrawals

// Note: In React Native Stripe, initialization is done via the StripeProvider component
// This service handles business logic and API calls

import Constants from 'expo-constants';
import { apiClient } from '../api/client';
import { calculateFees } from '../../utils/feeEngine';

// API Types
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Get Stripe publishable key from app config - NEVER hardcode
const getStripePublishableKey = (): string => {
  const key = Constants.expoConfig?.extra?.stripePublishableKey;
  if (!key) {
    throw new Error('Missing Stripe publishable key. Configure in app.json or environment.');
  }
  return key;
};

// Real API calls via backend
const apiCalls = {
  createPaymentIntent: async (dealId: string, amount: number): Promise<ApiResponse<{
    clientSecret: string;
    paymentIntentId: string;
  }>> => {
    const response = await apiClient.post<{ clientSecret: string }>('/wallet/deposit', { amount, dealId });
    const clientSecret = response.data?.clientSecret || '';
    return { success: true, data: { clientSecret, paymentIntentId: clientSecret.split('_secret')[0] } };
  },

  confirmPayment: async (paymentIntentId: string): Promise<ApiResponse<{
    success: boolean;
    transactionId: string;
  }>> => {
    // Confirmation happens on the Stripe SDK side; backend processes via webhook
    return { success: true, data: { success: true, transactionId: paymentIntentId } };
  },

  releaseEscrow: async (dealId: string): Promise<ApiResponse<{ success: boolean }>> => {
    await apiClient.post(`/deals/${dealId}/complete`, {});
    return { success: true };
  },

  requestRefund: async (dealId: string, reason: string): Promise<ApiResponse<{
    refundId: string;
  }>> => {
    const response = await apiClient.post<{ id: string }>('/disputes', { dealId, reason });
    return { success: true, data: { refundId: response.data?.id || '' } };
  },

  getBalance: async (): Promise<ApiResponse<{
    balance: number;
    pendingBalance: number;
    availableBalance: number;
  }>> => {
    const response = await apiClient.get<{ balance: number; pendingBalance: number; availableBalance: number }>('/wallet');
    return {
      success: true,
      data: {
        balance: response.data?.balance || 0,
        pendingBalance: response.data?.pendingBalance || 0,
        availableBalance: response.data?.availableBalance || 0,
      },
    };
  },

  withdraw: async (amount: number, _bankAccountId: string): Promise<ApiResponse<{
    transactionId: string;
  }>> => {
    const response = await apiClient.post<{ message: string }>('/wallet/withdraw', { amount });
    return { success: true, data: { transactionId: response.data?.message || 'pending' } };
  },

  transfer: async (amount: number, toUserId: string): Promise<ApiResponse<{
    transactionId: string;
  }>> => {
    const response = await apiClient.post<{ transactionId: string }>('/wallet/transfer', { amount, toUserId });
    return { success: true, data: { transactionId: response.data?.transactionId || 'pending' } };
  },
};

// Payment Service
export const paymentService = {
  // Create and present payment sheet for escrow
  createEscrowPayment: async (
    dealId: string,
    amount: number,
    description: string
  ): Promise<{
    success: boolean;
    clientSecret?: string;
    paymentIntentId?: string;
    error?: string;
  }> => {
    try {
      // Create payment intent on backend
      const response = await apiCalls.createPaymentIntent(dealId, amount);
      
      if (!response.success || !response.data) {
        return { success: false, error: response.error || 'Failed to create payment' };
      }

      return {
        success: true,
        clientSecret: response.data.clientSecret,
        paymentIntentId: response.data.paymentIntentId,
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Payment failed' 
      };
    }
  },

  // Confirm payment (called after user completes payment)
  confirmEscrowPayment: async (
    paymentIntentId: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> => {
    try {
      const response = await apiCalls.confirmPayment(paymentIntentId);
      
      if (!response.success || !response.data) {
        return { success: false, error: response.error || 'Failed to confirm payment' };
      }

      return {
        success: true,
        transactionId: response.data.transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Confirmation failed',
      };
    }
  },

  // Release escrow to traveler (after QR confirmation)
  releaseEscrowToTraveler: async (
    dealId: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await apiCalls.releaseEscrow(dealId);
      
      if (!response.success) {
        return { success: false, error: response.error || 'Failed to release funds' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Release failed',
      };
    }
  },

  // Request refund for cancelled deal
  requestRefund: async (
    dealId: string,
    reason: string
  ): Promise<{ success: boolean; refundId?: string; error?: string }> => {
    try {
      const response = await apiCalls.requestRefund(dealId, reason);
      
      if (!response.success || !response.data) {
        return { success: false, error: response.error || 'Failed to request refund' };
      }

      return {
        success: true,
        refundId: response.data.refundId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Refund request failed',
      };
    }
  },

  // Deposit funds to wallet
  depositFunds: async (
    amount: number,
    _cardDetails: {
      number: string;
      expMonth: number;
      expYear: number;
      cvc: string;
    }
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> => {
    try {
      // Create payment intent via backend; Stripe SDK handles card collection
      const response = await apiCalls.createPaymentIntent('deposit', amount);
      
      if (!response.success || !response.data) {
        return { success: false, error: response.error || 'Failed to create deposit' };
      }

      return {
        success: true,
        transactionId: response.data.paymentIntentId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Deposit failed',
      };
    }
  },

  // Withdraw funds from wallet
  withdrawFunds: async (
    amount: number,
    bankAccountId: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> => {
    try {
      const response = await apiCalls.withdraw(amount, bankAccountId);
      
      if (!response.success || !response.data) {
        return { success: false, error: response.error || 'Failed to withdraw' };
      }

      return {
        success: true,
        transactionId: response.data.transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Withdrawal failed',
      };
    }
  },

  // Transfer to another user
  transferToUser: async (
    amount: number,
    toUserId: string
  ): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> => {
    try {
      const response = await apiCalls.transfer(amount, toUserId);
      
      if (!response.success || !response.data) {
        return { success: false, error: response.error || 'Failed to transfer' };
      }

      return {
        success: true,
        transactionId: response.data.transactionId,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Transfer failed',
      };
    }
  },

  // Get wallet balance
  getWalletBalance: async (): Promise<{
    success: boolean;
    balance?: number;
    pendingBalance?: number;
    availableBalance?: number;
    error?: string;
  }> => {
    try {
      const response = await apiCalls.getBalance();
      
      if (!response.success || !response.data) {
        return { success: false, error: response.error || 'Failed to get balance' };
      }

      return {
        success: true,
        balance: response.data.balance,
        pendingBalance: response.data.pendingBalance,
        availableBalance: response.data.availableBalance,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get balance',
      };
    }
  },

  // Platform gross revenue for a deal (sender flat fee + traveler 8% service fee).
  calculateCommission: (amount: number): number => {
    const { platformGrossRevenue } = calculateFees(amount);
    return platformGrossRevenue;
  },

  // Traveler net payout after 8% service fee.
  calculateTakeHome: (serviceFee: number): number => {
    const { travelerNetPayout } = calculateFees(serviceFee);
    return travelerNetPayout;
  },

  // Format currency
  formatCurrency: (amount: number, currency = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  },
};

export default paymentService;
