# 300K Micro-Sites Strategy: Supplier & Product Pages at Scale

## Executive Summary

Holibob has ~300,000 experiences from suppliers, many with minimal digital presence. This document explores creating dedicated micro-sites for every supplier and product to capture search traffic and dominate rankings for long-tail queries.

**Key Insight**: The existing platform is architected for ~200 sites. Scaling to 300k requires fundamental changes to domain strategy, infrastructure, content generation, and SEO approach.

---

## 1. Current Architecture Assessment

### What's Already Built

| Component | Current State | 300k Ready? |
|-----------|---------------|-------------|
| Multi-tenant routing | Domain → Site lookup via DB | ❌ 2 queries/request |
| Content generation | 7 content types, AI-powered | ⚠️ Needs quotas |
| SEO automation | GSC, GA4, sitemaps, structured data | ⚠️ API limits |
| Domain management | Cloudflare registrar integration | ❌ Cost prohibitive |
| Job queue | BullMQ on single Redis | ❌ Needs clustering |
| Database | Single PostgreSQL | ❌ Needs read replicas |

### Current Platform Limits
```
maxTotalSites: 200
maxSitesPerHour: 10
maxContentPagesPerHour: 100
maxGSCRequestsPerHour: 200
```

---

## 2. Domain Strategy Options

### The Core Problem
Registering 300k domains is:
- **Cost prohibitive**: ~$10/domain × 300k = $3M/year in renewals
- **Operationally impossible**: DNS management, SSL certificates, monitoring
- **SEO risky**: Google may see this as a link scheme or PBN

### Option A: Subdomain Approach (Recommended)

**Structure**: `{supplier-slug}.holibob.com` or `{product-slug}.experiences.holibob.com`

```
suppliers.holibob.com/adventure-co           → Supplier homepage
adventure-co.suppliers.holibob.com           → Alternative: subdomain per supplier
products.holibob.com/london-walking-tour-123 → Product page
```

**Pros**:
- Single parent domain to manage
- Inherits domain authority from holibob.com
- No registration costs
- Wildcard SSL certificate covers all subdomains
- Easy DNS management (single wildcard A record)

**Cons**:
- Subdomains treated as separate sites by Google (less authority inheritance than subdirectories)
- GSC requires each subdomain to be verified separately (or use domain-level property)
- Branding is tied to holibob.com

**SEO Considerations**:
- Google treats subdomains as "somewhat" related to the main domain
- Internal linking between subdomains is less powerful than within a domain
- Can still build domain authority through quality content and backlinks

### Option B: Subdirectory Approach

**Structure**: `holibob.com/suppliers/{slug}` and `holibob.com/products/{slug}`

```
holibob.com/suppliers/adventure-co/
holibob.com/suppliers/adventure-co/tours/london-walking-tour
holibob.com/products/london-walking-tour-123/
```

**Pros**:
- **Maximum SEO benefit**: All content shares domain authority
- Single GSC property for the entire site
- Simpler technical implementation
- Unified sitemap strategy

**Cons**:
- Not truly "separate sites" - no independent branding
- Harder to isolate supplier-specific analytics
- Single point of failure (if holibob.com penalized, all content affected)

### Option C: Hybrid Approach (Recommended for Scale)

**Structure**:
- Top suppliers (by revenue/volume): `{supplier}.holibob.com` (subdomain)
- Long-tail suppliers: `holibob.com/s/{supplier-slug}` (subdirectory)
- Products: Always subdirectory under supplier or products path

```
# Premium suppliers (top 1,000)
adventure-co.holibob.com/
adventure-co.holibob.com/tours/london-walking-tour

# Long-tail suppliers (remaining 299,000)
holibob.com/s/small-tour-operator/
holibob.com/s/small-tour-operator/tours/local-experience

# Products (can be accessed directly)
holibob.com/p/london-walking-tour-123
```

**Benefits**:
- Premium suppliers get dedicated presence (partnership value)
- Long-tail suppliers benefit from main domain authority
- Products are always accessible at consistent URLs
- Scales without domain registration costs

---

## 3. Recommended Architecture: Subdirectory-First

