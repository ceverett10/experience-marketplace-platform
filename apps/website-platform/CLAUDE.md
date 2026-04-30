# Website Platform (`@experience-marketplace/website-platform`)

Multi-tenant consumer storefronts. Next.js 14 App Router, React 18, Tailwind CSS. Port 3000.

## Multi-Tenant Architecture

This app serves ALL site types from one codebase: main sites (custom domains), opportunity microsites,
supplier microsites, and the parent `experiencess.com` portal.

### Request Flow

1. **Middleware** (`middleware.ts`): Extracts hostname from `x-forwarded-host` → strips port/www
2. **Microsite detection**: `*.experiencess.com` → `parseMicrositeHostname()` → returns `MicrositeContext`
3. **Site resolution**: `getSiteFromHostname(hostname)` in `lib/tenant.ts` → DB lookup by domain or slug
4. **Context injection**: `SiteProvider` wraps app → hooks: `useSite()`, `useBrand()`, `useSEO()`

### Site Type Resolution Order (`lib/tenant.ts`)

1. **Microsite subdomains** (early exit): `parseMicrositeHostname()` checks if hostname matches
   `*.experiencess.com` → looks up `MicrositeConfig` by subdomain + parentDomain composite key →
   returns `MicrositeContext` with entityType, supplierId/productId, supplierCities/categories,
   layoutConfig, discoveryConfig. **1-minute in-memory cache** per subdomain.

2. **Parent domain**: Bare `experiencess.com` or `www.experiencess.com` → returns parent site config
   (the network hub / aggregator portal).

3. **Dev fallback**: `localhost`, `*.vercel.app`, `*.herokuapp.com` → returns DEFAULT_SITE_CONFIG.

4. **Production main sites**: DB lookup on `domain` table by hostname, or fallback to `site.slug`.

### How Microsites Differ from Main Sites

| Aspect            | Main Site                       | Microsite                              |
| ----------------- | ------------------------------- | -------------------------------------- |
| Domain            | Custom (e.g., london-tours.com) | Subdomain (e.g., X.experiencess.com)   |
| DB model          | `Site` + `Domain`               | `MicrositeConfig` (+ linked Brand)     |
| Content scope     | Full (all page types)           | OPPORTUNITY: full / SUPPLIER: minimal  |
| Layout            | Configurable                    | Auto: product count → layout type      |
| Holibob filtering | By partner ID                   | By supplierId, productId, or discovery |
| Branding          | Full custom brand               | AI-generated (comprehensive or light)  |
| Paid traffic      | Full bidding engine             | OPPORTUNITY: yes / SUPPLIER: no        |
| SEO               | Full                            | OPPORTUNITY: full / SUPPLIER: basic    |

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

**Full Holibob docs**: `packages/holibob-api/CLAUDE.md` (methods, auth, GraphQL queries, pitfalls).

## Testing

- **Framework**: Vitest + React Testing Library + Playwright (E2E)
- **Coverage**: 65% thresholds (statements/functions/lines), 75% branches
- **Mocks**: next/navigation, next/headers, next/image in `test/setup.tsx`
- **Custom render**: `renderWithSite(component, site)` wraps in `SiteProvider`
- **E2E**: Booking flow, checkout in `booking-flow.e2e.test.ts`

## Where to Find Things

| Feature                       | File(s)                                                |
| ----------------------------- | ------------------------------------------------------ |
| Multi-tenant resolution       | `src/lib/tenant.ts` (getSiteFromHostname)              |
| Site context provider         | `src/lib/site-context.tsx` (useSite, useBrand, useSEO) |
| Middleware (cookies, headers) | `src/middleware.ts`                                    |
| Homepage                      | `src/app/page.tsx`                                     |
| Experience detail page        | `src/app/experiences/[slug]/page.tsx`                  |
| Blog detail page              | `src/app/blog/[slug]/page.tsx`                         |
| Destination pages             | `src/app/destinations/[slug]/page.tsx`                 |
| Category pages                | `src/app/categories/[slug]/page.tsx`                   |
| Sitemap generation            | `src/app/sitemap.ts`                                   |
| Booking API routes            | `src/app/api/booking/`                                 |
| Product API routes            | `src/app/api/products/`                                |
| Payment (Stripe)              | `src/app/api/payment/`                                 |
| Checkout flow                 | `src/app/checkout/[bookingId]/page.tsx`                |
| Root layout + brand CSS       | `src/app/layout.tsx`                                   |
| Image utilities               | `src/lib/image-utils.ts`                               |
| Structured data               | `src/components/seo/StructuredData.tsx`                |
| Brand CSS variables           | `src/lib/brand-css.ts` (generateBrandCSSVariables)     |
| Contact form notification     | `src/lib/email.ts` (sendContactNotification, Resend)   |

