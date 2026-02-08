# Microsites Implementation Roadmap

## Overview

This roadmap breaks down the implementation of the microsite system into parallel work streams. Each stream can be worked on independently by different agents/developers.

**Primary Domain**: `experiencess.com` (Cloudflare)
**Architecture**: `{supplier-slug}.experiencess.com`

---

## Work Streams

### Stream 1: Infrastructure & Domain Setup

**Priority**: Critical (blocks other streams)
**Estimated Time**: 2-3 days

- [ ] **1.1** Configure Cloudflare wildcard DNS for `experiencess.com`
  - Add A record for `experiencess.com` → server IP
  - Add wildcard A record for `*.experiencess.com` → server IP

- [ ] **1.2** Configure Cloudflare SSL/TLS
  - Enable Universal SSL (covers wildcard)
  - Set SSL mode to "Full (strict)"
  - Verify edge certificates work for subdomains

- [ ] **1.3** Configure Cloudflare Page Rules (optional)
  - Force HTTPS redirect
  - Cache rules for static assets

- [ ] **1.4** Update Vercel/deployment to accept wildcard domain
  - Add `*.experiencess.com` to allowed domains
  - Add `experiencess.com` to allowed domains

**Deliverables**:

- Any subdomain like `test.experiencess.com` resolves to the website-platform
- SSL works for all subdomains

---

### Stream 2: Database Schema

**Priority**: Critical (blocks streams 4, 5, 6)
**Estimated Time**: 1-2 days

- [ ] **2.1** Add new Prisma models to schema

  ```
  packages/database/prisma/schema.prisma
  ```

  - `Supplier` model
  - `Product` model (for cached Holibob products)
  - `MicrositeConfig` model
  - `EntityType` enum
  - `MicrositeStatus` enum

- [ ] **2.2** Add relations
  - `MicrositeConfig` → `Brand` (one-to-one)
  - `MicrositeConfig` → `Supplier` (optional)
  - `MicrositeConfig` → `Product` (optional)
  - `Supplier` → `Product[]` (one-to-many)
  - `MicrositeConfig` → `Page[]` (one-to-many)

- [ ] **2.3** Run migration

  ```bash
  pnpm db:migrate
  ```

- [ ] **2.4** Generate Prisma client

  ```bash
  pnpm db:generate
  ```

- [ ] **2.5** Add database indexes for performance
  - `Supplier.slug` (unique)
  - `Supplier.holibobSupplierId` (unique)
  - `Product.slug` (unique)
  - `Product.holibobProductId` (unique)
  - `Product.supplierId`
  - `MicrositeConfig.fullDomain` (unique)
  - `MicrositeConfig.[subdomain, parentDomain]` (composite unique)

**Deliverables**:

- New models available via Prisma client
- Migrations applied successfully

---

### Stream 3: Tenant Resolution & Routing

**Priority**: High (blocks stream 6)
**Estimated Time**: 2-3 days
**Depends on**: Stream 2

- [ ] **3.1** Update `tenant.ts` with microsite detection

  ```
  apps/website-platform/src/lib/tenant.ts
  ```

  - Add `checkMicrositeSubdomain()` function
  - Add `getMicrositeConfig()` with caching
  - Add `mapMicrositeToSiteConfig()` function
  - Modify `getSiteFromHostname()` to check microsites first

- [ ] **3.2** Add Redis caching for microsite configs
  - Cache key pattern: `microsite:{subdomain}:{parentDomain}`
  - TTL: 5 minutes
  - Invalidation on update

- [ ] **3.3** Update middleware (if needed)

  ```
  apps/website-platform/src/middleware.ts
  ```

  - Add headers for microsite detection
  - Pass subdomain info to pages

- [ ] **3.4** Create microsite-aware SiteConfig interface extension
  - Add `micrositeConfig` optional field
  - Include `supplierId` and `productId` references

- [ ] **3.5** Test routing
  - Test existing sites still work (backward compatibility)
  - Test microsite subdomain resolution
  - Test cache invalidation

**Deliverables**:

- `getSiteFromHostname()` returns correct config for microsites
- Existing sites continue to work unchanged
- Redis caching operational

---

### Stream 4: Holibob Sync Pipeline

**Priority**: High
**Estimated Time**: 4-5 days
**Depends on**: Stream 2

- [ ] **4.1** Create rate limiter utility

  ```
  packages/jobs/src/utils/rate-limiter.ts
  ```

  - 60 requests/minute default
  - Configurable delay between batches
  - Request counter with minute reset

- [ ] **4.2** Create supplier sync service

  ```
  packages/jobs/src/services/supplier-sync.ts
  ```

  - `syncSuppliersFromHolibob()` function
  - Discover suppliers through product aggregation
  - Generate unique slugs with collision handling
  - Upsert to database