### URL Structure
```
holibob.com/
├── /suppliers/                          # Supplier directory
│   ├── /suppliers/{supplier-slug}/      # Supplier homepage
│   │   ├── /about                       # About the supplier
│   │   ├── /experiences                 # All supplier experiences
│   │   ├── /reviews                     # Aggregated reviews
│   │   └── /contact                     # Supplier contact
│   └── ...
├── /experiences/                        # Product/experience pages
│   ├── /experiences/{product-slug}/     # Experience detail
│   │   ├── /book                        # Booking flow
│   │   └── /reviews                     # Experience reviews
│   └── ...
├── /destinations/{location}/            # Location landing pages
├── /categories/{category}/              # Category pages
└── /blog/                               # Blog content
```

### Why Subdirectories Win for SEO

1. **Domain Authority Consolidation**: All 300k pages contribute to holibob.com's authority
2. **Internal Linking Power**: Links between pages pass full PageRank
3. **Single Sitemap Strategy**: One sitemap index with segmented sitemaps
4. **Unified GSC Property**: All pages in one Search Console property
5. **Simplified Analytics**: Single GA4 property with segment filters

### Database Schema Changes

```prisma
// New: Supplier model (currently only holibobPartnerId exists)
model Supplier {
  id                String   @id @default(cuid())
  holibobPartnerId  String   @unique
  name              String
  slug              String   @unique
  description       String?  @db.Text

  // Cached from Holibob
  productCount      Int      @default(0)
  cities            String[]
  categories        String[]
  rating            Float?
  reviewCount       Int      @default(0)

  // SEO
  metaTitle         String?
  metaDescription   String?
  structuredData    Json?

  // Content
  aboutContent      String?  @db.Text
  heroImage         String?
  logoUrl           String?

  // Relationships
  products          Product[]
  sites             Site[]      // Sites featuring this supplier

  // Tracking
  pageViews         Int      @default(0)
  lastSyncedAt      DateTime?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([slug])
  @@index([productCount])
}

// New: Product model (currently fetched on-demand from Holibob)
model Product {
  id                String   @id @default(cuid())
  holibobProductId  String   @unique
  slug              String   @unique
  title             String
  description       String?  @db.Text
  shortDescription  String?

  // Pricing & availability
  priceFrom         Decimal?
  currency          String   @default("GBP")
  duration          String?

  // Location
  city              String?
  country           String?
  latitude          Float?
  longitude         Float?

  // Ratings
  rating            Float?
  reviewCount       Int      @default(0)

  // Media (cached from Holibob)
  images            Json?    // Array of image URLs
  primaryImage      String?

  // SEO
  metaTitle         String?
  metaDescription   String?
  structuredData    Json?

  // Supplier relationship
  supplier          Supplier @relation(fields: [supplierId], references: [id])
  supplierId        String

  // Tracking
  pageViews         Int      @default(0)
  bookings          Int      @default(0)
  lastSyncedAt      DateTime?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([slug])
  @@index([supplierId])
  @@index([city])
  @@index([rating])
}
```

---

## 4. Content Strategy

### Content Types Per Entity

**Supplier Pages** (5-7 pages per supplier):
1. **Homepage**: Hero, featured experiences, about snippet, reviews
2. **About**: AI-generated supplier story, team (if available), values
3. **Experiences listing**: Filterable/sortable product grid
4. **Reviews**: Aggregated reviews across all products
5. **Blog category**: Content tagged to this supplier
6. **FAQ**: AI-generated from common questions

**Product Pages** (2-3 pages per product):
1. **Main page**: Full product details, booking widget, reviews, related products
2. **Reviews page**: Expanded reviews with filters
3. **Blog/Guide**: "Complete Guide to {Experience}" (generated on demand)

### Content Generation at Scale

**Current**: 7 content types × 1/day × 200 sites = 1,400 content pieces/day

**At 300k Scale** (with quotas):
```
Supplier pages:  300,000 suppliers × 5 pages = 1.5M pages (one-time generation)
Product pages:   300,000 products × 2 pages  = 600k pages (one-time generation)
Daily refresh:   1% of pages/day             = 21k pages/day (prioritized by traffic)
New products:    ~100/day estimated          = 200 pages/day
```

**Content Generation Prioritization**:
1. **High-traffic pages first**: Products/suppliers with GSC impressions
2. **Booking potential**: Products with high conversion rates
3. **Competitive keywords**: Where we're ranked #4-10 (within striking distance)
4. **Freshness signals**: Pages older than 90 days

