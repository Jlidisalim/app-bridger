// Bridger API Services - Complete Backend Integration
// All endpoints for Users, Deals, Payments, Notifications

import { apiClient, ApiResponse, PaginatedResponse, authTokens } from './client';
import { User, Deal, Package, Route, Flight, Transaction, Message, Conversation } from '../../types';

// ==================== AUTH API ====================

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const authApi = {
  // Send phone number for OTP
  sendOTP: async (phoneNumber: string): Promise<ApiResponse<{ otpSent: boolean }>> => {
    return apiClient.post('/auth/otp/send', { phone: phoneNumber });
  },

  // Verify OTP
  verifyOTP: async (phoneNumber: string, otp: string): Promise<ApiResponse<AuthTokens>> => {
    const response = await apiClient.post<AuthTokens>('/auth/otp/verify', { phone: phoneNumber, code: otp });
    if (response.success && response.data) {
      await authTokens.setTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response;
  },

  // Refresh token
  refreshToken: async (): Promise<boolean> => {
    const refreshToken = await authTokens.getRefreshToken();
    if (!refreshToken) return false;
    
    const response = await apiClient.post<AuthTokens>('/auth/refresh', { refreshToken }, false);
    if (response.success && response.data) {
      await authTokens.setTokens(response.data.accessToken, response.data.refreshToken);
      return true;
    }
    return false;
  },

  // Logout
  logout: async (): Promise<void> => {
    await apiClient.post('/auth/logout', {});
    await authTokens.clearTokens();
  },
};

// ==================== USER API ====================

export const userApi = {
  // Get current user profile
  getProfile: async (): Promise<ApiResponse<User>> => {
    return apiClient.get('/users/me');
  },

  // Update profile
  updateProfile: async (data: Partial<User>): Promise<ApiResponse<User>> => {
    return apiClient.patch('/users/me', data);
  },

  // Get user by ID
  getUser: async (userId: string): Promise<ApiResponse<User>> => {
    return apiClient.get(`/users/${userId}`);
  },

  // Upload avatar
  uploadAvatar: async (uri: string): Promise<ApiResponse<{ avatarUrl: string }>> => {
    return apiClient.patch('/users/me', { avatar: uri } as any);
  },

  // Get user stats
  getStats: async (): Promise<ApiResponse<{
    completedDeals: number;
    rating: number;
    memberSince: string;
  }>> => {
    return apiClient.get('/users/me/stats');
  },
};

// ==================== KYC API ====================

export const kycApi = {
  // Upload ID document
  uploadId: async (frontUri: string, backUri?: string): Promise<ApiResponse<{ 
    kycId: string;
    status: 'pending';
  }>> => {
    return apiClient.post('/users/me/kyc', { frontImage: frontUri, backImage: backUri });
  },

  // Submit selfie for verification
  submitSelfie: async (selfieUri: string, kycId: string): Promise<ApiResponse<{ 
    status: 'pending' | 'processing';
  }>> => {
    return apiClient.post('/users/me/kyc', { selfieImage: selfieUri, kycId });
  },

  // Check KYC status
  getStatus: async (): Promise<ApiResponse<{
    status: 'none' | 'pending' | 'approved' | 'rejected';
    verifiedAt?: string;
    rejectionReason?: string;
  }>> => {
    return apiClient.get('/users/me');
  },

  // Retry KYC after rejection
  retry: async (): Promise<ApiResponse<{ kycId: string }>> => {
    return apiClient.post('/users/me/kyc', {});
  },
};

// ==================== DEALS API ====================

export const dealsApi = {
  // Get all deals (with filters)
  getDeals: async (params: {
    page?: number;
    limit?: number;
    origin?: string;
    destination?: string;
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    minPrice?: number;
    maxPrice?: number;
  }): Promise<ApiResponse<PaginatedResponse<Deal>>> => {
    const query = new URLSearchParams(params as any).toString();
    return apiClient.get(`/deals?${query}`);
  },

  // Get single deal
  getDeal: async (dealId: string): Promise<ApiResponse<Deal>> => {
    return apiClient.get(`/deals/${dealId}`);
  },

  // Create new deal (sender)
  createDeal: async (dealData: {
    package: Package;
    route: Route;
    receiverName: string;
    receiverPhone: string;
    price: number;
    negotiable: boolean;
  }): Promise<ApiResponse<Deal>> => {
    return apiClient.post('/deals', dealData);
  },

  // Update deal
  updateDeal: async (dealId: string, data: Partial<Deal>): Promise<ApiResponse<Deal>> => {
    return apiClient.patch(`/deals/${dealId}`, data);
  },

  // Cancel deal
  cancelDeal: async (dealId: string, _reason: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.delete(`/deals/${dealId}`);
  },

  // Accept deal (traveler)
  acceptDeal: async (dealId: string): Promise<ApiResponse<Deal>> => {
    return apiClient.post(`/deals/${dealId}/match`, {});
  },

  // Counter offer
  counterOffer: async (dealId: string, price: number): Promise<ApiResponse<Deal>> => {
    return apiClient.post(`/deals/${dealId}/counter`, { price });
  },

  // Get deal tracking
  getTracking: async (dealId: string): Promise<ApiResponse<{
    deal: Deal;
    timeline: Array<{
      step: string;
      status: 'completed' | 'current' | 'pending';
      timestamp?: string;
    }>;
    currentLocation?: { lat: number; lng: number };
  }>> => {
    return apiClient.get(`/deals/${dealId}/tracking`);
  },

  // Update tracking status (pickup)
  updateTrackingStatus: async (dealId: string, _status: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.post(`/deals/${dealId}/pickup`, {});
  },

  // Get deal (includes QR code if generated)
  generateDeliveryQR: async (dealId: string): Promise<ApiResponse<{ 
    qrCode: string;
    collectionLink: string;
  }>> => {
    return apiClient.get(`/deals/${dealId}`);
  },

  // Verify QR code
  verifyQRCode: async (dealId: string, qrData: string): Promise<ApiResponse<{ 
    verified: boolean;
  }>> => {
    return apiClient.post(`/deals/${dealId}/verify-qr`, { qrPayload: qrData });
  },

  // Confirm delivery
  confirmDelivery: async (dealId: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.post(`/deals/${dealId}/deliver`, {});
  },
};

// ==================== TRIPS API ====================

export const tripsApi = {
  // Get my trips (as traveler)
  getMyTrips: async (params?: { status?: string }): Promise<ApiResponse<Array<Flight & { deals: Deal[] }>>> => {
    const query = params ? `?status=${params.status}` : '';
    return apiClient.get(`/trips${query}`);
  },

  // Create trip
  createTrip: async (tripData: {
    route: Route;
    flight: Flight;
    capacity: { weight: number; items: number };
    price: number;
    negotiable: boolean;
  }): Promise<ApiResponse<Flight>> => {
    return apiClient.post('/trips', tripData);
  },

  // Update trip
  updateTrip: async (tripId: string, data: Partial<Flight>): Promise<ApiResponse<Flight>> => {
    return apiClient.patch(`/trips/${tripId}`, data);
  },

  // Cancel trip
  cancelTrip: async (tripId: string, _reason: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.delete(`/trips/${tripId}`);
  },

  // Get popular routes
  getPopularRoutes: async (): Promise<ApiResponse<Array<{
    from: string;
    to: string;
    count: number;
  }>>> => {
    return apiClient.get('/trips/popular-routes');
  },
};

// ==================== PAYMENTS API ====================

export const paymentsApi = {
  // Get wallet balance
  getBalance: async (): Promise<ApiResponse<{
    balance: number;
    pendingBalance: number;
    availableBalance: number;
  }>> => {
    return apiClient.get('/wallet');
  },

  // Create payment intent (for escrow)
  createPaymentIntent: async (dealId: string, amount: number): Promise<ApiResponse<{
    clientSecret: string;
    paymentIntentId: string;
  }>> => {
    return apiClient.post('/wallet/deposit', { dealId, amount });
  },

  // Confirm payment
  confirmPayment: async (paymentIntentId: string): Promise<ApiResponse<{ 
    success: boolean;
    transactionId: string;
  }>> => {
    return apiClient.post('/wallet/deposit', { paymentIntentId });
  },

  // Release escrow (complete the deal)
  releaseEscrow: async (dealId: string): Promise<ApiResponse<{ 
    success: boolean;
  }>> => {
    return apiClient.post(`/deals/${dealId}/complete`, {});
  },

  // Request refund — calls real /wallet/refund endpoint
  requestRefund: async (dealId: string, reason: string): Promise<ApiResponse<{
    refundId: string;
    amount: number;
  }>> => {
    return apiClient.post('/wallet/refund', { dealId, reason });
  },

  // Get transaction history
  getTransactions: async (params?: { page?: number; limit?: number }): Promise<ApiResponse<PaginatedResponse<Transaction>>> => {
    const query = params ? `?page=${params.page}&limit=${params.limit}` : '';
    return apiClient.get(`/wallet/transactions${query}`);
  },

  // Deposit funds — backend creates a Stripe PaymentIntent and returns its clientSecret.
  // The mobile then presents Stripe's PaymentSheet to actually charge the card.
  deposit: async (
    amount: number,
  ): Promise<ApiResponse<{ clientSecret: string }>> => {
    return apiClient.post('/wallet/deposit', { amount });
  },

  // Initiate Flouci payment — backend creates payment session and returns redirect URL
  initFlouciPayment: async (amount: number, phone: string): Promise<ApiResponse<{
    paymentUrl: string;
    paymentId: string;
  }>> => {
    return apiClient.post('/wallet/flouci/init', { amount, phone });
  },

  // Verify Flouci payment after redirect
  verifyFlouciPayment: async (paymentId: string): Promise<ApiResponse<{
    success: boolean;
    transactionId: string;
  }>> => {
    return apiClient.post('/wallet/flouci/verify', { paymentId });
  },

  // Initiate D17 payment — backend sends OTP via D17
  initD17Payment: async (amount: number, phone: string): Promise<ApiResponse<{
    sessionId: string;
  }>> => {
    return apiClient.post('/wallet/d17/init', { amount, phone });
  },

  // Confirm D17 OTP
  confirmD17Payment: async (sessionId: string, otp: string): Promise<ApiResponse<{
    transactionId: string;
  }>> => {
    return apiClient.post('/wallet/d17/confirm', { sessionId, otp });
  },

  // Withdraw funds — supports card / d17 / flouci
  withdraw: async (
    amount: number,
    method: 'card' | 'd17' | 'flouci',
    details: {
      card?: { number: string; expiry: string; holder: string };
      phone?: string;
    }
  ): Promise<ApiResponse<{ transactionId: string }>> => {
    return apiClient.post('/wallet/withdraw', { amount, method, ...details });
  },

  // Initiate D17 withdrawal — backend sends OTP via D17
  initD17Withdraw: async (amount: number, phone: string): Promise<ApiResponse<{
    sessionId: string;
  }>> => {
    return apiClient.post('/wallet/d17/withdraw/init', { amount, phone });
  },

  // Confirm D17 withdrawal OTP
  confirmD17Withdraw: async (sessionId: string, otp: string): Promise<ApiResponse<{
    transactionId: string;
  }>> => {
    return apiClient.post('/wallet/d17/withdraw/confirm', { sessionId, otp });
  },

  // Initiate Flouci withdrawal — backend returns redirect URL
  initFlouciWithdraw: async (amount: number, phone: string): Promise<ApiResponse<{
    paymentUrl: string;
    paymentId: string;
  }>> => {
    return apiClient.post('/wallet/flouci/withdraw/init', { amount, phone });
  },

  // Verify Flouci withdrawal after redirect
  verifyFlouciWithdraw: async (paymentId: string): Promise<ApiResponse<{
    success: boolean;
    transactionId: string;
  }>> => {
    return apiClient.post('/wallet/flouci/withdraw/verify', { paymentId });
  },

  // Transfer to user (uses deposit endpoint)
  transfer: async (amount: number, _toUserId: string): Promise<ApiResponse<{
    transactionId: string;
  }>> => {
    return apiClient.post('/wallet/deposit', { amount });
  },
};

// ==================== MESSAGES API ====================

export const messagesApi = {
  // Get all conversations
  getConversations: async (): Promise<ApiResponse<Conversation[]>> => {
    return apiClient.get('/chat/rooms');
  },

  // Get single conversation
  getConversation: async (conversationId: string): Promise<ApiResponse<{
    conversation: Conversation;
    messages: Message[];
  }>> => {
    return apiClient.get(`/chat/rooms/${conversationId}`);
  },

  // Send message
  sendMessage: async (conversationId: string, content: string): Promise<ApiResponse<Message>> => {
    return apiClient.post(`/chat/rooms/${conversationId}/messages`, { content });
  },

  // Start new conversation
  startConversation: async (userId: string, initialMessage: string): Promise<ApiResponse<Conversation>> => {
    return apiClient.post('/chat/rooms', { userId, initialMessage });
  },

  // Mark as read
  markAsRead: async (conversationId: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.post(`/chat/rooms/${conversationId}/read`, {});
  },
};

// ==================== DISPUTES API ====================

export const disputesApi = {
  // Create dispute
  createDispute: async (dealId: string, reason: string, description: string): Promise<ApiResponse<{
    disputeId: string;
  }>> => {
    return apiClient.post('/disputes', { dealId, reason, description });
  },

  // Get dispute
  getDispute: async (disputeId: string): Promise<ApiResponse<{
    dispute: {
      id: string;
      status: 'open' | 'evidence' | 'reviewing' | 'resolved';
      reason: string;
      description: string;
      timeline: Array<{
        status: string;
        timestamp: string;
      }>;
    };
  }>> => {
    return apiClient.get(`/disputes/${disputeId}`);
  },

  // Add evidence
  addEvidence: async (disputeId: string, evidence: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.post(`/disputes/${disputeId}/evidence`, { evidence });
  },

  // Contact mediator
  contactMediator: async (disputeId: string, message: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.post(`/disputes/${disputeId}/mediator`, { message });
  },
};

// ==================== NOTIFICATIONS API ====================

export const notificationsApi = {
  // Get notification settings
  getSettings: async (): Promise<ApiResponse<{
    deals: boolean;
    messages: boolean;
    payments: boolean;
    promotions: boolean;
  }>> => {
    return apiClient.get('/notifications/settings');
  },

  // Update notification settings
  updateSettings: async (settings: {
    deals?: boolean;
    messages?: boolean;
    payments?: boolean;
    promotions?: boolean;
  }): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.patch('/notifications/settings', settings);
  },

  // Get notification history
  getHistory: async (params?: { page?: number; limit?: number }): Promise<ApiResponse<PaginatedResponse<{
    id: string;
    title: string;
    body: string;
    type: string;
    read: boolean;
    createdAt: string;
    data?: Record<string, unknown>;
  }>>> => {
    const query = params ? `?page=${params.page}&limit=${params.limit}` : '';
    return apiClient.get(`/notifications${query}`);
  },

  // Mark notification as read
  markAsRead: async (notificationId: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.patch(`/notifications/${notificationId}/read`, {});
  },

  // Mark all notifications as read
  markAllRead: async (): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.patch('/notifications/read-all', {});
  },

  // Register push token
  registerPushToken: async (token: string): Promise<ApiResponse<{ success: boolean }>> => {
    return apiClient.post('/notifications/push-token', { token });
  },
};

