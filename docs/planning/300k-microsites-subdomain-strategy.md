# 300K Micro-Sites Strategy: Subdomain Approach with Independent Branding

## Executive Summary

Since Holibob is a B2B brand, consumer-facing micro-sites cannot live under `holibob.com`. This document details a **subdomain-based architecture** where each supplier and product gets its own independently-branded micro-site under a consumer-facing parent domain.

**Architecture**: `{supplier-slug}.experiencess.com`

**Primary Domain**: `experiencess.com` (purchased, hosted on Cloudflare)

Each micro-site operates as a standalone branded entity with its own:
- Brand identity (name, colors, logo)
- Content strategy
- SEO presence
- Analytics tracking

---

## 0. Backward Compatibility Guarantee

**The existing platform continues to work unchanged.** This is a pure extension, not a modification.

### What Stays the Same

| Component | Current Behavior | After Extension |
|-----------|------------------|-----------------|
| **Existing Sites** | `Site` model with custom domains | **Unchanged** |
| **Domain Table** | Maps `london-tours.com` → Site | **Unchanged** |
| **Brand Model** | One Brand per Site | **Unchanged** (new MicrositeConfig also uses Brand) |
| **Content Generation** | Jobs generate pages for Sites | **Unchanged** (new jobs for Microsites run separately) |
| **GSC Integration** | Per-site verification | **Unchanged** |
| **Tenant Resolution** | Domain lookup → Site | **Unchanged** (new path added for new parent domains only) |

### How It Works: Two Parallel Systems

```
Request arrives at website-platform
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  getSiteFromHostname(hostname)                          │
│                                                         │
│  1. Is hostname a NEW parent domain subdomain?          │
│     (*.experiencess.com, *.experiencess.com)             │
│         │                                               │
│         ├─ YES → Look up MicrositeConfig (NEW TABLE)    │
│         │        Return microsite config                │
│         │                                               │
│         └─ NO → Continue to existing logic...           │
│                                                         │
│  2. Look up Domain table (EXISTING - UNCHANGED)         │
│     Found? → Return associated Site                     │
│                                                         │
│  3. Fallback: Match subdomain to Site.slug (EXISTING)   │
│     Found? → Return Site                                │
│                                                         │
│  4. Return DEFAULT_SITE_CONFIG                          │
└─────────────────────────────────────────────────────────┘
```

### Key Isolation Points

1. **Different parent domains**: New microsites use `experiencess.com` - this doesn't exist today, so no conflict with existing sites

2. **Separate database table**: `MicrositeConfig` is a NEW model alongside `Site`, not a replacement

3. **Separate content pipeline**: New `MicrositeContentGenerator` service runs independently from existing `DailyContentGenerator`

4. **No schema changes to existing models**: `Site`, `Domain`, `Brand`, `Page` remain unchanged

### Code Change: tenant.ts Extension

The ONLY change to existing code is an early-exit check in `getSiteFromHostname()`:

```typescript
// apps/website-platform/src/lib/tenant.ts

export async function getSiteFromHostname(hostname: string): Promise<SiteConfig> {
  const cleanHostname = hostname.split(':')[0]?.replace(/^www\./, '') ?? hostname;

  // === NEW CODE START (inserted before existing logic) ===
  // Check if this is a microsite subdomain (new parent domains only)
  const micrositeConfig = await checkMicrositeSubdomain(cleanHostname);
  if (micrositeConfig) {
    return micrositeConfig;
  }
  // === NEW CODE END ===

  // === EXISTING CODE UNCHANGED BELOW ===
  // Development: localhost or preview deployments
  if (cleanHostname === 'localhost' || ...) {
    return DEFAULT_SITE_CONFIG;
  }

  // Production: query database for site by domain
  const domain = await prisma.domain.findUnique({
    where: { domain: cleanHostname },
    include: { site: { include: { brand: true } } }
  });

  if (domain?.site) {
    return mapSiteToConfig(domain.site);
  }

  // Fallback: subdomain → Site.slug matching
  // ... existing code unchanged ...
}

// NEW FUNCTION (does not modify anything existing)
async function checkMicrositeSubdomain(hostname: string): Promise<SiteConfig | null> {
  const MICROSITE_PARENT_DOMAINS = ['experiencess.com'];

  for (const parentDomain of MICROSITE_PARENT_DOMAINS) {
    if (hostname.endsWith(`.${parentDomain}`) && hostname !== parentDomain) {
      const subdomain = hostname.replace(`.${parentDomain}`, '');
      const config = await getMicrositeConfig(subdomain, parentDomain);
      if (config) {
        return mapMicrositeToSiteConfig(config);
      }
    }
  }

  return null; // Not a microsite, fall through to existing logic
}
```

### What This Means

- **Zero changes** to how `london-tours.com` or any existing site works
- **Zero changes** to existing Site, Domain, Brand, Page models
- **Zero changes** to existing content generation jobs
- **Zero changes** to existing GSC/GA4 integrations for current sites
- New microsites are a **completely parallel system** using new tables and new parent domains

### Data Model: Existing vs New (Side by Side)

```
┌─────────────────────────────────────┐    ┌─────────────────────────────────────┐
│  EXISTING (UNCHANGED)               │    │  NEW (ADDED)                        │
├─────────────────────────────────────┤    ├─────────────────────────────────────┤
│                                     │    │                                     │
│  Site ◄─────── Domain               │    │  MicrositeConfig                    │
│   │              │                  │    │   │                                 │
│   │              └── london-tours   │    │   ├── subdomain: "adventure-co"     │
│   │                  .com           │    │   ├── parentDomain: "experienceguide│
│   │                                 │    │   │                  .com"          │
│   ├── Brand (1:1)                   │    │   │                                 │
│   │                                 │    │   ├── Brand (1:1) ◄── Reuses Brand  │
│   ├── Page[]                        │    │   │                   model         │
│   │                                 │    │   │                                 │
│   ├── seoConfig                     │    │   ├── Page[] ◄─────── Reuses Page   │
│   │                                 │    │   │                   model         │
│   └── homepageConfig                │    │   │                                 │
│                                     │    │   └── Supplier/Product reference    │
│  Used by: ~200 existing sites       │    │                                     │
│  Domains: Custom (london-tours.com) │    │  Supplier ◄──────── NEW MODEL       │
│                                     │    │   │                                 │
│                                     │    │   └── Product[] ◄── NEW MODEL       │
│                                     │    │                                     │
│                                     │    │  Used by: ~50k new microsites       │
│                                     │    │  Domains: *.experiencess.com     │
│                                     │    │           *.experiencess.com            │
└─────────────────────────────────────┘    └─────────────────────────────────────┘

Both systems:
- Share the same Brand model (brand identity)
- Share the same Page model (content pages)
- Use the same SiteConfig interface (returned by getSiteFromHostname)
- Render using the same website-platform app
```

### Request Flow Examples

**Existing Site (unchanged)**:
```
GET https://london-tours.com/experiences

1. Middleware: hostname = "london-tours.com"
2. getSiteFromHostname():
   - checkMicrositeSubdomain() → null (not *.experiencess.com)
   - prisma.domain.findUnique({ domain: "london-tours.com" })
   - Found! → Return Site config
3. Page renders with Site's brand, content, etc.
```

**New Microsite**:
```
GET https://adventure-co.experiencess.com/experiences

1. Middleware: hostname = "adventure-co.experiencess.com"
2. getSiteFromHostname():
   - checkMicrositeSubdomain() → matches *.experiencess.com!
   - getMicrositeConfig("adventure-co", "experiencess.com")
   - Found! → Return MicrositeConfig (mapped to SiteConfig interface)
3. Page renders with Microsite's brand, content, etc.
```

**Both return the same `SiteConfig` interface** - the rest of the app doesn't know or care which system the config came from.

---

## 1. Domain Architecture

### Parent Domain Selection

You need one or more consumer-facing parent domains. Options:

