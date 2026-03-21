# Demand Generation Service (`@experience-marketplace/demand-generation`)

Autonomous background worker service. Runs BullMQ workers that process jobs from all 11 queues.

## Worker Variants

- **worker-fast.ts** — High-throughput (content generation, optimization)
- **worker-heavy.ts** — Long-running (audits, comprehensive scans)
- **worker-infra.ts** — Infrastructure (domain setup, SSL, GSC verification)
- **worker-generic.ts** — General-purpose fallback
- **index.ts** — Main orchestrator, manages all queues

Each variant runs as a separate Heroku dyno.

## Job Types Handled (80+)

### Content: CONTENT_GENERATE, CONTENT_OPTIMIZE, CONTENT_REVIEW + fanout jobs

### SEO: OPPORTUNITY_SCAN, OPPORTUNITY_OPTIMIZE, SEO_AUDIT, AUTO_OPTIMIZE, BATCH_OPTIMIZE

### Site/Domain: SITE_CREATE, SITE_DEPLOY, DOMAIN_REGISTER, DOMAIN_VERIFY, SSL_PROVISION

### GSC: GSC_SETUP, GSC_VERIFY, GSC_SYNC, MICROSITE_GSC_SYNC

### Analytics: GA4_SETUP, GA4_DAILY_SYNC, METRICS_AGGREGATE, PERFORMANCE_REPORT

### Sync: SUPPLIER_SYNC, PRODUCT_SYNC, BULK_PRODUCT_SYNC, SUPPLIER_ENRICH, BOOKING_STATUS_SYNC

### Microsites: MICROSITE_CREATE, MICROSITE_BRAND_GENERATE, MICROSITE_CONTENT_GENERATE, MICROSITE_PUBLISH

### Social: SOCIAL_DAILY_POSTING, SOCIAL_POST_GENERATE, SOCIAL_POST_PUBLISH

### Link Building: LINK_OPPORTUNITY_SCAN, LINK_OUTREACH_GENERATE, LINK_COMPETITOR_DISCOVERY

### Paid Traffic: PAID_KEYWORD_SCAN, AD_CAMPAIGN_SYNC, BIDDING_ENGINE_RUN, KEYWORD_ENRICHMENT

## Job Status Tracking

Each job tracked in Prisma `Job` model: RUNNING → COMPLETED | FAILED
Repeatable cron jobs auto-create DB records on first RUNNING status.

## Roadmap System

- `initializeSiteRoadmap()` — Sets up deployment sequence for new site
- `executeNextTasks()` — Orchestrates based on task dependencies
- `processAllSiteRoadmaps()` — Batch process all active roadmaps
- `detectStuckTasks()` + `resetStuckCount()` — Failure recovery

## Dependencies

Primary: `@experience-marketplace/jobs` (queue definitions, workers, services)
Also: database, holibob-api, shared, content-engine