- [ ] **4.3** Create product sync service

  ```
  packages/jobs/src/services/product-sync.ts
  ```

  - `syncProductsFromHolibob()` function
  - Fetch products per supplier
  - Cache product details locally
  - Link to supplier records

- [ ] **4.4** Add new job types

  ```
  packages/jobs/src/types.ts
  ```

  - `SUPPLIER_SYNC`
  - `PRODUCT_SYNC`
  - `SUPPLIER_SYNC_INCREMENTAL`

- [ ] **4.5** Add sync queue

  ```
  packages/jobs/src/queues/index.ts
  ```

  - New `sync` queue for long-running jobs
  - Configure 4-hour timeout

- [ ] **4.6** Create sync workers

  ```
  packages/jobs/src/workers/sync.ts
  ```

  - Handle `SUPPLIER_SYNC` jobs
  - Handle `PRODUCT_SYNC` jobs

- [ ] **4.7** Add scheduled jobs

  ```
  packages/jobs/src/schedulers/index.ts
  ```

  - Supplier sync: Daily 2 AM
  - Product sync: Daily 3 AM

- [ ] **4.8** Create manual sync trigger script

  ```
  packages/jobs/src/scripts/trigger-sync.ts
  ```

  - CLI tool for manual sync execution

**Deliverables**:

- Suppliers discovered and stored in database
- Products cached locally
- Daily sync scheduled
- Manual sync available

---

### Stream 5: Microsite Job Pipeline

**Priority**: Medium
**Estimated Time**: 3-4 days
**Depends on**: Stream 2, Stream 4

- [ ] **5.1** Add microsite job types

  ```
  packages/jobs/src/types.ts
  ```

  - `MICROSITE_CREATE`
  - `MICROSITE_BRAND_GENERATE`
  - `MICROSITE_CONTENT_GENERATE`
  - `MICROSITE_PUBLISH`
  - `MICROSITE_ARCHIVE`

- [ ] **5.2** Create microsite worker

  ```
  packages/jobs/src/workers/microsite.ts
  ```

  - `handleMicrositeCreate()` - creates microsite config
  - `handleMicrositeBrandGenerate()` - generates brand
  - `handleMicrositePublish()` - activates microsite

- [ ] **5.3** Create microsite content generator

  ```
  packages/jobs/src/services/microsite-content.ts
  ```

  - Generate homepage content
  - Generate about page
  - Generate experience listing page
  - Use AI for unique content

- [ ] **5.4** Extend brand generation for microsites

  ```
  packages/jobs/src/services/brand-generation.ts
  ```

  - Accept supplier/product context
  - Generate appropriate colors/fonts for niche
  - Create fallback templates

- [ ] **5.5** Add microsite scheduler

  ```
  packages/jobs/src/schedulers/index.ts
  ```

  - Content refresh: Daily 6 AM (1% rotation)
  - Health check: Sundays 8 AM

**Deliverables**:

- Microsites can be created via jobs
- Brand and content generation automated
- Scheduled maintenance jobs

---

### Stream 6: Website Platform Updates

**Priority**: Medium
**Estimated Time**: 4-5 days
**Depends on**: Stream 2, Stream 3

- [ ] **6.1** Create microsite layout variant

  ```
  apps/website-platform/src/app/(microsite)/layout.tsx
  ```

  - Or: Modify existing layout to handle microsite context
  - Apply microsite-specific branding

- [ ] **6.2** Update experience listing for microsites

  ```
  apps/website-platform/src/app/experiences/page.tsx
  ```

  - Filter by supplier when on microsite
  - Use cached local data instead of Holibob API

- [ ] **6.3** Create microsite API routes

  ```
  apps/website-platform/src/app/api/microsite/
  ```

  - `GET /api/microsite/products` - cached products for supplier
  - `GET /api/microsite/supplier` - supplier info

- [ ] **6.4** Update homepage for microsites
  - Show supplier branding
  - Feature supplier's products
  - Supplier-specific hero/testimonials

- [ ] **6.5** Create supplier about page

  ```
  apps/website-platform/src/app/about/page.tsx
  ```

  - Detect microsite context
  - Show supplier-specific about content

- [ ] **6.6** Create parent domain homepage

  ```
  experiencess.com/ (root domain)
  ```

  - Directory of all microsites
  - Search functionality
  - Category/location filters
  - Links to subdomains for SEO value

- [ ] **6.7** Update sitemap generation
  - Generate per-microsite sitemaps
  - Create sitemap index for parent domain

**Deliverables**:

- Microsites render with correct branding
- Products filtered by supplier
- Parent domain serves as directory

---

### Stream 7: Admin Interface