| Domain Type | Example | Pros | Cons |
|-------------|---------|------|------|
| Generic experience | `experiencess.com` | Broad, scalable | Less specific |
| Category-specific | `walkingtours.guide` | Strong keyword signal | Limits scope |
| Location-specific | `londontours.info` | Strong local signal | Limits geography |
| Neutral/abstract | `getaway.io` | Brandable | No keyword benefit |

**Recommendation**: Use 2-3 parent domains strategically:
```
experiencess.com     → Supplier micro-sites
experiencess.com            → Product micro-sites
localexperiences.com    → Location-specific aggregation
```

### URL Structure

```
# Supplier Micro-Sites (one per supplier)
adventure-co.experiencess.com/
├── /                           # Homepage (supplier brand)
├── /about                      # About the supplier
├── /experiences                # All experiences listing
├── /experiences/{slug}         # Individual experience detail
├── /destinations/{location}    # Location-specific pages
├── /blog                       # Supplier blog
├── /reviews                    # Aggregated reviews
└── /contact                    # Contact page

# Product Micro-Sites (one per significant product)
london-walking-tour.experiencess.com/
├── /                           # Product homepage
├── /itinerary                  # Detailed itinerary
├── /reviews                    # Product reviews
├── /faq                        # Product FAQ
├── /book                       # Booking flow
└── /blog                       # Related content
```

### When to Create Supplier vs Product Sites

| Entity Type | Create Micro-Site If... | Content Focus |
|-------------|-------------------------|---------------|
| **Supplier** | Has 5+ products | Full brand site, all experiences |
| **Premium Product** | High booking volume OR unique/signature experience | Deep product content |
| **Long-tail Product** | Part of supplier's catalog | Lives under supplier subdomain |

**Estimated Distribution**:
```
Suppliers with micro-sites:    ~10,000-50,000 (suppliers with 5+ products)
Premium product micro-sites:   ~5,000-20,000 (signature experiences)
Products under supplier sites: ~250,000 (remaining products)
Total subdomains:              ~15,000-70,000 (not 300k)
```

This is more manageable than 300k separate sites while still providing broad coverage.

---

## 2. Independent Branding Strategy

### Brand Generation Per Micro-Site

Each micro-site needs a unique brand identity. This leverages your existing `Brand` model:

```prisma
model MicrositeConfig {
  id                String   @id @default(cuid())
  subdomain         String   @unique  // "adventure-co"
  parentDomain      String             // "experiencess.com"

  // What this site represents
  entityType        EntityType         // SUPPLIER | PRODUCT
  supplierId        String?
  productId         String?

  // Brand Identity (AI-generated or supplier-provided)
  brand             Brand    @relation
  brandId           String   @unique

  // Site Configuration
  siteName          String             // "Adventure Co Tours"
  tagline           String?            // "Discover London's Hidden Gems"

  // SEO
  seoConfig         Json               // titleTemplate, keywords, etc.
  gscVerificationCode String?
  gaMeasurementId   String?

  // Content
  homepageConfig    Json?              // Hero, featured sections
  pages             Page[]

  // Status
  status            SiteStatus

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([subdomain, parentDomain])
  @@index([supplierId])
  @@index([productId])
}

enum EntityType {
  SUPPLIER
  PRODUCT
}
```

### Brand Generation Workflow

```
Supplier/Product Data (from Holibob)
    │
    ▼
┌─────────────────────────────────────┐
│  AI Brand Generation Pipeline       │
│                                     │
│  Input:                             │
│  - Supplier/product name            │
│  - Category (food, adventure, etc.) │
│  - Location (London, Paris, etc.)   │
│  - Description                      │
│  - Sample images                    │
│                                     │
│  Output:                            │
│  - Site name (brandable)            │
│  - Tagline                          │
│  - Color palette (primary/secondary)│
│  - Font pairing                     │
│  - Logo concept (generated or stock)│
│  - Tone of voice                    │
└─────────────────────────────────────┘
    │
    ▼
Brand Record Created
    │
    ▼
Homepage & Initial Content Generated
```

### Brand Sources (Priority Order)

1. **Supplier-provided branding** (if available via Holibob API)
   - Use their logo, colors, description
   - Respect brand guidelines

2. **AI-generated branding** (default)
   - Generate unique name variation: "Adventure Co" → "Adventure Co Experiences"
   - Generate color palette based on category/location
   - Generate logo using AI image generation or stock templates
   - Generate tagline based on offerings

3. **Template-based branding** (fallback)
   - Pre-defined templates per category (food = warm colors, adventure = bold colors)
   - Stock logo library with customization

### Example Brand Generation

**Input**:
```json
{
  "supplierName": "London Walks Ltd",
  "category": "walking-tours",
  "location": "London",
  "description": "Professional walking tours of London's historic neighborhoods",
  "productCount": 15,
  "topProducts": ["Jack the Ripper Tour", "Royal London Walk", "Beatles London"]
}
```

**Generated Brand**:
```json
{
  "siteName": "London Walks",
  "tagline": "Discover London's Stories, One Step at a Time",
  "primaryColor": "#1B4D3E",      // Forest green (walking/outdoor)
  "secondaryColor": "#F5F0E8",    // Cream (heritage/history)
  "accentColor": "#C9A962",       // Gold (premium/London)
  "headingFont": "Playfair Display",
  "bodyFont": "Open Sans",
  "toneOfVoice": "knowledgeable, friendly, storytelling",
  "logoStyle": "text-based with walking figure icon"
}
```

---

## 3. Technical Architecture

### DNS Configuration

**Wildcard DNS Setup** (Cloudflare):
```
# Parent domain A records
experiencess.com        A     <server-ip>
*.experiencess.com      A     <server-ip>

experiencess.com               A     <server-ip>
*.experiencess.com             A     <server-ip>
```

**Benefits**:
- Single DNS record handles unlimited subdomains
- No per-subdomain DNS management
- Instant subdomain availability

### SSL/TLS Configuration

**Wildcard SSL Certificate** (Cloudflare):
```
Certificate covers:
- experiencess.com
- *.experiencess.com

Certificate covers:
- experiencess.com
- *.experiencess.com
```

**Cloudflare Setup**:
- Enable "Full (strict)" SSL mode
- Universal SSL covers wildcard automatically
- Edge certificates for all subdomains

### Tenant Resolution (Modified)

Current tenant resolution checks `Domain` table. For subdomains, modify to:

```typescript
// apps/website-platform/src/lib/tenant.ts

export async function getSiteFromHostname(hostname: string): Promise<SiteConfig> {
  const cleanHostname = hostname.split(':')[0]?.replace(/^www\./, '');

  // 1. Check if it's a known parent domain
  const parentDomains = ['experiencess.com', 'experiencess.com', 'localexperiences.com'];
  const isSubdomain = parentDomains.some(pd =>
    cleanHostname.endsWith(`.${pd}`) && cleanHostname !== pd
  );

  if (isSubdomain) {
    // Extract subdomain: "adventure-co.experiencess.com" → "adventure-co"
    const subdomain = cleanHostname.split('.')[0];
    const parentDomain = parentDomains.find(pd => cleanHostname.endsWith(`.${pd}`));

    // Look up in MicrositeConfig
    const config = await getCachedMicrositeConfig(subdomain, parentDomain);
    if (config) {
      return mapMicrositeToSiteConfig(config);
    }
  }

  // 2. Fallback: Check Domain table (for custom domains)
  const domain = await prisma.domain.findUnique({
    where: { domain: cleanHostname },
    include: { site: { include: { brand: true } } }
  });

  if (domain?.site) {
    return mapSiteToConfig(domain.site);
  }

  // 3. Fallback: Default site
  return DEFAULT_SITE_CONFIG;
}

// Cached lookup (Redis)
async function getCachedMicrositeConfig(subdomain: string, parentDomain: string) {
  const cacheKey = `microsite:${subdomain}:${parentDomain}`;

  // Check Redis cache
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Database lookup
  const config = await prisma.micrositeConfig.findUnique({
    where: {
      subdomain_parentDomain: { subdomain, parentDomain }
    },
    include: { brand: true, pages: true }
  });

  if (config) {
    await redis.setex(cacheKey, 300, JSON.stringify(config)); // 5 min cache
  }

  return config;
}
```

