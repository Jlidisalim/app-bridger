-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "replyToId" TEXT;

-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "slaDeadline" SET DEFAULT NOW() + interval '72 hours';

-- CreateIndex
CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
