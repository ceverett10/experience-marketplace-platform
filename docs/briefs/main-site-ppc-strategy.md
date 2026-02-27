# Brief: Main Site PPC Campaign Strategy & Destination Pages

## Background

The Holibob Engineering Brief (v1.0, Feb 2026) identifies that PPC traffic should NOT go to supplier microsites (800+ nearly-identical `*.experiencess.com` subdomains). Instead, PPC traffic should route to **destination/category pages on the main site or branded sites** that aggregate ALL suppliers for a given destination.

A separate agent is handling the supplier microsite quick wins (removing competitor cross-links, stripping PPC nav, etc.). This brief covers the **longer-term strategic work**.

### Source Document

`/Users/user/Downloads/Holibob_Engineering_Brief.docx` — Sections 2.3, 2.4, 3, 4, and 5.

---

## Workstream 1: Multi-Supplier Destination Pages

### Problem

Someone searching "things to do in amsterdam" lands on `360-amsterdam-tours.experiencess.com` — a single supplier they've never heard of with only 24 experiences. They should see ALL Amsterdam experiences from ALL suppliers.

### What Exists

- Destination guide pages exist at `apps/website-platform/src/app/destinations/[slug]/page.tsx`
- But they show only products from ONE supplier (scoped to microsite context)
- Category pages exist at `apps/website-platform/src/app/categories/[slug]/page.tsx`
- `Site.primaryCurrency` field exists in schema
- Holibob API can aggregate products by destination (uses `freeText` filter)

### What Needs Building

1. **Destination landing pages on branded sites** (e.g., `london-food-tours.com/destinations/london`) or a central domain that aggregate ALL suppliers for a destination
   - URL: `/{domain}/destinations/{destination}` or `{destination}.experiencess.com`
   - H1: "Things to Do in {Destination}" (matches search query exactly)
   - Content: All experiences from ALL suppliers, sorted by popularity/rating
   - Filters: Category, Price, Duration, Rating, Date availability
   - Above fold: destination hero + H1 + count + date picker + first 3 cards
   - NO competitor cross-links, NO exit links on PPC variants
   - Structured data: FAQ schema, AggregateRating, Product schema

2. **Category landing pages nested under destinations**
   - URL: `/{domain}/destinations/{destination}/{category}`
   - H1: "{Category} in {Destination}" (e.g., "Food Tours in Amsterdam")
   - Cross-category links: "Also in Amsterdam: Walking Tours, Boat Trips, Museums"

### Architecture Decision

The current architecture is: 1 microsite = 1 supplier = 1 Holibob partner. To aggregate ALL suppliers for a destination, options are:

- **Option A**: Create destination pages on existing branded sites (harry-potter-tours.com, london-food-tours.com) that query Holibob without supplier filtering
- **Option B**: Create a new central domain/site that aggregates all suppliers
- **Option C**: Use `experiencess.com` as the parent brand for aggregated destination pages

### Key Files

- `apps/website-platform/src/app/destinations/[slug]/page.tsx` — existing destination page (single-supplier)
- `apps/website-platform/src/lib/tenant.ts` — site resolution from hostname
- `packages/holibob-api/src/client/index.ts` — API client (can query by destination without supplier filter)
- `apps/website-platform/src/components/microsite/CatalogHomepage.tsx` — existing catalog template

---

## Workstream 2: Brand Architecture

### Problem

800+ supplier microsites on `experiencess.com` subdomains are nearly identical and create trust deficits. The brief proposes 10-15 consumer brands by traveler intent instead.

### What Exists

- 17 branded sites already live (harry-potter-tours.com, london-food-tours.com, etc.)
- 36 demand-gen microsites (auto-generated)
- 39,115 supplier microsites (12,366 active)

### What's Proposed (Brief Section 2.4.2)

| Brand Concept              | Segment                | Status                                |
| -------------------------- | ---------------------- | ------------------------------------- |
| Harry Potter Tours         | Attraction-specific    | LIVE                                  |
| London Food Tours          | City + Category        | LIVE                                  |
| [Adventure Brand]          | Adventure travelers    | TO BUILD                              |
| [Food & Drink Brand]       | Culinary travelers     | TO BUILD                              |
| [City Explorer Brand]      | Urban sightseers       | TO BUILD                              |
| [Water Activities Brand]   | Water/boat enthusiasts | TO BUILD                              |
| [Transfer Brand]           | Practical travelers    | TO BUILD                              |
| [Attraction Tickets Brand] | Ticket buyers          | Partially live (museum tickets sites) |

### Key Decision

Supplier microsites should continue for **organic SEO** but should NOT be PPC landing pages. PPC traffic should route to destination/category pages or branded sites.

---