### Middleware Update

```typescript
// apps/website-platform/src/middleware.ts

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') ?? 'localhost';

  // Extract subdomain info for edge routing
  const { subdomain, parentDomain, isKnownParent } = parseHostname(hostname);

  const response = NextResponse.next();

  // Set headers for downstream use
  response.headers.set('x-subdomain', subdomain || '');
  response.headers.set('x-parent-domain', parentDomain || '');
  response.headers.set('x-is-microsite', isKnownParent ? 'true' : 'false');

  return response;
}

function parseHostname(hostname: string) {
  const parentDomains = ['experiencess.com', 'experiencess.com', 'localexperiences.com'];
  const cleanHostname = hostname.split(':')[0]?.replace(/^www\./, '');

  for (const pd of parentDomains) {
    if (cleanHostname.endsWith(`.${pd}`) && cleanHostname !== pd) {
      return {
        subdomain: cleanHostname.replace(`.${pd}`, ''),
        parentDomain: pd,
        isKnownParent: true
      };
    }
    if (cleanHostname === pd) {
      return { subdomain: null, parentDomain: pd, isKnownParent: true };
    }
  }

  return { subdomain: null, parentDomain: null, isKnownParent: false };
}
```

---

## 4. SEO Implications of Subdomains

### How Google Treats Subdomains

Google's official stance: **"We generally consider subdomains as separate sites"**

**Implications**:
- Each subdomain builds its own domain authority
- Links from `site-a.experiencess.com` to `site-b.experiencess.com` are treated as **external links**
- Parent domain authority does NOT automatically flow to subdomains
- Each subdomain needs its own backlink profile

### SEO Strategy for Subdomain Architecture

#### 1. Parent Domain as Authority Hub

Create content on the parent domain to build authority:

```
experiencess.com/
├── /                           # Directory/search of all suppliers
├── /destinations/{location}    # Location guides linking to supplier sites
├── /categories/{category}      # Category pages linking to relevant sites
├── /blog                       # Central blog with backlinks to microsites
└── /about                      # About the platform
```

**Link flow**:
```
experiencess.com (high authority)
    │
    ├──→ adventure-co.experiencess.com (backlink)
    ├──→ london-walks.experiencess.com (backlink)
    └──→ food-tours-paris.experiencess.com (backlink)
```

#### 2. Cross-Linking Strategy

**Controlled internal linking** between related subdomains:

```
adventure-co.experiencess.com
    │
    ├── "Other Walking Tours" section
    │   ├──→ london-walks.experiencess.com
    │   └──→ historic-london.experiencess.com
    │
    └── "Related Experiences" section
        ├──→ food-tours-london.experiencess.com
        └──→ thames-cruises.experiencess.com
```

**Implementation**:
```typescript
// Generate related sites section
async function getRelatedMicrosites(currentConfig: MicrositeConfig, limit = 5) {
  // Find sites in same location/category
  const related = await prisma.micrositeConfig.findMany({
    where: {
      AND: [
        { id: { not: currentConfig.id } },
        { status: 'ACTIVE' },
        {
          OR: [
            { location: currentConfig.location },
            { category: currentConfig.category }
          ]
        }
      ]
    },
    orderBy: { pageViews: 'desc' },
    take: limit
  });

  return related;
}
```

#### 3. Sitemap Strategy

**Per-subdomain sitemaps** (submitted to domain-level GSC property):

```
# Each subdomain has its own sitemap
adventure-co.experiencess.com/sitemap.xml
london-walks.experiencess.com/sitemap.xml

# Parent domain sitemap index references all
experiencess.com/sitemap_index.xml
├── experiencess.com/sitemap-main.xml
├── adventure-co.experiencess.com/sitemap.xml
├── london-walks.experiencess.com/sitemap.xml
└── ... (all subdomains)
```

**GSC Submission**:
```typescript
// Submit all subdomain sitemaps to domain-level property
async function submitAllSitemaps() {
  const gscProperty = 'sc-domain:experiencess.com';

  const microsites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' }
  });

  for (const site of microsites) {
    const sitemapUrl = `https://${site.subdomain}.${site.parentDomain}/sitemap.xml`;
    await gscClient.submitSitemap(gscProperty, sitemapUrl);
  }
}
```

#### 4. Google Search Console Setup

**Domain-level property** covers all subdomains:

```
Property: sc-domain:experiencess.com

Covers:
- experiencess.com
- www.experiencess.com
- *.experiencess.com (all subdomains)
- http and https variants
```

**Verification**: DNS TXT record (one-time setup)
```
experiencess.com TXT "google-site-verification=xxxxx"
```

**Benefits**:
- Single verification for unlimited subdomains
- Unified search analytics across all sites
- No per-subdomain verification needed
- Can filter by subdomain in GSC reports

**Limitations**:
- Cannot set different crawl rates per subdomain
- All subdomains share same owner/permissions
- Must use domain-level verification (no HTML tag option)

---

## 5. Challenges and Mitigations

### Challenge 1: Authority Dilution

**Problem**: Each subdomain starts with zero domain authority. With 50,000+ subdomains, authority is spread thin.

**Mitigations**:

1. **Strong parent domain content**
   - Invest in high-quality content on `experiencess.com`
   - Build backlinks to parent domain
   - Parent domain pages link to microsites

2. **Quality over quantity**
   - Only create microsites for suppliers/products with sufficient content
   - Minimum thresholds: 5+ products, reviews available, good images

3. **Prioritized link building**
   - Focus backlink efforts on top 1,000 microsites
   - Let long-tail sites benefit from internal cross-linking

4. **Consolidated product pages**
   - Long-tail products live under supplier subdomain (not separate sites)
   - Reduces total subdomain count significantly

### Challenge 2: Content Duplication Risk

**Problem**: Similar suppliers/products may generate near-identical content.

**Mitigations**:

1. **Unique content signals**
   - Include supplier-specific: name, history, reviews, team info
   - Include product-specific: itinerary details, real reviews, actual images
   - Location-specific content: local tips, neighborhood guides

2. **Content differentiation scoring**
   ```typescript
   async function assessContentUniqueness(content: string, siteId: string) {
     // Compare against similar sites
     const similarSites = await getSimilarSites(siteId);
     const similarities = await Promise.all(
       similarSites.map(s => calculateSimilarity(content, s.content))
     );
     const maxSimilarity = Math.max(...similarities);

     if (maxSimilarity > 0.7) {
       // Flag for manual review or regeneration
       return { unique: false, similarity: maxSimilarity };
     }
     return { unique: true, similarity: maxSimilarity };
   }
   ```

3. **Canonical tags for overlapping content**
   - If product appears on both supplier site and product site, use canonical

### Challenge 3: Crawl Budget at Scale

**Problem**: Google may not crawl all 50,000+ subdomains efficiently.

**Mitigations**:

1. **Prioritized sitemap submission**
   - Submit high-value sitemaps first
   - Use `<priority>` and `<lastmod>` effectively
   - Fresh content gets higher priority

2. **Sitemap segmentation**
   ```xml
   <!-- sitemap_index.xml -->
   <sitemap>
     <loc>https://experiencess.com/sitemap-high-priority.xml</loc>
     <lastmod>2026-02-06</lastmod>
   </sitemap>
   <sitemap>
     <loc>https://experiencess.com/sitemap-medium-priority.xml</loc>
     <lastmod>2026-02-05</lastmod>
   </sitemap>
   ```

3. **Internal linking from parent**
   - Parent domain pages link to microsites
   - Google discovers microsites through parent crawl

4. **Progressive rollout**
   - Launch 1,000 sites/week
   - Monitor indexing before scaling

### Challenge 4: Analytics Isolation

**Problem**: Need analytics per microsite, but 50k+ GA4 properties is impractical.

**Solution**: Single GA4 property with custom dimensions

```typescript
// Track events with microsite context
gtag('event', 'page_view', {
  'custom_dimensions': {
    'microsite_subdomain': 'adventure-co',
    'microsite_type': 'supplier',
    'supplier_id': 'sup_123',
    'category': 'walking-tours',
    'location': 'london'
  }
});
```

**GA4 Setup**:
- 1 property: `experiencess.com`
- Custom dimensions: subdomain, type, supplier_id, category, location
- Segment reports by dimension
- Create per-supplier dashboards via Looker Studio

### Challenge 5: SSL Certificate Management

**Problem**: Need SSL for 50k+ subdomains.

**Solution**: Cloudflare Universal SSL

```
Cloudflare Plan: Pro ($20/month)
├── Universal SSL: Covers *.experiencess.com
├── Edge Certificates: Auto-provisioned
├── Origin Certificates: Wildcard for origin server
└── Always HTTPS: Force redirect
```

**No per-subdomain SSL management needed.**

### Challenge 6: GSC Verification at Scale

**Problem**: 50k subdomains would need 50k GSC properties with individual verification.

**Solution**: Domain-level property (already covered above)

```
sc-domain:experiencess.com
```
- One DNS TXT verification
- Covers ALL subdomains automatically
- Single API quota (not 50k × quota)

### Challenge 7: Tenant Lookup Performance

**Problem**: 50k+ database lookups for tenant resolution.

**Solution**: Multi-layer caching

```typescript
// Layer 1: Edge cache (Cloudflare Workers KV)
// Layer 2: Redis cache (5 min TTL)
// Layer 3: In-memory cache (10 sec TTL)
// Layer 4: Database (fallback)

