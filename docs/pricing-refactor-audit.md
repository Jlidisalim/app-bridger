# Phase 0 — Pricing Refactor Audit

> Snapshot of the existing weak pricing module before any refactor work begins.
> Generated 2026-05-01 against `main` (commit `93580b9`).
> No code has been changed yet.

---

## 1. Files that import from `backend/src/ml/pricing/` or write to `PricingDataPoint`

### 1a. Imports from `backend/src/ml/pricing/pricingModel.ts`

| File | Symbol(s) imported | Line |
|---|---|---|
| [backend/src/server.ts](../backend/src/server.ts#L49) | `initPricingModel` | 49 (called at boot, line 287) |
| [backend/src/routes/ml.ts](../backend/src/routes/ml.ts#L15-L20) | `predictPrice`, `haversineKm`, `recordAcceptedPrice`, `selfTest as priceSelfTest` | 15–20 |

> No other backend file (services, validators, jobs, scripts, tests) imports from `backend/src/ml/pricing/`. The blast radius for deleting `pricingModel.ts` is exactly **two files**.

### 1b. Writes to `PricingDataPoint`

| File | Operation | Line | Notes |
|---|---|---|---|
| [backend/src/ml/pricing/pricingModel.ts](../backend/src/ml/pricing/pricingModel.ts#L218) | `prisma.pricingDataPoint.createMany(...)` | 218 | Boot-time synthetic seeding when row count < 50 (inside `initPricingModel`). |
| [backend/src/ml/pricing/pricingModel.ts](../backend/src/ml/pricing/pricingModel.ts#L300) | `prisma.pricingDataPoint.create(...)` | 300 | Inside `recordAcceptedPrice`, called by `POST /ml/record-accepted-price`. |
| [backend/src/routes/admin.ts](../backend/src/routes/admin.ts#L219-L230) | `prisma.pricingDataPoint.create(...)` | 225 | **Not mentioned in the refactor prompt.** `POST /admin/pricing-data` lets admins manually add training rows. There is also `GET /admin/pricing-data` (line 203) and `DELETE /admin/pricing-data/:id` (line 233). Phase 7 cleanup must decide whether to keep these as read-only browsers or delete them; the prompt's "PricingDataPoint stays read-only" rule means at minimum the `POST` and `DELETE` endpoints should be removed or 410'd. |

### 1c. Reads from `PricingDataPoint`

| File | Operation | Line |
|---|---|---|
| [backend/src/ml/pricing/pricingModel.ts](../backend/src/ml/pricing/pricingModel.ts#L213) | `findMany` (boot training) | 213 |
| [backend/src/ml/pricing/pricingModel.ts](../backend/src/ml/pricing/pricingModel.ts#L304-L306) | `count` + `findMany` (incremental retrain every 10 rows) | 304, 306 |
| [backend/src/routes/admin.ts](../backend/src/routes/admin.ts#L210-L211) | `findMany` + `count` (admin browser) | 210, 211 |

### 1d. Other "weak pricing" surface area discovered while grepping

These weren't in the prompt but they overlap with the pricing module and are worth flagging up front:

- [backend/src/ml/pricing/pricingModel.ts](../backend/src/ml/pricing/pricingModel.ts#L19-L56) **already** has a `predictPriceViaPython` proxy — it POSTs `{ distance_km, weight_kg, category, urgency }` to `${ML_SERVICE_URL}/predict/price`. The prompt's Phase 2 should keep this exact request shape mounted at `/predict/price/legacy` for one release, **then** swap the TS caller to the new richer schema.
- [src/utils/pricing.ts](../src/utils/pricing.ts#L31-L66) — mobile-side `getSuggestedPriceRange()` is a **separate, hard-coded route table** (`LHR-JFK: $45`, etc.) and a category multiplier (`Electronics: 1.3`, …). It is not wired into `pricingAPI`, but it does drive other UI surfaces — verify in Phase 6 whether any screen still calls it (it would shadow the live ML preview if so).
- [backend/src/ml/matching/](../backend/src/ml/matching/) and [backend/src/ml/reviews/](../backend/src/ml/reviews/) live alongside `pricing/` — the prompt says we are only refactoring `pricing/`, so leave matching and reviews untouched.

---

## 2. Exact `GET /ml/estimate-price` response contract (the line we cannot move)

Source: [backend/src/routes/ml.ts:63-120](../backend/src/routes/ml.ts#L63-L120).

### Request

```
GET /ml/estimate-price?fromLat=…&fromLng=…&toLat=…&toLng=…&weight=…&volume=…&urgent=…
```

- Auth: `optionalAuth` + `mlRateLimiter`. Anonymous calls work today.
- All four coordinates required. `weight` defaults to `'1'`, `volume` to `'0'`, `urgent` to `'false'`.
- Validation: lat ∈ [-90, 90], lon ∈ [-180, 180], 0 < weight ≤ 50, volume ≥ 0. Bad input → `400 { error: "..." }`.

### 200 response — JSON shape

```json
{
  "estimatedPrice": 47.83,
  "minPrice":       40.66,
  "maxPrice":       55.00,
  "confidence":     0.71,
  "distanceKm":     1382
}
```

- `estimatedPrice / minPrice / maxPrice` — numbers, USD-ish (no currency field), already rounded to 2 decimals by the local model.
- **`confidence` is a NUMBER between 0 and 1** (today's model returns 0.55–0.92 from the local regression, 0.85 / 0.60 from the Python heuristic). The Phase 2 spec changes this to a **STRING** (`"HIGH" | "MEDIUM" | "LOW"`). **This IS a breaking change for the mobile shape unless the GET endpoint adapter translates back.** The spec's hard rule §6 ("do not break `GET /ml/estimate-price`'s response shape") therefore forces the Phase 3 adapter to project the string confidence back to a number — propose mapping: `HIGH → 0.85`, `MEDIUM → 0.65`, `LOW → 0.45`. Confirm with the team before Phase 3.
- `distanceKm` — integer (rounded by `Math.round` at line 115).
- No `model_version`, no `source`, no `currency` field today.

### Mobile consumer of this response

[src/services/api.ts:430-475](../src/services/api.ts#L430-L475) — `pricingAPI.getSuggestedPrice` calls the `GET` endpoint, then maps the response to:

```ts
{
  min:        Math.round(d.minPrice),
  max:        Math.round(d.maxPrice),
  median:     Math.round(d.estimatedPrice),
  confidence: d.confidence,                 // ← still a number on the wire
  distanceKm: d.distanceKm,
}
```

Mobile rounds prices to integers before display — so any USD ↔ deal-currency conversion done in Phase 3 must happen **before** the response is built, not after.

---

## 3. Mobile screens & helpers that consume `pricingAPI`

| Caller | Line | What it sends | What it does with the result |
|---|---|---|---|
| [src/screens/PricingScreen.tsx](../src/screens/PricingScreen.tsx#L36-L53) | 41 | `route { from, to } + senderPackage.weight \|\| 1` | Drops it into the "Smart AI Suggestion" card (`min`/`max` range + median). Sender flow, step 5 of 5. |
| [src/screens/TravelerPricingScreen.tsx](../src/screens/TravelerPricingScreen.tsx#L41-L58) | 46 | `route { from, to } + hard-coded weight 1` | Same UI pattern, traveler side, step 4 of 5. **Note**: weight is hard-coded to 1 because trips don't have a per-package weight — Phase 6 should switch this to the new `POST /api/trips` matcher response, not call `pricingAPI` at all. |
| [src/services/api.ts](../src/services/api.ts#L430-L475) | 430 | — | Sole producer of `pricingAPI`. Internally maps IATA codes → lat/lng using `AIRPORT_COORDS` (lines 380–428). If the route uses non-IATA city names, the call short-circuits to the local fallback (lines 469–473). |

**Other mobile pricing helpers (NOT going through `pricingAPI`):**

- [src/utils/pricing.ts](../src/utils/pricing.ts) — `getSuggestedPriceRange`, `calculateCommission`, `formatCurrency`, `validatePrice`. Re-exports `SENDER_FLAT_FEE`, `TRAVELER_FEE_RATE`, `calculateFees` from `feeEngine.ts`. Phase 6 must `grep -rn "getSuggestedPriceRange" src` once Phase 1 is in to confirm no screen falls back to it.

**Search command for verification:**

```bash
grep -rn "pricingAPI\|getSuggestedPrice\b\|getSuggestedPriceRange" src
```

---

## 4. SQL counts (deferred — DB not running locally)

The two queries the prompt asked to record. They were NOT executed yet because Postgres isn't running in this audit pass and the prompt's Phase 0 explicitly says "Do not touch code yet" — running migrations or starting a fresh DB would qualify.

```sql
-- 4a. Legacy deals missing geo (will need backfill or rejection on next deal create)
SELECT COUNT(*) FROM "Deal" WHERE "fromLat" IS NULL;

-- 4b. Legacy deals missing category — WILL FAIL today
-- "category" column is added in Phase 1's migration `xgboost_pricing`.
-- Run this AFTER the migration; expected result: 100 % of pre-migration rows = NULL.
SELECT COUNT(*) FROM "Deal" WHERE "category" IS NULL;
```

To run them once Postgres is up:

```bash
docker compose up -d postgres
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c 'SELECT COUNT(*) FROM "Deal" WHERE "fromLat" IS NULL;'
```

**Schema context backing these queries** (so reviewers don't have to open the file):

- [backend/prisma/schema.prisma:149-152](../backend/prisma/schema.prisma#L149-L152) — `Deal.fromLat / fromLng / toLat / toLng` are all `Float?` (nullable). Phase 4 must reject creates with NULL geo, but legacy rows can stay nullable.
- [backend/prisma/schema.prisma:153](../backend/prisma/schema.prisma#L153) — `packageSize String  // SMALL, MEDIUM, LARGE, EXTRA_LARGE` (already a String, no enum). Phase 1 will rely on `SIZE_VOLUME_CM3` to map it.
- [backend/prisma/schema.prisma:497-507](../backend/prisma/schema.prisma#L497-L507) — `PricingDataPoint` has fields `distance / weight / volume / urgent / price / createdAt`. No `userId`, no `dealId`, no `currency`. The Phase 1 spec correctly does NOT alter this table — the new write target is `PricePredictionLog`.
- [backend/prisma/schema.prisma:345-377](../backend/prisma/schema.prisma#L345-L377) — `Trip` has `fromCity/toCity/…/maxWeight/price/currency/negotiable`. **No lat/lng, no capacity volume, no corridor.** Phase 1.2 adds these.

---

## 5. Service & infra ground-truth (cross-checked against prompt)

| Claim in the prompt | Confirmed against repo? |
|---|---|
| ML service is `ml-service` on port `8000` | ✅ — `face-verification-service/Dockerfile` exposes 8000; `docker-compose.yml` maps it. The prompt's old/wrong reference to "`ml-price` on `8001`" doesn't exist anywhere in the repo. |
| Backend reads `ML_SERVICE_URL` (default `http://localhost:8000`) | ✅ — [backend/src/config/env.ts:42](../backend/src/config/env.ts#L42), surfaced as `config.mlService.url` ([env.ts:172-174](../backend/src/config/env.ts#L172-L174)). |
| `face-verification-service/app/main.py:319` exposes `POST /predict/price` | ✅ — confirmed at line 319. Lazy loader at lines 306-316 reads `/app/models/pricing_model.pkl`. |
| `.pkl` files are NOT checked in | ✅ — `face-verification-service/models/` and `data/` directories don't exist. The Python service therefore runs on the heuristic fallback today (`model_version: "heuristic_fallback"`). |
| `train_pricing.py` exists | ✅ — `face-verification-service/train_pricing.py` is present. |
| `Deal.category` does NOT exist yet | ✅ — confirmed at [schema.prisma:137-193](../backend/prisma/schema.prisma#L137-L193). |
| Existing Python `/predict/price` already returns `model_version` | ✅ — `xgb_v1` when model present, `heuristic_fallback` otherwise. The Phase 2 schema bump can keep that field name. |

---

## 6. Things that surprised me — flag for the team before starting Phase 1

1. **Admin UI writes to `PricingDataPoint`**. The refactor prompt's "PricingDataPoint stays read-only" hard rule is at odds with `POST /admin/pricing-data` and `DELETE /admin/pricing-data/:id` ([routes/admin.ts:219-238](../backend/src/routes/admin.ts#L219-L238)). Decision needed: keep them (read-only browser only), 410 Gone them, or migrate the admin UI to a `PricePredictionLog` browser instead. Adding to Phase 7 cleanup checklist.
2. **`confidence` semantic change is breaking**. Today the wire format is `number`; the new design uses `string`. Phase 3's `GET /ml/estimate-price` adapter MUST project string → number before responding so [api.ts:459](../src/services/api.ts#L459) keeps working. Suggested mapping above.
3. **The mobile-only fallback price table** in [src/utils/pricing.ts:8-19](../src/utils/pricing.ts#L8-L19) is invisible from the API audit. If any UI surface still calls `getSuggestedPriceRange`, it will silently shadow the live model. Run `grep -rn "getSuggestedPriceRange" src` at the start of Phase 6.
4. **`TravelerPricingScreen` is going away in Phase 6** — it currently calls `pricingAPI` with `weight=1` which is meaningless. The replacement flow (`POST /api/trips` → matches) does not call the pricing endpoint at all from the traveler side; the matcher does it server-side. Worth confirming the spec author intended that — the existing screen does have a service-fee field tied to `feeEngine`, and that fee logic must survive the rewrite.
5. **`config.server.port` defaults to 3000 in env.ts but `server.ts` uses `process.env.PORT || 4000`** ([server.ts:277](../backend/src/server.ts#L277)). Pre-existing bug, out of pricing scope, but the docker compose says backend is on 4000 — the env-default is dead code. Mentioned only so nobody "fixes" it during the refactor.

---

## 7. Stop point

Phase 0 audit complete. **No code has been changed.** Per the prompt:

> Stop after Phase 0 and post the audit file. Do not touch code yet.

Awaiting go-ahead from the user before starting Phase 1 (`xgboost_pricing` migration).
