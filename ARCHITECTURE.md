# Bridger - Architecture & Implementation Guide

## Overview

Bridger is a peer-to-peer package delivery platform built with React Native (Expo). This document describes the complete architecture after the refactoring from a `useState`-based navigation system to a proper React Navigation stack with Zustand state management.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Button.tsx       # Multi-variant action button
│   ├── DotIndicator.tsx # Carousel pagination dots
│   ├── ErrorBoundary.tsx# Error boundary with retry
│   ├── Input.tsx        # Form text input with validation
│   ├── OTPInput.tsx     # 6-digit verification code input
│   ├── QRCodeGenerator.tsx # QR code generation component
│   ├── StepIndicator.tsx# Multi-step progress bar
│   ├── Typography.tsx   # Unified text rendering
│   └── index.ts         # Barrel exports
│
├── navigation/          # React Navigation setup
│   ├── types.ts         # Navigation type definitions
│   ├── AuthStack.tsx    # Authentication flow navigator
│   ├── MainTabs.tsx     # Bottom tab navigator
│   ├── AppStack.tsx     # Main app stack navigator
│   ├── RootNavigator.tsx# Root navigator (auth/app switch)
│   └── index.ts         # Barrel exports
│
├── screens/             # All 30 screen components
│   ├── SplashScreen.tsx
│   ├── OnboardingScreen.tsx
│   ├── PhoneEntryScreen.tsx
│   ├── OTPVerificationScreen.tsx
│   ├── KYCUploadScreen.tsx
│   ├── SelfieVerificationScreen.tsx
│   ├── KYCStatusScreen.tsx
│   ├── HomeScreen.tsx
│   ├── ExploreScreen.tsx
│   ├── CreateSelectionScreen.tsx
│   ├── PackageDetailsScreen.tsx
│   ├── RouteSelectionScreen.tsx
│   ├── ReceiverDetailsScreen.tsx
│   ├── PricingScreen.tsx
│   ├── ReviewPublishScreen.tsx
│   ├── SuccessScreen.tsx
│   ├── TravelerRouteScreen.tsx
│   ├── FlightDetailsScreen.tsx
│   ├── CapacityScreen.tsx
│   ├── TravelerPricingScreen.tsx
│   ├── TravelerReviewScreen.tsx
│   ├── TravelerSuccessScreen.tsx
│   ├── DealDetailsScreen.tsx
│   ├── TrackingScreen.tsx
│   ├── DeliveryConfirmationScreen.tsx
│   ├── FinalSuccessScreen.tsx
│   ├── DisputeScreen.tsx
│   ├── MessagesScreen.tsx
│   ├── ChatDetailScreen.tsx
│   ├── ProfileScreen.tsx
│   └── WalletScreen.tsx
│
├── services/            # API service layer
│   └── api.ts           # Mock API functions (auth, deals, payment, chat, pricing, disputes)
│
├── store/               # State management
│   └── useAppStore.ts   # Zustand global store
│
├── theme/               # Design system
│   └── theme.ts         # Colors, spacing, radius, typography tokens
│
├── types/               # TypeScript type definitions
│   └── index.ts         # All data models and navigation types
│
└── utils/               # Utility functions
    ├── pricing.ts       # AI pricing suggestions, commission calculations
    └── qrCode.ts        # QR code data generation and parsing
```

## Navigation Architecture

### Before (useState-based)

All screens were conditionally rendered in `App.tsx` based on a `screen` state variable. This caused:

- No back gesture support
- No screen transition animations
- No deep linking capability
- Poor memory management (all screens mounted)

### After (React Navigation)

```
RootNavigator
├── AuthStack (when !isAuthenticated)
│   ├── Splash
│   ├── Onboarding
│   ├── PhoneEntry
│   ├── OTPVerification
│   ├── KYCUpload
│   ├── SelfieVerification
│   └── KYCStatus
│
└── AppStack (when isAuthenticated)
    ├── MainTabs (Bottom Tab Navigator)
    │   ├── HomeTab
    │   ├── ExploreTab
    │   ├── CreateTab
    │   ├── MessagesTab
    │   └── ProfileTab
    │
    ├── CreateSelection
    ├── PackageDetails → RouteSelection → ReceiverDetails → Pricing → ReviewPublish → SenderSuccess
    ├── TravelerRoute → FlightDetails → Capacity → TravelerPricing → TravelerReview → TravelerSuccess
    ├── DealDetails → Tracking → DeliveryConfirmation → FinalSuccess
    ├── Dispute
    ├── ChatDetail
    └── Wallet
