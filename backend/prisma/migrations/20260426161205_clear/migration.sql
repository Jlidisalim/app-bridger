-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "itemValue" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "slaDeadline" SET DEFAULT NOW() + interval '72 hours';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "banned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "flagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "reasonForBan" TEXT;

-- CreateIndex
CREATE INDEX "User_banned_idx" ON "User"("banned");

-- CreateIndex
CREATE INDEX "User_flagged_idx" ON "User"("flagged");
