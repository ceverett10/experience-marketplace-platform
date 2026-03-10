# Jobs Package (`@experience-marketplace/jobs`)

Background job queue system built on BullMQ + Redis. Powers all autonomous operations.

## Queue Architecture

11 queues: CONTENT, SEO, GSC, SITE, DOMAIN, ANALYTICS, ABTEST, SYNC, MICROSITE, SOCIAL, ADS

Each queue has independent config:

- **Timeout**: 60s (SEO) to 21,600s/6h (ADS — bidding engine at ~1 campaign/min)
- **Retries**: 2-5 attempts with exponential backoff
- **Daily budgets**: Per-queue caps to prevent runaway fan-out (e.g., CONTENT: 2000/day)
- **Dedup**: Redis SET NX with 2h TTL prevents duplicate jobs

## Worker Pattern

All workers follow this structure:

```typescript
export async function handleJobType(job: Job<PayloadType>): Promise<JobResult> {
  // 1. Check pause control
  const canProceed = await canExecuteAutonomousOperation({ siteId, feature });
  if (!canProceed.allowed) return { success: false, error: canProceed.reason };

  // 2. Main logic
  // 3. Return { success: true, message, data, timestamp }
  // 4. On error: classify → log → retry or dead letter
}
```

Key files: `workers/content.ts`, `workers/ads.ts`, `workers/domain.ts`, `workers/sync.ts`, `workers/site.ts`

## Error Handling

**Categories**: EXTERNAL_API, DATABASE, CONFIGURATION, BUSINESS_LOGIC, NOT_FOUND, RATE_LIMIT, AUTH, NETWORK, UNKNOWN

**Severity**: TEMPORARY → RECOVERABLE → PERMANENT → CRITICAL

- Exponential backoff: `delay = baseDelay × 2^attemptsMade`
- Rate limit errors: respect `Retry-After` header
- Circuit breaker: Redis-persisted (CLOSED → OPEN → HALF_OPEN), prevents cascading failures
- Error tracking: logs to `ErrorLog` table with jobType, category, severity

## Scheduler Conventions

All schedules use BullMQ repeatable jobs (Redis-persisted cron, NOT setInterval).

**Content fanout**: Stagger 15s per site to prevent queue flooding.

Key schedules (UTC):

- Content blog: 4 AM daily
- FAQ hubs: Mondays 1:30 AM
- Destination landing: 5:30 AM daily
- GSC sync: every 6 hours
- Ad campaign sync: hourly
- Queue cleanup: hourly
- Pipeline health check: 9 AM daily
- Meta title maintenance: Sundays 8 AM

## Paid Traffic / Bidding Engine

### End-to-End Pipeline

1. **Keyword Discovery** (`paid-keyword-scanner.ts`) — 5 modes, runs twice weekly:
   - GSC Mining: keywords with 50+ impressions but position > 15 (organic underperformance)
   - Keyword Expansion: related keywords from top-50 performing opportunities (10 seeds max)
   - Category Discovery: destination × category combinations from site configs (20 seeds max)
   - Pinterest CPC: enriches candidates with bid estimates
   - Meta Audience: searches interests for Meta targeting + delivery estimates

2. **AI Quality Evaluation** (`keyword-quality-evaluator.ts`) — Claude Haiku scores 4 dimensions:
   - Relevance (tours/activities = high, flights/hotels = low)
   - Commercial Intent (booking likelihood)
   - Competition Viability (CPC vs difficulty)
   - Landing Page Fit (does site have relevant content?)
   - Decision: BID (≥65), REVIEW (40-64), SKIP (<40). Auto-penalties for single-word (-30),
     hotel/flight (-25), navigational (-25). Quality decay: >£10 spend + 0 conversions → -20%/week.

3. **Profitability Scoring** (`bidding-engine.ts`):
   - `maxCPC = (AOV × CVR × commission) / targetROAS`
   - Defaults: AOV £197, CVR 1.5%, commission 18%, targetROAS 1.0
   - Requires min 3 bookings for AOV, 100 sessions for CVR (90-day lookback)

4. **Campaign Selection**: Top-N campaigns within daily budget (85% greedy + 15% exploration).
   Budget: £1,200/day max, £50/campaign max. ROAS thresholds: pause < 0.5, target 1.0, scale > 2.0.