**Priority**: Low (can be done later)
**Estimated Time**: 3-4 days
**Depends on**: Stream 2, Stream 4, Stream 5

- [ ] **7.1** Create `/microsites` page

  ```
  apps/admin/src/app/microsites/page.tsx
  ```

  - List all microsites
  - Filter by status, supplier, etc.
  - Pagination

- [ ] **7.2** Create `/microsites/[id]` detail page
  - View microsite details
  - Trigger content generation
  - Pause/resume controls
  - Archive functionality

- [ ] **7.3** Create `/suppliers` page

  ```
  apps/admin/src/app/suppliers/page.tsx
  ```

  - List synced suppliers
  - Filter by product count, rating
  - Bulk select for microsite creation

- [ ] **7.4** Create `/suppliers/[id]` detail page
  - View supplier details
  - List supplier's products
  - Create microsite button

- [ ] **7.5** Create `/operations/sync` page
  - View sync status
  - Trigger manual sync
  - View sync logs

- [ ] **7.6** Add microsite API endpoints

  ```
  apps/admin/src/app/api/microsites/
  ```

  - CRUD operations
  - Bulk create
  - Status updates

- [ ] **7.7** Extend operations dashboard
  - Add microsite metrics
  - Add sync status
  - Add supplier/product counts

**Deliverables**:

- Admin can view/manage microsites
- Admin can view synced suppliers
- Admin can trigger sync manually

---

## Implementation Order

```
Week 1:
├── Stream 1: Infrastructure (Days 1-2) ← CRITICAL PATH
├── Stream 2: Database Schema (Days 1-2) ← CRITICAL PATH
└── Stream 3: Tenant Resolution (Days 2-4) ← Depends on Stream 2

Week 2:
├── Stream 4: Holibob Sync (Days 1-5) ← Can start after Stream 2
└── Stream 5: Microsite Jobs (Days 3-5) ← Depends on Stream 2, 4

Week 3:
├── Stream 6: Website Platform (Days 1-5) ← Depends on Stream 2, 3
└── Stream 5: Complete (Days 1-2)

Week 4:
├── Stream 6: Complete (Days 1-3)
├── Stream 7: Admin Interface (Days 1-4) ← Optional, can defer
└── Integration Testing (Days 4-5)

Week 5+:
├── Initial Holibob Sync (~5-7 hours)
├── Generate first 100 microsites
├── Quality review
└── Scale to 1,000+ microsites
```

---

## Parallel Execution Plan

**Agent 1 (Infrastructure)**:

1. Stream 1: Domain/Cloudflare setup
2. Stream 3: Tenant resolution
3. Stream 6: Website platform updates

**Agent 2 (Data Pipeline)**:

1. Stream 2: Database schema
2. Stream 4: Holibob sync
3. Stream 5: Microsite jobs

**Agent 3 (Admin - Optional)**:

1. Stream 7: Admin interface
2. Testing & QA

---

## Success Criteria

### Phase 1 (End of Week 2)

- [ ] `test.experiencess.com` loads website-platform
- [ ] Database has Supplier/Product/MicrositeConfig models
- [ ] Tenant resolution detects microsite subdomains
- [ ] Initial Holibob sync completes

### Phase 2 (End of Week 4)

- [ ] 100 microsites generated with unique brands
- [ ] Microsites render with correct supplier products
- [ ] Parent domain shows directory
- [ ] Daily sync jobs running

### Phase 3 (End of Week 6)

- [ ] 1,000+ microsites live
- [ ] Admin interface functional
- [ ] Sitemaps submitted to GSC
- [ ] Monitoring/alerting in place

---

## Files to Create/Modify

### New Files

```
packages/database/prisma/schema.prisma (modify)
packages/jobs/src/utils/rate-limiter.ts (new)
packages/jobs/src/services/supplier-sync.ts (new)
packages/jobs/src/services/product-sync.ts (new)
packages/jobs/src/services/microsite-content.ts (new)
packages/jobs/src/workers/sync.ts (new)
packages/jobs/src/workers/microsite.ts (new)
apps/website-platform/src/lib/microsite.ts (new)
apps/admin/src/app/microsites/ (new directory)
apps/admin/src/app/suppliers/ (new directory)
apps/admin/src/app/operations/sync/page.tsx (new)
```

### Modified Files

```
packages/jobs/src/types.ts
packages/jobs/src/queues/index.ts
packages/jobs/src/schedulers/index.ts
apps/website-platform/src/lib/tenant.ts
apps/website-platform/src/middleware.ts
apps/website-platform/src/app/experiences/page.tsx
apps/website-platform/src/app/page.tsx (for parent domain)
```

---

_Document Version: 1.0_
_Created: 2026-02-06_
