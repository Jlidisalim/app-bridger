# Automated Delivery & Travel Booking System Specification

## 1. Overview

This specification defines an automated delivery-and-travel booking system that connects senders (who need packages delivered) with travelers (who have available luggage space). The system handles booking, payment, pickup verification, and delivery confirmation through QR code scanning.

**System Participants:**
- **Sender**: Posts a package shipment request with route, package details, and offered price
- **Traveler**: Posts available travel capacity and accepts package delivery requests
- **System**: Handles matching, payment processing, verification, and notifications

---

## 2. User Stories

### 2.1 Booking and Acceptance Flow

```
As a sender,
I want to post a package shipment request,
So that I can find a traveler to deliver my package.

Acceptance Criteria:
- Sender can select pickup location (airport/city)
- Sender can select destination location (airport/city)
- Sender can specify package category and weight
- Sender can set their offered price
- Sender can provide receiver contact details
```

```
As a traveler,
I want to post my available travel capacity,
So that I can earn money by delivering packages.

Acceptance Criteria:
- Traveler can select departure/arrival airports
- Traveler can specify travel date(s)
- Traveler can indicate available luggage capacity
- Traveler can set minimum price per kg
```

```
As a sender,
I want to accept a traveler's offer,
So that I can confirm the delivery booking.

Acceptance Criteria:
- Sender sees all available travelers for their route
- Sender can view traveler profile and rating
- Sender can accept or counter-offer
- Booking is only confirmed after both parties accept
```

```
As a traveler,
I want to accept a sender's package request,
So that I can confirm the delivery booking.

Acceptance Criteria:
- Traveler sees all package requests matching their route
- Traveler can view sender profile and rating
- Traveler can accept or counter-offer
- Booking is only confirmed after both parties accept
```

### 2.2 Payment Handling Flow

```
As the system,
I want to charge the sender after both parties accept,
So that funds are secured before pickup.

Acceptance Criteria:
- System waits for both acceptances before charging
- System checks sender's account balance
- If insufficient: block booking and prompt sender to add funds
- If sufficient: process charge and generate QR code
- If charge fails: display error and allow retry
```

```
As a sender,
I want to be notified when payment fails,
So that I can add funds and complete my booking.

Acceptance Criteria:
- Display clear "Insufficient Funds" message
- Show required amount vs. current balance
- Provide "Add Funds" action button
- Once funds added,自动 retry charge
- Send confirmation notification on success
```

### 2.3 Package Pickup Process

```
As the system,
I want to generate a unique QR code after payment,
So that the package can be verified at pickup.

Acceptance Criteria:
- QR code is generated after successful payment
- QR code is tied to transaction ID
- QR code is displayed in sender's app
- QR code contains: dealId, senderId, travelerId, timestamp
```

```
As a sender,
I want to share my QR code with the traveler,
So that they can confirm package pickup.

Acceptance Criteria:
- QR code is easily accessible in app
- Sender can show QR code to traveler in person
- System provides clear instructions
```

```
As a traveler,
I want to scan the sender's QR code to confirm pickup,
So that the system knows I've received the package.

Acceptance Criteria:
- "Pickup" step visible in Deal Summary
- Camera scanner available to scan QR code
- Manual code entry option as fallback
- On successful scan: update status to "in transit"
```

### 2.4 Verification and Confirmation Flow

```
As the traveler,
I want to scan the sender's QR code,
So that pickup is confirmed and I can proceed with delivery.

Acceptance Criteria:
- Camera opens for QR scanning
- Scan validates QR code authenticity
- Valid scan: status → "in transit", notify both parties
- Invalid scan: display error with retry option
```

```
As the system,
I want to notify both parties of status changes,
So that everyone stays informed.

Acceptance Criteria:
- On pickup confirmed: notify sender and traveler
- On delivery confirmed: notify both parties
- Notifications include deal ID and current status
```

---

## 3. Key UI Screens

### 3.1 Sender Flow Screens

| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| Package Details | Enter package info | Category dropdown, weight slider, description |
| Route Selection | Select route | From/To airport pickers, date picker |
| Receiver Details | Enter receiver info | Name, phone number inputs |
| Pricing | Set offered price | Price input, negotiable toggle |
| Review & Publish | Confirm booking | Summary, publish button |
| Deal Summary | Track deal | Timeline, status, QR code, chat |
| Wallet | Manage funds | Balance, add funds, transactions |

### 3.2 Traveler Flow Screens

| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| Route Selection | Set travel route | From/To airports, date range, flexibility toggle |
| Flight Details | Flight information | Flight number, airline, time |
| Capacity | Set luggage space | Weight capacity, package types accepted |
| Pricing | Set minimum price | Price per kg, minimums |
| Review & Publish | Confirm trip | Summary, publish button |
| Deal Summary | Track pickup/delivery | Timeline, QR scanner, chat |
| My Trips | View trips | Active/completed trips list |

### 3.3 Shared Screens

| Screen | Purpose | Key Elements |
|--------|---------|--------------|
| Deal Details | View deal info | Route, package, price, user profiles |
| Tracking/Deal Summary | Track transaction | Timeline, current status, actions |
| Chat | Communicate | Messages, quick replies |
| Notifications | View alerts | Active alerts, history |
| Profile | View/edit profile | Photo, name, rating, KYC |

### 3.4 Error Screens

| Screen | Trigger | Elements |
|--------|---------|----------|
| Insufficient Funds | Payment fails due to balance | Balance shortfall, Add Funds button |
| QR Scan Failed | Invalid/unreadable QR | Error message, manual entry link |
| Transaction Failed | System error | Error details, retry button, support contact |
| Deal Cancelled | Either party cancels | Cancellation reason, alternative suggestions |

