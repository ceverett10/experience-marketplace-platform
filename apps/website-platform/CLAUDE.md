# Website Platform (`@experience-marketplace/website-platform`)

Multi-tenant consumer storefronts. Next.js 14 App Router, React 18, Tailwind CSS. Port 3000.

## Multi-Tenant Architecture

### Request Flow

1. **Middleware** (`middleware.ts`): Extracts hostname from `x-forwarded-host` → strips port/www
2. **Microsite detection**: `*.experiencess.com` → `parseMicrositeHostname()` → returns `MicrositeContext`
3. **Site resolution**: `getSiteFromHostname(hostname)` in `lib/tenant.ts` → DB lookup by domain or slug
4. **Context injection**: `SiteProvider` wraps app → hooks: `useSite()`, `useBrand()`, `useSEO()`

### Attribution Cookies (set by middleware)

- `utm_params` (30min): UTM params, gclid, fbclid, landing page
- `funnel_session` (30min, httpOnly): Rolling session ID
- `ai_referral_source` (30min): ChatGPT, Claude, Gemini, Copilot traffic detection

## Experience URLs (CRITICAL — past bug source)

```
URL: /experiences/{holibobProductId}    ← CORRECT (product ID)
NOT: /experiences/{human-readable-slug}  ← WRONG
```

The `[slug]` param goes directly to `client.getProduct(slug)`. Human-readable slugs from `product.slug` are for SEO/sitemap ONLY, never for routing.

When linking to experiences, ALWAYS use `product.holibobProductId`, not `product.slug`.

## Slug Prefix Convention (CRITICAL — past bug source)

Database stores slugs WITH prefix for some page types:

- BLOG: `blog/my-post` → URL `/blog/my-post`
- LANDING: `destinations/london` → URL `/destinations/london`
- FAQ: `faq/booking` → URL `/faq/booking`
- CATEGORY: `food-tours` (NO prefix) → URL `/categories/food-tours`
- PRODUCT: product ID (NO prefix) → URL `/experiences/{id}`

**In page files**: Prepend the prefix when querying DB:

```typescript
const fullSlug = `blog/${slug}`; // for blog pages
const page = await prisma.page.findUnique({ where: { siteId_slug: { siteId, slug: fullSlug } } });
```

**In sitemap.ts**: Use `/${page.slug}` for BLOG/LANDING/FAQ. Use `/categories/${slug}` for CATEGORY.

## Meta Title Template

Layout.tsx defines `titleTemplate: '%s | Site Name'`. Pages must:

- Set `title` WITHOUT the pipe suffix
- Only add `| Site Name` to `openGraph.title` and `twitter.title`

## Page Data Fetching Pattern

All pages are async server components with `revalidate`:

```typescript
export const revalidate = 300; // 5 minutes

export async function generateMetadata({ params }): Promise<Metadata> {
  // Resolve site from headers, fetch page data, return metadata
}

export default async function Page({ params }) {
  // Fetch data, render with structured data (Schema.org)
}
```

## Schema.org Structured Data

Every indexable page includes Schema.org JSON-LD:

- **Blog**: `BlogPosting` — requires `image` array (fallback chain: ogImage → brand → hero → logo)
- **Experience**: `Product`, `AggregateRating`, `BreadcrumbList`
- **Homepage**: `TourOperatorSchema`, `WebSiteSchema`, `LocalBusinessSchema`
- **All pages**: `BreadcrumbList`

## Component Patterns

- **Server by default** — only mark `'use client'` when needed (state, events, browser APIs)
- **Client components**: BookingWidget, ExperienceCard, CheckoutClient, ReviewsCarousel, analytics
- **Hybrid pattern**: Server component wraps async data fetch, passes to client child
- **Graceful fallback**: Try/catch → `return null` for non-critical async sections

## Brand Theming

CSS variables injected at runtime in root layout:

```typescript
const brandCSS = generateBrandCSSVariables(site.brand);
// --primary-color, --secondary-color, etc.
```

Tailwind config references these: `colors: { primary: 'hsl(var(--primary))' }`

## Booking Flow (Holibob API)

9-step Look-to-Book flow via `@experience-marketplace/holibob-api`:

1. Product discovery → 2. Product detail → 3. Availability check
2. Options selection → 5. Pricing → 6. Create booking
3. Answer questions (3 levels) → 8. Payment (Stripe) → 9. Commit

API routes in `api/booking/`, `api/products/`, `api/payment/`.

## Testing

- **Framework**: Vitest + React Testing Library + Playwright (E2E)
- **Coverage**: 65% thresholds (statements/functions/lines), 75% branches
- **Mocks**: next/navigation, next/headers, next/image in `test/setup.tsx`
- **Custom render**: `renderWithSite(component, site)` wraps in `SiteProvider`
- **E2E**: Booking flow, checkout in `booking-flow.e2e.test.ts`

## Common Pitfalls

1. Don't route experiences by human-readable slug — always product ID
2. Don't double-append site name to `title` field
3. Don't forget slug prefixes in DB lookups
4. Don't hardcode Holibob partner ID — use `site.holibobPartnerId`
5. Don't access site config without `getSiteFromHostname()`
6. Schema.org `BlogPosting` MUST have `image` — use fallback chain