// ==================== SEARCH API ====================

export const searchApi = {
  // Search deals
  searchDeals: async (query: string, filters?: Record<string, unknown>): Promise<ApiResponse<Deal[]>> => {
    return apiClient.post('/search/deals', { query, filters });
  },

  // Search users
  searchUsers: async (query: string): Promise<ApiResponse<User[]>> => {
    return apiClient.post('/search/users', { query });
  },

  // Get search suggestions
  getSuggestions: async (query: string): Promise<ApiResponse<{
    deals: string[];
    users: string[];
    locations: string[];
  }>> => {
    return apiClient.get(`/search/suggestions?q=${encodeURIComponent(query)}`);
  },
};

// ==================== REVIEWS API ====================

export interface Review {
  id: string;
  dealId: string;
  authorId: string;
  targetId: string;
  rating: number;
  comment?: string;
  sentiment?: string;
  fraudScore?: number;
  flagged: boolean;
  status: 'approved' | 'pending_moderation' | 'rejected';
  createdAt: string;
  author?: { id: string; name: string; avatar?: string };
  target?: { id: string; name: string; avatar?: string };
}

export const reviewsApi = {
  // Submit a review after deal completion
  submitReview: async (data: {
    dealId: string;
    targetId: string;
    rating: number;
    comment?: string;
  }): Promise<ApiResponse<Review>> => {
    return apiClient.post('/reviews', data);
  },

  // Get all reviews for a specific deal (check if already reviewed)
  getDealReviews: async (dealId: string): Promise<ApiResponse<Review[]>> => {
    return apiClient.get(`/reviews/delivery/${dealId}`);
  },

  // Get all reviews received by a user
  getUserReviews: async (userId: string, page = 1, limit = 20): Promise<ApiResponse<{
    items: Review[];
    total: number;
    averageRating: number;
    reviewCount: number;
  }>> => {
    return apiClient.get(`/reviews/user/${userId}?page=${page}&limit=${limit}`);
  },
};

// Export all APIs
export default {
  auth: authApi,
  user: userApi,
  kyc: kycApi,
  deals: dealsApi,
  trips: tripsApi,
  payments: paymentsApi,
  messages: messagesApi,
  disputes: disputesApi,
  notifications: notificationsApi,
  search: searchApi,
  reviews: reviewsApi,
};