5. **Landing Page Routing** (`landing-page-routing.ts`) — priority ladder:
   HOMEPAGE (branded intent) → BLOG (informational) → COLLECTION (audience-specific) →
   DESTINATION ("things to do in X") → CATEGORY (activity-specific) →
   EXPERIENCES_FILTERED (activity + location combo)

6. **Deployment** (`workers/ads.ts` → `google-ads-client.ts` / `meta-ads-client.ts`):
   - **Google**: STAG pattern — 1 campaign per theme, 1-5 ad groups, exact-match keywords, RSAs.
     Starts MANUAL_CPC → migrates to TARGET_ROAS after 15+ conversions.
   - **Meta**: Consolidated CBO campaigns grouped by activity category (8 groups).
     Interest-based targeting, DSA compliance for EU.

### Platform-Specific Notes

**Google Ads**: 50 req/min rate limit. Geo-targeting uses PRESENCE_OR_INTEREST.
Sitelinks, callouts, structured snippets auto-attached. Negative keywords batched 1000/request.

**Meta Ads**: Graph API v18.0, 3 req/min rate limit.
Encrypted tokens (`:` separator) prioritized over plaintext. DSA compliance required for EU.

**CRITICAL**: `location_types` is deprecated. `budget_rebalance_flag` deprecated since v7.0.

## Content Generation

Uses `@experience-marketplace/content-engine` (Claude Haiku model).

### Content Types & Topic Selection (`daily-content-generator.ts`)

| Type                | Strategy                                                                | Schedule        |
| ------------------- | ----------------------------------------------------------------------- | --------------- |
| Blog                | Site keywords/destinations, rotate topics                               | Daily 4 AM      |
| Destination Landing | Top SEO opportunities by location + site config destinations            | Daily 5:30 AM   |
| FAQ Hub             | GSC question queries (30-day) + existing H3 headers + AI fallback       | Mondays 1:30 AM |
| Comparison          | Deterministic pairing: category vs category, destination vs destination | Daily 6 AM      |
| Content Refresh     | SEO health identifies underperforming pages (low CTR, position drop)    | Daily 2 AM      |
| Local Guide         | "First-timers guide" per destination                                    | Sundays 3 AM    |
| Seasonal Event      | Current + upcoming month events (Christmas, Easter, etc.)               | Daily 7 AM      |

Topics sourced from: `homepageConfig` (destinations/categories), `seoConfig` (primaryKeywords),
microsite `discoveryConfig` (keyword, destination, niche).

### Quality Pipeline

- Draft → Quality Assess (0-100) → Rewrite (max 3) → Publish
- Auto-publish at 90+, pass at 75+
- Link sanitization: strips hallucinated URLs, placeholder domains
- Cost limits: $0.50/piece, $50/day

### Microsite Content

- **Opportunity microsites**: Full content set (homepage, about, blog, FAQ, experiences, contact, privacy, terms)
- **Supplier/Product microsites**: Minimal (homepage, about, experiences)
- Opportunity microsites get content refreshed every ~20 days (5% daily rotation across all microsites)

## Testing Pattern

```typescript
// Hoist mocks BEFORE imports
const { mockPrisma, mockRedis } = vi.hoisted(() => ({
  mockPrisma: { job: { create: vi.fn() } },
  mockRedis: { set: vi.fn(), incr: vi.fn() },
}));
vi.mock('@experience-marketplace/database', () => ({ prisma: mockPrisma }));

// Re-import in beforeEach after mocks
let module: any;
beforeEach(async () => {
  vi.clearAllMocks();
  module = await import('./index');
});
```

## Key Environment Variables

