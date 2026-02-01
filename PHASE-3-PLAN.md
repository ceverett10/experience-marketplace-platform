# Phase 3: Production Readiness & Advanced Autonomy

**Phase Duration:** Weeks 5-8
**Status:** 🚧 Ready to Start
**Current Progress:** 0%
**Last Updated:** January 31, 2026

---

## Overview

Phase 3 focuses on completing the production-ready platform with:
- External API integrations for enhanced autonomy
- Full domain management automation
- Monitoring and observability infrastructure
- Advanced A/B testing and optimization
- Level 3 autonomy (minimal human intervention)

**Prerequisites:** ✅ Phase 2 Complete
- All 223 tests passing
- All 7 workers operational
- Database schema complete
- CI/CD pipeline working

---

## Sprint 3.1: Keyword Research & SEO Intelligence ⏳

### Priority: HIGH
### Estimated Duration: 1 week

### Objectives

Integrate real keyword research APIs to replace placeholder data in the opportunity scanner.

### Tasks

#### 1. Budget-Friendly Keyword Research Integration

**Recommended Approach:** Hybrid solution with free + low-cost APIs

**Files to Modify:**
- `packages/jobs/src/services/keyword-research.ts` (new)
- `packages/jobs/src/services/datafor-seo-client.ts` (new)
- `packages/jobs/src/services/serp-api-client.ts` (new)
- `packages/jobs/src/workers/opportunity.ts`
- `packages/database/prisma/schema.prisma` (add API credentials)

**Implementation:**
```typescript
// Budget-friendly keyword research service
export class KeywordResearchService {
  private dataForSeo: DataForSEOClient;      // $50/mo - Primary data
  private serpApi: SerpAPIClient;            // $50/mo - SERP analysis
  private googleTrends: GoogleTrendsAPI;     // FREE - Trend data

  async getKeywordData(keyword: string): Promise<KeywordData> {
    // Get search volume from DataForSEO
    const volume = await this.dataForSeo.getSearchVolume(keyword);

    // Get trend data from Google Trends (free)
    const trends = await this.googleTrends.getTrend(keyword);

    // Calculate difficulty from SERP analysis
    const serp = await this.serpApi.search(keyword);
    const difficulty = this.calculateDifficulty(serp);

    return {
      searchVolume: volume,
      keywordDifficulty: difficulty,
      trend: trends.trend,
      cpc: volume.cpc || 0,
    };
  }

  async getRelatedKeywords(keyword: string): Promise<string[]> {
    // Use DataForSEO related keywords API
    const related = await this.dataForSeo.getRelatedKeywords(keyword);
    return related.keywords;
  }

  async getCompetitorAnalysis(domain: string): Promise<CompetitorData> {
    // Use SerpAPI to get competitor SERP positions
    const competitors = await this.serpApi.getCompetitors(domain);
    return this.analyzeCompetitors(competitors);
  }

  // DIY keyword difficulty calculation (saves $150/month vs SEMrush)
  private calculateDifficulty(serp: SERPResult): number {
    const topResults = serp.results.slice(0, 10);

    // Analyze domain authority indicators
    const scores = topResults.map(result => {
      let score = 0;
      // Domain age (estimate from TLD and content)
      if (result.domain.includes('.gov') || result.domain.includes('.edu')) score += 20;
      if (result.domain.length < 10) score += 10; // Likely established
      // HTTPS
      if (result.link.startsWith('https://')) score += 5;
      // Content indicators
      if (result.snippet.length > 200) score += 10;
      // Position weight
      score *= (11 - result.position) / 10;
      return score;
    });

    const avgScore = scores.reduce((a, b) => a + b, 0) / 10;
    return Math.min(100, Math.round(avgScore));
  }
}
```

**API Options (Choose One or More):**

**Option A: DataForSEO (Recommended - Best Value)**
- **Cost:** ~$50/month (pay-as-you-go)
- **Coverage:** Search volume, CPC, competition, related keywords
- **Pricing:** $0.002-0.005 per API call
- **API:** https://dataforseo.com/

**Option B: SerpAPI (For SERP Scraping)**
- **Cost:** $50/month (5,000 searches)
- **Coverage:** Real Google SERP data, competitor positions
- **API:** https://serpapi.com/

