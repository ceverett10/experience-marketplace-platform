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

## API-Specific Behaviors

- **`discoverProducts`** uses `seenProductIdList` for pagination (NOT page/pageSize). Pass previously seen IDs to get next batch.
- **`getProductsByProvider`** uses traditional page/pageSize (max 5000/page). Use this for microsites and bulk sync.
- **`getProviders()`** requires elevated API permissions — use `getAllProvidersWithCounts()` instead (via `providerTree` query).
- **Partial GraphQL errors**: Holibob returns errors alongside valid data (e.g., null `guidePriceFormattedText` on free products). The client silently uses partial data and logs a warning — this is intentional.
- **Date format**: API requires full ISO 8601 DateTime, not date strings. Client's `toDateTimeString()` handles conversion.
- **Currency**: Set at client construction via `x-holibob-currency` header. Default is GBP — pass `currency` in config for non-GBP sites.

## Common Pitfalls

1. Product IDs are for routing (`/experiences/{id}`), NOT human-readable slugs
2. `getProductsByProvider` with `placeName` filter validates city products exist
3. Bulk sync (`getAllProducts`) paginates at 500 — can take hours for full catalog
4. Questions come at 3 levels — must iterate and answer all before commit
5. `getProviders()` fails with permission error — always use `getAllProvidersWithCounts()`
6. Don't use `discoverProducts` for bulk sync — it requires `seenProductIdList` pagination
