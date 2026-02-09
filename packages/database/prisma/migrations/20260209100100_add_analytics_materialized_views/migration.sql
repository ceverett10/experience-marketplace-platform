-- Materialized Views for Analytics Dashboard
-- These views pre-aggregate GSC data for fast portfolio queries

-- Daily site GSC totals (refresh hourly via scheduled job)
-- Used by: Portfolio overview, site comparison charts
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_site_daily_gsc AS
SELECT
    "siteId",
    date,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE
        WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions)
        ELSE 0
    END as avg_ctr,
    AVG(position) as avg_position,
    COUNT(DISTINCT query) as unique_queries,
    COUNT(DISTINCT "pageUrl") as unique_pages
FROM "PerformanceMetric"
WHERE date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY "siteId", date;

-- Unique index for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_site_daily_gsc_unique
ON mv_site_daily_gsc("siteId", date);

-- Additional index for date-range queries
CREATE INDEX IF NOT EXISTS idx_mv_site_daily_gsc_date
ON mv_site_daily_gsc(date);


-- Portfolio weekly rollup (refresh daily via scheduled job)
-- Used by: Portfolio trends, week-over-week comparisons
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_portfolio_weekly AS
SELECT
    DATE_TRUNC('week', date)::date as week,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE
        WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions)
        ELSE 0
    END as avg_ctr,
    AVG(position) as avg_position,
    COUNT(DISTINCT "siteId") as active_sites
FROM "PerformanceMetric"
WHERE date >= CURRENT_DATE - INTERVAL '1 year'
GROUP BY DATE_TRUNC('week', date);

-- Unique index for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_portfolio_weekly_unique
ON mv_portfolio_weekly(week);


-- Top queries across portfolio (refresh daily)
-- Used by: Search performance page, keyword analysis
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_top_queries AS
SELECT
    query,
    SUM(clicks) as total_clicks,
    SUM(impressions) as total_impressions,
    CASE
        WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions)
        ELSE 0
    END as avg_ctr,
    AVG(position) as avg_position,
    COUNT(DISTINCT "siteId") as site_count,
    MAX(date) as last_seen
FROM "PerformanceMetric"
WHERE
    date >= CURRENT_DATE - INTERVAL '30 days'
    AND query IS NOT NULL
    AND query != ''
GROUP BY query
HAVING SUM(impressions) >= 10
ORDER BY SUM(clicks) DESC
LIMIT 1000;

-- Unique index for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_top_queries_unique
ON mv_top_queries(query);

-- Index for sorting by clicks
CREATE INDEX IF NOT EXISTS idx_mv_top_queries_clicks
ON mv_top_queries(total_clicks DESC);


-- Function to refresh all analytics materialized views
-- Called by REFRESH_ANALYTICS_VIEWS scheduled job
CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
    -- Use CONCURRENTLY to avoid locking reads during refresh
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_site_daily_gsc;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_portfolio_weekly;
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_queries;
END;
$$ LANGUAGE plpgsql;
