-- Add GSC tracking field to microsite_configs
ALTER TABLE "microsite_configs" ADD COLUMN "gscLastSyncedAt" TIMESTAMP(3);

-- Create MicrositeAnalyticsSnapshot table
CREATE TABLE "microsite_analytics_snapshots" (
    "id" TEXT NOT NULL,
    "micrositeId" TEXT NOT NULL,
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
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalImpressions" INTEGER NOT NULL DEFAULT 0,
    "avgCtr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgPosition" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ga4Synced" BOOLEAN NOT NULL DEFAULT false,
    "gscSynced" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "microsite_analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- Create MicrositePerformanceMetric table
CREATE TABLE "microsite_performance_metrics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "query" TEXT,
    "pageUrl" TEXT,
    "device" TEXT,
    "country" TEXT,
    "micrositeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "microsite_performance_metrics_pkey" PRIMARY KEY ("id")
);

-- Create unique constraints
CREATE UNIQUE INDEX "microsite_analytics_snapshots_micrositeId_date_key" ON "microsite_analytics_snapshots"("micrositeId", "date");
CREATE UNIQUE INDEX "microsite_performance_metrics_micrositeId_date_query_pageUrl_device_country_key" ON "microsite_performance_metrics"("micrositeId", "date", "query", "pageUrl", "device", "country");

-- Create indexes for performance
CREATE INDEX "microsite_analytics_snapshots_micrositeId_date_idx" ON "microsite_analytics_snapshots"("micrositeId", "date");
CREATE INDEX "microsite_analytics_snapshots_date_idx" ON "microsite_analytics_snapshots"("date");
CREATE INDEX "microsite_performance_metrics_micrositeId_date_idx" ON "microsite_performance_metrics"("micrositeId", "date");
CREATE INDEX "microsite_performance_metrics_query_idx" ON "microsite_performance_metrics"("query");

-- Add foreign key constraints
ALTER TABLE "microsite_analytics_snapshots" ADD CONSTRAINT "microsite_analytics_snapshots_micrositeId_fkey" FOREIGN KEY ("micrositeId") REFERENCES "microsite_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "microsite_performance_metrics" ADD CONSTRAINT "microsite_performance_metrics_micrositeId_fkey" FOREIGN KEY ("micrositeId") REFERENCES "microsite_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create materialized view for microsite daily GSC aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_microsite_daily_gsc AS
SELECT
  "micrositeId",
  date,
  SUM(clicks) as total_clicks,
  SUM(impressions) as total_impressions,
  CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) * 100 ELSE 0 END as avg_ctr,
  CASE WHEN SUM(impressions) > 0 THEN SUM(position * impressions) / SUM(impressions) ELSE 0 END as avg_position,
  COUNT(DISTINCT query) as unique_queries,
  COUNT(DISTINCT "pageUrl") as unique_pages
FROM "microsite_performance_metrics"
WHERE date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY "micrositeId", date;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_microsite_daily_gsc ON mv_microsite_daily_gsc("micrositeId", date);
