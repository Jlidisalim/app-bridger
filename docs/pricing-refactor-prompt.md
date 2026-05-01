# Bridger — Strengthen the Price Suggestion Module (Refactor Prompt for Codex)

> **Use this prompt with claude code on the Bridger repo.** This is a refactor of the
> existing, weak pricing suggestion module — not a greenfield build. Every path,
> endpoint, model and schema reference below has been verified against the
> current `main` branch. Do not invent files or services that are not listed.

---

## Ground truth — what already exists

You **must** read these before changing anything. They define the contract you cannot break.

- **Backend pricing engine (TS):** [backend/src/ml/pricing/pricingModel.ts](backend/src/ml/pricing/pricingModel.ts) — hand-rolled normal-equations linear regression in TypeScript. Trains on rows of `PricingDataPoint`. Bootstraps with 200 synthetic rows when DB has < 50. **This is the "weak" module to replace.**
- **Backend route exposing it:** [backend/src/routes/ml.ts](backend/src/routes/ml.ts) — mounts `GET /ml/estimate-price`, `POST /ml/record-accepted-price`, `POST /ml/match`, `GET /ml/health`.
- **Python ML service (FastAPI):** [face-verification-service/app/main.py](face-verification-service/app/main.py) — already exposes `POST /predict/price` (line 319). Lazily loads `/app/models/pricing_model.pkl` + `pricing_encoder.pkl`; falls back to a heuristic when the model file is absent. **No `.pkl` is checked into the repo.** Ports & service name in compose: `ml-service` on `8000` (not `ml-price` on `8001`).
- **XGBoost trainer:** [face-verification-service/train_pricing.py](face-verification-service/train_pricing.py) — runnable script that produces the two `.pkl` files. Needs a CSV of completed deals at `face-verification-service/data/deals.csv`.
- **Prisma schema:** [backend/prisma/schema.prisma](backend/prisma/schema.prisma) — actual fields:
  - `Deal`: `senderId`, `travelerId`, `fromCity/toCity/fromCountry/toCountry`, `fromLat/fromLng/toLat/toLng` (all nullable), `packageSize` (`SMALL|MEDIUM|LARGE|EXTRA_LARGE`), `isFragile`, `itemValue`, `weight`, `price`, `currency` (default `USD`). **No `category` column yet.**
  - `Trip`: `fromCity/toCity/fromCountry/toCountry`, `departureDate`, `maxWeight`, `price`, `currency`. **No lat/lng, no volume capacity, no corridor.**
  - `PricingDataPoint`: `distance`, `weight`, `volume`, `urgent`, `price`. Used as the training table for the TS regression.
  - `User`: `rating`, `verified`, `totalDeals`, `kycStatus`, `faceVerificationStatus` — the poster-side ML features are pulled from here.