**Option C: Google Keyword Planner API (FREE)**
- **Cost:** FREE (requires minimal Google Ads spend ~$5-10/mo)
- **Coverage:** Search volume ranges, keyword ideas
- **Limitation:** Volume ranges, not exact numbers

**Option D: Ubersuggest API (Budget Alternative)**
- **Cost:** $29/month
- **Coverage:** Search volume, SEO difficulty, CPC
- **API:** https://app.neilpatel.com/en/ubersuggest/api

**Environment Variables Required:**
```bash
# Primary (choose one)
DATAFORSEO_API_LOGIN=your-login
DATAFORSEO_API_PASSWORD=your-password

# Or alternative
SERPAPI_KEY=your-key
# Or
UBERSUGGEST_API_KEY=your-key

# Free supplementary
GOOGLE_TRENDS_API_KEY=not-required  # Public API
```

#### 3. Update Opportunity Scanner

**Replace Placeholder Logic:**
```typescript
// Before (placeholder):
searchVolume: Math.floor(Math.random() * 10000)
keywordDifficulty: Math.floor(Math.random() * 40) + 30

// After (real data):
const keywordData = await keywordService.getKeywordData(query);
searchVolume: keywordData.searchVolume
keywordDifficulty: keywordData.difficulty
```

#### 4. Add Competitor Monitoring

**New Worker Handler:**
```typescript
export async function handleCompetitorScan(job: Job<CompetitorScanPayload>) {
  // Scan competitor sites
  // Identify content gaps
  // Generate opportunities
}
```

### Deliverables

- ✅ SEMrush or Ahrefs API client
- ✅ Real keyword data in opportunity scanner
- ✅ Competitor analysis worker
- ✅ Updated scoring algorithm with real metrics
- ✅ API usage tracking and rate limiting

### Success Metrics

- Real search volume data for 100% of opportunities
- Keyword difficulty accuracy > 90%
- Competitor analysis for top 5 results per keyword
- API rate limits respected (no 429 errors)

---

## Sprint 3.2: Domain Management Automation 🔧

### Priority: HIGH
### Estimated Duration: 1 week

### Objectives

Complete domain registration, DNS configuration, and SSL provisioning with production APIs.

### Tasks

#### 1. Domain Registrar Integration

**Choose One:**
- Namecheap API
- Cloudflare Registrar API
- Google Domains API

**Implementation Steps:**

**Files to Create/Modify:**
- `packages/jobs/src/services/domain-registrar.ts` (new)
- `packages/jobs/src/workers/domain.ts` (update stubs)

```typescript
export class DomainRegistrarService {
  async checkAvailability(domain: string): Promise<boolean> {
    // Check if domain available
  }

  async registerDomain(domain: string, years: number): Promise<Registration> {
    // Register domain
    // Return order ID, cost, expiry
  }

  async configureDNS(domain: string, records: DNSRecord[]): Promise<void> {
    // Set DNS records
  }

  async enableAutoRenew(domain: string): Promise<void> {
    // Enable auto-renewal
  }
}
```

#### 2. Cloudflare DNS Integration

**For domains registered elsewhere:**

```typescript
export class CloudflareDNSService {
  async addZone(domain: string): Promise<Zone> {
    // Add domain to Cloudflare
  }

  async updateDNSRecords(domain: string, records: DNSRecord[]): Promise<void> {
    // Configure DNS
  }

  async enableProxy(domain: string): Promise<void> {
    // Enable Cloudflare proxy (CDN + DDoS)
  }
}
```

#### 3. Let's Encrypt SSL Automation

**Via Cloudflare or direct ACME:**

```typescript
export class SSLService {
  async provisionCertificate(domain: string): Promise<Certificate> {
    // Request SSL certificate
    // Validate domain ownership (HTTP-01 or DNS-01 challenge)
    // Install certificate
    // Set up auto-renewal
  }

  async renewCertificate(domain: string): Promise<void> {
    // Check expiry
    // Renew if needed (< 30 days remaining)
  }
}
```

#### 4. Update Domain Worker

**Remove Mocks, Add Real Implementations:**

```typescript
// In handleDomainRegister
const registrar = new DomainRegistrarService();
const result = await registrar.registerDomain(domain, registrationYears);

// Store registration details
await prisma.domain.update({
  where: { id: domainId },
  data: {
    status: 'REGISTERED',
    registrationOrderId: result.orderId,
    registrationCost: result.cost,
    expiresAt: result.expiryDate,
  },
});
```