---

## 4. State Machine

### 4.1 Deal Status Flow

```
published → accepted → escrow_paid → pickup → in_transit → arrived → qr_confirmed → completed
              ↓              ↓           ↓          ↓          ↓
           cancelled    cancelled   cancelled  cancelled  cancelled
```

**States:**
| Status | Description | Allowed Actions |
|--------|-------------|-----------------|
| `published` | Open for acceptance | Accept, Cancel |
| `accepted` | Both parties accepted | Pay, Cancel |
| `escrow_paid` | Payment secured | Generate QR, Cancel |
| `pickup` | Awaiting QR scan | Scan QR |
| `in_transit` | Package with traveler | Mark Arrived |
| `arrived` | At destination | Confirm Delivery |
| `qr_confirmed` | Delivery verified | Complete |
| `completed` | Full transaction done | View Receipt |
| `cancelled` | Deal cancelled | - |

---

## 5. API Endpoints (Conceptual)

### 5.1 Deals API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/deals` | Create new deal (sender) |
| GET | `/deals` | List available deals |
| GET | `/deals/:id` | Get deal details |
| POST | `/deals/:id/accept` | Accept deal (sender/traveler) |
| POST | `/deals/:id/match` | Match traveler to deal |
| POST | `/deals/:id/pay` | Process payment |
| GET | `/deals/:id/qr` | Generate pickup QR |
| POST | `/deals/:id/pickup-confirm` | Confirm pickup via QR |
| POST | `/deals/:id/delivery-confirm` | Confirm delivery |
| DELETE | `/deals/:id` | Cancel deal |

### 5.2 Payments API

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/wallet` | Get wallet balance |
| POST | `/wallet/deposit` | Add funds |
| POST | `/wallet/withdraw` | Withdraw funds |
| GET | `/transactions` | Transaction history |

---

## 6. Edge Cases

### 6.1 Payment Edge Cases

| Scenario | Handling |
|----------|----------|
| Sender has $0 balance | Block booking, show "Add Funds" prompt |
| Balance drops during hold | Release hold, require new payment attempt |
| Card declined | Show error, suggest alternative payment |
| Payment timeout | Mark as pending, retry with exponential backoff |
| Multiple rapid payment attempts | Rate limit: max 3 attempts per minute |

### 6.2 QR Code Edge Cases

| Scenario | Handling |
|----------|----------|
| QR code expired (>24h) | Regenerate new QR code |
| QR code already scanned | Show "Already used" error |
| Invalid QR format | Show "Invalid code" error, allow manual entry |
| Camera permission denied | Provide manual code entry option |
| Poor camera visibility | Suggest manual entry alternative |

### 6.3 Cancellation Edge Cases

| Scenario | Handling |
|----------|----------|
| Sender cancels before acceptance | Full refund to sender |
| Sender cancels after acceptance (before payment) | Full refund, no penalty |
| Sender cancels after payment (before pickup) | Refund minus cancellation fee |
| Traveler cancels after acceptance | Sender notified, deal reopened |
| Traveler cancels after pickup | Penalty, report generated |

### 6.4 Timing Edge Cases

| Scenario | Handling |
|----------|----------|
| Traveler misses flight | Status update, sender options |
| Package not ready at pickup | Traveler can extend wait window |
| Traveler doesn't arrive | Sender can dispute after timeout |
| Delivery delayed | Auto-extend with notifications |

### 6.5 User Interaction Edge Cases

| Scenario | Handling |
|----------|----------|
| Both parties counter-offer | Accept one to move to next state |
| User goes offline during booking | Save state, resume on return |
| App killed during payment | Check payment status on reopen |
| Push notifications disabled | Fall back to in-app notifications |

---

## 7. User Dashboards

### 7.1 Sender Dashboard

**Active Section:**
- Pending acceptances (travelers who accepted, awaiting sender confirmation)
- In transit (packages currently being delivered)
- Awaiting pickup (packages ready for traveler pickup)

**Pending Actions:**
- Accept traveler's offer
- Recharge balance (if insufficient)
- Generate/Show QR code
- Confirm delivery (after traveler arrives)

**History Section:**
- Completed deliveries
- Cancelled deals

### 7.2 Traveler Dashboard

**Active Section:**
- Pending acceptances (senders who accepted, awaiting traveler confirmation)
- In transit (packages currently carrying)
- Awaiting pickup (packages to collect)

**Pending Actions:**
- Accept sender's package
- Scan QR to confirm pickup
- Confirm delivery

**History Section:**
- Completed deliveries
- Earnings summary

---

## 8. Notifications

### 8.1 Notification Types

| Trigger | Recipient | Channel |
|---------|-----------|---------|
| New acceptance | Sender/Traveler | Push + In-app |
| Payment successful | Sender | Push + In-app |
| Payment failed | Sender | Push + In-app |
| Pickup confirmed | Both | Push + In-app |
| In transit update | Sender | Push + In-app |
| Delivery confirmed | Both | Push + In-app |
| Deal cancelled | Both | Push + In-app |
| New message | Both | Push + In-app |

---

## 9. Security Considerations

1. **Payment**: Use PCI-compliant payment processor
2. **QR Codes**: Encrypt/decode with transaction-specific keys
3. **Fraud Prevention**: Limit failed payment attempts
4. **Identity Verification**: Require KYC before first transaction
5. **Rating System**: Report users with low ratings

---

## 10. Success Metrics

- Deal acceptance rate: Target >70%
- Payment success rate: Target >95%
- QR scan success rate: Target >98%
- User satisfaction: Rating >4.5
- Transaction completion rate: Target >90%