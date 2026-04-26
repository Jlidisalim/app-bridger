import { create } from 'zustand';
import {
  User,
  Package,
  Route,
  Flight,
  Pricing,
  Deal,
  Transaction,
  ChatConversation,
  PackageCategory,
} from '../types';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dealsAPI, paymentAPI, chatAPI, paymentsApi } from '../services/api';
import apiClient from '../services/api/client';
import { disconnectSocket } from '../hooks/useSocket';
import {
  FAKE_USER,
  FAKE_DEALS,
  FAKE_TRANSACTIONS,
  FAKE_CONVERSATIONS,
  FAKE_WALLET_BALANCE,
} from '../mocks/fakeData';
import { avatarCache } from '../services/avatar/avatarCache';

// ============================================
// Bridger - Global App Store (Zustand)
// ============================================

interface AppStore {
  // --- Auth State ---
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  currentUser: User | null;
  phone: string;

  // --- KYC State ---
  kycDocumentType: 'id_card' | 'passport' | 'license' | null;
  kycDocumentFront: string | null;
  kycDocumentBack: string | null;
  kycSelfie: string | null;
  kycStatus: 'not_started' | 'pending' | 'approved' | 'rejected';

  // --- Face Verification State ---
  faceEmbedding: number[] | null;
  idEmbedding: number[] | null;
  faceVerificationStatus: 'idle' | 'capturing' | 'uploading_id' | 'comparing' | 'verified' | 'failed';
  faceConfidence: number | null;
  faceVerificationMessage: string | null;

  // --- Extracted ID Info (from OCR) ---
  extractedIdNumber: string | null;
  extractedBirthday: string | null;

  // --- Mode ---
  mode: 'sender' | 'traveler';

  // --- Sender Flow Data ---
  senderPackage: Package | null;
  senderRoute: Route | null;
  senderReceiver: { name: string; phone: string } | null;
  senderPricing: Pricing | null;

  // --- Traveler Flow Data ---
  travelerRoute: Route | null;
  travelerFlight: Flight | null;
  travelerCapacity: number;
  travelerPricing: Pricing | null;
  travelerPackageTypes: PackageCategory[];
  travelerDescription: string;

  // --- Deals ---
  deals: Deal[];
  activeDeal: Deal | null;

  // --- Trips (traveler posts) ---
  trips: any[];
  tripsPage: number;
  tripsHasMore: boolean;

  // --- Wallet ---
  walletBalance: number;
  transactions: Transaction[];

  // --- Chat ---
  conversations: ChatConversation[];

  // --- Notifications ---
  unreadNotificationCount: number;

  // --- Loading & Error ---
  isLoading: boolean;
  conversationsLoading: boolean;
  error: string | null;

  // --- Auth Actions ---
  setPhone: (phone: string) => void;
  setAuthenticated: (value: boolean) => void;
  setOnboardingComplete: (value: boolean) => void;
  setCurrentUser: (user: User | null) => void;
  logout: () => void;

  // --- KYC Actions ---
  setKYCDocumentType: (type: 'id_card' | 'passport' | 'license') => void;
  setKYCDocumentFront: (uri: string) => void;
  setKYCDocumentBack: (uri: string) => void;
  setKYCSelfie: (uri: string) => void;
  setKYCStatus: (status: 'not_started' | 'pending' | 'approved' | 'rejected') => void;
  clearKYC: () => void;

  // --- Face Verification Actions ---
  setFaceEmbedding: (embedding: number[] | null) => void;
  setIdEmbedding: (embedding: number[] | null) => void;
  setFaceVerificationStatus: (status: 'idle' | 'capturing' | 'uploading_id' | 'comparing' | 'verified' | 'failed') => void;
  setFaceConfidence: (confidence: number | null) => void;
  setFaceVerificationMessage: (message: string | null) => void;
  resetFaceVerification: () => void;
  setExtractedIdNumber: (v: string | null) => void;
  setExtractedBirthday: (v: string | null) => void;

  // --- Mode Actions ---
  setMode: (mode: 'sender' | 'traveler') => void;
  toggleMode: () => void;

  // --- Sender Flow Actions ---
  setSenderPackage: (pkg: Package | null) => void;
  setSenderRoute: (route: Route | null) => void;
  setSenderReceiver: (receiver: { name: string; phone: string } | null) => void;
  setSenderPricing: (pricing: Pricing | null) => void;
  clearSenderFlow: () => void;

  // --- Traveler Flow Actions ---
  setTravelerRoute: (route: Route | null) => void;
  setTravelerFlight: (flight: Flight | null) => void;
  setTravelerCapacity: (capacity: number) => void;
  setTravelerPricing: (pricing: Pricing | null) => void;
  setTravelerPackageTypes: (types: PackageCategory[]) => void;
  setTravelerDescription: (description: string) => void;
  clearTravelerFlow: () => void;