- `REDIS_URL` / `REDIS_TLS_URL` — Queue backend (Heroku Redis with TLS)
- `ANTHROPIC_API_KEY` — Content generation
- `META_AD_ACCOUNT_ID`, `META_ACCESS_TOKEN`, `META_PAGE_ID` — Meta Ads
- `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, etc. — Google Ads (6 vars)
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — Domain management
- `BIDDING_MAX_DAILY_BUDGET` — Default £1,200
- `ENABLED_AD_PLATFORMS` — Default GOOGLE_SEARCH

## Where to Find Things

| Feature                     | File(s)                                                           |
| --------------------------- | ----------------------------------------------------------------- |
| Queue definitions & routing | `queues/index.ts` (QUEUE_CONFIG, addJob)                          |
| Job type → queue mapping    | `types/index.ts` (JOB_TYPE_TO_QUEUE)                              |
| Job payload types           | `types/index.ts` (JobPayload union)                               |
| Content generation          | `workers/content.ts`, `services/daily-content-generator.ts`       |
| Bidding engine              | `services/bidding-engine.ts` ↔ `services/landing-page-routing.ts` |
| Meta Ads API                | `services/social/meta-ads-client.ts`                              |
| Google Ads API              | `services/google-ads-client.ts`                                   |
| Campaign deployment         | `workers/ads.ts`                                                  |
| Domain lifecycle            | `workers/domain.ts`                                               |
| Product/supplier sync       | `workers/sync.ts`                                                 |
| Site creation & brand       | `workers/site.ts`                                                 |
| Microsite operations        | `workers/microsite.ts`                                            |
| Cron schedules              | `schedulers/index.ts`                                             |
| Error classification        | `errors/index.ts`                                                 |
| Circuit breakers            | `errors/circuit-breaker.ts`                                       |
| Pause control               | `services/pause-control.ts`                                       |
| Paid traffic config         | `config/paid-traffic.ts`                                          |

## Adding a New Job Type (Checklist)

1. Add to `JobType` enum in `packages/database/prisma/schema.prisma`
2. Run `npm run db:generate --workspace=@experience-marketplace/database`
3. Add entry to `JOB_TYPE_TO_QUEUE` in `src/types/index.ts`
4. Add payload type to `JobPayload` union in `src/types/index.ts`
5. Create handler in appropriate `workers/*.ts` file
6. If scheduled: add cron to `schedulers/index.ts`
7. Test: `npm run test --workspace=@experience-marketplace/jobs`

## Runtime Constraints

- **Worker concurrency**: All queues at 1 (reduced from 2-5 to prevent R15 OOM). Do not increase.
- **Lock duration**: 5 min (`lockDuration: 300_000`), stalled interval 30s, maxStalledCount 1
- **Job cleanup**: `removeOnComplete: 20`, `removeOnFail: 100` per queue
- **BullMQ Redis**: Requires `maxRetriesPerRequest: null` and `enableReadyCheck: false`
- **Event streams**: Capped at 50 entries to prevent Redis memory growth
- **Dedup**: Redis SET NX with 2h TTL. Jobs in `dedupExemptTypes` bypass. Re-queuing within 2h is silently dropped.
- **Daily budgets**: Fail-open (allow through if Redis unavailable). Returns fake ID `budget-exceeded:...` when exceeded.

## PlatformSettings & Pause Control

- Singleton record ID: `'platform_settings_singleton'`
- `isProcessingAllowed(siteId?)`: checks global pause → per-site pause. **Fails open** on DB error.
- `isFeatureEnabled(featureName)`: checks feature-specific flags (enableContentGeneration, etc.)
- Per-site pause: `site.autonomousProcessesPaused` — independent of global pause

## Known Stubs (Not Yet Implemented)

These features have TODO placeholders in the code — do not try to integrate with them:

- **Notifications** (Slack/email/PagerDuty): `errors/tracking.ts`, `workers/content.ts` — stubs only
- **Email service**: `workers/analytics.ts` — no email provider wired in
- **Logo generation**: `workers/microsite.ts` — intentionally disabled, awaiting higher quality
- **Seasonality scoring**: `workers/opportunity.ts` — hardcoded placeholder
- **Admin site metrics**: `admin/api/sites/route.ts` — revenue, visitors, bookings all return 0

## Common Pitfalls

1. **Supplier cities** list claimed cities — validate products actually exist via Holibob API
2. **Queue timeouts**: ADS queue needs 6h for full bidding engine run
3. **Redis memory**: Queue cleanup runs hourly, keeps last 20 completed / 100 failed
4. **Fanout staggering**: Always delay 15s per site in fanout jobs
5. **Pause control**: Check `canExecuteAutonomousOperation()` before autonomous work
6. **Tightly coupled files**: `bidding-engine.ts` ↔ `landing-page-routing.ts` — always change together
7. **Prisma enum casts**: May need `as any` for string literals — this is a known friction point
8. **Silent job drops**: Budget exceeded and dedup both return fake IDs, not errors
9. **Do not increase worker concurrency** — all set to 1 after R15 OOM crashes
10. **Autonomous roadmap processor is disabled** — commented out, do not re-enable
