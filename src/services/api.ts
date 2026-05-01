/**
 * Bridger API Service
 * 
 * This module provides real API functions that communicate with the backend.
 * Uses the apiClient for authenticated HTTP requests.
 */

import { apiClient, authTokens } from './api/client';
import {
  sendWhatsAppOTP,
  verifyOTP as verifyLocalOTP,
  resendOTP as resendLocalOTP,
} from './whatsapp/otpService';

// Re-export API modules from the canonical api/index.ts for screens that import from there
export {
  userApi,
  kycApi,
  dealsApi,
  tripsApi,
  paymentsApi,
  messagesApi,
  disputesApi,
  notificationsApi,
  searchApi,
} from './api/index';

// Tracks whether the last sendOTP call used local mode (backend unreachable)
const _otpMode: Record<string, 'backend' | 'local'> = {};

function isNetworkError(err: string | undefined): boolean {
  return err === 'Network request failed' || err === 'Request timeout';
}

// ============================================
// Authentication API
// ============================================

export const authAPI = {
  sendOTP: async (phoneNumber: string): Promise<{ success: boolean; message: string; code?: string }> => {
    const result = await apiClient.post<{ message: string; code?: string }>('/auth/otp/send', { phone: phoneNumber }, false);
    if (result.success) {
      _otpMode[phoneNumber] = 'backend';
      return { success: true, message: result.data?.message || 'OTP sent successfully', code: result.data?.code };
    }
    // Surface real errors to the user — no silent fallback to mock mode
    const errMsg = result.error || 'Failed to send OTP';
    if (__DEV__) {
      console.error('[sendOTP] Backend error:', errMsg);
    }
    return { success: false, message: errMsg };
  },

  verifyOTP: async (phoneNumber: string, code: string): Promise<{ success: boolean; token?: string; user?: any }> => {
    // Always try backend first (especially for dev bypass code 111111)
    const result = await apiClient.post<{ accessToken: string; refreshToken: string; user: any }>('/auth/otp/verify', { phone: phoneNumber, code }, false);
    if (result.success && result.data) {
      await authTokens.setTokens(result.data.accessToken, result.data.refreshToken);
      return { success: true, token: result.data.accessToken, user: result.data.user };
    }
    // If backend returned a real error (not network), stop here
    if (!isNetworkError(result.error)) {
      return { success: false };
    }
    // Backend unreachable — fall through to local verify
    const local = await verifyLocalOTP(phoneNumber, code);
    return { success: local.success, token: local.token };
  },

  uploadKYC: async (documentUri: string, selfieUri: string): Promise<{ success: boolean; status: string }> => {
    const result = await apiClient.post<{ status: string }>('/users/me/kyc', { documentUri, selfieUri });
    return { success: result.success, status: result.data?.status || 'pending' };
  },

  getKYCStatus: async (): Promise<{ status: 'pending' | 'approved' | 'rejected' }> => {
    const result = await apiClient.get<{ kycStatus: string }>('/users/me');
    const status = result.data?.kycStatus?.toLowerCase() as 'pending' | 'approved' | 'rejected';
    return { status: status || 'pending' };
  },
};

// ============================================
// Deals API
// ============================================

