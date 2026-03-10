# Holibob API Client (`@experience-marketplace/holibob-api`)

GraphQL client for the Holibob product/booking API. Powers product discovery and the full booking flow.

## Client Setup

```typescript
import { createHolibobClient } from '@experience-marketplace/holibob-api';
const client = createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });
```

Env vars: `HOLIBOB_API_URL`, `HOLIBOB_PARTNER_ID`, `HOLIBOB_API_KEY`, `HOLIBOB_API_SECRET`

## 9-Step Look-to-Book Flow

1. `discoverProducts(filter)` — Product listing with filters
2. `getProduct(productId)` — Detail with reviews, languages, cancellation
3. `discoverAvailability(productId, dateFrom, dateTo)` — Date availability
4. `getAvailabilityList()` / `setAvailabilityOptions()` — Options (time slots, variants)
5. `getAvailabilityPricing()` / `setAvailabilityPricing()` — Participant pricing
6. `createBooking()` + `addAvailabilityToBooking()` — Create basket
7. `getBookingQuestions()` / `answerBookingQuestions()` — 3 levels: booking, availability, person
8. `getStripePaymentIntent()` — Payment
9. `commitBooking()` + `waitForConfirmation()` — Finalize

## Provider/Product Methods

- `getProviders()` — All providers (requires elevated permissions)
- `discoverProvidersFromProducts()` — Recommended discovery approach
- `getAllProvidersWithCounts()` — Most efficient, sorted by product count
- `getProductsByProvider(providerId, { placeName, categoryIds })` — Filtered by city
- `getAllProducts()` — Bulk sync at 500/page (used for product cache)

## Authentication

- Base: API key + Partner ID + Currency headers
- Optional: HMAC-SHA1 signature for elevated security
- Signature: `date + apiKey + method + path + body` → SHA1 → Base64

## Error Handling

- Partial GraphQL errors: Uses available data if response has both data and errors
- Client errors (4xx): No retry
- Server errors (5xx): Exponential backoff (default 3 retries)
- Detailed logging of GraphQL errors and variables

## GraphQL Queries

56+ queries/mutations in raw GraphQL (not generated). Full control over field selection.

## Common Pitfalls

1. Product IDs are for routing (`/experiences/{id}`), NOT human-readable slugs
2. `getProductsByProvider` with `placeName` filter validates city products exist
3. Bulk sync (`getAllProducts`) paginates at 500 — can take hours for full catalog
4. Questions come at 3 levels — must iterate and answer all before commit