const CACHE_LAYERS = {
  edge: { ttl: 60 },      // 1 minute at edge
  redis: { ttl: 300 },    // 5 minutes in Redis
  memory: { ttl: 10 },    // 10 seconds in-memory
};

async function getMicrositeConfig(subdomain: string, parentDomain: string) {
  const key = `${subdomain}.${parentDomain}`;

  // Memory cache
  if (memoryCache.has(key)) return memoryCache.get(key);

  // Redis cache
  const cached = await redis.get(`microsite:${key}`);
  if (cached) {
    const config = JSON.parse(cached);
    memoryCache.set(key, config, CACHE_LAYERS.memory.ttl);
    return config;
  }

  // Database
  const config = await prisma.micrositeConfig.findUnique({
    where: { subdomain_parentDomain: { subdomain, parentDomain } },
    include: { brand: true }
  });

  if (config) {
    await redis.setex(`microsite:${key}`, CACHE_LAYERS.redis.ttl, JSON.stringify(config));
    memoryCache.set(key, config, CACHE_LAYERS.memory.ttl);
  }

  return config;
}
```

### Challenge 8: Email Deliverability

**Problem**: Transactional emails from 50k subdomains may hit spam filters.

**Solution**: Centralized email sending

```
Booking confirmations:  bookings@experiencess.com
Contact forms:          contact@experiencess.com
Newsletters:            hello@experiencess.com

Email template includes:
- Microsite branding (logo, colors)
- Reply-to: site-specific address
- Sender name: "Adventure Co via Experience Guide"
```

---

## 6. Content Strategy for Subdomains

### Supplier Micro-Site Content

```
adventure-co.experiencess.com/
│
├── Homepage
│   ├── Hero with supplier branding
│   ├── Featured experiences (3-6)
│   ├── About snippet
│   ├── Trust signals (reviews, badges)
│   └── CTA to browse all experiences
│
├── /about
│   ├── Supplier story (AI-generated from data)
│   ├── Team section (if available)
│   ├── Values/mission
│   └── Trust badges
│
├── /experiences
│   ├── Filterable grid of all products
│   ├── Category filters
│   ├── Sort by: popular, price, rating
│   └── Pagination
│
├── /experiences/{product-slug}
│   ├── Full product details
│   ├── Image gallery
│   ├── Booking widget
│   ├── Reviews section
│   ├── Related experiences
│   └── FAQ
│
├── /destinations/{location}
│   ├── Location overview
│   ├── Experiences in this location
│   └── Local tips
│
├── /blog
│   ├── Category/destination content
│   ├── "Best of" guides
│   ├── Seasonal content
│   └── Max 4-6 posts per year
│
├── /reviews
│   ├── All reviews aggregated
│   ├── Filter by product
│   └── Review highlights
│
└── /contact
    ├── Contact form
    └── Supplier info (where permitted)
```

### Product Micro-Site Content (Premium Products Only)

```
london-walking-tour.experiencess.com/
│
├── Homepage
│   ├── Hero with product imagery
│   ├── Key details (duration, price, rating)
│   ├── Brief description
│   ├── Booking CTA
│   └── Trust signals
│
├── /itinerary
│   ├── Detailed day-by-day (if multi-day)
│   ├── Stop-by-stop breakdown
│   ├── What's included
│   └── What to bring
│
├── /reviews
│   ├── All product reviews
│   ├── Review statistics
│   └── Photo reviews
│
├── /faq
│   ├── Common questions
│   ├── Booking policies
│   └── Accessibility info
│
├── /book
│   ├── Date selection
│   ├── Participant count
│   ├── Add-ons
│   └── Checkout flow
│
└── /blog (optional)
    ├── "Complete Guide to [Experience]"
    ├── "What to Expect"
    └── Related destination content
```

### Content Generation Quotas

```typescript
const MICROSITE_CONTENT_QUOTAS = {
  supplier: {
    homepage: 1,
    about: 1,
    experienceListing: 1,
    experienceDetailPages: 'unlimited', // One per product
    destinationPages: 'max_5',          // Top 5 locations
    blogPosts: 6,                        // Max 6 per year
    reviewsPage: 1,
    contactPage: 1,
    // Total: ~10 + products + 6 blogs/year
  },

  product: {
    homepage: 1,
    itinerary: 1,
    reviewsPage: 1,
    faqPage: 1,
    blogPosts: 2,                        // Max 2 per year
    // Total: ~5 + 2 blogs/year
  }
};
```

---

## 7. Revised Infrastructure

### Database Schema (NEW Models - Added Alongside Existing)

**Important**: These are NEW tables added to the database. The existing `Site`, `Domain`, `Brand`, `Page` tables remain completely unchanged.

```prisma
// NEW: Microsite configuration (parallel to Site, not replacing it)
model MicrositeConfig {
  id                String       @id @default(cuid())

  // Domain info
  subdomain         String                // "adventure-co"
  parentDomain      String                // "experiencess.com"
  fullDomain        String       @unique  // "adventure-co.experiencess.com" (computed)

  // Entity reference
  entityType        EntityType            // SUPPLIER | PRODUCT
  supplierId        String?
  productId         String?

  // Brand (one-to-one)
  brand             Brand        @relation(fields: [brandId], references: [id])
  brandId           String       @unique

  // Site identity
  siteName          String                // "Adventure Co Tours"
  tagline           String?

  // SEO configuration
  seoConfig         Json                  // { titleTemplate, keywords, etc. }
  gscVerified       Boolean      @default(false)
  gaMeasurementId   String?               // Shared GA4, but tracked

  // Homepage configuration
  homepageConfig    Json?

  // Content
  pages             Page[]

  // Status
  status            MicrositeStatus       // DRAFT, GENERATING, ACTIVE, PAUSED

  // Tracking
  pageViews         Int          @default(0)
  lastContentUpdate DateTime?

  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  // Relations
  supplier          Supplier?    @relation(fields: [supplierId], references: [id])
  product           Product?     @relation(fields: [productId], references: [id])

  @@unique([subdomain, parentDomain])
  @@index([status])
  @@index([supplierId])
  @@index([productId])
  @@index([entityType])
}