### AI Generation Quotas
```typescript
const CONTENT_QUOTAS = {
  supplier: {
    homepage: 1,        // One homepage, refreshed quarterly
    about: 1,           // One about page
    faq: 1,             // One FAQ page
    blogPosts: 4,       // Max 4 blog posts per supplier per year
  },
  product: {
    mainPage: 1,        // One main page, refreshed monthly
    guide: 1,           // One comprehensive guide
    blogMentions: 12,   // Featured in up to 12 blog posts per year
  }
};
```

---

## 5. SEO Implications

### Google's View of Large-Scale Content

**Risks**:
1. **Thin content penalty**: Pages with minimal unique value
2. **Duplicate content**: Similar products/suppliers with near-identical pages
3. **Spam signals**: Rapid publication of AI-generated content
4. **Crawl budget**: Google may not crawl all 2M+ pages efficiently

**Mitigations**:
1. **Quality over quantity**: Only publish pages scoring >70 on quality gate
2. **Unique content signals**: Include supplier-specific details, reviews, images
3. **Gradual rollout**: Publish 1,000-5,000 pages/week, not all at once
4. **Sitemap segmentation**: Separate sitemaps by content type and freshness
5. **noindex low-value**: Products with no reviews, minimal info, or <$10 price

### Structured Data Strategy

**Supplier Pages**:
```json
{
  "@type": "TouristTrip",
  "provider": {
    "@type": "TravelAgency",
    "name": "Adventure Co",
    "aggregateRating": { "@type": "AggregateRating", ... }
  }
}
```

**Product Pages**:
```json
{
  "@type": ["Product", "TouristTrip"],
  "name": "London Walking Tour",
  "offers": { "@type": "Offer", "price": "25.00", "priceCurrency": "GBP" },
  "aggregateRating": { "@type": "AggregateRating", ... },
  "review": [ ... ]
}
```

### Sitemap Strategy for 2M+ Pages

```
sitemap_index.xml
├── sitemap-suppliers-a.xml      (suppliers A-C, 10k URLs)
├── sitemap-suppliers-b.xml      (suppliers D-F, 10k URLs)
├── ...
├── sitemap-products-1.xml       (products 1-50000)
├── sitemap-products-2.xml       (products 50001-100000)
├── ...
├── sitemap-destinations.xml     (location pages)
├── sitemap-categories.xml       (category pages)
├── sitemap-blog-2025.xml        (blog posts by year)
└── sitemap-blog-2024.xml
```

**Implementation**:
```typescript
// /app/sitemap.ts - becomes sitemap index
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sitemapIndex = [
    { url: `${baseUrl}/sitemap-suppliers.xml`, lastModified: new Date() },
    { url: `${baseUrl}/sitemap-products.xml`, lastModified: new Date() },
    // ...
  ];
  return sitemapIndex;
}

// /app/sitemap-suppliers.xml/route.ts - dynamic supplier sitemap
export async function GET() {
  const suppliers = await prisma.supplier.findMany({
    take: 50000,
    orderBy: { pageViews: 'desc' },
    select: { slug: true, updatedAt: true }
  });
  // Generate XML...
}
```

### Google Search Console at Scale

**Challenge**: GSC has limits
- 1,000 properties per account
- 25,000 rows per analytics query
- Rate limits on API calls

**Solution**: Domain-level property
```
Property: sc-domain:holibob.com
```
- Covers all subdomains and paths
- Single verification
- Unified search analytics
- No per-subdomain registration needed

---

## 6. Infrastructure Requirements

### Database Scaling

**Current**: Single PostgreSQL instance

**Required for 300k**:
```
Primary DB (Write)
├── Connection pooling (PgBouncer)
├── 2M+ rows in Product/Supplier tables
└── Indexes: slug, supplierId, city, rating

Read Replicas (2-3)
├── Tenant lookups (high read)
├── Product searches
└── Analytics queries

Redis Cluster
├── Site config cache (5-10 min TTL)
├── Product data cache (1 hour TTL)
├── BullMQ job queues (partitioned)
└── Rate limiting
```

### Caching Strategy

