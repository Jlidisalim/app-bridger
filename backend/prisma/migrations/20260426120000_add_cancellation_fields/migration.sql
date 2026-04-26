-- Cancellation audit columns for Deal
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "cancelledById"   TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "cancelledByRole" TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "cancelReason"    TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "cancelEvidence"  TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "cancelledAt"     TIMESTAMP(3);

-- Cancellation audit columns for Trip
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "cancelledById"   TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "cancelledByRole" TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "cancelReason"    TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "cancelEvidence"  TEXT;
ALTER TABLE "Trip" ADD COLUMN IF NOT EXISTS "cancelledAt"     TIMESTAMP(3);