### Deliverables

- ✅ Production domain registrar integration
- ✅ Cloudflare DNS automation
- ✅ Let's Encrypt SSL with auto-renewal
- ✅ Domain ownership verification
- ✅ Cost tracking and billing alerts

### Success Metrics

- Domain registration success rate > 95%
- SSL provisioning < 5 minutes
- Zero expired certificates
- DNS propagation < 1 hour

---

## Sprint 3.3: Monitoring & Observability 📊

### Priority: MEDIUM
### Estimated Duration: 1 week

### Objectives

Build monitoring infrastructure for queue health, worker performance, and system alerts.

### Tasks

#### 1. Queue Health Dashboard

**New Admin Page:**
- `apps/admin/src/app/queues/page.tsx` (new)

**Features:**
- Real-time queue metrics (waiting, active, completed, failed)
- Worker status (running, paused, stalled)
- Job duration histograms
- Error rate graphs
- Manual job triggering
- Queue pause/resume controls

**Data Source:**
```typescript
// Use BullMQ methods
const metrics = await queueRegistry.getQueueMetrics();
// Returns: { waiting, active, completed, failed, delayed }
```

#### 2. Worker Performance Monitoring

**Metrics to Track:**
- Job processing time (P50, P95, P99)
- Job success/failure rates
- Jobs per hour
- Memory usage per worker
- CPU usage per worker

**Implementation:**
```typescript
// Add to worker handlers
const startTime = Date.now();
try {
  // ... process job
  const duration = Date.now() - startTime;
  await trackMetric('job.duration', duration, {
    jobType: job.name,
    status: 'success'
  });
} catch (error) {
  await trackMetric('job.failure', 1, {
    jobType: job.name,
    error: error.message
  });
}
```

#### 3. Email Notification System

**For Critical Events:**
- Worker crashes
- Job failures (> 3 retries)
- Queue overflow (> 1000 pending)
- SSL expiry warnings (< 7 days)
- Domain expiry warnings (< 30 days)

**Implementation:**
```typescript
// Use SendGrid, AWS SES, or Postmark
export class EmailService {
  async sendAlert(alert: Alert): Promise<void> {
    // Format email template
    // Send to operators
  }
}
```

**Environment Variables:**
- `EMAIL_SERVICE_API_KEY`
- `EMAIL_FROM=alerts@yourdomain.com`
- `EMAIL_TO=ops@yourdomain.com`

#### 4. Slack/Discord Webhook Integration

**For Real-Time Alerts:**

```typescript
export class SlackService {
  async sendNotification(message: string, severity: 'info' | 'warning' | 'error'): Promise<void> {
    // Send to Slack webhook
    // Color-code by severity
  }
}
```

**Environment Variables:**
- `SLACK_WEBHOOK_URL`
- `DISCORD_WEBHOOK_URL` (optional alternative)

### Deliverables

- ✅ Queue health dashboard in admin
- ✅ Worker performance metrics
- ✅ Email alerting system
- ✅ Slack/Discord notifications
- ✅ Error tracking and logging

### Success Metrics

- Dashboard load time < 2 seconds
- Alerts delivered < 1 minute after incident
- 100% uptime visibility
- Zero missed critical alerts

---

## Sprint 3.4: Advanced A/B Testing 🧪

### Priority: MEDIUM
### Estimated Duration: 1 week

### Objectives

Enhance A/B testing with auto-generated variants, advanced algorithms, and automatic rollout.

### Tasks

#### 1. AI-Powered Variant Generation

**Use Claude to generate test variants:**

```typescript
export async function generateVariant(
  original: string,
  variantType: 'headline' | 'cta' | 'description'
): Promise<string> {
  const prompt = `Generate an A/B test variant for this ${variantType}:

  Original: ${original}

  Requirements:
  - Similar length
  - Different approach (emotional vs logical, urgency vs value, etc.)
  - Maintain brand voice
  - Single variant only`;

  const variant = await claude.generate(prompt);
  return variant;
}
```

#### 2. Multi-Variant Testing

**Extend from A/B to A/B/C/D:**