## Transactional Email (Resend)

Contact form submissions trigger a notification email via Resend in `src/lib/email.ts`.

- **Send is fire-and-forget and fail-soft**: failure to send never fails the request — the DB record + admin page are the source of truth
- **Reply-To is set to the customer's email**, so replying from your inbox replies to them directly
- **Required env vars** (skipped silently if any are missing):
  - `RESEND_API_KEY`
  - `RESEND_FROM_EMAIL` (e.g., `Holibob Creators <info@creators.holibob.tech>` — the domain MUST be verified in Resend)
  - `CONTACT_NOTIFICATION_EMAIL` (where notifications are delivered)
- **Optional**: `ADMIN_BASE_URL` for the "view in admin" link (defaults to `https://admin.experiencess.com`)
- New transactional email types should reuse this module — don't add a second Resend client

## Testing Commands

```bash
npm run test --workspace=@experience-marketplace/website-platform           # Unit tests
npm run test:coverage --workspace=@experience-marketplace/website-platform   # With coverage
npm run test:e2e --workspace=@experience-marketplace/website-platform        # Playwright E2E
```

Test environment is `jsdom`. Mocks for next/navigation, next/headers in `src/test/setup.tsx`.

## Caching & Error Handling

- **ISR**: All pages use `revalidate = 300` (5 min). No `generateStaticParams` — all pages are dynamically rendered then cached.
- **Error boundaries**: Root `error.tsx` and `experiences/[slug]/error.tsx` exist. No `global-error.tsx` — root layout errors are uncaught.
- **Graceful fallback**: Server components use try/catch → `return null` for non-critical sections. Data fetch failures render nothing rather than triggering error boundary.
- **Stripe webhook**: `api/payment/webhook` requires raw body — any middleware that parses the body will break signature verification.

## Middleware Details

- Reads `x-forwarded-host` first (Cloudflare/Heroku sets this), then falls back to `host`
- Sets `x-site-id` cookie/header but does NOT do a DB lookup — that happens later in `getSiteFromHostname()`
- `utm_params` cookie: `httpOnly: false` (client-side checkout reads it for attribution)
- `funnel_session` cookie: `httpOnly: true`, 30-min rolling TTL (reset on every request)
- AI referral detection: hardcoded list of 8 LLM platform referers, not configurable via env

## PlatformSettings (Feature Flags)

Singleton record with ID `'platform_settings_singleton'`. Workers check `isProcessingAllowed()` from `packages/jobs/src/services/pause-control.ts`. Fails open on DB error. Per-site pause (`site.autonomousProcessesPaused`) is separate from global pause.

## Common Pitfalls

1. Don't route experiences by human-readable slug — always product ID
2. Don't double-append site name to `title` field
3. Don't forget slug prefixes in DB lookups
4. Don't hardcode Holibob partner ID — use `site.holibobPartnerId`
5. Don't access site config without `getSiteFromHostname()`
6. Schema.org `BlogPosting` MUST have `image` — use fallback chain
7. New page type? Update sitemap.ts slug handling AND this CLAUDE.md
8. Stripe webhook body must not be pre-parsed — use `request.text()` for raw body
9. No `global-error.tsx` — errors in root layout (e.g., brand CSS injection) are uncaught
10. **Booking commit DB write is fail-open** — if Postgres is at connection limit, `/api/booking/commit` returns 200 but the `Booking` record is never saved. A `BookingFunnelEvent` with `errorCode: DB_SAVE_FAILED` is the only trace. Cross-reference Holibob bookings against our DB if revenue doesn't reconcile.