enum EntityType {
  SUPPLIER
  PRODUCT
}

enum MicrositeStatus {
  DRAFT
  GENERATING
  ACTIVE
  PAUSED
  ARCHIVED
}

// Supplier model (linked to Holibob)
model Supplier {
  id                String   @id @default(cuid())
  holibobPartnerId  String   @unique

  // Basic info
  name              String
  slug              String   @unique
  description       String?  @db.Text

  // Cached from Holibob
  productCount      Int      @default(0)
  cities            String[]
  categories        String[]
  rating            Float?
  reviewCount       Int      @default(0)

  // Media
  logoUrl           String?
  heroImage         String?
  images            Json?     // Array of image URLs

  // Relationships
  products          Product[]
  microsite         MicrositeConfig?

  // Sync
  lastSyncedAt      DateTime?

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([slug])
  @@index([productCount])
}

// Product model (linked to Holibob)
model Product {
  id                String   @id @default(cuid())
  holibobProductId  String   @unique

  // Basic info
  slug              String   @unique
  title             String
  description       String?  @db.Text
  shortDescription  String?

  // Pricing
  priceFrom         Decimal?
  currency          String   @default("GBP")
  duration          String?

  // Location
  city              String?
  country           String?
  coordinates       Json?    // { lat, lng }

  // Ratings
  rating            Float?
  reviewCount       Int      @default(0)

  // Media
  images            Json?
  primaryImage      String?

  // Classification
  categories        String[]
  tags              String[]

  // Supplier relationship
  supplier          Supplier @relation(fields: [supplierId], references: [id])
  supplierId        String

  // Optional: dedicated microsite (for premium products)
  microsite         MicrositeConfig?

  // Tracking
  bookingCount      Int      @default(0)
  pageViews         Int      @default(0)
  lastSyncedAt      DateTime?

  // Flags
  isPremium         Boolean  @default(false)  // Qualifies for own microsite

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([slug])
  @@index([supplierId])
  @@index([city])
  @@index([isPremium])
}
```

### Shared Infrastructure

The microsite system **shares infrastructure** with the existing platform:

| Component | Shared? | Notes |
|-----------|---------|-------|
| **website-platform app** | Yes | Same Next.js app serves both |
| **PostgreSQL database** | Yes | New tables added, existing unchanged |
| **Redis** | Yes | Same cache, different key prefixes |
| **BullMQ workers** | Partially | New job types for microsites |
| **Cloudflare** | Yes | Same account, new DNS zones |
| **Holibob API** | Yes | Same integration |

**Benefits of shared infrastructure**:
- Single deployment pipeline
- Unified monitoring
- Shared authentication (admin)
- Lower operational overhead
- Code reuse (components, utilities)

### Cloudflare Configuration

```javascript
// Cloudflare Workers script for edge routing
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const hostname = url.hostname

  // Check if known parent domain
  const parentDomains = ['experiencess.com', 'experiencess.com']
  const isSubdomain = parentDomains.some(pd =>
    hostname.endsWith(`.${pd}`) && hostname !== pd && !hostname.startsWith('www.')
  )

  if (isSubdomain) {
    const subdomain = hostname.split('.')[0]
    const parentDomain = parentDomains.find(pd => hostname.endsWith(`.${pd}`))

    // Check KV cache for microsite config
    const cacheKey = `microsite:${subdomain}:${parentDomain}`
    const cached = await MICROSITE_KV.get(cacheKey)

    if (cached === 'NOT_FOUND') {
      // Return 404 page
      return new Response('Site not found', { status: 404 })
    }

    // Add headers for origin
    const modifiedRequest = new Request(request, {
      headers: new Headers({
        ...Object.fromEntries(request.headers),
        'x-subdomain': subdomain,
        'x-parent-domain': parentDomain,
        'x-microsite': 'true'
      })
    })

    return fetch(modifiedRequest)
  }

  // Pass through for non-microsite requests
  return fetch(request)
}
```

---

## 8. Holibob API Integration Strategy

### Current API Capabilities

The existing Holibob integration provides:

| Data | API Method | Notes |
|------|------------|-------|
| **Products** | `discoverProducts()` | Search by location, category, dates |
| **Product Details** | `getProduct(id)` | Full details, reviews, itinerary |
| **Categories** | `getCategories()` | Activity types with product counts |
| **Places** | `getPlaces()` | Location hierarchy (country → city) |
| **Inventory Landscape** | `discoverInventoryLandscape()` | Countries, cities, categories with counts |
| **Availability** | `discoverAvailability()` | Real-time pricing and slots |
| **Booking** | `createBooking()` | Full booking flow |

### Key Insight: Supplier Data via Products

**There is no direct `listAllSuppliers()` endpoint.** Suppliers are discovered through their products:

```typescript
// Each product contains supplier info
{
  id: "prod_123",
  name: "London Walking Tour",
  supplierId: "sup_456",        // ← Supplier identifier
  supplierName: "London Walks", // ← Supplier name
  // ... other product fields
}
```

### Data Flow: Holibob → Local Cache → Microsites

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         HOLIBOB API (Source of Truth)                    │
│  - 300k products with supplierId/supplierName                            │
│  - Real-time availability and pricing                                    │
│  - Booking flow                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Daily Sync (2-3 AM)
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         LOCAL DATABASE (Cache)                           │
│                                                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐                      │
│  │ Supplier (NEW)      │    │ Product (NEW)       │                      │
│  │                     │    │                     │                      │
│  │ holibobSupplierId   │◄───│ supplierId          │                      │
│  │ name                │    │ holibobProductId    │                      │
│  │ slug                │    │ title, slug         │                      │
│  │ productCount        │    │ priceFrom, rating   │                      │
│  │ cities[]            │    │ city, categories    │                      │
│  │ categories[]        │    │ primaryImage        │                      │
│  │ avgRating           │    │                     │                      │
│  └─────────────────────┘    └─────────────────────┘                      │
│                                                                          │
│  Static data: Supplier profiles, product catalog (refreshed daily)       │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Microsite Pages
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         MICROSITES                                       │
│                                                                          │
│  adventure-co.experiencess.com                                        │
│  ├── Homepage: Cached supplier data + cached products                    │
│  ├── /experiences: Cached product list (filtered by supplier)            │
│  ├── /experiences/[slug]: Real-time Holibob fetch (availability)         │
│  └── /book: Real-time Holibob booking flow                               │
│                                                                          │
│  Cached pages: Fast, SEO-friendly                                        │
│  Booking flow: Real-time from Holibob (unchanged from existing sites)    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Supplier Discovery Sync Job

```typescript
// NEW: packages/jobs/src/services/supplier-sync.ts

