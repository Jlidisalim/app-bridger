-- AlterTable: add isFragile (itemValue already exists in the database)
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "isFragile" BOOLEAN NOT NULL DEFAULT false;