```typescript
interface ABTest {
  variants: Variant[]; // Support 2-5 variants
  allocationStrategy: 'thompson' | 'epsilon-greedy' | 'ucb1';
  confidenceLevel: number; // 0.90, 0.95, 0.99
}
```

#### 3. Automatic Winner Rollout

**When statistical significance reached:**

```typescript
if (test.significanceReached && test.hasWinner) {
  // Gradually roll out winner
  await scheduleGradualRollout(test.winnerId, {
    stages: [
      { percentage: 50, duration: '1 day' },
      { percentage: 75, duration: '2 days' },
      { percentage: 100, duration: 'permanent' }
    ]
  });
}
```

#### 4. Advanced Algorithms

**UCB1 (Upper Confidence Bound):**
```typescript
function ucb1Score(variant: Variant, totalTrials: number): number {
  const mean = variant.conversions / variant.impressions;
  const exploration = Math.sqrt((2 * Math.log(totalTrials)) / variant.impressions);
  return mean + exploration;
}
```

**Bayesian Optimization:**
```typescript
function bayesianUpdate(
  priorAlpha: number,
  priorBeta: number,
  conversions: number,
  impressions: number
): { alpha: number; beta: number } {
  return {
    alpha: priorAlpha + conversions,
    beta: priorBeta + (impressions - conversions)
  };
}
```

### Deliverables

- ✅ AI variant generation
- ✅ Multi-variant testing (A/B/C/D)
- ✅ UCB1 and Bayesian algorithms
- ✅ Automatic winner rollout
- ✅ Test performance dashboard

### Success Metrics

- Variant generation quality score > 80
- Test convergence time < 7 days
- Automatic rollout success rate > 95%
- CTR improvement from winners > 10%

---

## Sprint 3.5: Full Autonomy Features 🤖

### Priority: HIGH
### Estimated Duration: 2 weeks

### Objectives

Achieve Level 3 autonomy - platform operates independently with minimal human oversight.

### Tasks

#### 1. Autonomous Site Creation

**Auto-create sites for high-value opportunities:**

```typescript
// In opportunity scanner
if (opportunity.score > 75 && opportunity.inventoryCount > 10) {
  await queueRegistry.addJob('site', {
    type: 'SITE_CREATE',
    payload: {
      opportunityId: opportunity.id,
      autoGenerate: true,
      autoDeploy: true,
      autoRegisterDomain: true,
    },
  });
}
```

**Workflow:**
1. Detect opportunity (score > 75)
2. Generate brand identity (AI)
3. Register domain
4. Create site structure
5. Generate initial content (10 pages)
6. Deploy to production
7. Start GSC tracking

**Approval Requirements:**
- ❌ No human approval needed
- ✅ Post-deployment notification only
- ✅ Can be rolled back within 24h

#### 2. Autonomous Site Deprecation

**Auto-deprecate underperforming sites:**

```typescript
// In analytics worker
const poorPerformers = await prisma.site.findMany({
  where: {
    status: 'ACTIVE',
    AND: [
      { avgImpressions: { lt: 100 } }, // < 100 impressions/day
      { avgClicks: { lt: 5 } },        // < 5 clicks/day
      { lastBooking: { lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } }, // No bookings in 90 days
    ]
  }
});

for (const site of poorPerformers) {
  await scheduleDeprecation(site.id, {
    warningPeriod: 30, // days
    redirectTo: 'main-site',
  });
}
```

**Deprecation Workflow:**
1. Identify underperformer (30-day avg)
2. Send warning notification
3. Wait 30 days
4. Redirect traffic to main site
5. Archive content
6. Cancel domain renewal
7. Mark site as DEPRECATED

#### 3. Budget Optimization

**Auto-adjust spending based on ROI:**

```typescript
interface BudgetOptimizer {
  maxMonthlySpend: number;
  targetROI: number; // Minimum 3:1

  async optimizeBudget(): Promise<BudgetAllocation> {
    // Calculate ROI per channel
    // Reallocate budget to high-performers
    // Pause/reduce low-performers
  }
}
```

**Optimization Rules:**
- Content generation: Pause if quality score < 70 for 10 consecutive pieces
- SEO opportunities: Reduce scanning frequency if conversion rate < 5%
- Domain registrations: Cap at 5/month if avg bookings per site < 1/month
- A/B tests: Stop tests early if clear loser (p < 0.05)