export async function syncSuppliersFromHolibob() {
  const holibob = getHolibobClient();
  const supplierMap = new Map<string, SupplierAggregation>();

  // 1. Get inventory landscape (what cities/categories exist)
  const landscape = await holibob.discoverInventoryLandscape();
  console.log(`Found ${landscape.cities.length} cities, ${landscape.categories.length} categories`);

  // 2. Discover products across all city/category combinations
  for (const city of landscape.cities) {
    for (const category of landscape.categories) {
      await rateLimiter.wait(); // Respect API limits

      const products = await holibob.discoverProducts({
        freeText: city.name,
        categoryIds: [category.id],
        pageSize: 100,
      });

      // 3. Aggregate supplier data from products
      for (const product of products.items) {
        const existing = supplierMap.get(product.supplierId) || {
          supplierId: product.supplierId,
          supplierName: product.supplierName,
          productIds: new Set<string>(),
          cities: new Set<string>(),
          categories: new Set<string>(),
          ratings: [] as number[],
          prices: [] as number[],
        };

        existing.productIds.add(product.id);
        existing.cities.add(city.name);
        existing.categories.add(category.name);
        if (product.reviewRating) existing.ratings.push(product.reviewRating);
        if (product.priceFrom) existing.prices.push(product.priceFrom);

        supplierMap.set(product.supplierId, existing);
      }
    }
  }

  console.log(`Discovered ${supplierMap.size} unique suppliers`);

  // 4. Upsert suppliers to database
  for (const [supplierId, data] of supplierMap) {
    await prisma.supplier.upsert({
      where: { holibobSupplierId: supplierId },
      create: {
        holibobSupplierId: supplierId,
        name: data.supplierName,
        slug: generateUniqueSlug(data.supplierName),
        productCount: data.productIds.size,
        cities: Array.from(data.cities),
        categories: Array.from(data.categories),
        rating: data.ratings.length > 0 ? average(data.ratings) : null,
        reviewCount: data.ratings.length,
        priceRange: {
          min: Math.min(...data.prices),
          max: Math.max(...data.prices),
          currency: 'GBP',
        },
      },
      update: {
        name: data.supplierName,
        productCount: data.productIds.size,
        cities: Array.from(data.cities),
        categories: Array.from(data.categories),
        rating: data.ratings.length > 0 ? average(data.ratings) : null,
        reviewCount: data.ratings.length,
        priceRange: {
          min: Math.min(...data.prices),
          max: Math.max(...data.prices),
          currency: 'GBP',
        },
        lastSyncedAt: new Date(),
      },
    });
  }
}
```

### Product Sync Job

```typescript
// NEW: packages/jobs/src/services/product-sync.ts

export async function syncProductsFromHolibob() {
  const holibob = getHolibobClient();
  const suppliers = await prisma.supplier.findMany();

  for (const supplier of suppliers) {
    // Fetch all products for this supplier
    const products = await discoverAllSupplierProducts(holibob, supplier);

    for (const product of products) {
      await prisma.product.upsert({
        where: { holibobProductId: product.id },
        create: {
          holibobProductId: product.id,
          slug: generateUniqueSlug(product.name),
          title: product.name,
          shortDescription: product.shortDescription,
          priceFrom: product.priceFrom,
          currency: product.priceCurrency || 'GBP',
          duration: parseIsoDuration(product.duration),
          rating: product.reviewRating,
          reviewCount: product.reviewCount,
          primaryImage: product.imageList?.[0]?.url,
          images: product.imageList?.map(img => img.url),
          city: product.place?.name,
          country: product.place?.country,
          categories: product.categories?.map(c => c.name) || [],
          supplierId: supplier.id,
        },
        update: {
          title: product.name,
          shortDescription: product.shortDescription,
          priceFrom: product.priceFrom,
          rating: product.reviewRating,
          reviewCount: product.reviewCount,
          primaryImage: product.imageList?.[0]?.url,
          images: product.imageList?.map(img => img.url),
          lastSyncedAt: new Date(),
        },
      });
    }
  }
}

async function discoverAllSupplierProducts(holibob: HolibobClient, supplier: Supplier) {
  const allProducts: Product[] = [];
  const seenIds: string[] = [];

  // Iterate through supplier's cities to find all their products
  for (const city of supplier.cities) {
    let hasMore = true;
    while (hasMore) {
      await rateLimiter.wait();

      const response = await holibob.discoverProducts({
        freeText: city,
        pageSize: 100,
        seenProductIdList: seenIds,
      });

      // Filter to only this supplier's products
      const supplierProducts = response.items.filter(
        p => p.supplierId === supplier.holibobSupplierId
      );

      allProducts.push(...supplierProducts);
      seenIds.push(...response.items.map(p => p.id));
      hasMore = response.pageInfo.hasNextPage;
    }
  }

  return allProducts;
}
```

### What Changes vs Current Sites

| Aspect | Current Sites | New Microsites |
|--------|---------------|----------------|
| **Holibob Partner ID** | One per site (in config) | All use same Partner ID |
| **Product Discovery** | Real-time, all products | Filtered by `supplierId` |
| **Supplier Info** | Not tracked | Local `Supplier` table |
| **Product Catalog** | On-demand only | Cached locally (daily sync) |
| **Availability/Pricing** | Real-time | **Real-time (unchanged)** |
| **Booking Flow** | Real-time | **Real-time (unchanged)** |

### Hybrid Data Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│  PAGE TYPE              │  DATA SOURCE          │  CACHE TTL    │
├─────────────────────────────────────────────────────────────────┤
│  Homepage               │  Local DB             │  1 day        │
│  Supplier About         │  Local DB + AI        │  1 day        │
│  Experience Listing     │  Local DB             │  1 day        │
│  Experience Detail      │  Local DB + Holibob   │  1 hour       │
│  Availability Calendar  │  Holibob API          │  Real-time    │
│  Booking Flow           │  Holibob API          │  Real-time    │
│  Reviews                │  Holibob API          │  1 hour       │
└─────────────────────────────────────────────────────────────────┘
```

**Why this hybrid approach?**
- **SEO pages** (homepage, listings): Use cached data for fast load times
- **Booking-critical pages**: Always real-time from Holibob for accurate availability
- **Reviews**: Can be slightly stale (1 hour) without impacting user experience

### Microsite Product Filtering

When a microsite requests products, filter by the supplier:

```typescript
// apps/website-platform/src/app/api/experiences/route.ts (modified for microsites)

export async function GET(request: Request) {
  const site = await getSiteFromHostname(hostname);

  // Check if this is a microsite with a linked supplier
  if (site.micrositeConfig?.supplierId) {
    // Return cached products from local DB (fast, SEO-friendly)
    const products = await prisma.product.findMany({
      where: { supplierId: site.micrositeConfig.supplierId },
      orderBy: { rating: 'desc' },
    });
    return Response.json({ items: products });
  }

  // Existing sites: fetch from Holibob API (unchanged)
  const holibob = getHolibobClient(site.holibobPartnerId);
  const products = await holibob.discoverProducts(filters);
  return Response.json(products);
}
```

### Sync Schedule

```typescript
// packages/jobs/src/schedulers/index.ts

// NEW: Holibob data sync jobs (added to existing scheduler)
scheduleJob('SUPPLIER_SYNC', {
  schedule: '0 2 * * *',     // Daily at 2 AM
  handler: syncSuppliersFromHolibob,
  timeout: 4 * 60 * 60 * 1000, // 4 hours max
});

scheduleJob('PRODUCT_SYNC', {
  schedule: '0 3 * * *',     // Daily at 3 AM (after supplier sync)
  handler: syncProductsFromHolibob,
  timeout: 4 * 60 * 60 * 1000, // 4 hours max
});

scheduleJob('MICROSITE_CONTENT_REFRESH', {
  schedule: '0 5 * * *',     // Daily at 5 AM (after product sync)
  handler: refreshMicrositeContent,
});
```

### Rate Limiting for Sync

```typescript
// packages/jobs/src/utils/rate-limiter.ts

const HOLIBOB_RATE_LIMIT = {
  requestsPerMinute: 60,
  delayBetweenBatches: 1000, // 1 second
};

class RateLimiter {
  private lastRequest = 0;
  private requestCount = 0;

  async wait() {
    this.requestCount++;

    // Reset counter every minute
    const now = Date.now();
    if (now - this.lastRequest > 60000) {
      this.requestCount = 1;
    }

    // If we've hit the limit, wait
    if (this.requestCount >= HOLIBOB_RATE_LIMIT.requestsPerMinute) {
      const waitTime = 60000 - (now - this.lastRequest);
      await sleep(waitTime);
      this.requestCount = 1;
    }

    // Minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < HOLIBOB_RATE_LIMIT.delayBetweenBatches) {
      await sleep(HOLIBOB_RATE_LIMIT.delayBetweenBatches - timeSinceLastRequest);
    }

    this.lastRequest = Date.now();
  }
}

export const rateLimiter = new RateLimiter();
```

### Estimated Sync Times