- **Mobile callers of the suggestion endpoint:**
  - [src/services/api.ts:360-405](src/services/api.ts#L360-L405) — `pricingAPI.getSuggestedPrice` calls `GET /ml/estimate-price?fromLat=…&fromLng=…&toLat=…&toLng=…&weight=…` and returns `{ min, max, median, confidence, distanceKm }`.
  - [src/screens/PricingScreen.tsx:36-53](src/screens/PricingScreen.tsx#L36-L53) — sender pricing step.
  - [src/screens/TravelerPricingScreen.tsx](src/screens/TravelerPricingScreen.tsx) — traveler pricing step.
- **Docker compose:** [docker-compose.yml](docker-compose.yml) — `postgres`, `redis`, `backend` (port 4000), `baileys` (3001), `ml-service` (8000). Backend reads `ML_SERVICE_URL` from env (default `http://localhost:8000`, see [backend/src/config/env.ts](backend/src/config/env.ts)).

If anything you are about to write contradicts the list above, stop and re-read.

---

## Goal

Make the price suggestion **trustworthy** — accurate enough that a sender can trust the suggested figure, and a traveler can trust a "fair price" badge. Concretely:

1. **Replace** the in-process linear-regression in [pricingModel.ts](backend/src/ml/pricing/pricingModel.ts) with a thin client that calls the existing FastAPI `/predict/price`, plus a deterministic local fallback.
2. **Upgrade** the Python `/predict/price` endpoint to use the richer feature set listed below, train an XGBoost model on real + synthetic data via [train_pricing.py](face-verification-service/train_pricing.py), and persist the artefacts at `face-verification-service/models/`.
3. **Add the missing schema** (`Deal.category`, `Deal` price-prediction snapshot fields, `Trip` lat/lng + volume + corridor, `TripDealMatch`, `PricePredictionLog`) in **one** Prisma migration.
4. **Keep `PricingDataPoint`** read-only — old rows stay, no new writes. New writes go to `PricePredictionLog`.
5. **Sender flow:** live preview as the deal form is filled → "Use this price" or override → store both `price` (sender) and `predictedPrice` (model) on the row.
6. **Traveler flow:** posting a `Trip` returns the matching `Deal`s along the corridor with sender info, fairness verdict, detour, projected earnings.
7. **Do not break the existing mobile contract** — `GET /ml/estimate-price` must keep returning `{ estimatedPrice, minPrice, maxPrice, confidence, distanceKm }`. New richer endpoint can be added alongside.

---

## Architecture (what already exists vs. what you add)

```
React Native ──HTTP──> Express (4000) ──HTTP──> FastAPI ml-service (8000)
                            │                         │
                            │                         ├── /predict/price  (XGBoost or heuristic)
                            │                         ├── /predict/sentiment
                            │                         └── /verify/face …
                            ▼
                       PostgreSQL
              (Deal, Trip, TripDealMatch, User, PricePredictionLog)
```

Express never does ML math. It calls FastAPI. If FastAPI is unreachable (3 s timeout, 2 retries) it returns a deterministic fallback price tagged `source: "fallback"` so deal creation never fails.

---

## Currency rule (read this — easy to get wrong)

The XGBoost model is trained on **USD**. `Deal.currency` defaults to `"USD"` but can be `TND`, `EUR`, etc.

- **For prediction:** convert `itemValue` to USD before sending; receive `predictedPriceUsd` from the service.
- **For storage:** store `predictedPrice` in the deal's currency and `predictedPriceUsd` for analytics.
- **For comparison:** when computing `priceDeviationPct`, both sides must be in the same currency.
- **FX source:** add `backend/src/services/fx/converter.ts` with an in-memory rate map seeded from env (`FX_RATES_JSON`, default `{ "USD": 1, "TND": 0.32, "EUR": 1.07, "GBP": 1.25 }`). Real FX feed is a separate task — do not block on it.

---

## Phase 0 — Audit (deliverable: a markdown file, no code yet)

Run these and write the result to [docs/pricing-refactor-audit.md](docs/pricing-refactor-audit.md):

```bash
grep -rn "PricingDataPoint" backend/src backend/prisma
grep -rn "predictPrice\|pricingModel\|/ml/estimate-price\|record-accepted-price" backend/src
grep -rn "pricingAPI\|getSuggestedPrice\|/ml/estimate-price" src
```

Document:
1. Every file that imports from `backend/src/ml/pricing/` or writes to `PricingDataPoint`.
2. The exact response shape of `GET /ml/estimate-price` today (the contract you must preserve).
3. Every mobile screen and helper that consumes `pricingAPI`.
4. `SELECT COUNT(*) FROM "Deal" WHERE "fromLat" IS NULL` and `WHERE "category" IS NULL` (the latter will be 100 % until Phase 1).

**Stop after Phase 0 and post the audit file. Do not touch code yet.**

---

## Phase 1 — Schema migration (single migration: `xgboost_pricing`)

Edit [backend/prisma/schema.prisma](backend/prisma/schema.prisma). Then run:

```bash
cd backend && npx prisma migrate dev --name xgboost_pricing && npx prisma generate
```

### 1.1 Extend `Deal`

```prisma
model Deal {
  // ... existing fields unchanged ...

  // NEW — required by ML; nullable so legacy rows still load
  category          String?     // value must be in VALID_CATEGORIES (Zod-enforced on create)

  // NEW — price prediction snapshot (set once at deal creation)
  predictedPrice    Float?
  predictedPriceUsd Float?
  priceModelVersion String?     // e.g. "xgb_v1"
  priceConfidence   String?     // HIGH | MEDIUM | LOW
  priceDeviationPct Float?      // ((senderPrice − predicted) / predicted) × 100, in deal currency
  priceSource       String?     // model | fallback
  predictedAt       DateTime?

  // NEW — match relation (defined below)
  matches           TripDealMatch[]

  @@index([category])
}
```

`category` is a `String`, **not** an enum. The 29 allowed values live exactly once, in [shared/constants/categories.ts](shared/constants/categories.ts) (created in Phase 3). Validation happens at the Zod layer.

### 1.2 Extend `Trip`

```prisma
model Trip {
  // ... existing fields unchanged ...

  // NEW — geo (nullable for legacy rows; new posts must provide them)
  fromLat       Float?
  fromLng       Float?
  toLat         Float?
  toLng         Float?

  // NEW — capacity (existing maxWeight stays)
  capacityCm3   Int       @default(40000)   // carry-on default

  // NEW — corridor tolerance for matching
  corridorKm    Float     @default(50)

  matches       TripDealMatch[]

  @@index([fromLat, fromLng, toLat, toLng])
}
```

### 1.3 New `TripDealMatch`

```prisma
model TripDealMatch {
  id                  String   @id @default(cuid())
  tripId              String
  trip                Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)
  dealId              String
  deal                Deal     @relation(fields: [dealId], references: [id], onDelete: Cascade)
  detourKm            Float
  matchScore          Float                     // 0 – 100
  fairPriceAtMatch    Float                     // in deal currency, snapshot
  fairPriceAtMatchUsd Float
  verdict             String                    // FAIR | ABOVE_MARKET | BELOW_MARKET
  createdAt           DateTime @default(now())

  @@unique([tripId, dealId])
  @@index([tripId, matchScore])
  @@index([dealId])
}
```

### 1.4 New `PricePredictionLog` (replaces `PricingDataPoint` as the write target)

```prisma
model PricePredictionLog {
  id                String   @id @default(cuid())
  userId            String?
  dealId            String?
  inputHash         String                       // sha256 of canonicalized input
  inputJson         String                       // full JSON of inputs sent to FastAPI

  predictedPrice    Float
  predictedPriceUsd Float
  currency          String
  modelVersion      String
  confidence        String                       // HIGH | MEDIUM | LOW
  source            String                       // model | fallback
  latencyMs         Int

  createdAt         DateTime @default(now())

  @@index([userId, createdAt])
  @@index([dealId])
  @@index([modelVersion, createdAt])
}
```

### 1.5 Mark `PricingDataPoint` deprecated (comment only — keep the table)

```prisma
/// DEPRECATED — backed the v1 in-process linear regression. Replaced by the
/// XGBoost service. Read-only from Phase 3 onward; existing rows are kept for
/// possible re-training. New writes go to PricePredictionLog.
model PricingDataPoint { ... }
```

### Acceptance — Phase 1
- [ ] Migration runs cleanly, `npx prisma generate` succeeds.
- [ ] No existing field is renamed or removed.
- [ ] `prisma.pricingDataPoint.findMany()` still returns historic rows.

---

## Phase 2 — Strengthen the Python ML service

Work inside [face-verification-service/](face-verification-service/) — **do not** create a new `ml/price/` folder. The service already exists.

### 2.1 New input/output schema

In [face-verification-service/app/schemas.py](face-verification-service/app/schemas.py) add (or replace) `PriceRequest` to match the richer features the trainer will use. All values are USD where applicable:

```python
class PriceRequest(BaseModel):
    fromLat: float = Field(..., ge=-90, le=90)
    fromLng: float = Field(..., ge=-180, le=180)
    toLat:   float = Field(..., ge=-90, le=90)
    toLng:   float = Field(..., ge=-180, le=180)
    packageSize: Literal["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"]
    weight: float = Field(..., gt=0, le=50)
    isFragile: int = Field(..., ge=0, le=1)
    itemValue: float = Field(..., ge=0, le=100000)   # USD
    category: str
    posterRating: float = Field(..., ge=0, le=5)
    posterExperience: int = Field(..., ge=0)
    posterVerified: int = Field(..., ge=0, le=1)

class PriceResponse(BaseModel):
    estimated_price: float          # USD
    min_price: float                # USD
    max_price: float                # USD
    confidence: str                 # HIGH | MEDIUM | LOW
    distance_km: float
    volume_cm3: int
    model_version: str              # e.g. "xgb_v2" or "heuristic_fallback"
```

Keep the **existing** legacy shape `(distance_km, weight_kg, category, urgency)` working under `/predict/price/legacy` so the current TS code does not break during the transition. Remove it in Phase 7 once the new TS client is shipped.

### 2.2 Confidence rule

- `LOW` if `distance > 2500 km` **OR** `category` is not one of the 29 trained categories.
- `MEDIUM` if `1500 < distance ≤ 2500 km`.
- `HIGH` otherwise.

Clamp the predicted price to `[1.0, 200.0]` USD and round to 2 decimals.

### 2.3 Train the model

Update [face-verification-service/train_pricing.py](face-verification-service/train_pricing.py) so it consumes the richer feature set:

- Numeric: `distance_km, volume_cm3, weight, declared_value, poster_rating, poster_experience, poster_verified, isFragile, dist_x_weight, dist_x_volume, value_per_kg`.
- One-hot: the 29 categories listed in §3.1 below.
- Target: `price` in USD.

Bootstrap data sources, in order: (a) any existing CSV at `face-verification-service/data/deals.csv`; (b) completed deals from Postgres (joined with sender via Prisma's exported view or a raw SQL export script in `backend/src/scripts/export-completed-deals.ts`); (c) synthetic rows generated by extending `generateSeedData` from the old TS module — port the formula to Python.

Output artefacts: `face-verification-service/models/pricing_model.pkl` and `pricing_encoder.pkl`. Update the lazy loader in [main.py:306](face-verification-service/app/main.py#L306).

### 2.4 Add `/predict/price/batch`

```python
@app.post("/predict/price/batch")
async def predict_price_batch(request: Request, body: List[PriceRequest]) -> List[PriceResponse]:
    ...
```

Used by the matcher in Phase 5 to score N deals in one call.

### Acceptance — Phase 2
- [ ] `docker compose up ml-service` healthchecks green.
- [ ] `curl -X POST localhost:8000/predict/price -d @sample.json` returns model output with `model_version: "xgb_v2"` (or `"heuristic_fallback"` if `.pkl` is missing).
- [ ] `pytest face-verification-service/tests/` covers: success path, unknown category → confidence `LOW`, distance > 2500 km → confidence `LOW`, `.pkl` missing → heuristic path.

---

## Phase 3 — Replace the Express pricing engine

### 3.1 Create [backend/src/shared/constants/categories.ts](backend/src/shared/constants/categories.ts) (single source of truth)

```ts
export const VALID_CATEGORIES = [
  "Mobile Phone", "Gift Card", "Vitamins", "Smartwatch", "Charger / Cable",
  "Book / Notebook", "OTC Medication", "Earbuds", "Legal Document", "Glasses",
  "Laptop", "Tablet", "Hearing Aid", "Prescription Meds", "Skincare / Cosmetics",
  "Cash / Money", "USB Drive", "Camera", "Power Bank", "Medical Device",
  "SIM Card", "Keys", "Game Cartridge", "Passport / ID",
  "Jewelry - Necklace", "Jewelry - Bracelet", "Credit Card",
  "Jewelry - Ring", "Jewelry - Watch",
] as const;

export type Category = typeof VALID_CATEGORIES[number];

export const SIZE_VOLUME_CM3 = {
  SMALL: 1000, MEDIUM: 5000, LARGE: 15000, EXTRA_LARGE: 30000,
} as const;

export type PackageSize = keyof typeof SIZE_VOLUME_CM3;
```

Mobile imports this file via path alias (the repo already uses `src/`). If a TS path mapping is needed for the RN side, add one in `tsconfig.json`.

### 3.2 Create the new pricing service

```
backend/src/services/pricing/
  priceClient.ts        // HTTP client for FastAPI (axios, 3 s timeout, 2 retries)
  priceFallback.ts      // deterministic rule-based estimator
  pricingService.ts     // orchestrator: input → FX → ML/fallback → log → output
  index.ts              // barrel
backend/src/services/fx/
  converter.ts          // toUsd / fromUsd
backend/src/validators/pricing.ts   // Zod schemas
```

`priceClient.ts`:
- `baseURL = config.mlService.url` (already exists in [config/env.ts](backend/src/config/env.ts)).
- 3 s timeout, 2 retries with exponential backoff (200 ms → 500 ms).
- Throws `PriceServiceUnavailableError` on any non-recoverable failure.
- Methods: `predict(input)`, `predictBatch(inputs)`, `health()`.
- Logs `{ requestId, latencyMs, outcome }` via the existing `pino` logger ([utils/logger.ts](backend/src/utils/logger.ts)).

`priceFallback.ts`:
- Pure function. Same input shape as the FastAPI `PriceRequest`.
- Formula (in USD): `clamp(2, 200, (5 + 0.0055·dist + 0.4·weight + 0.005·itemValueUsd + (isFragile ? 1.5 : 0)) × sizeMul)`
  with `sizeMul = { SMALL: 1.0, MEDIUM: 1.4, LARGE: 1.9, EXTRA_LARGE: 2.5 }`.

`pricingService.ts`:
- `estimate(input: PricingInput): Promise<PricingResult>`.
- Reads `posterRating / posterExperience / posterVerified` **from the DB user** keyed by `input.userId`. Never trust client-supplied values.
- Converts `itemValue` to USD, calls the client, converts back, computes `suggestedRange = ±10 %`.
- Writes one row to `PricePredictionLog` (fire-and-forget, do not block response).
- Returns `{ predictedPrice, predictedPriceUsd, currency, suggestedRange, distanceKm, confidence, source, modelVersion }`.

### 3.3 Update [backend/src/routes/ml.ts](backend/src/routes/ml.ts)

- **Keep** `GET /ml/estimate-price` and its current response shape `{ estimatedPrice, minPrice, maxPrice, confidence, distanceKm }`. Implement it as a thin adapter on top of `pricingService.estimate` (mobile is shipped against this contract — see [src/services/api.ts:381](src/services/api.ts#L381)).
- **Add** `POST /ml/estimate-price` accepting the full Zod-validated `PricingInput` and returning the full `PricingResult`. Auth required. Rate-limit to 30 req/min/user (use existing `mlRateLimiter`).
- **Stop writing** to `PricingDataPoint`. Delete the call inside `recordAcceptedPrice`. The endpoint can stay as a no-op for one release, then be deleted in Phase 7.
- Replace the import of `predictPrice / predictPriceLocal / haversineKm` from `../ml/pricing/pricingModel` with imports from `../services/pricing`.

### 3.4 Delete the old engine

Once 3.1–3.3 compile and tests pass, delete:
- [backend/src/ml/pricing/pricingModel.ts](backend/src/ml/pricing/pricingModel.ts)
- The `initPricingModel()` call in [backend/src/server.ts](backend/src/server.ts).
- Any tests referencing the old module under [backend/tests/](backend/tests/).

Then `grep -rn "PricingDataPoint\|pricingModel\|predictPriceLocal" backend/src` must return zero hits.

### 3.5 Tests

Add [backend/tests/pricing.test.ts](backend/tests/pricing.test.ts) covering:
1. Happy path — FastAPI mocked with `nock`, returns expected `PricingResult`.
2. FastAPI 500 → fallback path, `source: "fallback"`, deal still created.
3. FastAPI timeout (3 s) → fallback path within 4 s wall time.
4. Unknown currency → 400.
5. `posterRating` injected via request body is ignored; DB value is used.
6. Every successful call writes one `PricePredictionLog` row.

### Acceptance — Phase 3
- [ ] `GET /ml/estimate-price` returns the same JSON shape as before.
- [ ] Killing the `ml-service` container makes the endpoint return 200 with `source: "fallback"`.
- [ ] No write to `PricingDataPoint` happens anywhere in `backend/src`.
- [ ] Old [pricingModel.ts](backend/src/ml/pricing/pricingModel.ts) is deleted.

---

## Phase 4 — Wire pricing into deal creation

Edit the existing `POST /api/deals` route in [backend/src/routes/deals.ts](backend/src/routes/deals.ts):

1. Add `category` to the Zod create schema; reject if missing or not in `VALID_CATEGORIES`.
2. Reject creation if any of `fromLat / fromLng / toLat / toLng` is null.
3. After validation, call `pricingService.estimate({ ..., userId: req.user.id })`.
4. Persist `predictedPrice`, `predictedPriceUsd`, `priceConfidence`, `priceModelVersion`, `priceSource`, `predictedAt`.
5. Compute `priceDeviationPct = ((senderPrice − predicted) / predicted) × 100` in the deal currency. Persist.
6. If `|priceDeviationPct| > 30`, include `warning: "PRICE_FAR_FROM_MODEL"` in the response.

### New endpoint — sender preview

`POST /api/deals/estimate-price` — same body as deal creation minus `price`. Returns the full `PricingResult`. Does not write a `Deal`. Auth required, 30 req/min/user.

### Acceptance — Phase 4
- [ ] Creating a deal without `category` → 400.
- [ ] Successful creation persists all six prediction fields.
- [ ] `priceDeviationPct` is correct on a manually-tested case.
- [ ] `/api/deals/estimate-price` p95 < 500 ms with the ML service up.

---

## Phase 5 — Trip posting + matching

### 5.1 `POST /api/trips` ([backend/src/routes/trips.ts](backend/src/routes/trips.ts))

Require `fromLat / fromLng / toLat / toLng`. Accept new optional fields `capacityCm3` (default `40000`) and `corridorKm` (default `50`, range `10–100`). After persisting the `Trip`, run the matcher and return the trip plus the top 20 matches in the same response.

### 5.2 New matcher

```
backend/src/services/matching/
  routeCorridor.ts   // pointToSegmentDistanceKm, isWithinCorridor, detourKm
  matcher.ts         // findMatches(tripId, opts?)
  matcher.test.ts
```

Pipeline inside `findMatches`:
1. Load `Trip` + traveler. Reject if lat/lng missing.
2. DB filter — `Deal.status='OPEN'`, `pickupDate <= departureDate + 1d`, `weight <= trip.maxWeight`, `fromLat/toLat NOT NULL`, `category NOT NULL`.
3. In-memory corridor filter (`isWithinCorridor`).
4. Volume filter — `SIZE_VOLUME_CM3[deal.packageSize] <= trip.capacityCm3`.
5. Build batch `PriceRequest[]` (USD), call `priceClient.predictBatch(...)`. On failure, fall back per-deal to `priceFallback`.
6. Score each surviving deal:
   ```
   score = 100
         − (detourKm / corridorKm) × 30
         − abs(pickupHoursOffset) × 1.5
         + (sender.verified ? 5 : 0)
         + (sender.rating − 3) × 4
   ```
   clamped to `[0, 100]`.
7. Verdict: `|dev| ≤ 10 → FAIR`, `dev > 10 → ABOVE_MARKET`, `dev < -10 → BELOW_MARKET`.
8. Sort by score desc, take top `opts.limit` (default 20), upsert into `TripDealMatch`.

### 5.3 `GET /api/trips/:id/matches` — denormalized response

```json
{
  "trip": { "id": "...", "fromLat": ..., "toLat": ...,
            "departureDate": "...", "remainingCapacityKg": 12.5, "corridorKm": 50 },
  "matches": [{
    "matchId": "...", "matchScore": 87.4, "detourKm": 12.3,
    "deal": { "id": "...", "title": "...", "category": "Mobile Phone",
              "packageSize": "MEDIUM", "weight": 1.2, "isFragile": true,
              "itemValue": 450, "currency": "USD",
              "fromCity": "Tunis", "toCity": "Paris",
              "fromLat": ..., "fromLng": ..., "toLat": ..., "toLng": ...,
              "pickupDate": "...", "deliveryDate": "..." },
    "sender": { "id": "...", "name": "Salim J.", "avatar": "...",
                "rating": 4.7, "totalDeals": 23, "verified": true,
                "kycStatus": "APPROVED", "memberSince": "2025-09-12" },
    "pricing": { "senderPrice": 22.0, "fairPrice": 18.42,
                 "currency": "USD", "deviationPct": 19.4,
                 "verdict": "ABOVE_MARKET" },
    "estimatedEarnings": { "amount": 22.0, "currency": "USD",
                           "platformFee": 2.2, "netToTraveler": 19.8 }
  }],
  "summary": { "totalMatches": 12, "totalPotentialEarnings": 240.0,
               "totalNetEarnings": 216.0, "totalDetourKm": 47.5,
               "totalWeight": 8.4, "totalVolumeCm3": 45000,
               "capacityUtilization": { "weight": 0.67, "volume": 0.45 } }
}
```

`platformFee` reads `process.env.PLATFORM_FEE_PCT` (default `0.10`, validated at boot in [config/env.ts](backend/src/config/env.ts)).

### Acceptance — Phase 5
- [ ] Trip without lat/lng → 400.
- [ ] `POST /api/trips` returns trip + matches in one call.
- [ ] Matches are sorted by `matchScore` desc.
- [ ] `summary.totalNetEarnings` = sum of `estimatedEarnings.netToTraveler`.
- [ ] Re-running the matcher upserts (does not duplicate) into `TripDealMatch`.

---

## Phase 6 — Mobile

### 6.1 Sender — update existing flow

Files: [src/screens/PackageDetailsScreen.tsx](src/screens/PackageDetailsScreen.tsx), [src/screens/PricingScreen.tsx](src/screens/PricingScreen.tsx), [src/services/api.ts](src/services/api.ts).

- Add a **category picker** step. Searchable list of the 29 values from the new shared constants file (group by Electronics / Documents / Jewelry / Health / Other-physical for ergonomics). Block "Next" until one is picked.
- Replace the body of `pricingAPI.getSuggestedPrice` (in [src/services/api.ts:360](src/services/api.ts#L360)) so it can call the new `POST /ml/estimate-price` (richer payload) when called with the full input, **and** keeps the old `GET /ml/estimate-price` path for callers that only have route + weight (until they migrate).
- Add `useEstimatePrice` hook (debounced 600 ms) backing a `PricePreviewCard` in [PricingScreen.tsx](src/screens/PricingScreen.tsx) — states: idle / loading / success / fallback. "Use this price" fills the input with `predictedPrice`.
- `PriceDeviationModal` — when `|deviationPct| > 30`, show modal with "Adjust" / "Post anyway".

### 6.2 Traveler — new flow

- Update [TravelerPricingScreen.tsx](src/screens/TravelerPricingScreen.tsx) (or add `PostTripScreen`) to capture lat/lng via map picker, capacity buttons (Backpack 10000 / Carry-on 40000 / Checked 80000 / Trunk 200000) and corridor slider (10–100 km, default 50).
- Submit → `POST /api/trips` → navigate to a new `TripMatchesScreen` with the returned matches.
- `TripMatchesScreen` — sticky `MatchSummaryHeader` (totals + capacity bars), tabs (Best match / Highest earnings / Least detour / Soonest pickup), `MatchCard` rows with the six sections from §5.3.

### Acceptance — Phase 6
- [ ] Sender form blocks "Post" until category is picked.
- [ ] Live preview updates ~600 ms after the last keystroke.
- [ ] Traveler posting Tunis → Paris shows multiple sorted matches.
- [ ] All on-screen prices use the deal's currency (not always USD).

---

## Phase 7 — Cleanup & E2E

- Delete `/predict/price/legacy` from [face-verification-service/app/main.py](face-verification-service/app/main.py).
- Delete `POST /ml/record-accepted-price`.
- Delete `initPricingModel()` import from [server.ts](backend/src/server.ts).
- Add the deprecation `///` comment on `PricingDataPoint`.
- `console.log` → `pino` in any new file.

E2E test [backend/tests/e2e/pricing-flow.test.ts](backend/tests/e2e/pricing-flow.test.ts):
1. Seed sender + traveler.
2. Sender → `POST /api/deals/estimate-price` Tunis → Paris medium phone — assert price + confidence returned.
3. Sender → `POST /api/deals` with that price — assert all six prediction fields persisted.
4. Traveler → `POST /api/trips` Tunis → Paris — assert at least one match including the deal.
5. Match `pricing.fairPrice ≈ predicted` from step 2 (within 1¢).
6. Match `pricing.verdict` is correct.
7. Each call writes one `PricePredictionLog` row.

Resilience:
- 100 parallel calls to `POST /ml/estimate-price` — p95 < 800 ms.
- Stop `ml-service` — next call returns `source: "fallback"` within 4 s.
- Restart — next call returns `source: "model"`.

### Final acceptance
- [ ] `docker compose up` brings up `postgres + redis + backend + baileys + ml-service`.
- [ ] All tests pass.
- [ ] Mobile sender + traveler flows verified on a real device.
- [ ] `PricePredictionLog` is being populated.

---

## Hard rules (do not break)

1. **Pricing failures must not block deal creation.** Fallback always returns a price.
2. **Never trust client-supplied `posterRating / posterExperience / posterVerified`.** Always read from the authenticated user's DB row.
3. **Never recompute fair price for historical matches.** Use `TripDealMatch.fairPriceAtMatch`.
4. **`VALID_CATEGORIES` lives in exactly one file** — [shared/constants/categories.ts](backend/src/shared/constants/categories.ts). Re-listing them anywhere else is a code smell.
5. **Currency is sticky to the deal.** USD ↔ deal-currency conversions only at the boundary.
6. **Do not break `GET /ml/estimate-price`'s response shape.** Mobile is shipped against it.
7. **`PricingDataPoint` is deprecated, not deleted.** Keep historic data; stop writes.
8. **Reuse the existing `ml-service` container** ([face-verification-service/](face-verification-service/), port 8000). Do not invent a new `ml-price` service.

---

## Run order

```
Phase 0 (audit + STOP) → 1 → 2 → 3 → 4 → 5 → 6 → 7
```

Run `npm test` (backend) and `pytest` (face-verification-service) and commit at the end of each phase. Don't stack debt.

Your first message back must be: **"Starting Phase 0 audit. Will report back with `docs/pricing-refactor-audit.md` before touching code."**
