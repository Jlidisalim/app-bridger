-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "slaDeadline" SET DEFAULT NOW() + interval '72 hours';

-- CreateTable
CREATE TABLE "TrackingSession" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'idle',
    "gpsActive" BOOLEAN NOT NULL DEFAULT false,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "gpsAccuracyM" DOUBLE PRECISION,
    "gpsHeadingDeg" DOUBLE PRECISION,
    "gpsSpeedMs" DOUBLE PRECISION,
    "gpsAltitudeM" DOUBLE PRECISION,
    "gpsUpdatedAt" TIMESTAMP(3),
    "gpsLostAt" TIMESTAMP(3),
    "flightActive" BOOLEAN NOT NULL DEFAULT false,
    "flightCallsign" TEXT,
    "flightIcao24" TEXT,
    "flightLat" DOUBLE PRECISION,
    "flightLng" DOUBLE PRECISION,
    "flightAltitudeM" DOUBLE PRECISION,
    "flightHeadingDeg" DOUBLE PRECISION,
    "flightVelocityMs" DOUBLE PRECISION,
    "flightVerticalRate" DOUBLE PRECISION,
    "flightOnGround" BOOLEAN,
    "flightStale" BOOLEAN,
    "flightUpdatedAt" TIMESTAMP(3),
    "flightLastPollAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackingSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionLog" (
    "id" BIGSERIAL NOT NULL,
    "dealId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "altitudeM" DOUBLE PRECISION,
    "headingDeg" DOUBLE PRECISION,
    "speedMs" DOUBLE PRECISION,
    "source" TEXT,
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrackingSession_dealId_key" ON "TrackingSession"("dealId");

-- CreateIndex
CREATE INDEX "TrackingSession_mode_idx" ON "TrackingSession"("mode");

-- CreateIndex
CREATE INDEX "TrackingSession_gpsActive_idx" ON "TrackingSession"("gpsActive");

-- CreateIndex
CREATE INDEX "TrackingSession_flightActive_idx" ON "TrackingSession"("flightActive");

-- CreateIndex
CREATE INDEX "PositionLog_dealId_loggedAt_idx" ON "PositionLog"("dealId", "loggedAt");

-- AddForeignKey
ALTER TABLE "TrackingSession" ADD CONSTRAINT "TrackingSession_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositionLog" ADD CONSTRAINT "PositionLog_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
