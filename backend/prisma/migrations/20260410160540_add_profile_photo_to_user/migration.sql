-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "slaDeadline" SET DEFAULT NOW() + interval '72 hours';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "profilePhoto" TEXT;