## Workstream 3: Ad Campaign Landing URL Routing

### Problem

Both Meta and Google ad campaigns currently route to supplier microsites. The brief explicitly states (Sections 3.3 and 4.4 — marked CRITICAL):

> "Meta/Google ad landing URLs must point to the NEW destination/category pages, NOT supplier microsites."

### What Exists

- `packages/jobs/src/services/landing-page-routing.ts` — determines landing page URL for each ad
- `packages/jobs/src/services/bidding-engine.ts` — campaign planning and bid calculation
- Meta consolidation script: `scripts/migrate-meta-consolidated.js` (PR #84 merged)
- Google restructure script: `packages/jobs/src/scripts/google-ads-restructure.ts` (branch `feat/google-ads-restructure`)

### What Needs Changing

1. Update `landing-page-routing.ts` to route PPC traffic to destination/category pages instead of supplier microsites
2. Update ad creative URLs in both Meta and Google campaign creation
3. Ensure UTM parameters carry through for attribution

### Key Files

- `packages/jobs/src/services/landing-page-routing.ts`
- `packages/jobs/src/services/bidding-engine.ts`
- `packages/jobs/src/config/paid-traffic.ts`

---

## Workstream 4: Bid Strategy Phasing

### Problem

Current bid strategies have zero conversions to optimize against.

### Brief's Phased Approach (Section 4.3)

| Phase                  | Trigger                            | Strategy                         | Timeline   |
| ---------------------- | ---------------------------------- | -------------------------------- | ---------- |
| 1: Data Collection     | Launch                             | Maximize Clicks with CPC cap     | Weeks 1-4  |
| 2: Conversion Learning | First conversions verified         | Maximize Conversions (no target) | Weeks 4-8  |
| 3: Efficiency          | 30+ conversions in 30 days         | Target CPA (1.5x actual)         | Weeks 8-12 |
| 4: ROAS                | 50+ conversions + revenue tracking | Target ROAS                      | Week 12+   |

### What Exists

- Google restructure script uses `MAXIMIZE_CLICKS` with CPC caps (Phase 1) ✓
- Meta consolidation uses `LOWEST_COST_WITH_MIN_ROAS` (2.0x floor) — may be too aggressive for Phase 1
- `.migrateToSmartBidding()` exists in Google client but no automated trigger
- No monitoring system to detect when phase transition thresholds are met

### What Needs Building

- Automated phase transition detection (conversion count thresholds)
- Dashboard or alert when campaigns reach Phase 2/3/4 readiness
- Consider starting Meta on `LOWEST_COST_WITHOUT_CAP` initially (like Tier 2), then graduating to ROAS

---

## Workstream 5: Content Generation for Ads

### What Exists (Largely Complete)

- Google RSA headline templates with pin positions ✓
- Meta ad copy templates via Claude Haiku ✓
- Keyword generation rules ✓
- Negative keyword lists (280+ terms, 6 categories) ✓
- Ad coherence checking ✓

### What Needs Work

- Ad copy should reference destination pages, not supplier pages
- Meta ad primary text needs to aggregate product counts across ALL suppliers for a destination (not just one supplier's 24 products)
- Template: "Discover {total_count} experiences in {destination}" where total_count = all suppliers combined

---

## Conversion Tracking (Mostly Done)

### What Exists

- Google Ads conversion tag + GA4 events ✓ (85%)
- Meta Pixel + CAPI with deduplication ✓ (90%)
- Click ID capture (gclid/fbclid) in middleware ✓
- Server-side offline conversion uploads every 2 hours ✓
- BookingFunnelEvent tracking in DB ✓

### Gaps

- No GTM container (uses gtag directly)
- 2-hour batch delay on conversion uploads (no real-time push)
- No conversion monitoring dashboard

---

## Dependencies

| Dependency                       | Blocks                 | Notes                                                                                 |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Destination pages built          | Ad landing URL routing | Can't route ads to pages that don't exist                                             |
| Holibob API multi-supplier query | Destination pages      | Need to verify API can return ALL suppliers for a destination without partner scoping |
| Brand architecture decisions     | New branded sites      | Which 10-15 brands? Domain purchases?                                                 |
| Conversion tracking verified     | Bid strategy Phase 2+  | Need confirmed conversions before switching from Maximize Clicks                      |

---

## Suggested Sequence

1. **Verify Holibob API** can return multi-supplier results for a destination (quick test)
2. **Build destination landing pages** on existing branded sites first (lowest risk)
3. **Update landing-page-routing.ts** to route PPC to destination pages
4. **Update ad campaigns** to use new landing URLs
5. **Monitor conversion data** for Phase 2 bid strategy transition
6. **Build additional branded sites** as data shows which categories convert
