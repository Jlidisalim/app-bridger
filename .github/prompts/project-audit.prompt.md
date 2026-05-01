---
description: 'Audit the full project for missing screens, broken buttons, placeholder code, incomplete API endpoints, and gaps between frontend and backend'
agent: 'agent'
tools: [search, codebase]
---

Perform a comprehensive project audit on this React Native + Express codebase. Report findings grouped by severity.

## What to check

### 1. Screens & Navigation

- List all screens in `src/screens/` and verify each is registered in navigation (`src/navigation/`)
- Flag screens with truncated code, empty render bodies, or missing exports

### 2. Broken Buttons & Placeholder UI

- Search for `Alert.alert` calls that indicate unimplemented features ("Coming soon", "not available", "TODO")
- Search for `onPress={() => {}}` or empty handler functions
- Search for `placeholder` styled views that replace real content

### 3. Mock / Stub Services

- Identify functions in `src/services/` returning hardcoded or simulated data
- Flag `console.log('[Mock API]')` patterns
- List TODO/FIXME/HACK comments across the codebase

### 4. Frontend ↔ Backend Gaps

- Compare routes in `backend/src/routes/` with API calls in `src/services/`
- List endpoints the frontend expects but the backend does not expose
- List Prisma models missing for features the frontend uses (trips, disputes, reviews)

### 5. Hardcoded / Dev-Only Values

- Localhost or private-IP URLs (`localhost`, `10.0.2.2`, `192.168.*`)
- Hardcoded tokens, secrets, user data
- Simulator-only workarounds that would break on device

### 6. Missing Assets

- Image `require()` calls referencing files that do not exist in `assets/`

## Output format

Return a Markdown table per category with columns: **File**, **Line**, **Issue**, **Severity** (Critical / High / Medium / Low).
End with a prioritized action plan.

---

## Previously fixed issues (reference)

The following were identified and fixed in a prior audit pass:

| Area                                   | Fix                                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CapacityScreen slider                  | PanResponder-based interactive weight slider                                                        |
| PackageDetailsScreen slider            | PanResponder-based interactive weight slider                                                        |
| ExploreScreen map buttons              | expo-location for current location, zoomLevel state for zoom controls                               |
| ChatDetailScreen call button           | `Linking.openURL('tel:...')` with confirmation                                                      |
| `src/services/api.ts`                  | Fully rewired from mock data to real `apiClient` calls                                              |
| `src/services/api/faceVerification.ts` | URL from `Constants.expoConfig` instead of hardcoded                                                |
| `src/services/whatsapp/otpService.ts`  | URL from `Constants.expoConfig` instead of hardcoded IP                                             |
| `pushNotificationService.ts`           | Push token registration actually sends to backend                                                   |
| `src/store/useAppStore.ts`             | Removed mock data, added `fetchDeals`/`fetchTransactions`/`fetchConversations`/`fetchWalletBalance` |
| Prisma schema                          | Added Trip and Dispute models with migration                                                        |
| `backend/src/routes/trips.ts`          | New CRUD + popular-routes endpoint                                                                  |
| `backend/src/routes/disputes.ts`       | New create/detail/evidence/list endpoints                                                           |
| `backend/src/routes/deals.ts`          | Added search, pricing-suggestion, counter-offer                                                     |
| `backend/src/routes/users.ts`          | Added stats and avatar endpoints                                                                    |
| `backend/src/routes/wallet.ts`         | Real Stripe integration (conditional on env)                                                        |