export const dealsAPI = {
  createSenderDeal: async (data: {
    package: any;
    route: any;
    receiver: any;
    pricing: any;
  }): Promise<{ success: boolean; dealId: string; error?: string }> => {
    if (!data.package) throw new Error('Package details are required');
    if (!data.route)   throw new Error('Route details are required');
    if (!data.pricing) throw new Error('Pricing details are required');

    const weight = Number(data.package.weight) || 0.5;
    const packageSize: string = data.package.packageSize || (
      weight <= 0.2 ? 'SMALL' :
      weight <= 0.5 ? 'MEDIUM' :
      weight <= 2   ? 'LARGE'  : 'EXTRA_LARGE'
    );

     // Normalize pickupDate to ISO string
     let pickupDate: string | undefined;
     const rawDate = data.route.departureDate || data.route.date;
     if (rawDate) {
       try {
         const d = new Date(rawDate);
         pickupDate = isNaN(d.getTime()) ? undefined : d.toISOString();
       } catch { pickupDate = undefined; }
     }

     // Images may arrive as file URIs from the image picker; the backend stores them as provided.
     // For persistent, cross-device visibility we now capture base64 data URIs directly from the picker.
     const images: string[] = Array.isArray(data.package.images)
       ? data.package.images
       : data.package.image
       ? [data.package.image]
       : [];

     const result = await apiClient.post<{ id: string }>('/deals', {
      title: `${data.package.category ?? 'Package'} - ${data.route.from} to ${data.route.to}`,
      description: `Package: ${data.package.category ?? 'Package'}, Weight: ${weight}kg`,
      fromCity: data.route.from,
      toCity: data.route.to,
      fromCountry: data.route.fromCountry || '',
      toCountry: data.route.toCountry || '',
      packageSize,
      weight,
      isFragile: data.package.isFragile ?? false,
      itemValue: data.package.itemValue != null ? Number(data.package.itemValue) : undefined,
      price: Number(data.pricing.amount),
      currency: data.pricing.currency || 'USD',
      pickupDate,
      images,
      receiverName:  data.receiver?.name  || undefined,
      receiverPhone: data.receiver?.phone || undefined,
    });

    if (!result.success) {
      return { success: false, dealId: '', error: result.error };
    }
    return { success: true, dealId: result.data?.id || '' };
  },

  createTravelerTrip: async (data: {
    route: any;
    flight: any;
    capacity: number;
    pricing: any;
    transportType?: 'PLANE' | 'BOAT' | 'ROAD';
  }): Promise<{ success: boolean; tripId: string }> => {
    if (!data.route) throw new Error('Route is required');
    if (!data.pricing) throw new Error('Pricing is required');

    // Normalize departureDate to ISO string so backend validator accepts it
    let departureDate: string | undefined;
    const rawDate = data.flight?.date;
    if (rawDate) {
      try {
        const d = new Date(rawDate);
        departureDate = isNaN(d.getTime()) ? undefined : d.toISOString();
      } catch {
        departureDate = undefined;
      }
    }

    const result = await apiClient.post<{ id: string }>('/trips', {
      fromCity: data.route.from,
      toCity: data.route.to,
      fromCountry: data.route.fromCountry || '',
      toCountry: data.route.toCountry || '',
      departureDate,
      departureTime: data.flight?.time || undefined,
      flightNumber: data.flight?.flightNumber || undefined,
      transportType: data.transportType || 'PLANE',
      maxWeight: data.capacity,
      price: data.pricing.amount,
      currency: data.pricing.currency || 'USD',
      negotiable: data.pricing.negotiable || false,
    });
    return { success: result.success, tripId: result.data?.id || '' };
  },

  getDeals: async (filters?: {
    route?: string;
    category?: string;
    priceRange?: [number, number];
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; hasMore: boolean; total: number; page: number }> => {
    const params = new URLSearchParams();
    if (filters?.route) params.append('route', filters.route);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.priceRange) {
      params.append('minPrice', String(filters.priceRange[0]));
      params.append('maxPrice', String(filters.priceRange[1]));
    }
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.limit) params.append('limit', String(filters.limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    const result = await apiClient.get<any>(`/deals${query}`);
    const data = result.data;
    if (data && typeof data === 'object' && 'items' in data) {
      return { items: data.items || [], hasMore: data.hasMore ?? false, total: data.total ?? 0, page: data.page ?? 1 };
    }
    const items = Array.isArray(data) ? data : [];
    return { items, hasMore: false, total: items.length, page: 1 };
  },

  getDeal: async (dealId: string): Promise<any | null> => {
    const result = await apiClient.get<any>(`/deals/${dealId}`);
    return result.data || null;
  },

  getTrip: async (tripId: string): Promise<any | null> => {
    const result = await apiClient.get<any>(`/trips/${tripId}`);
    return result.data || null;
  },

  acceptDeal: async (dealId: string, price: number): Promise<{ success: boolean; error?: string }> => {
    const result = await apiClient.post<any>(`/deals/${dealId}/match`, { price });
    return { success: result.success, error: result.error };
  },

  deleteDeal: async (dealId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await apiClient.delete<any>(`/deals/${dealId}`);
    return { success: result.success, error: result.error };
  },

  deleteTrip: async (tripId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await apiClient.delete<any>(`/trips/${tripId}`);
    return { success: result.success, error: result.error };
  },

  updateDealStatus: async (dealId: string, status: string): Promise<{ success: boolean }> => {
    const result = await apiClient.post<any>(`/deals/${dealId}/status`, { status });
    return { success: result.success };
  },

  generateReceiverCode: async (dealId: string): Promise<{ success: boolean; receiverCode?: string; error?: string }> => {
    const result = await apiClient.post<{ receiverCode: string }>(`/deals/${dealId}/generate-receiver-code`, {});
    if (result.success && result.data?.receiverCode) {
      return { success: true, receiverCode: result.data.receiverCode };
    }
    return { success: false, error: result.error };
  },

  verifyReceiverCode: async (dealId: string, code: string): Promise<{ success: boolean; verified?: boolean; error?: string }> => {
    const result = await apiClient.post<{ verified: boolean }>(`/deals/receiver-verify`, { dealId, receiverCode: code });
    return { success: result.success, verified: result.data?.verified, error: result.error };
  },

  generateTravelerReceiverCode: async (tripId: string): Promise<{ success: boolean; receiverCode?: string; error?: string }> => {
    const result = await apiClient.post<{ receiverCode: string }>(`/trips/${tripId}/generate-receiver-code`, {});
    if (result.success && result.data?.receiverCode) {
      return { success: true, receiverCode: result.data.receiverCode };
    }
    return { success: false, error: result.error };
  },

  verifyTravelerReceiverCode: async (tripId: string, code: string): Promise<{ success: boolean; verified?: boolean; error?: string }> => {
    const result = await apiClient.post<{ verified: boolean }>(`/trips/receiver-verify`, { tripId, receiverCode: code });
    return { success: result.success, verified: result.data?.verified, error: result.error };
  },
};

// ============================================
// Payment API
// ============================================

export const paymentAPI = {
  createEscrow: async (dealId: string, amount: number): Promise<{ success: boolean; escrowId: string }> => {
    const result = await apiClient.post<{ id: string }>('/wallet/deposit', { amount, dealId });
    return { success: result.success, escrowId: result.data?.id || '' };
  },

  releaseEscrow: async (escrowId: string): Promise<{ success: boolean }> => {
    const result = await apiClient.post<any>(`/wallet/release`, { transactionId: escrowId });
    return { success: result.success };
  },

  getWalletBalance: async (): Promise<{ balance: number; currency: string }> => {
    const result = await apiClient.get<{ balance: number }>('/wallet');
    return { balance: result.data?.balance || 0, currency: 'USD' };
  },

  getTransactions: async (): Promise<any[]> => {
    const result = await apiClient.get<{ items: any[] }>('/wallet/transactions');
    return result.data?.items || [];
  },

  withdraw: async (amount: number, method: string): Promise<{ success: boolean }> => {
    const result = await apiClient.post<any>('/wallet/withdraw', { amount, method });
    return { success: result.success };
  },
};

// ============================================
// Chat API
// ============================================

export const chatAPI = {
  getConversations: async (): Promise<any[]> => {
    const result = await apiClient.get<any[]>('/chat/rooms');
    return result.data || [];
  },

  getMessages: async (conversationId: string): Promise<any[]> => {
    const result = await apiClient.get<any>(`/chat/rooms/${conversationId}/messages`);
    return result.data?.items || result.data || [];
  },

  sendMessage: async (conversationId: string, text: string): Promise<{ success: boolean; messageId: string; error?: string }> => {
    const result = await apiClient.post<{ id: string }>(`/chat/rooms/${conversationId}/messages`, { content: text });
    return { success: result.success, messageId: result.data?.id || '', error: result.error };
  },

  // Send a structured message (image / location / etc.) — sender provides content + extra fields.
  sendStructuredMessage: async (
    conversationId: string,
    payload: { content: string; type: 'TEXT' | 'IMAGE' | 'LOCATION'; imageUrl?: string; latitude?: number; longitude?: number; address?: string; replyToId?: string }
  ): Promise<{ success: boolean; messageId: string; error?: string }> => {
    const result = await apiClient.post<{ id: string }>(`/chat/rooms/${conversationId}/messages`, payload);
    return { success: result.success, messageId: result.data?.id || '', error: result.error };
  },

  // Upload a chat image attachment. Returns the public URL of the saved file.
  uploadImage: async (uri: string, mimeType = 'image/jpeg'): Promise<string> => {
    const formData = new FormData();
    const filename = uri.split('/').pop() || `chat_${Date.now()}.jpg`;
    formData.append('image', { uri, name: filename, type: mimeType } as any);
    const result = await apiClient.upload<{ url: string }>('/chat/upload', formData);
    if (!result.success || !result.data?.url) {
      throw new Error(result.error || 'Failed to upload image');
    }
    return result.data.url;
  },

  // Find existing chat room for a deal or trip, or create one.
  // Pass type='trip' when the id refers to a Trip record.
  // NOTE: The backend handles "get or create" logic - it finds existing rooms
  // by dealId/tripId even if the current user hasn't opened them yet.
  getOrCreateRoom: async (id: string, type: 'deal' | 'trip' = 'deal'): Promise<string> => {
    const body = type === 'trip' ? { tripId: id } : { dealId: id };
    const result = await apiClient.post<{ id: string }>('/chat/rooms', body);
    return result.data?.id || '';
  },
};

// ============================================
// User moderation API (block / report)
// ============================================

export type ReportReason =
  | 'SPAM'
  | 'SCAM'
  | 'HARASSMENT'
  | 'INAPPROPRIATE'
  | 'FAKE_LISTING'
  | 'IMPERSONATION'
  | 'OTHER';

export const userModerationAPI = {
  blockUser: async (userId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await apiClient.post<any>(`/users/${userId}/block`, {});
    return { success: result.success, error: result.error };
  },

  unblockUser: async (userId: string): Promise<{ success: boolean; error?: string }> => {
    const result = await apiClient.delete<any>(`/users/${userId}/block`);
    return { success: result.success, error: result.error };
  },

  getBlockStatus: async (userId: string): Promise<{ blockedByMe: boolean; blockedByThem: boolean; anyBlock: boolean }> => {
    const result = await apiClient.get<{ blockedByMe: boolean; blockedByThem: boolean; anyBlock: boolean }>(`/users/${userId}/block`);
    return result.data || { blockedByMe: false, blockedByThem: false, anyBlock: false };
  },

  listBlockedUsers: async (): Promise<any[]> => {
    const result = await apiClient.get<any[]>('/users/me/blocks');
    return result.data || [];
  },

  reportUser: async (
    userId: string,
    reason: ReportReason,
    description?: string,
    chatRoomId?: string
  ): Promise<{ success: boolean; reportId?: string; error?: string }> => {
    const result = await apiClient.post<{ report?: { id: string } }>(`/users/${userId}/report`, {
      reason,
      description,
      chatRoomId,
    });
    return { success: result.success, reportId: result.data?.report?.id, error: result.error };
  },
};

// ============================================
// Pricing AI API
// ============================================

// Compact IATA → [lat, lng] lookup for ML price estimation
const AIRPORT_COORDS: Record<string, [number, number]> = {
  JFK:[-73.7781,40.6413],LAX:[-118.4081,33.9425],ORD:[-87.9073,41.9742],ATL:[-84.4277,33.6407],
  DFW:[-97.0403,32.8998],SFO:[-122.379,37.6213],MIA:[-80.287,25.7959],SEA:[-122.3088,47.4502],
  BOS:[-71.0096,42.3656],DEN:[-104.6737,39.8561],IAH:[-95.3414,29.9844],EWR:[-74.1745,40.6895],
  MSP:[-93.2223,44.8848],DTW:[-83.3534,42.2124],PHX:[-112.0078,33.4373],LAS:[-115.1537,36.084],
  MCO:[-81.308,28.4312],YYZ:[-79.6248,43.6777],YVR:[-123.1792,49.1947],YUL:[-73.7408,45.4706],
  MEX:[-99.0721,19.4363],GRU:[-46.4731,-23.4356],EZE:[-58.5358,-34.8222],SCL:[-70.7858,-33.393],
  BOG:[-74.1469,4.7016],LIM:[-77.1143,-12.0219],LHR:[-0.4543,51.47],CDG:[2.5479,49.0097],
  FRA:[8.5622,50.0379],AMS:[4.7683,52.3105],MAD:[-3.5676,40.4983],BCN:[2.0785,41.2971],
  FCO:[12.2389,41.8003],MXP:[8.7231,45.63],MUC:[11.775,48.3538],ZRH:[8.5492,47.4647],
  VIE:[16.5697,48.1103],IST:[28.7519,41.2753],CPH:[12.656,55.618],OSL:[11.1004,60.1939],
  ARN:[17.9186,59.6519],HEL:[24.963,60.3172],DUB:[-6.2499,53.4264],LIS:[-9.1354,38.7756],
  ATH:[23.9445,37.9364],WAW:[20.9671,52.1657],PRG:[14.26,50.1008],BRU:[4.4844,50.9014],
  DXB:[55.3657,25.2532],AUH:[54.6511,24.433],DOH:[51.6081,25.2731],RUH:[46.6989,24.9578],
  JED:[39.1525,21.6702],BAH:[50.6336,26.2708],MCT:[58.2844,23.5933],AMM:[35.9932,31.7226],
  TLV:[34.8854,32.0055],KWI:[47.9689,29.2266],SIN:[103.9915,1.3644],HKG:[113.9185,22.308],
  NRT:[140.3864,35.7647],HND:[139.7798,35.5494],ICN:[126.4407,37.4602],PEK:[116.6031,40.0799],
  PVG:[121.8083,31.1443],CAN:[113.299,23.3924],BKK:[100.7501,13.69],KUL:[101.7099,2.7456],
  CGK:[106.6558,-6.1256],MNL:[121.0194,14.5086],DEL:[77.1,28.5562],BOM:[72.8656,19.0896],
  BLR:[77.7066,13.1986],SGN:[106.6519,10.8185],HAN:[105.807,21.2212],TPE:[121.2328,25.0777],
  SYD:[151.1772,-33.9461],MEL:[144.8433,-37.6733],BNE:[153.1175,-27.3842],AKL:[174.7917,-37.0082],
  JNB:[28.246,-26.1392],CPT:[18.6017,-33.9649],CAI:[31.4056,30.1219],ADD:[38.7993,8.9779],
  NBO:[36.9278,-1.3192],LOS:[3.3212,6.5774],CMN:[-7.5898,33.3675],ALG:[3.2154,36.691],
  TUN:[10.2272,36.851],DAR:[39.2026,-6.878],ACC:[-0.1668,5.6052],CMB:[79.8841,7.1808],
};

export const pricingAPI = {
  getSuggestedPrice: async (route: { from: string; to: string }, packageWeight: number): Promise<{
    min: number;
    max: number;
    median: number;
    confidence: number;
    distanceKm?: number;
  }> => {
    const fromCode = route.from?.toUpperCase().trim();
    const toCode = route.to?.toUpperCase().trim();
    const fromCoords = AIRPORT_COORDS[fromCode];
    const toCoords = AIRPORT_COORDS[toCode];

    if (fromCoords && toCoords) {
      try {
        const [fromLng, fromLat] = fromCoords;
        const [toLng, toLat] = toCoords;
        const result = await apiClient.get<{
          estimatedPrice: number; minPrice: number; maxPrice: number;
          confidence: number; distanceKm: number;
        }>(
          `/ml/estimate-price?fromLat=${fromLat}&fromLng=${fromLng}&toLat=${toLat}&toLng=${toLng}&weight=${packageWeight}`
        );
        if (result.success && result.data) {
          const d = result.data;
          return {
            min: Math.round(d.minPrice),
            max: Math.round(d.maxPrice),
            median: Math.round(d.estimatedPrice),
            confidence: d.confidence,
            distanceKm: d.distanceKm,
          };
        }
      } catch {
        // Fall through to local estimate
      }
    }

    // Fallback local estimate if coords not found or endpoint fails
    const basePrice = 35;
    const weightFactor = packageWeight * 10;
    const min = Math.round(basePrice);
    const max = Math.round(basePrice + weightFactor + 10);
    return { min, max, median: Math.round((min + max) / 2), confidence: 0.5 };
  },
};

// ============================================
// Dispute API
// ============================================

export type DisputeType =
  | 'ITEM_DAMAGED'
  | 'ITEM_LOST'
  | 'NOT_DELIVERED'
  | 'WRONG_ITEM'
  | 'FRAUD'
  | 'OTHER';

export const disputeAPI = {
  createDispute: async (
    dealId: string,
    reason: string,
    opts?: { disputeType?: DisputeType; description?: string },
  ): Promise<{ success: boolean; disputeId: string; error?: string }> => {
    const result = await apiClient.post<{ id: string }>('/disputes', {
      dealId,
      reason,
      disputeType: opts?.disputeType ?? 'OTHER',
      ...(opts?.description ? { description: opts.description } : {}),
    });
    return { success: result.success, disputeId: result.data?.id || '', error: result.error };
  },

  // Submit a JSON evidence item (text note or external URL)
  submitEvidenceJson: async (
    disputeId: string,
    payload: { type?: 'TEXT' | 'PHOTO' | 'VIDEO' | 'DOCUMENT'; content?: string; url?: string },
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await apiClient.post<any>(`/disputes/${disputeId}/evidence`, payload);
    return { success: result.success, error: result.error };
  },

  // Upload a single binary evidence file
  uploadEvidenceFile: async (disputeId: string, formData: FormData) => {
    return apiClient.upload<any>(`/disputes/${disputeId}/evidence/upload`, formData);
  },

  getDispute: async (disputeId: string) => {
    return apiClient.get<any>(`/disputes/${disputeId}`);
  },

  getTimeline: async (disputeId: string) => {
    return apiClient.get<{ items: any[] }>(`/disputes/${disputeId}/timeline`);
  },

  getMessages: async (disputeId: string, limit = 200) => {
    return apiClient.get<{ items: any[] }>(`/disputes/${disputeId}/messages?limit=${limit}`);
  },

  sendMessage: async (disputeId: string, content: string) => {
    return apiClient.post<any>(`/disputes/${disputeId}/messages`, { content });
  },

  sendAttachment: async (disputeId: string, formData: FormData) => {
    return apiClient.upload<any>(`/disputes/${disputeId}/messages/attachment`, formData);
  },

  escalate: async (disputeId: string) => {
    return apiClient.post<{ success: boolean }>(`/disputes/${disputeId}/mediator`, {});
  },

  listForDeal: async (dealId: string) => {
    return apiClient.get<{ items: any[] }>(`/disputes?dealId=${encodeURIComponent(dealId)}`);
  },
};