  // --- Deal Actions ---
  setDeals: (deals: Deal[]) => void;
  addDeal: (deal: Deal) => void;
  setActiveDeal: (deal: Deal | null) => void;
  updateDealStatus: (dealId: string, status: Deal['status']) => void;
  // Patch a deal in-place from a socket update or API response.
  mergeDealUpdate: (update: Partial<Deal> & { id: string }) => void;
  // Re-fetch a single deal from the backend and merge its authoritative state.
  refreshDeal: (dealId: string) => Promise<void>;

  // --- Wallet Actions ---
  setWalletBalance: (balance: number) => void;
  addTransaction: (transaction: Transaction) => void;

  // --- Chat Actions ---
  setConversations: (conversations: ChatConversation[]) => void;
  updateContactAvatar: (userId: string, newUrl: string | null) => void;

  // --- Notification Actions ---
  setUnreadNotificationCount: (count: number) => void;
  incrementUnreadNotificationCount: () => void;

  // --- Pagination State ---
  dealsPage: number;
  dealsHasMore: boolean;

  // --- Async Fetch Actions ---
  fetchDeals: (page?: number, append?: boolean) => Promise<void>;
  fetchTrips: (page?: number, append?: boolean) => Promise<void>;
  fetchTransactions: () => Promise<void>;
  fetchConversations: () => Promise<void>;
  fetchWalletBalance: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // --- Initial State ---
      // In dev (__DEV__ === true) we start pre-authenticated with rich fake data
      // so every screen can be tested without a running backend.
      isAuthenticated: __DEV__,
      hasCompletedOnboarding: __DEV__,
      currentUser: __DEV__ ? FAKE_USER : null,
      phone: __DEV__ ? FAKE_USER.phone : '',

  // KYC
  kycDocumentType: null,
  kycDocumentFront: null,
  kycDocumentBack: null,
  kycSelfie: null,
  kycStatus: __DEV__ ? 'approved' : 'not_started',

  // Face verification
  faceEmbedding: null,
  idEmbedding: null,
  faceVerificationStatus: 'idle',
  faceConfidence: null,
  faceVerificationMessage: null,
  extractedIdNumber: null,
  extractedBirthday: null,

  mode: 'sender',

  // Sender flow
  senderPackage: null,
  senderRoute: null,
  senderReceiver: null,
  senderPricing: null,

  // Traveler flow
  travelerRoute: null,
  travelerFlight: null,
  travelerCapacity: 0.5,
  travelerPricing: null,
  travelerPackageTypes: [],
  travelerDescription: '',

  // Deals
  deals: [],
  activeDeal: null,
  dealsPage: 1,
  dealsHasMore: false,

  // Trips
  trips: [],
  tripsPage: 1,
  tripsHasMore: false,

  // Wallet
  walletBalance: 0,
  transactions: [],

  // Chat
  conversations: [],

  // Notifications
  unreadNotificationCount: 0,

  // Loading & Error
  isLoading: false,
  conversationsLoading: false,
  error: null,