```

## State Management (Zustand)

The `useAppStore` provides global state for:

| Category      | State                                                                    | Description                   |
| ------------- | ------------------------------------------------------------------------ | ----------------------------- |
| Auth          | `isAuthenticated`, `currentUser`, `phone`                                | Authentication state          |
| Mode          | `mode`                                                                   | 'sender' or 'traveler'        |
| Sender Flow   | `senderPackage`, `senderRoute`, `senderReceiver`, `senderPricing`        | Sender creation data          |
| Traveler Flow | `travelerRoute`, `travelerFlight`, `travelerCapacity`, `travelerPricing` | Traveler creation data        |
| Deals         | `deals`, `activeDeal`                                                    | Deal listings and active deal |
| Wallet        | `walletBalance`, `transactions`                                          | Financial data                |
| Chat          | `conversations`                                                          | Chat conversations            |

## Key Features Implemented

### 1. QR Code Generation

- `QRCodeGenerator` component using `react-native-qrcode-svg`
- QR data includes deal ID, route, timestamp, expiration, and signature
- Modal in `TrackingScreen` for generating and displaying QR codes
- Utility functions for data generation, parsing, and validation

### 2. Error Boundary

- `ErrorBoundary` component wraps the entire app
- Shows user-friendly error screen with retry button
- Displays error details in development mode
- Catches and logs all unhandled errors

### 3. AI-Powered Pricing

- `getSuggestedPriceRange()` calculates price based on route, weight, and category
- Route-specific base prices for popular routes
- Category multipliers (Electronics = 1.3x, Documents = 0.8x)
- `calculateCommission()` for 5% platform fee calculation

### 4. Mock API Service Layer

- `authAPI` - OTP sending/verification, KYC upload
- `dealsAPI` - CRUD operations for deals/trips
- `paymentAPI` - Escrow creation/release, wallet, transactions
- `chatAPI` - Conversations and messages
- `pricingAPI` - AI price suggestions
- `disputeAPI` - Dispute filing and evidence submission

## Design System

| Token      | Values                                                                    |
| ---------- | ------------------------------------------------------------------------- |
| Primary    | `#1E3B8A` (deep blue)                                                     |
| Background | Light: `#F6F6F8`, Dark: `#121620`                                         |
| Semantic   | Error: `#EF4444`, Success: `#22C55E`, Warning: `#F59E0B`, Info: `#3B82F6` |
| Spacing    | xs(4), sm(8), md(12), lg(16), xl(24), xxl(32), 3xl(48), 4xl(64)           |
| Radius     | sm(8), lg(16), xl(24), 3xl(32), full(9999)                                |
| Typography | Inter font, sizes xs(12) to 5xl(48)                                       |

## Dependencies Added

| Package                         | Purpose                      |
| ------------------------------- | ---------------------------- |
| `@react-navigation/bottom-tabs` | Bottom tab navigator         |
| `zustand`                       | Lightweight state management |
| `react-native-qrcode-svg`       | QR code generation           |
| `@types/jest`                   | Test type definitions        |

## What Still Needs Backend Integration

| Feature            | Current State         | Backend Needed                  |
| ------------------ | --------------------- | ------------------------------- |
| Authentication     | Mock OTP verification | Twilio/Firebase Auth            |
| KYC Verification   | UI only               | Onfido/Jumio integration        |
| Real-time Chat     | Mock data             | WebSocket/Firebase Realtime     |
| Payment/Escrow     | Mock functions        | Stripe/PayPal integration       |
| Push Notifications | Not implemented       | FCM/APNs                        |
| Image Upload       | Local picker only     | S3/Firebase Storage             |
| Search/Filter      | UI only               | Elasticsearch/Algolia           |
| Map Integration    | Placeholder image     | Google Maps/Mapbox              |
| Deep Linking       | Not implemented       | React Navigation linking config |
| i18n               | English only          | react-i18next                   |
| Analytics          | Not implemented       | Mixpanel/Firebase Analytics     |
| Offline Support    | Not implemented       | AsyncStorage/WatermelonDB       |

## Running the App

```bash
# Install dependencies
npm install

# Start Expo dev server
npx expo start

# Run on iOS
npx expo run:ios

# Run on Android
npx expo run:android

# Type check
npx tsc --noEmit
```
