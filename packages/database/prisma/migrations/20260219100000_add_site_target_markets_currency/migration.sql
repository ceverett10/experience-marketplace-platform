-- AlterTable
ALTER TABLE "Site" ADD COLUMN "targetMarkets" TEXT[] DEFAULT ARRAY['GB', 'US', 'CA', 'AU', 'IE', 'NZ']::TEXT[];
ALTER TABLE "Site" ADD COLUMN "primaryCurrency" TEXT NOT NULL DEFAULT 'GBP';