  // --- Auth Actions ---
  setPhone: (phone) => set({ phone }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setOnboardingComplete: (value) => set({ hasCompletedOnboarding: value }),
  setCurrentUser: (user) => set({ currentUser: user }),
  logout: () => {
    // Disconnect socket before clearing state
    // FIX 6: synchronous disconnect — no dynamic import race condition
    disconnectSocket();
    // Wipe avatar cache so the next user doesn't see stale avatars
    avatarCache.clear();
    // Clear all AsyncStorage keys used by this store
    AsyncStorage.multiRemove(['bridger-app-storage']).catch(() => {});
    set({
      isAuthenticated: false,
      hasCompletedOnboarding: false,
      currentUser: null,
      phone: '',
      // Deals
      deals: [],
      activeDeal: null,
      dealsPage: 1,
      dealsHasMore: true,
      // Trips
      trips: [],
      tripsPage: 1,
      tripsHasMore: false,
      // Wallet
      walletBalance: 0,
      transactions: [],
      // Chat
      conversations: [],
      // KYC
      kycDocumentType: null,
      kycDocumentFront: null,
      kycDocumentBack: null,
      kycSelfie: null,
      kycStatus: 'not_started',
      // Face verification
      faceEmbedding: null,
      idEmbedding: null,
      faceVerificationStatus: 'idle',
      faceConfidence: null,
      faceVerificationMessage: null,
      extractedIdNumber: null,
      extractedBirthday: null,
      // Flow state
      senderPackage: null,
      senderRoute: null,
      senderReceiver: null,
      senderPricing: null,
      travelerRoute: null,
      travelerFlight: null,
      travelerCapacity: 0.5,
      travelerPricing: null,
      travelerPackageTypes: [],
      travelerDescription: '',
      // Error
      isLoading: false,
      error: null,
    });
  },

  // --- KYC Actions ---
  setKYCDocumentType: (type) => set({ kycDocumentType: type }),
  setKYCDocumentFront: (uri) => set({ kycDocumentFront: uri }),
  setKYCDocumentBack: (uri) => set({ kycDocumentBack: uri }),
  setKYCSelfie: (uri) => set({ kycSelfie: uri }),
  setKYCStatus: (status) => set({ kycStatus: status }),
  clearKYC: () => set({
    kycDocumentType: null,
    kycDocumentFront: null,
    kycDocumentBack: null,
    kycSelfie: null,
    kycStatus: 'not_started',
  }),

  // --- Face Verification Actions ---
  setFaceEmbedding: (embedding) => set({ faceEmbedding: embedding }),
  setIdEmbedding: (embedding) => set({ idEmbedding: embedding }),
  setFaceVerificationStatus: (status) => set({ faceVerificationStatus: status }),
  setFaceConfidence: (confidence) => set({ faceConfidence: confidence }),
  setFaceVerificationMessage: (message) => set({ faceVerificationMessage: message }),
  setExtractedIdNumber: (v) => set({ extractedIdNumber: v }),
  setExtractedBirthday: (v) => set({ extractedBirthday: v }),
  resetFaceVerification: () => set({
    faceEmbedding: null,
    idEmbedding: null,
    faceVerificationStatus: 'idle',
    faceConfidence: null,
    faceVerificationMessage: null,
    extractedIdNumber: null,
    extractedBirthday: null,
  }),

  // --- Mode Actions ---
  setMode: (mode) => set({ mode }),
  toggleMode: () =>
    set((state) => ({ mode: state.mode === 'sender' ? 'traveler' : 'sender' })),

  // --- Sender Flow Actions ---
  setSenderPackage: (pkg) => set({ senderPackage: pkg }),
  setSenderRoute: (route) => set({ senderRoute: route }),
  setSenderReceiver: (receiver) => set({ senderReceiver: receiver }),
  setSenderPricing: (pricing) => set({ senderPricing: pricing }),
  clearSenderFlow: () =>
    set({
      senderPackage: null,
      senderRoute: null,
      senderReceiver: null,
      senderPricing: null,
    }),

  // --- Traveler Flow Actions ---
  setTravelerRoute: (route) => set({ travelerRoute: route }),
  setTravelerFlight: (flight) => set({ travelerFlight: flight }),
  setTravelerCapacity: (capacity) => set({ travelerCapacity: capacity }),
  setTravelerPricing: (pricing) => set({ travelerPricing: pricing }),
  setTravelerPackageTypes: (types) => set({ travelerPackageTypes: types }),
  setTravelerDescription: (description) => set({ travelerDescription: description }),
  clearTravelerFlow: () =>
    set({
      travelerRoute: null,
      travelerFlight: null,
      travelerCapacity: 0.5,
      travelerPricing: null,
      travelerPackageTypes: [],
      travelerDescription: '',
    }),

  // --- Deal Actions ---
  setDeals: (deals) => set({ deals }),
  addDeal: (deal) => set((state) => ({ deals: [...state.deals, deal] })),
  setActiveDeal: (deal) => set({ activeDeal: deal }),
  updateDealStatus: (dealId, status) => {
    const event = { status, timestamp: new Date().toISOString() };
    const append = (d: Deal): Deal => ({
      ...d,
      status,
      trackingEvents: [...(d.trackingEvents ?? []), event],
    });
    // Optimistic update — UI is snappy
    set((state) => ({
      deals: state.deals.map((d) => (d.id === dealId ? append(d) : d)),
      activeDeal:
        state.activeDeal?.id === dealId
          ? append(state.activeDeal)
          : state.activeDeal,
    }));
    // Persist to backend, then re-sync from backend (which holds the authoritative
    // trackingEvents list and broadcasts `deal_updated` to the other party).
    dealsAPI.updateDealStatus(dealId, status)
      .then(() => get().refreshDeal(dealId))
      .catch(() => {});
  },

  mergeDealUpdate: (update) =>
    set((state) => ({
      deals: state.deals.map((d) => (d.id === update.id ? { ...d, ...update } : d)),
      activeDeal:
        state.activeDeal?.id === update.id
          ? { ...state.activeDeal, ...update }
          : state.activeDeal,
    })),

  refreshDeal: async (dealId) => {
    try {
      const deal = await dealsAPI.getDeal(dealId);
      if (deal) get().mergeDealUpdate(deal);
    } catch {
      // non-critical — keep current deal in state
    }
  },

  // --- Wallet Actions ---
  setWalletBalance: (balance) => set({ walletBalance: balance }),
  addTransaction: (transaction) =>
    set((state) => ({
      transactions: [transaction, ...state.transactions],
    })),

  // --- Chat Actions ---
  setConversations: (conversations) => set({ conversations }),

  // Propagates an avatar URL change from a socket event to the cache and
  // to the stored conversation list so the Messages screen re-renders.
  updateContactAvatar: (userId, newUrl) => {
    // 1. Push to cache — notifies all open Avatar components immediately
    avatarCache.invalidate(userId, newUrl);
    // 2. Patch the in-memory conversation list so MessagesScreen stays fresh
    set((state) => ({
      conversations: state.conversations.map((c) => {
        if (c.user?.id !== userId) return c;
        return {
          ...c,
          user: {
            ...c.user,
            avatar: newUrl ?? undefined,
            profilePhoto: newUrl ?? undefined,
            avatarVersion: (c.user.avatarVersion ?? 0) + 1,
          },
        };
      }),
    }));
  },

  // --- Notification Actions ---
  setUnreadNotificationCount: (count) => set({ unreadNotificationCount: count }),
  incrementUnreadNotificationCount: () =>
    set((state) => ({ unreadNotificationCount: state.unreadNotificationCount + 1 })),

  // --- Async Fetch Actions ---
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),

