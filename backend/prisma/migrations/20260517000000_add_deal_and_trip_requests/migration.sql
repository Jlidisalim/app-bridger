-- Adds DealRequest and TripRequest tables for the request/approval flow.
-- Travelers no longer auto-match a Deal by calling /match — they create a
-- PENDING DealRequest, and the Sender accepts or rejects it. Same for
-- TripRequest in the opposite direction.

-- DealRequest
CREATE TABLE "DealRequest" (
  "id"            TEXT NOT NULL,
  "dealId"        TEXT NOT NULL,
  "requesterId"   TEXT NOT NULL,
  "proposedPrice" DOUBLE PRECISION NOT NULL,
  "message"       TEXT,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"     TIMESTAMP(3),
  CONSTRAINT "DealRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DealRequest_dealId_requesterId_key" ON "DealRequest"("dealId", "requesterId");
CREATE INDEX "DealRequest_dealId_status_idx"      ON "DealRequest"("dealId", "status");
CREATE INDEX "DealRequest_requesterId_status_idx" ON "DealRequest"("requesterId", "status");
ALTER TABLE "DealRequest"
  ADD CONSTRAINT "DealRequest_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DealRequest"
  ADD CONSTRAINT "DealRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- TripRequest
CREATE TABLE "TripRequest" (
  "id"            TEXT NOT NULL,
  "tripId"        TEXT NOT NULL,
  "requesterId"   TEXT NOT NULL,
  "proposedPrice" DOUBLE PRECISION NOT NULL,
  "message"       TEXT,
  "title"         TEXT,
  "description"   TEXT,
  "packageSize"   TEXT,
  "weight"        DOUBLE PRECISION,
  "itemValue"     DOUBLE PRECISION,
  "isFragile"     BOOLEAN NOT NULL DEFAULT false,
  "receiverName"  TEXT,
  "receiverPhone" TEXT,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt"     TIMESTAMP(3),
  CONSTRAINT "TripRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TripRequest_tripId_requesterId_key" ON "TripRequest"("tripId", "requesterId");
CREATE INDEX "TripRequest_tripId_status_idx"      ON "TripRequest"("tripId", "status");
CREATE INDEX "TripRequest_requesterId_status_idx" ON "TripRequest"("requesterId", "status");
ALTER TABLE "TripRequest"
  ADD CONSTRAINT "TripRequest_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TripRequest"
  ADD CONSTRAINT "TripRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