| Data | Volume | Estimated Time |
|------|--------|----------------|
| Supplier discovery | ~10k suppliers | ~2-3 hours |
| Product sync | ~300k products | ~3-4 hours |
| **Total daily sync** | | **~5-7 hours** |

Runs overnight (2-7 AM) so doesn't impact daytime operations.

### Backward Compatibility

**Existing sites continue to use Holibob API directly (unchanged)**:
- Real-time product discovery
- Real-time availability
- Real-time booking

**New microsites use hybrid approach**:
- Cached catalog for listings/SEO pages
- Real-time Holibob for booking flow

The booking widget and checkout flow remain **identical** - they always call Holibob in real-time regardless of site type.

---

## 9. Admin Interface & Worker Integration

### Current Architecture (What Exists)

The platform has a mature admin system and job queue infrastructure:

**Admin Interface** (`/apps/admin/`):
| Page | Purpose |
|------|---------|
| `/` | Dashboard with KPIs, site counts, revenue |
| `/sites` | Site management, create/edit/archive |
| `/sites/[id]` | Individual site control, roadmap execution |
| `/content` | Content review and approval workflow |
| `/domains` | Domain verification, SSL, DNS |
| `/operations` | System health, queue metrics, job monitoring |
| `/operations/jobs` | Job list with filtering, retry controls |
| `/settings` | Platform configuration, pause controls |

**Job Queue** (BullMQ + Redis):
- 7 queues: `content`, `seo`, `gsc`, `site`, `domain`, `analytics`, `abtest`
- 22+ job types with typed payloads
- Automatic retry with exponential backoff
- Circuit breakers for external services

**Pause Controls** (3 levels):
```
Global:     PlatformSettings.allAutonomousProcessesPaused
Per-Site:   Site.autonomousProcessesPaused
Per-Queue:  queueRegistry.pauseQueue(queueName)
```

### Integration Strategy: Extend, Don't Replace

The microsite system will **extend** existing infrastructure:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         EXISTING (UNCHANGED)                            │
├─────────────────────────────────────────────────────────────────────────┤
│  Admin UI        │  Job Queues      │  Workers          │  Schedulers   │
│  /sites          │  content         │  site.ts          │  Daily jobs   │
│  /operations     │  seo             │  content.ts       │  GSC sync     │
│  /content        │  domain          │  seo-*.ts         │  etc.         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                │ EXTEND
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         NEW (ADDED)                                     │
├─────────────────────────────────────────────────────────────────────────┤
│  Admin UI        │  Job Types       │  Workers          │  Schedulers   │
│  /microsites     │  MICROSITE_*     │  microsite.ts     │  Supplier sync│
│  /suppliers      │  SUPPLIER_SYNC   │  supplier-sync.ts │  Product sync │
│  /products       │  PRODUCT_SYNC    │  product-sync.ts  │  Microsite    │
│                  │                  │                   │  content      │
└─────────────────────────────────────────────────────────────────────────┘
```

### New Admin Pages

```
apps/admin/src/app/
├── microsites/
│   ├── page.tsx                    # Microsite list (filterable)
│   └── [id]/
│       ├── page.tsx                # Microsite detail & controls
│       ├── content/page.tsx        # Microsite content management
│       └── analytics/page.tsx      # Microsite-specific metrics
│
├── suppliers/
│   ├── page.tsx                    # Supplier list (from Holibob sync)
│   └── [id]/
│       ├── page.tsx                # Supplier detail
│       ├── products/page.tsx       # Supplier's products
│       └── microsite/page.tsx      # Create/manage microsite for supplier
│
└── operations/
    └── sync/page.tsx               # Holibob sync status & controls
```

### New Job Types

```typescript
// packages/jobs/src/types.ts (extended)

enum JobType {
  // ... existing types unchanged ...

  // NEW: Microsite management
  MICROSITE_CREATE = 'MICROSITE_CREATE',
  MICROSITE_BRAND_GENERATE = 'MICROSITE_BRAND_GENERATE',
  MICROSITE_CONTENT_GENERATE = 'MICROSITE_CONTENT_GENERATE',
  MICROSITE_PUBLISH = 'MICROSITE_PUBLISH',
  MICROSITE_ARCHIVE = 'MICROSITE_ARCHIVE',

  // NEW: Holibob sync
  SUPPLIER_SYNC = 'SUPPLIER_SYNC',
  PRODUCT_SYNC = 'PRODUCT_SYNC',
  SUPPLIER_SYNC_INCREMENTAL = 'SUPPLIER_SYNC_INCREMENTAL',
}

// Queue mapping (reuse existing queues)
const JOB_TYPE_TO_QUEUE = {
  // ... existing mappings unchanged ...

  // Microsites use 'site' queue (same timeout/retry config)
  MICROSITE_CREATE: 'site',
  MICROSITE_BRAND_GENERATE: 'site',
  MICROSITE_PUBLISH: 'site',
  MICROSITE_ARCHIVE: 'site',

  // Content uses 'content' queue
  MICROSITE_CONTENT_GENERATE: 'content',

  // Sync jobs use new 'sync' queue (long-running)
  SUPPLIER_SYNC: 'sync',
  PRODUCT_SYNC: 'sync',
};
```

### New Workers

```typescript
// packages/jobs/src/workers/microsite.ts

export async function handleMicrositeCreate(job: Job<MicrositeCreatePayload>) {
  const { supplierId, parentDomain } = job.data;

  // 1. Get supplier data
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });

  // 2. Generate brand (reuse existing brand generation service)
  const brand = await generateBrandIdentity({
    name: supplier.name,
    niche: supplier.categories[0],
    location: supplier.cities[0],
  });

  // 3. Create microsite config
  const microsite = await prisma.micrositeConfig.create({
    data: {
      subdomain: supplier.slug,
      parentDomain,
      supplierId,
      brandId: brand.id,
      siteName: brand.siteName,
      status: 'DRAFT',
    },
  });

  // 4. Queue content generation
  await addJob('MICROSITE_CONTENT_GENERATE', {
    micrositeId: microsite.id,
    contentTypes: ['homepage', 'about', 'experiences'],
  });

  return { success: true, micrositeId: microsite.id };
}
```

### New API Endpoints

```typescript
// apps/admin/src/app/api/microsites/route.ts

// List microsites (paginated, filterable)
GET /api/microsites?status=ACTIVE&supplierId=xxx&page=1

// Create microsite for supplier
POST /api/microsites
Body: { supplierId, parentDomain }

// Bulk create microsites
POST /api/microsites/bulk
Body: { supplierIds[], parentDomain }

// apps/admin/src/app/api/microsites/[id]/route.ts

// Get microsite details
GET /api/microsites/[id]

// Update microsite
PATCH /api/microsites/[id]
Body: { status, siteName, seoConfig }

// Trigger content generation
POST /api/microsites/[id]/generate-content
Body: { contentTypes[] }

// apps/admin/src/app/api/sync/route.ts

// Trigger manual sync
POST /api/sync/suppliers
POST /api/sync/products

// Get sync status
GET /api/sync/status
```

### Pause Controls for Microsites

```typescript
// Extend existing pause-control service

// Global microsite pause (new setting)
PlatformSettings.micrositeAutonomousProcessesPaused: boolean

// Per-microsite pause
MicrositeConfig.autonomousProcessesPaused: boolean

// Check before any microsite job
async function shouldPauseMicrositeJob(micrositeId: string): Promise<boolean> {
  const settings = await getPlatformSettings();

  // Global platform pause
  if (settings.allAutonomousProcessesPaused) return true;

  // Global microsite pause
  if (settings.micrositeAutonomousProcessesPaused) return true;

  // Per-microsite pause
  const microsite = await prisma.micrositeConfig.findUnique({
    where: { id: micrositeId },
  });
  if (microsite?.autonomousProcessesPaused) return true;

  return false;
}
```

### Operations Dashboard Extension

```typescript
// Extend /operations dashboard

