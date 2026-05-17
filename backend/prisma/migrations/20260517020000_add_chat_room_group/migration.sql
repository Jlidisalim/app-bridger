-- Adds group-chat support to ChatRoom.
-- A group room is a 3-party room (sender + traveler + receiver) for one deal,
-- and is intentionally NOT linked through the unique dealId column so that the
-- existing 1-1 deal room can coexist with the group room.

ALTER TABLE "ChatRoom"
  ADD COLUMN "isGroup"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "groupDealId" TEXT;

CREATE INDEX "ChatRoom_groupDealId_idx" ON "ChatRoom"("groupDealId");