```typescript
// Site/Supplier config caching
const CACHE_CONFIG = {
  siteConfig: { ttl: 300 },      // 5 minutes
  supplierData: { ttl: 3600 },   // 1 hour
  productData: { ttl: 1800 },    // 30 minutes
  searchResults: { ttl: 60 },    // 1 minute
};

// Implementation: Redis + in-memory
async function getSupplier(slug: string): Promise<Supplier> {
  // Check memory cache (10s)
  // Check Redis cache (1h)
  // Fallback to database
  // Populate caches
}
```

### Edge Caching (Cloudflare)

```
Cloudflare Edge
├── Cache supplier/product pages (1 hour)
├── Cache static assets (1 week)
├── Rate limiting per IP
└── Bot protection

Origin
├── Next.js with ISR (revalidate: 3600)
├── API routes with cache headers
└── Dynamic content (booking, user-specific)
```

### Content Generation Infrastructure

**Current**: Single BullMQ instance, ~100 pages/hour capacity

**Required for 300k**:
```
Job Queue Cluster
├── Redis Cluster (3+ nodes)
├── Queue partitioning by content type
├── Priority queues (high-traffic pages first)
└── Dead letter queue for failures

Content Workers (horizontal scaling)
├── 10-20 worker processes
├── Auto-scaling based on queue depth
├── Separate workers per content type
└── Rate limiting for AI API calls

AI API Management
├── Claude API: 100k tokens/min tier
├── Request batching for efficiency
├── Fallback to smaller models for simple content
└── Cost tracking per content type
```

---

## 7. Rollout Plan

### Phase 1: Foundation (Weeks 1-4)

1. **Database schema updates**
   - Add Supplier and Product models
   - Create indexes
   - Set up read replica

2. **Data import pipeline**
   - Sync all suppliers from Holibob
   - Sync all products from Holibob
   - Generate slugs (collision handling)

3. **Basic pages**
   - Supplier listing page (`/suppliers`)
   - Supplier detail page (`/suppliers/{slug}`)
   - Product detail page (`/experiences/{slug}`)

### Phase 2: Content Generation (Weeks 5-8)

1. **Priority content**
   - Top 1,000 suppliers by product count
   - Top 10,000 products by booking volume
   - Generate homepage + about for each supplier
   - Generate main page for each product

2. **SEO setup**
   - Sitemap index with segmented sitemaps
   - Structured data for all pages
   - GSC submission
   - GA4 event tracking

3. **Quality monitoring**
   - Content quality scoring
   - Duplicate detection
   - Thin content flagging

### Phase 3: Scale Out (Weeks 9-16)

1. **Remaining content**
   - Generate pages for remaining 299k suppliers
   - Generate pages for remaining 290k products
   - Rate: 5,000 pages/day

2. **Optimization**
   - A/B test page layouts
   - Optimize for Core Web Vitals
   - Build internal linking graph

3. **Monitoring**
   - GSC indexing coverage
   - Ranking tracking for key terms
   - Conversion tracking

### Phase 4: Ongoing Operations (Week 17+)

1. **Daily operations**
   - New product sync
   - Content refresh (1% of pages/day)
   - SEO health monitoring

2. **Growth tactics**
   - Blog content for suppliers
   - Comparison pages
   - Seasonal content

---

## 8. Risk Assessment

### High Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Google penalty for thin content | Loss of all rankings | Quality gates, gradual rollout, noindex low-value |
| Holibob API changes | Data sync breaks | API versioning, local caching, error handling |
| Cost overrun (AI generation) | Budget exceeded | Quotas, model selection, caching |
| Database performance | Site slowdown | Read replicas, caching, query optimization |

### Medium Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| Competitor replication | Reduced advantage | Speed to market, quality differentiation |
| Supplier data quality | Poor page quality | Data validation, enrichment |
| Crawl budget exhaustion | Pages not indexed | Sitemap prioritization, internal linking |

### Low Risk

| Risk | Impact | Mitigation |
|------|--------|------------|
| GSC rate limits | Delayed verification | Batch processing, domain-level property |
| Image optimization | Slow pages | CDN, lazy loading, WebP |

---

## 9. Cost Estimates

### One-Time Costs

