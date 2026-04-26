-- Migration: Add tripId support to ChatRoom and make dealId optional
-- This enables chat rooms to be linked to Trip postings in addition to Deals.

-- 1. Make dealId nullable (was NOT NULL)
ALTER TABLE "ChatRoom" ALTER COLUMN "dealId" DROP NOT NULL;

-- 2. Add tripId column (nullable, unique — one chat room per trip)
ALTER TABLE "ChatRoom" ADD COLUMN "tripId" TEXT;
CREATE UNIQUE INDEX "ChatRoom_tripId_key" ON "ChatRoom"("tripId");

-- 3. Add foreign key: ChatRoom.tripId → Trip.id (cascade delete)
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