#### 4. Self-Healing System

**Auto-recovery from common failures:**

```typescript
export async function autoHeal(error: Error, context: JobContext): Promise<boolean> {
  switch (error.type) {
    case 'RATE_LIMIT':
      // Wait and retry with exponential backoff
      await sleep(calculateBackoff(context.attempts));
      return true;

    case 'DATABASE_LOCK':
      // Retry with jitter
      await sleep(Math.random() * 1000);
      return true;

    case 'API_TIMEOUT':
      // Switch to backup API
      context.useBackupAPI = true;
      return true;

    case 'SSL_EXPIRED':
      // Auto-renew certificate
      await sslService.renewCertificate(context.domain);
      return true;

    default:
      // Escalate to human
      await notifyOps(error);
      return false;
  }
}
```

### Deliverables

- ✅ Autonomous site creation (score > 75)
- ✅ Autonomous site deprecation (poor performers)
- ✅ Budget optimization algorithm
- ✅ Self-healing error recovery
- ✅ Full Level 3 autonomy operational

### Success Metrics

- Site creation success rate > 90%
- Sites created without human approval: 100%
- Deprecation false positive rate < 5%
- Budget utilization efficiency > 85%
- Auto-recovery success rate > 70%

---

## Sprint 3.6: Performance Optimization 🚀

### Priority: LOW
### Estimated Duration: 1 week

### Objectives

Optimize system performance for scale and cost efficiency.

### Tasks

#### 1. Database Query Optimization

**Add Indexes:**
```sql
-- High-frequency queries
CREATE INDEX idx_pages_site_status ON pages(site_id, status);
CREATE INDEX idx_opportunities_score ON opportunities(score DESC, status);
CREATE INDEX idx_content_quality ON content(quality_score DESC, status);
CREATE INDEX idx_metrics_page_date ON metrics(page_id, created_at DESC);
```

**Query Optimization:**
- Use connection pooling
- Implement query result caching (Redis)
- Batch database operations
- Use transactions for multi-step operations

#### 2. Job Queue Optimization

**Concurrency Tuning:**
```typescript
const queueOptions = {
  concurrency: {
    content: 3,      // Parallel content generation
    seo: 5,          // Parallel opportunity scanning
    gsc: 2,          // API rate limit consideration
    site: 2,         // Avoid Heroku rate limits
    domain: 1,       // Sequential for reliability
    analytics: 3,    // Parallel analysis
    abtest: 2,       // Parallel experiments
  }
};
```

**Job Prioritization:**
```typescript
await queueRegistry.addJob('content', {
  type: 'CONTENT_GENERATE',
  payload: { ... },
  opts: {
    priority: opportunity.score > 85 ? 1 : 10, // Higher score = higher priority
  }
});
```

#### 3. API Rate Limit Management

**Smart Rate Limiting:**
```typescript
export class RateLimiter {
  private tokens: Map<string, TokenBucket>;

  async acquireToken(api: string): Promise<void> {
    const bucket = this.tokens.get(api);
    if (!bucket.hasTokens()) {
      await bucket.waitForToken();
    }
    bucket.consume();
  }
}
```

**Rate Limits:**
- Claude API: 100,000 tokens/min
- GSC API: 1,200 queries/day
- SEMrush API: 10,000 API units/month
- Heroku API: 500 requests/hour

#### 4. Content Delivery Optimization

**CDN Setup:**
- Enable Cloudflare CDN for static assets
- Cache pages with 1-hour TTL
- Use ISR (Incremental Static Regeneration) for semi-static pages

**Image Optimization:**
- Convert to WebP format
- Lazy loading for below-fold images
- Responsive image sizes

### Deliverables

- ✅ Database query optimization (< 100ms P95)
- ✅ Job queue concurrency tuning
- ✅ API rate limit management
- ✅ CDN and caching strategy
- ✅ Image optimization pipeline

### Success Metrics

- Database query time: < 100ms P95
- Job processing throughput: +50%
- API rate limit violations: 0
- Page load time: < 2s P95
- CDN cache hit rate: > 80%

---

## Technical Debt Resolution

### High Priority

1. **Type Safety Improvements**
   - Add strict null checks across codebase
   - Improve Prisma type exports
   - Add runtime validation with Zod

