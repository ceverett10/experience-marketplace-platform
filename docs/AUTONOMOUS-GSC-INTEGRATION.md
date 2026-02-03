# Autonomous GSC Verification Integration

**Goal**: Fully automate Google Search Console verification and monitoring as part of the autonomous site creation and optimization pipeline.

---

## Overview: Complete Autonomous Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. OPPORTUNITY DISCOVERY                                    │
│     - Scan keywords (Holibob inventory, GSC data, trends)   │
│     - Calculate priority scores                              │
│     - Create SEOOpportunity records                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  2. SITE CREATION                                            │
│     - Generate site concept (AI)                             │
│     - Create Site + Brand records                            │
│     - Status: DRAFT → REVIEW                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  3. DOMAIN REGISTRATION                                      │
│     - Check availability (Namecheap/Cloudflare API)          │
│     - Register domain automatically                          │
│     - Configure DNS (A record, CNAME)                        │
│     - Wait for DNS propagation                               │
│     - Status: REVIEW → DNS_PENDING                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  4. GSC VERIFICATION (NEW!)                                  │
│     - Generate verification token (GSC API)                  │
│     - Store in Site.gscVerificationCode                      │
│     - Meta tag automatically appears on site                 │
│     - Verify via GSC API                                     │
│     - Add service account with Full permissions              │
│     - Status: DNS_PENDING → GSC_VERIFICATION                 │
│     - On success: GSC_VERIFICATION → ACTIVE                  │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  5. CONTENT GENERATION                                       │
│     - Generate homepage, category pages, blog posts          │
│     - AI-powered with quality scoring                        │
│     - Optimized for target keywords                          │
│     - Auto-publish when quality > 85                         │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  6. PERFORMANCE MONITORING                                   │
│     - GSC data sync every 6 hours                            │
│     - Track: impressions, clicks, CTR, position              │
│     - Identify underperforming pages                         │
│     - Detect new opportunities                               │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│  7. OPTIMIZATION LOOP                                        │
│     - Low CTR? → Rewrite title/description                   │
│     - Position drop? → Add 500+ words                        │
│     - High impressions, low clicks? → Create new content     │
│     - A/B test variations                                    │
│     - Continuous improvement                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema Changes

### 1. Update Site Model

```prisma
model Site {
  id          String   @id @default(cuid())
  slug        String   @unique
  name        String
  description String?

  // Brand Configuration
  brand       Brand?   @relation(fields: [brandId], references: [id])
  brandId     String?  @unique

  // Domain Configuration
  domains     Domain[]
  primaryDomain String?

  // Holibob Integration
  holibobPartnerId String
  holibobApiKey    String?

  // Site Settings
  status      SiteStatus @default(DRAFT)
  isAutomatic Boolean    @default(true)

  // SEO Configuration
  seoConfig   Json?    // { titleTemplate, defaultDescription, keywords }

  // ⭐ NEW: GSC Verification
  gscVerificationCode  String?    // Meta tag content for verification
  gscVerified          Boolean    @default(false)
  gscVerifiedAt        DateTime?
  gscPropertyUrl       String?    // Full GSC property URL (sc-domain: or https://)
  gscLastSyncedAt      DateTime?  // Last successful data sync

  // Relationships
  pages       Page[]
  content     Content[]
  bookings    Booking[]
  opportunities SEOOpportunity[]
  abTests     ABTest[]
  metrics     PerformanceMetric[]
  jobs        Job[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  publishedAt DateTime?

  @@index([status])
  @@index([holibobPartnerId])
  @@index([gscVerified])  // ⭐ NEW INDEX
}
```

### 2. Update SiteStatus Enum

```prisma
enum SiteStatus {
  DRAFT              // Initial creation
  REVIEW             // Ready for review
  DNS_PENDING        // Domain registered, waiting for DNS
  GSC_VERIFICATION   // ⭐ NEW: Verifying with GSC
  SSL_PENDING        // SSL certificate provisioning
  ACTIVE             // Live and operational
  PAUSED             // Temporarily disabled
  ARCHIVED           // Deprecated
}
```

### 3. Add New Job Types

