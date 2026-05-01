-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "receiverName" TEXT,
ADD COLUMN     "receiverPhone" TEXT;

-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "slaDeadline" SET DEFAULT NOW() + interval '72 hours';