| Item | Estimate |
|------|----------|
| Development (4 months, 2 engineers) | $80,000-120,000 |
| Initial content generation (2M pages × $0.02 avg) | $40,000 |
| Database migration & scaling | $5,000-10,000 |
| **Total One-Time** | **$125,000-170,000** |

### Monthly Recurring

| Item | Estimate |
|------|----------|
| Database (scaled PostgreSQL) | $500-1,000 |
| Redis Cluster | $200-400 |
| AI API (content refresh, new content) | $2,000-5,000 |
| CDN/Edge (Cloudflare Pro) | $200 |
| Monitoring & logging | $100-200 |
| **Total Monthly** | **$3,000-7,000** |

### Avoided Costs (vs. Domain Registration)

| Item | Saved |
|------|-------|
| Domain registration (300k × $10) | $3,000,000/year |
| SSL certificates (if not Cloudflare) | $100,000+/year |
| DNS management overhead | Significant |

---

## 10. Success Metrics

### Primary KPIs

1. **Indexed pages**: Target 90%+ of published pages indexed within 3 months
2. **Organic traffic**: 10x traffic increase within 6 months
3. **Ranking coverage**: Top 10 ranking for 50%+ of supplier brand terms
4. **Conversion rate**: Maintain or improve booking conversion rate

### Secondary KPIs

1. **Content quality score**: Average >75 across all pages
2. **Page load time**: <2s for 90th percentile
3. **Crawl efficiency**: <5% crawl errors in GSC
4. **Cost per page**: <$0.05 average generation cost

---

## 11. Recommendation

**Proceed with subdirectory approach** (`holibob.com/suppliers/` and `holibob.com/experiences/`) for the following reasons:

1. **SEO advantage**: Consolidated domain authority benefits all 300k pages
2. **Cost efficiency**: No domain registration costs
3. **Operational simplicity**: Single SSL, single GSC property, unified analytics
4. **Scalability**: Architecture supports millions of pages
5. **Risk mitigation**: Gradual rollout allows quality monitoring

**Key success factors**:
- Quality over quantity in content generation
- Gradual rollout with monitoring
- Strong internal linking strategy
- Regular content refresh for high-traffic pages
- Investment in caching/performance infrastructure

---

## Appendix A: Technical Implementation Notes

### Route Structure (Next.js App Router)

```
app/
├── suppliers/
│   ├── page.tsx                    # Supplier directory
│   └── [slug]/
│       ├── page.tsx                # Supplier homepage
│       ├── about/page.tsx          # About page
│       ├── experiences/page.tsx    # Experience listing
│       └── reviews/page.tsx        # Reviews page
├── experiences/
│   ├── page.tsx                    # Experience search
│   └── [slug]/
│       ├── page.tsx                # Experience detail
│       ├── book/page.tsx           # Booking flow
│       └── reviews/page.tsx        # Reviews page
└── api/
    └── revalidate/
        └── route.ts                # On-demand revalidation
```

### Caching Headers

```typescript
// For supplier/product pages
export const revalidate = 3600; // ISR: 1 hour

// For dynamic segments
export async function generateStaticParams() {
  // Pre-generate top 10k pages at build time
  const topProducts = await prisma.product.findMany({
    take: 10000,
    orderBy: { pageViews: 'desc' },
    select: { slug: true }
  });
  return topProducts.map(p => ({ slug: p.slug }));
}
```

### Holibob Sync Job

```typescript
// Scheduled: Every 6 hours
async function syncHolibobData() {
  // 1. Fetch all products from Holibob API (paginated)
  // 2. Upsert to Product table
  // 3. Update supplier product counts
  // 4. Flag new products for content generation
  // 5. Flag removed products for noindex
}
```

---

## Appendix B: Alternative Approaches Considered

### 1. Programmatic SEO Platform (e.g., Webflow + Airtable)
- **Rejected**: Limited customization, doesn't scale to 300k pages, expensive

### 2. Static Site Generator (Next.js Export)
- **Rejected**: Build times for 2M pages impractical, no ISR support

### 3. Separate Domains per Supplier Category
- **Rejected**: Dilutes SEO value, complex management

### 4. White-label Platform for Suppliers
- **Rejected**: Requires supplier engagement, slower rollout

---

*Document Version: 1.0*
*Last Updated: 2026-02-06*
*Author: Planning Session*
