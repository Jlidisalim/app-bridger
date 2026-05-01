-- Dispute communication & timeline persistence
-- Adds: disputeType column on Dispute, file metadata on DisputeEvidence,
--       DisputeMessage thread, and DisputeTimelineEvent audit table.

ALTER TABLE "Dispute"
  ADD COLUMN "disputeType" TEXT NOT NULL DEFAULT 'OTHER';

ALTER TABLE "DisputeEvidence"
  ADD COLUMN "fileName" TEXT,
  ADD COLUMN "fileSize" INTEGER,
  ADD COLUMN "mimeType" TEXT;

CREATE TABLE "DisputeMessage" (
  "id"             TEXT PRIMARY KEY,
  "disputeId"      TEXT NOT NULL,
  "senderId"       TEXT,
  "senderRole"     TEXT NOT NULL,
  "content"        TEXT,
  "attachmentUrl"  TEXT,
  "attachmentType" TEXT,
  "attachmentName" TEXT,
  "attachmentSize" INTEGER,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeMessage_disputeId_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DisputeMessage_disputeId_createdAt_idx"
  ON "DisputeMessage"("disputeId", "createdAt");

CREATE TABLE "DisputeTimelineEvent" (
  "id"          TEXT PRIMARY KEY,
  "disputeId"   TEXT NOT NULL,
  "eventType"   TEXT NOT NULL,
  "actorId"     TEXT,
  "actorRole"   TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "metadata"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DisputeTimelineEvent_disputeId_fkey"
    FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "DisputeTimelineEvent_disputeId_createdAt_idx"
  ON "DisputeTimelineEvent"("disputeId", "createdAt");

CREATE INDEX "DisputeTimelineEvent_eventType_idx"
  ON "DisputeTimelineEvent"("eventType");