  fetchDeals: async (page = 1, append = false) => {
    if (append && !get().dealsHasMore) return;
    set({ isLoading: !append, error: null });
    try {
      const result = await dealsAPI.getDeals({ page, limit: 20 });
      const items = result.items as Deal[];
      set((state) => ({
        deals: append ? [...state.deals, ...items] : items,
        dealsPage: page,
        dealsHasMore: result.hasMore,
        isLoading: false,
      }));
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Failed to load deals' });
    }
  },

  fetchTrips: async (page = 1, append = false) => {
    if (append && !get().tripsHasMore) return;
    try {
      const result = await apiClient.get<any>(`/trips?page=${page}&limit=20&status=OPEN`);
      const data = result.data;
      const items: any[] = Array.isArray(data) ? data : (data?.items ?? []);
      const hasMore: boolean = data?.hasMore ?? false;
      set((state) => ({
        trips: append ? [...state.trips, ...items] : items,
        tripsPage: page,
        tripsHasMore: hasMore,
      }));
    } catch {
      // non-critical — keep existing trips list
    }
  },

  fetchTransactions: async () => {
    set({ isLoading: true, error: null });
    try {
      // Try the paginated endpoint first (api/index.ts paymentsApi), fall back to legacy
      const result = await paymentsApi.getTransactions({ page: 1, limit: 50 });
      if (result.success && result.data) {
        const items = result.data.items ?? (result.data as any);
        set({ transactions: (Array.isArray(items) ? items : []) as Transaction[], isLoading: false });
      } else {
        const legacy = await paymentAPI.getTransactions();
        set({ transactions: (Array.isArray(legacy) ? legacy : []) as Transaction[], isLoading: false });
      }
    } catch (e: any) {
      // Fallback to legacy endpoint if new one is unavailable
      try {
        const legacy = await paymentAPI.getTransactions();
        set({ transactions: (Array.isArray(legacy) ? legacy : []) as Transaction[], isLoading: false });
      } catch {
        set({ isLoading: false, error: e?.message || 'Failed to load transactions' });
      }
    }
  },

  fetchConversations: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await chatAPI.getConversations();
      const conversations = (Array.isArray(result) ? result : []) as ChatConversation[];
      set({ conversations, isLoading: false });
      // Seed avatar cache for every participant so renders are instant
      conversations.forEach((c) => {
        const uid = c.user?.id;
        const url = c.user?.profilePhoto || c.user?.avatar;
        if (uid && url) avatarCache.register(uid, url);
      });
    } catch (e: any) {
      set({ isLoading: false, error: e?.message || 'Failed to load conversations' });
    }
  },

  fetchWalletBalance: async () => {
    try {
      // Try the full paymentsApi first for available/pending breakdown
      const result = await paymentsApi.getBalance();
      if (result.success && result.data) {
        const total = (result.data.availableBalance ?? result.data.balance ?? 0)
                    + (result.data.pendingBalance ?? 0);
        set({ walletBalance: total });
      } else {
        const legacy = await paymentAPI.getWalletBalance();
        set({ walletBalance: legacy.balance });
      }
    } catch {
      // wallet balance failure is non-critical, keep current value
    }
  },
}),
  {
    name: 'bridger-app-storage',
    storage: createJSONStorage(() => AsyncStorage),
    partialize: (state) => ({
      isAuthenticated: state.isAuthenticated,
      hasCompletedOnboarding: state.hasCompletedOnboarding,
      currentUser: state.currentUser,
      phone: state.phone,
      kycStatus: state.kycStatus,
      mode: state.mode,
    }),
  }
));