2. **Error Handling Standardization**
   - Create custom error classes
   - Standardize error responses
   - Improve error logging

3. **Testing Coverage**
   - Add integration tests for workers
   - Add E2E tests for booking flow
   - Increase unit test coverage to > 80%

### Medium Priority

4. **Documentation**
   - API documentation (OpenAPI/Swagger)
   - Worker handbook for operations
   - Deployment runbook

5. **Security Hardening**
   - API key rotation
   - Secrets management (Vault/AWS Secrets Manager)
   - Security audit

---

## Phase 3 Success Criteria

### Must Have (For Phase 3 Complete)

- ✅ Real keyword research data (SEMrush or Ahrefs)
- ✅ Production domain registration working
- ✅ SSL automation with auto-renewal
- ✅ Monitoring dashboard operational
- ✅ Email/Slack alerting configured
- ✅ Autonomous site creation (no approval needed)
- ✅ Budget optimization algorithm
- ✅ Self-healing error recovery

### Nice to Have (Phase 4)

- ⏳ Machine learning for opportunity scoring
- ⏳ Custom AI model training (fine-tuned Claude)
- ⏳ Advanced competitor intelligence
- ⏳ International expansion (multi-language)

---

## Estimated Costs (Monthly)

### API Services

**Budget Option (Recommended):**
- Claude API: $300-500/month (content generation, scales with usage)
- **DataForSEO:** $50/month (keyword research - pay-as-you-go)
- **SerpAPI:** $50/month (SERP analysis, 5,000 searches)
- Google Trends: $0 (free)
- SendGrid: $15/month (email notifications, 40k emails)

**Premium Option (If budget allows):**
- Claude API: $500/month
- SEMrush: $200/month (all-in-one SEO suite)
- SendGrid: $15/month

### Infrastructure
- Heroku Dynos: $100/month (website + workers)
- Redis: $15/month (job queues)
- PostgreSQL: $9/month (database)

### Domain & SSL
- Domain registrations: $50/month (5 domains @ $10/ea)
- Cloudflare Free: $0/month (SSL included)
- Cloudflare Pro (optional): $20/month per domain (advanced features)

**Budget Total: ~$589-689/month** (saves $220-320/month vs premium)
**Premium Total: ~$809-909/month** (with SEMrush)

**Recommended:** Start with budget option ($589/mo), upgrade to premium if ROI justifies it.

---

## Timeline

### Week 5: Sprint 3.1 (Keyword Research)
- Days 1-2: SEMrush/Ahrefs API integration
- Days 3-4: Update opportunity scanner
- Day 5: Testing and validation

### Week 6: Sprint 3.2 (Domain Automation)
- Days 1-2: Domain registrar integration
- Days 3-4: SSL automation
- Day 5: Testing and validation

### Week 7: Sprint 3.3 & 3.4 (Monitoring & A/B Testing)
- Days 1-3: Monitoring dashboard
- Days 4-5: Advanced A/B testing

### Week 8: Sprint 3.5 (Full Autonomy)
- Days 1-3: Autonomous site creation
- Days 4-5: Budget optimization & self-healing

---

## Phase 3 Kickoff Checklist

Before starting Phase 3:

- ✅ Phase 2 complete (100%)
- ✅ All tests passing (223/223)
- ✅ All lint checks passing
- ✅ Documentation updated
- ⬜ API keys acquired:
  - ⬜ SEMrush or Ahrefs API key
  - ⬜ Domain registrar API key (Namecheap/Cloudflare)
  - ⬜ Email service API key (SendGrid)
  - ⬜ Slack webhook URL (optional)
- ⬜ Budget approved ($909/month)
- ⬜ Team briefed on Phase 3 goals
- ⬜ Phase 3 branch created

---

## Next Phase Preview: Phase 4

### Sprint 4.1: Machine Learning & AI
- Custom AI model training
- Predictive opportunity scoring
- Sentiment analysis for reviews

### Sprint 4.2: International Expansion
- Multi-language content generation
- Currency conversion
- Localized SEO strategies

### Sprint 4.3: Advanced Analytics
- Cohort analysis
- Funnel optimization
- Attribution modeling

---

**Phase 3 Status:** 🚧 Ready to Start
**Current Blockers:** None - awaiting API key acquisition
**Next Action:** Acquire API keys and start Sprint 3.1