```prisma
enum JobType {
  // Content Generation
  CONTENT_GENERATE
  CONTENT_OPTIMIZE
  CONTENT_REVIEW

  // SEO
  SEO_ANALYZE
  SEO_OPPORTUNITY_SCAN
  GSC_SYNC

  // Site Management
  SITE_CREATE
  SITE_DEPLOY
  DOMAIN_REGISTER
  DOMAIN_VERIFY
  SSL_PROVISION
  GSC_VERIFY         // ⭐ NEW: Verify site in GSC
  GSC_SETUP          // ⭐ NEW: Complete GSC setup

  // Analytics
  METRICS_AGGREGATE
  PERFORMANCE_REPORT

  // A/B Testing
  ABTEST_ANALYZE
  ABTEST_REBALANCE
}
```

---

## Implementation: Code Changes

### 1. Database Migration

```bash
# Create migration
npx prisma migrate dev --name add_gsc_verification_fields

# Apply to production
npx prisma migrate deploy
```

### 2. Update Layout for Dynamic Verification

**File**: `apps/website-platform/src/app/layout.tsx`

```tsx
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const hostname = headersList.get('host') ?? 'localhost';
  const site = await getSiteFromHostname(hostname);
  const brandCSS = generateBrandCSSVariables(site.brand);

  return (
    <html lang="en" className={`${inter.variable} ${playfair.variable}`}>
      <head>
        {/* ⭐ Dynamic GSC Verification per site */}
        {site.gscVerificationCode && (
          <meta name="google-site-verification" content={site.gscVerificationCode} />
        )}

        {/* Preconnect to external APIs for faster resource loading */}
        <link rel="preconnect" href="https://api.sandbox.holibob.tech" />
        <link rel="dns-prefetch" href="https://api.sandbox.holibob.tech" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {brandCSS && <style dangerouslySetInnerHTML={{ __html: brandCSS }} />}
      </head>
      <body className="min-h-screen bg-white font-sans antialiased">
        <SiteProvider site={site}>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </SiteProvider>
      </body>
    </html>
  );
}
```

### 3. Create GSC Verification Worker

**File**: `packages/jobs/src/workers/gsc-verification-worker.ts`

