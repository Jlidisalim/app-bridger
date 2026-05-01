-- Adds UserBlock + UserReport tables and image / location columns to ChatMessage.

-- ChatMessage: add image + location columns
ALTER TABLE "ChatMessage" ADD COLUMN "imageUrl"  TEXT;
ALTER TABLE "ChatMessage" ADD COLUMN "latitude"  DOUBLE PRECISION;
ALTER TABLE "ChatMessage" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "ChatMessage" ADD COLUMN "address"   TEXT;

-- UserBlock
CREATE TABLE "UserBlock" (
  "id"        TEXT NOT NULL,
  "blockerId" TEXT NOT NULL,
  "blockedId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserBlock_blockerId_blockedId_key" ON "UserBlock"("blockerId", "blockedId");
CREATE INDEX "UserBlock_blockerId_idx" ON "UserBlock"("blockerId");
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
ALTER TABLE "UserBlock"
  ADD CONSTRAINT "UserBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBlock"
  ADD CONSTRAINT "UserBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- UserReport
CREATE TABLE "UserReport" (
  "id"          TEXT NOT NULL,
  "reporterId"  TEXT NOT NULL,
  "reportedId"  TEXT NOT NULL,
  "reason"      TEXT NOT NULL,
  "description" TEXT,
  "status"      TEXT NOT NULL DEFAULT 'PENDING',
  "chatRoomId"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UserReport_reporterId_idx" ON "UserReport"("reporterId");
CREATE INDEX "UserReport_reportedId_idx" ON "UserReport"("reportedId");
CREATE INDEX "UserReport_status_createdAt_idx" ON "UserReport"("status", "createdAt");
ALTER TABLE "UserReport"
  ADD CONSTRAINT "UserReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserReport"
  ADD CONSTRAINT "UserReport_reportedId_fkey" FOREIGN KEY ("reportedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
