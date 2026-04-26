import { Deal, User, Message, Conversation } from '../types';

export type MainTabParamList = {
  HomeTab: undefined;
  ExploreTab: { filter?: string } | undefined;
  CreateTab: undefined;
  MessagesTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = MainTabParamList & {
  // Auth Stack
  Splash: undefined;
  Onboarding: undefined;
  PhoneEntry: undefined;
  OTPVerification: { phoneNumber: string; skipVerification?: boolean };
  SelfieVerification: undefined;
  FaceVerification: undefined;
  IDDocumentScan: undefined;
  PersonalInfo: undefined;
  VerificationResult: undefined;
  KYCStatus: undefined;
  ReceiverScan: undefined;
  Auth: undefined;
  Main: undefined;
  App: undefined;

  // Main Stack
  MainTabs: { screen?: string } | undefined;
  
  // Create Flow
  CreateSelection: undefined;
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

  // Deal & Chat
  DealDetails: { dealId: string; type?: 'deal' | 'trip'; isOwner?: boolean };
  Tracking: { dealId: string };
  LiveTracking: { dealId: string };
  DeliveryConfirmation: { dealId: string };
  FinalSuccess: undefined;
  Dispute: { dealId: string };
  ReceiverCode: { dealId: string };
  Reservation: { dealId: string };
  ChatDetail: { user: { name: string; verified?: boolean; conversationId?: string; dealId?: string; phone?: string; avatar?: string; profilePhoto?: string } };


  // Wallet
  Wallet: undefined;
  Deposit: undefined;
  Withdraw: undefined;

  // Profile
  EditProfile: undefined;
  Settings: undefined;
  HelpSupport: undefined;
  Notifications: undefined;
};

export type AuthStackParamList = {
  Splash: undefined;
  Onboarding: undefined;
  PhoneEntry: undefined;
  OTPVerification: { phoneNumber: string; skipVerification?: boolean };
  SelfieVerification: undefined;
  FaceVerification: undefined;
  IDDocumentScan: undefined;
  PersonalInfo: undefined;
  VerificationResult: undefined;
  KYCStatus: undefined;
  ReceiverScan: undefined;
};

export type AppStackParamList = RootStackParamList;
