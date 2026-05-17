-- Adds boat (AIS) tracking fields to TrackingSession, parallel to the
-- existing flight fields. Polled by the in-process vesselPoller from the
-- AISHub Web Service, keyed by MMSI.

ALTER TABLE "TrackingSession"
  ADD COLUMN "boatActive"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "boatMmsi"        BIGINT,
  ADD COLUMN "boatImo"         BIGINT,
  ADD COLUMN "boatName"        TEXT,
  ADD COLUMN "boatCallsign"    TEXT,
  ADD COLUMN "boatLat"         DOUBLE PRECISION,
  ADD COLUMN "boatLng"         DOUBLE PRECISION,
  ADD COLUMN "boatCogDeg"      DOUBLE PRECISION,
  ADD COLUMN "boatSogKnots"    DOUBLE PRECISION,
  ADD COLUMN "boatHeadingDeg"  DOUBLE PRECISION,
  ADD COLUMN "boatNavStatus"   INTEGER,
  ADD COLUMN "boatType"        INTEGER,
  ADD COLUMN "boatDraughtM"    DOUBLE PRECISION,
  ADD COLUMN "boatDestination" TEXT,
  ADD COLUMN "boatEta"         TEXT,
  ADD COLUMN "boatStale"       BOOLEAN,
  ADD COLUMN "boatUpdatedAt"   TIMESTAMP(3),
  ADD COLUMN "boatLastPollAt"  TIMESTAMP(3);

CREATE INDEX "TrackingSession_boatActive_idx" ON "TrackingSession"("boatActive");
