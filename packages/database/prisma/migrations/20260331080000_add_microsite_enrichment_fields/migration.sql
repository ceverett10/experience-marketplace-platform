-- Add AI enrichment fields to microsite_configs for Phase 2 homepage redesign.
-- All fields are nullable — homepage degrades gracefully when null.

ALTER TABLE "microsite_configs" ADD COLUMN "heroHeadline" TEXT;
ALTER TABLE "microsite_configs" ADD COLUMN "destinationBlurb" TEXT;
ALTER TABLE "microsite_configs" ADD COLUMN "destinationTags" TEXT[] DEFAULT '{}';
ALTER TABLE "microsite_configs" ADD COLUMN "enrichedAt" TIMESTAMP(3);
ALTER TABLE "microsite_configs" ADD COLUMN "enrichmentSource" TEXT;
