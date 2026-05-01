-- AlterTable
ALTER TABLE "Dispute" ALTER COLUMN "slaDeadline" SET DEFAULT NOW() + interval '72 hours';
