-- AlterEnum: Add PAID_CANDIDATE to OpportunityStatus
ALTER TYPE "OpportunityStatus" ADD VALUE 'PAID_CANDIDATE';

-- AlterEnum: Add ad job types to JobType
ALTER TYPE "JobType" ADD VALUE 'AD_CAMPAIGN_SYNC';
ALTER TYPE "JobType" ADD VALUE 'AD_PERFORMANCE_REPORT';
ALTER TYPE "JobType" ADD VALUE 'AD_BUDGET_OPTIMIZER';

-- CreateEnum: AdPlatform
CREATE TYPE "AdPlatform" AS ENUM ('PINTEREST', 'FACEBOOK', 'GOOGLE_DISPLAY', 'BING', 'OUTBRAIN', 'REDDIT');

-- CreateEnum: CampaignStatus
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateTable: AdCampaign
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "dailyBudget" DECIMAL(10,2) NOT NULL,
    "totalBudget" DECIMAL(10,2),
    "maxCpc" DECIMAL(10,2) NOT NULL,
    "keywords" TEXT[],
    "targetUrl" TEXT NOT NULL,
    "audiences" JSONB,
    "geoTargets" TEXT[],
    "utmSource" TEXT NOT NULL,
    "utmMedium" TEXT NOT NULL DEFAULT 'cpc',
    "utmCampaign" TEXT NOT NULL,
    "platformCampaignId" TEXT,
    "totalSpend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalImpressions" INTEGER NOT NULL DEFAULT 0,
    "avgCpc" DECIMAL(10,4),
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "roas" DOUBLE PRECISION,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AdDailyMetric
CREATE TABLE "ad_daily_metrics" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "spend" DECIMAL(10,2) NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "cpc" DECIMAL(10,4) NOT NULL,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ad_daily_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_campaigns_siteId_idx" ON "ad_campaigns"("siteId");
CREATE INDEX "ad_campaigns_platform_status_idx" ON "ad_campaigns"("platform", "status");
CREATE INDEX "ad_campaigns_opportunityId_idx" ON "ad_campaigns"("opportunityId");
CREATE UNIQUE INDEX "ad_daily_metrics_campaignId_date_key" ON "ad_daily_metrics"("campaignId", "date");
CREATE INDEX "ad_daily_metrics_campaignId_idx" ON "ad_daily_metrics"("campaignId");
CREATE INDEX "ad_daily_metrics_date_idx" ON "ad_daily_metrics"("date");

-- CreateIndex: Add cpc index on SEOOpportunity
CREATE INDEX "SEOOpportunity_cpc_idx" ON "SEOOpportunity"("cpc");

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "SEOOpportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ad_daily_metrics" ADD CONSTRAINT "ad_daily_metrics_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