```typescript
import { Job } from 'bullmq';
import { prisma } from '@experience-marketplace/database';
import { getGSCClient } from '../services/gsc-client';

interface GSCVerifyPayload {
  siteId: string;
}

/**
 * GSC Verification Worker
 *
 * Automates Google Search Console verification for new sites
 */
export async function gscVerificationWorker(job: Job<GSCVerifyPayload>) {
  const { siteId } = job.data;

  console.log(`[GSC Verify] Starting verification for site ${siteId}`);

  try {
    // 1. Fetch site
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      include: { domains: true },
    });

    if (!site) {
      throw new Error(`Site ${siteId} not found`);
    }

    if (!site.primaryDomain) {
      throw new Error(`Site ${siteId} has no primary domain`);
    }

    // 2. Check if already verified
    if (site.gscVerified) {
      console.log(`[GSC Verify] Site ${siteId} already verified`);
      return { success: true, message: 'Already verified' };
    }

    const siteUrl = `https://${site.primaryDomain}`;
    const gscClient = getGSCClient();

    // 3. Get verification token if not already stored
    if (!site.gscVerificationCode) {
      console.log(`[GSC Verify] Requesting verification token for ${siteUrl}`);

      const token = await gscClient.getSiteVerificationToken({
        siteUrl,
        verificationMethod: 'META',
      });

      // Store verification code in database
      await prisma.site.update({
        where: { id: siteId },
        data: {
          gscVerificationCode: token,
          gscPropertyUrl: siteUrl,
        },
      });

      console.log(`[GSC Verify] Verification token stored for ${siteUrl}`);

      // Wait for deployment to pick up the new meta tag
      await job.updateProgress(30);
      console.log(`[GSC Verify] Waiting for meta tag to be deployed...`);
      await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait 1 minute
    }

    await job.updateProgress(50);

    // 4. Verify the site
    console.log(`[GSC Verify] Verifying site ${siteUrl} with GSC`);

    await gscClient.verifySite({
      siteUrl,
      verificationMethod: 'META',
    });

    console.log(`[GSC Verify] Site verified successfully!`);
    await job.updateProgress(70);

    // 5. Add service account to property
    console.log(`[GSC Verify] Adding service account to GSC property`);

    await gscClient.addUser({
      siteUrl,
      emailAddress: process.env.GSC_CLIENT_EMAIL!,
      permissionLevel: 'siteOwner',
    });

    console.log(`[GSC Verify] Service account added with Full permissions`);
    await job.updateProgress(90);

    // 6. Update site as verified
    await prisma.site.update({
      where: { id: siteId },
      data: {
        gscVerified: true,
        gscVerifiedAt: new Date(),
        status: 'ACTIVE', // Move to active status
      },
    });

    await job.updateProgress(100);

    console.log(`[GSC Verify] ✅ Site ${siteId} fully verified and active!`);

    // 7. Queue initial GSC data sync
    await addJob('GSC_SYNC', {
      siteId,
      startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
      endDate: new Date().toISOString().split('T')[0], // Today
      dimensions: ['query', 'page', 'country', 'device'],
    });

    return {
      success: true,
      siteUrl,
      verifiedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[GSC Verify] Error verifying site ${siteId}:`, error);

    // Update site status to indicate failure
    await prisma.site.update({
      where: { id: siteId },
      data: { status: 'REVIEW' }, // Back to manual review
    });

    throw error;
  }
}
```

### 4. Update Site Creation Worker

**File**: `apps/demand-generation/src/workers/site-worker.ts`

Add GSC verification step after domain registration:

```typescript
export async function siteCreationWorker(job: Job) {
  const { opportunityId, niche, location } = job.data;

  try {
    // 1. Generate site concept
    const concept = await generateSiteConcept(niche, location);

    // 2. Create site in database
    const site = await prisma.site.create({
      data: {
        slug: slugify(concept.name),
        name: concept.name,
        description: concept.description,
        holibobPartnerId: process.env.HOLIBOB_PARTNER_ID!,
        status: 'DRAFT',
        seoConfig: {
          titleTemplate: `%s | ${concept.name}`,
          defaultDescription: concept.description,
          keywords: concept.keywords,
        },
      },
    });

    // 3. Create brand
    const brand = await generateBrand(site.id, concept);

    // 4. Register domain
    const domain = await registerDomain(site.id, concept.domain);

    // Update site with primary domain
    await prisma.site.update({
      where: { id: site.id },
      data: {
        primaryDomain: domain.domain,
        status: 'DNS_PENDING',
      },
    });

    // 5. Wait for DNS propagation (async job)
    await addJob('DOMAIN_VERIFY', { siteId: site.id, domainId: domain.id });

    // 6. ⭐ Queue GSC verification (runs after DNS is ready)
    await addJob(
      'GSC_VERIFY',
      { siteId: site.id },
      {
        delay: 5 * 60 * 1000, // Wait 5 minutes for DNS
      }
    );

    // 7. Queue content generation (runs in parallel)
    await addJob('CONTENT_GENERATE', {
      siteId: site.id,
      opportunityId,
      pageTypes: ['HOMEPAGE', 'BLOG', 'CATEGORY'],
      count: 10,
    });

    return { success: true, siteId: site.id, domain: domain.domain };
  } catch (error) {
    console.error('[Site Creation] Error:', error);
    throw error;
  }
}
```

### 5. Update GSC Client with Verification Methods

**File**: `packages/jobs/src/services/gsc-client.ts`

Add verification methods:

```typescript
export class GSCClient {
  // ... existing methods

  /**
   * Get verification token for a site
   */
  async getSiteVerificationToken(params: {
    siteUrl: string;
    verificationMethod: 'META' | 'FILE' | 'DNS';
  }): Promise<string> {
    const { siteUrl, verificationMethod } = params;

    // Call GSC Site Verification API
    const response = await this.request('/siteVerification/v1/token', {
      method: 'POST',
      body: JSON.stringify({
        site: {
          type: verificationMethod === 'DNS' ? 'INET_DOMAIN' : 'SITE',
          identifier: siteUrl,
        },
        verificationMethod,
      }),
    });

    return response.token;
  }

  /**
   * Verify a site with GSC
   */
  async verifySite(params: {
    siteUrl: string;
    verificationMethod: 'META' | 'FILE' | 'DNS';
  }): Promise<void> {
    const { siteUrl, verificationMethod } = params;

    await this.request(`/siteVerification/v1/webResource`, {
      method: 'POST',
      body: JSON.stringify({
        site: {
          type: verificationMethod === 'DNS' ? 'INET_DOMAIN' : 'SITE',
          identifier: siteUrl,
        },
        verificationMethod,
      }),
    });
  }

  /**
   * Add user (service account) to GSC property
   */
  async addUser(params: {
    siteUrl: string;
    emailAddress: string;
    permissionLevel: 'siteOwner' | 'siteFullUser' | 'siteRestrictedUser';
  }): Promise<void> {
    const { siteUrl, emailAddress, permissionLevel } = params;

    await this.request(`/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/permissions`, {
      method: 'POST',
      body: JSON.stringify({
        emailAddress,
        permissionLevel,
      }),
    });
  }
}
```

---

## Integration with Optimization Loop

Once GSC is verified and syncing data, the optimization loop activates:

### Triggers for Optimization

1. **Low CTR Detection**

   ```typescript
   // In GSC sync worker
   if (ctr < 2.0 && avgPosition <= 10) {
     await addJob('CONTENT_OPTIMIZE', {
       siteId,
       pageUrl,
       optimizationType: 'META_TAGS',
       reason: 'Low CTR for top 10 position',
     });
   }
   ```

2. **Position Drop Detection**

   ```typescript
   // Check position drop over 7 days
   if (positionDrop > 5) {
     await addJob('CONTENT_OPTIMIZE', {
       siteId,
       pageUrl,
       optimizationType: 'CONTENT_REFRESH',
       reason: 'Position dropped by 5+ ranks',
     });
   }
   ```

3. **New Opportunity Detection**
   ```typescript
   // High impressions but low clicks
   if (impressions > 1000 && clicks < 20) {
     await addJob('CONTENT_GENERATE', {
       siteId,
       keyword: query,
       pageType: 'BLOG',
       reason: 'High impression keyword opportunity',
     });
   }
   ```

---

## Testing the Flow

### 1. Test Individual Components

```bash
# Test GSC verification for existing site
npm run worker:gsc-verify -- --siteId=<your-site-id>

# Test full site creation flow
npm run worker:site-create -- --niche="adventure-tours" --location="bali"
```

### 2. Monitor Job Queue

```bash
# Watch job queue in real-time
npm run queue:monitor
```

### 3. Check Database

```sql
-- View sites pending GSC verification
SELECT id, name, primaryDomain, status, gscVerified, gscVerifiedAt
FROM "Site"
WHERE status = 'GSC_VERIFICATION';

-- View GSC metrics
SELECT * FROM "PerformanceMetric"
WHERE "siteId" = '<your-site-id>'
ORDER BY date DESC
LIMIT 100;
```

---

## Production Rollout Plan

### Phase 1: Setup Current Site (Manual)

- ✅ Verify current production site manually
- ✅ Configure GSC environment variables
- ✅ Test GSC data sync

### Phase 2: Add Database Fields

- [ ] Create and run migration
- [ ] Update TypeScript types
- [ ] Deploy to production

### Phase 3: Update Layout

- [ ] Add dynamic verification tag
- [ ] Test with development site
- [ ] Deploy to production

### Phase 4: Implement Workers

- [ ] Create GSC verification worker
- [ ] Update site creation worker
- [ ] Test end-to-end flow in development

### Phase 5: Enable Automation

- [ ] Create test site via automation
- [ ] Verify GSC verification works
- [ ] Monitor first 24 hours
- [ ] Enable for all new sites

---

## Success Metrics

Track these KPIs to measure autonomous system success:

1. **Site Creation Rate**: Sites created per day
2. **GSC Verification Success**: % of sites verified automatically
3. **Time to First Data**: Hours from creation to first GSC sync
4. **Optimization Trigger Rate**: Jobs triggered per site per week
5. **Performance Improvement**: Average CTR/position improvement over time

---

## Next Steps

1. **Immediate**: Add database migration for GSC verification fields
2. **Short-term**: Implement dynamic verification in layout
3. **Medium-term**: Create GSC verification worker
4. **Long-term**: Full autonomous pipeline with 200+ sites

This integration makes your platform truly autonomous - from opportunity discovery to live, verified, optimized site in <24 hours!
