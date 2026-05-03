// ============================================
// Bridger - Type Definitions
// ============================================

// --- User Types ---
export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  avatar?: string;
  profilePhoto?: string;
  verified: boolean;
  rating?: number;
  memberSince?: string;
  completionRate?: number;
  totalDeals?: number;
  kycStatus: 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW' | 'pending' | 'approved' | 'rejected' | 'not_started';
}

// --- Package Types ---
export type PackageCategory =
  | 'Documents'
  | 'Electronics'
  | 'Small Parcel'
  | 'Gift'
  | 'Accessories'
  | 'Others';

export type PackageSize = 'SMALL' | 'MEDIUM' | 'LARGE' | 'EXTRA_LARGE';

export interface Package {
  id?: string;
  category: PackageCategory;
  weight: number;
  packageSize?: PackageSize;
  isFragile?: boolean;
  itemValue?: number;
  image?: string;
  images?: string[];
  description?: string;
}

// --- Route Types ---
export interface Route {
  from: string; // City or airport code
  to: string;
  departureDate?: string;
}

// --- Flight Types ---
export interface Flight {
  date: string;
  time: string;
  flexible: boolean; // ±3 days
  departureAirport?: string;
  arrivalAirport?: string;
}

// --- Pricing Types ---
export interface Pricing {
  amount: number;
  negotiable: boolean;
  currency: 'USD';
  suggestedMin?: number;
  suggestedMax?: number;
}

// --- Deal Types ---
export type DealStatus =
  | 'published'
  | 'accepted'
  | 'escrow_paid'
  | 'pickup'
  | 'in_transit'
  | 'arrived'
  | 'qr_confirmed'
  | 'completed'
  | 'cancelled'
  | 'disputed'
  | 'OPEN'
  | 'MATCHED'
  | 'PICKED_UP'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export interface Deal {
  id: string;
  senderId?: string;
  travelerId?: string;
  sender?: { id: string; name: string; avatar?: string; profilePhoto?: string; rating?: number };
  traveler?: { id: string; name: string; avatar?: string; profilePhoto?: string; rating?: number };
  senderName?: string;
  travelerName?: string;
  package?: Package;
  route: Route;
  flight?: Flight;
  pricing: Pricing;
  status: DealStatus;
  verified?: boolean;
  receiverCode?: string;
  createdAt?: string;
  updatedAt?: string;
  // Display helpers
  name?: string;
  price?: number;
  negotiable?: boolean;
  routeString?: string; // "LHR → JFK"
  // Backend fields
  title?: string;
  description?: string;
  fromCity?: string;
  toCity?: string;
  fromCountry?: string;
  toCountry?: string;
  packageSize?: string;
  weight?: number;
  currency?: string;
  pickupDate?: string;
  deliveryDate?: string;
  // Images
  images?: string[];
  // Tracking timeline (status transitions with timestamps)
  trackingEvents?: Array<{ status: DealStatus; timestamp: string }>;
}

// --- Transaction Types ---
export type TransactionStatus = 'Completed' | 'Processing' | 'Failed';

export interface Transaction {
  id: string;
  type: 'credit' | 'debit';
  label: string;
  description: string;
  amount: number;
  date: string;
  status: TransactionStatus;
}

// --- Chat Types ---
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: string;
  read: boolean;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  participant?: User;
  lastMessage?: Message;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  read: boolean;
}

export interface ChatConversation {
  id: string;
  user: {
    /** Stable user ID — used as the avatar cache key for live updates */
    id?: string;
    name: string;
    verified?: boolean;
    avatar?: string;
    profilePhoto?: string;
    active?: boolean;
    /**
     * Monotonically-increasing version stamp. When this changes the client
     * knows the avatar has been updated and should invalidate its cache entry.
     */
    avatarVersion?: number;
  };
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isSystem?: boolean;
}

// --- Dispute Types ---
export type DisputeStatus = 'opened' | 'evidence_submitted' | 'admin_reviewing' | 'resolved';

export interface Dispute {
  id: string;
  dealId: string;
  status: DisputeStatus;
  reason: string;
  evidence?: string[];
  createdAt: string;
  resolvedAt?: string;
}

// --- Tracking Timeline ---
export interface TimelineStep {
  title: string;
  subtitle: string;
  status: 'completed' | 'active' | 'pending';
  icon: string;
}

// --- Navigation Types ---
export type RootStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  PhoneEntry: undefined;
  OTPVerification: { phoneNumber: string };
  KYCUpload: undefined;
  SelfieVerification: undefined;
  KYCStatus: undefined;
  MainTabs: undefined;
  CreateSelection: undefined;
  // Sender Flow
  PackageDetails: undefined;
  RouteSelection: undefined;
  ReceiverDetails: undefined;
  Pricing: undefined;
  ReviewPublish: undefined;
  SenderSuccess: undefined;
  // Traveler Flow
  TravelerRoute: undefined;
  FlightDetails: undefined;
  Capacity: undefined;
  TravelerPricing: undefined;
  TravelerReview: undefined;
  TravelerSuccess: undefined;
  // Deal Flow
  DealDetails: { deal: Deal; type?: 'deal' | 'trip'; isOwner?: boolean };
  Tracking: { deal: Deal };
  DeliveryConfirmation: { deal: Deal };
  FinalSuccess: undefined;
  Dispute: { deal: Deal };
  // Auxiliary
  ChatDetail: { user: { name: string; verified?: boolean; avatar?: string } };
  Wallet: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Explore: undefined;
  Create: undefined;
  Messages: undefined;
  Profile: undefined;
};

// --- App State ---
export interface AppState {
  // Auth
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  currentUser: User | null;
  phone: string;

  // Mode
  mode: 'sender' | 'traveler';

  // Sender flow data
  senderPackage: Package | null;
  senderRoute: Route | null;
  senderReceiver: { name: string; phone: string } | null;
  senderPricing: Pricing | null;

  // Traveler flow data
  travelerRoute: Route | null;
  travelerFlight: Flight | null;
  travelerCapacity: number;
  travelerPricing: Pricing | null;

  // Deals
  deals: Deal[];
  activeDeal: Deal | null;

  // Wallet
  walletBalance: number;
  transactions: Transaction[];

  // Chat
  conversations: ChatConversation[];
}
