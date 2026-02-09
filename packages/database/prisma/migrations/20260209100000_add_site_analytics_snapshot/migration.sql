-- CreateTable: SiteAnalyticsSnapshot
-- Pre-aggregated daily GA4 + business metrics for admin analytics dashboard
CREATE TABLE "site_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "users" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "pageviews" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgSessionDuration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engagementRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trafficSources" JSONB,
    "deviceBreakdown" JSONB,
    "bookings" INTEGER NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "ga4Synced" BOOLEAN NOT NULL DEFAULT false,
    "gscSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_analytics_snapshots_siteId_date_key" ON "site_analytics_snapshots"("siteId", "date");

-- CreateIndex
CREATE INDEX "site_analytics_snapshots_siteId_date_idx" ON "site_analytics_snapshots"("siteId", "date");

-- CreateIndex
CREATE INDEX "site_analytics_snapshots_date_idx" ON "site_analytics_snapshots"("date");

-- AddForeignKey
ALTER TABLE "site_analytics_snapshots" ADD CONSTRAINT "site_analytics_snapshots_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