// New metrics section: Microsite Operations
{
  totalMicrosites: number,
  activeMicrosites: number,
  micrositesCreatedToday: number,
  micrositeContentGenerated: number,

  // Sync status
  lastSupplierSync: Date,
  lastProductSync: Date,
  suppliersInDb: number,
  productsInDb: number,

  // Queue metrics for new queues
  syncQueue: {
    waiting: number,
    active: number,
    completed: number,
    failed: number,
  }
}
```

### Scheduled Jobs for Microsites

```typescript
// packages/jobs/src/schedulers/index.ts (extended)

// NEW: Holibob sync schedules
scheduleJob('SUPPLIER_SYNC', {
  schedule: '0 2 * * *',  // Daily 2 AM
  timeout: 4 * 60 * 60 * 1000,
});

scheduleJob('PRODUCT_SYNC', {
  schedule: '0 3 * * *',  // Daily 3 AM (after supplier sync)
  timeout: 4 * 60 * 60 * 1000,
});

// NEW: Microsite content schedules
scheduleJob('MICROSITE_CONTENT_REFRESH', {
  schedule: '0 6 * * *',  // Daily 6 AM
  handler: async () => {
    // Refresh 1% of microsites per day (rotating)
    const microsites = await getMicrositesForRefresh(0.01);
    for (const ms of microsites) {
      await addJob('MICROSITE_CONTENT_GENERATE', {
        micrositeId: ms.id,
        contentTypes: ['homepage'],
        isRefresh: true,
      });
    }
  },
});

// NEW: Microsite health check
scheduleJob('MICROSITE_HEALTH_CHECK', {
  schedule: '0 8 * * 0',  // Sundays 8 AM
  handler: async () => {
    // Check for microsites with issues
    // - No content generated
    // - Supplier deleted from Holibob
    // - Low traffic (needs attention)
  },
});
```

### Admin UI Workflow: Creating Microsites

```
Admin Dashboard
      │
      ▼
/suppliers (list all synced suppliers)
      │
      ├── Filter by: productCount > 5, rating > 3.5
      │
      ▼
Select suppliers for microsite creation
      │
      ▼
POST /api/microsites/bulk
  { supplierIds: [...], parentDomain: "experiencess.com" }
      │
      ▼
Jobs queued: MICROSITE_CREATE × N
      │
      ▼
/operations/jobs (monitor progress)
      │
      ▼
/microsites (view created microsites)
      │
      ▼
Individual microsite management
  - Trigger content generation
  - View analytics
  - Pause/resume
  - Archive
```

### Backward Compatibility Checklist

| Component | Change Type | Impact on Existing |
|-----------|-------------|-------------------|
| Admin pages | **Add** new routes | None - new URLs |
| Job types | **Add** new types | None - existing types unchanged |
| Queue config | **Add** sync queue | None - existing queues unchanged |
| Workers | **Add** new files | None - existing workers unchanged |
| Schedulers | **Add** new schedules | None - existing schedules unchanged |
| Pause controls | **Extend** settings | None - new fields only |
| Operations dashboard | **Extend** metrics | None - additive only |

**No changes to existing admin functionality.** Everything is additive.

---

## 10. Revised Rollout Plan

### Phase 1: Foundation (Weeks 1-4)

1. **Domain setup**
   - Register `experiencess.com`, `experiencess.com`
   - Configure wildcard DNS
   - Configure wildcard SSL via Cloudflare

2. **Database schema**
   - Add `Supplier`, `Product`, `MicrositeConfig` models
   - Create indexes
   - Set up read replica

3. **Core routing**
   - Update middleware for subdomain detection
   - Implement `getMicrositeConfig()` with caching
   - Create microsite layout template

4. **Holibob data sync pipeline**
   - Build `syncSuppliersFromHolibob()` job (discovers suppliers via products)
   - Build `syncProductsFromHolibob()` job (caches product catalog)
   - Implement rate limiter for API compliance
   - Initial full sync (~5-7 hours)
   - Generate slugs with collision handling
   - Schedule daily overnight sync (2-5 AM)

### Phase 2: Brand Generation (Weeks 5-8)

1. **AI brand pipeline**
   - Build brand generation service
   - Create fallback templates
   - Test with 100 suppliers

2. **Content templates**
   - Supplier homepage template
   - Product detail template
   - About page template

3. **Initial microsites**
   - Generate 1,000 supplier microsites
   - Generate 500 premium product microsites
   - Quality review and iteration

### Phase 3: Scale Content (Weeks 9-16)

1. **Full rollout**
   - Generate remaining supplier microsites (5k-50k)
   - Generate remaining product microsites (5k-20k)
   - Rate: 500 microsites/day

2. **SEO optimization**
   - Submit all sitemaps to GSC
   - Build parent domain content
   - Cross-linking implementation

3. **Monitoring**
   - Index coverage tracking
   - Ranking monitoring
   - Performance metrics

### Phase 4: Ongoing (Week 17+)

1. **New supplier/product onboarding**
   - Automatic microsite creation for qualifying entities
   - Brand generation pipeline

2. **Content maintenance**
   - Quarterly homepage refresh
   - Bi-annual about page refresh
   - 4-6 blog posts per site per year

3. **Optimization**
   - A/B testing layouts
   - CTR optimization
   - Conversion tracking

---

## 11. Cost Comparison: Subdomain vs Subdirectory

| Item | Subdomain Approach | Subdirectory Approach |
|------|-------------------|----------------------|
| **Domain registration** | $20-40/year (2-3 domains) | $0 (use holibob.com) |
| **SSL certificates** | $0 (Cloudflare wildcard) | N/A |
| **DNS management** | Simple (wildcard) | N/A |
| **GSC setup** | 1 domain-level property | 1 property |
| **GA4 setup** | 1 property + dimensions | 1 property |
| **SEO authority** | Distributed across subdomains | Consolidated |
| **Branding flexibility** | Full independence | Limited by parent brand |
| **Development complexity** | Medium-High | Low |
| **Maintenance overhead** | Medium | Low |

**Subdomain approach recommended** because:
- Holibob B2B brand cannot be consumer-facing
- Independent supplier/product branding required
- Cost difference is minimal ($20-40/year vs $0)

---

## 12. Success Metrics

### Phase 1 (3 months)
- 10,000+ microsites live
- 70%+ pages indexed
- Parent domain DA 20+

### Phase 2 (6 months)
- 50,000+ microsites live
- 85%+ pages indexed
- 10,000+ organic sessions/month
- Top 10 ranking for 100+ supplier brand terms

### Phase 3 (12 months)
- Full rollout complete
- 50,000+ organic sessions/month
- 25% of microsites driving bookings
- Parent domain DA 40+

---

## 13. Key Differences from Subdirectory Approach

| Aspect | Subdirectory | Subdomain |
|--------|--------------|-----------|
| **URL** | holibob.com/suppliers/x | x.experiencess.com |
| **Branding** | Holibob (B2B) | Independent per site |
| **Domain authority** | Consolidated | Distributed |
| **Internal links** | Full PageRank | External link treatment |
| **GSC properties** | 1 | 1 (domain-level) |
| **GA4 properties** | 1 | 1 (with dimensions) |
| **Technical complexity** | Lower | Higher |
| **Subdomain count** | N/A | 15,000-70,000 |
| **Parent domain role** | Main site | Authority hub + directory |

---

## 14. Recommendation

**Proceed with subdomain approach** using:
- 2-3 consumer-facing parent domains
- AI-generated independent branding per microsite
- 15,000-70,000 subdomains (not 300k - consolidate long-tail under supplier sites)
- Domain-level GSC property
- Single GA4 with custom dimensions
- Multi-layer caching for performance

**Key success factors**:
1. Strong parent domain content and backlinks
2. Quality thresholds for microsite creation
3. Unique, supplier-specific content
4. Progressive rollout with indexing monitoring
5. Cross-linking strategy between related microsites

---

*Document Version: 2.0*
*Last Updated: 2026-02-06*
*Focus: Subdomain approach with independent branding*
