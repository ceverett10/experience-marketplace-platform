-- Add landing page routing fields to AdCampaign
ALTER TABLE "ad_campaigns" ADD COLUMN "landingPagePath" TEXT;
ALTER TABLE "ad_campaigns" ADD COLUMN "landingPageType" TEXT;
ALTER TABLE "ad_campaigns" ADD COLUMN "landingPageProducts" INTEGER;
ALTER TABLE "ad_campaigns" ADD COLUMN "qualityScore" INTEGER;

-- Add index on landing page type for analytics grouping
CREATE INDEX "ad_campaigns_landingPageType_idx" ON "ad_campaigns"("landingPageType");

-- Add quality score to daily metrics
ALTER TABLE "ad_daily_metrics" ADD COLUMN "qualityScore" INTEGER;

-- Add new funnel steps
ALTER TYPE "BookingFunnelStep" ADD VALUE 'LANDING_PAGE_VIEW' BEFORE 'AVAILABILITY_SEARCH';
ALTER TYPE "BookingFunnelStep" ADD VALUE 'EXPERIENCE_CLICKED' BEFORE 'AVAILABILITY_SEARCH';

-- Add landing page field to BookingFunnelEvent
ALTER TABLE "BookingFunnelEvent" ADD COLUMN "landingPage" TEXT;

-- Add index for paid traffic funnel queries
CREATE INDEX "BookingFunnelEvent_utmMedium_createdAt_idx" ON "BookingFunnelEvent"("utmMedium", "createdAt");
