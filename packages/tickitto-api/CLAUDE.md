# Tickitto API Client (`@experience-marketplace/tickitto-api`)

REST client for Tickitto event ticketing API. Alternative to Holibob for live events/concerts.

## Client Setup

```typescript
import { createTickittoClient } from '@experience-marketplace/tickitto-api';
const client = createTickittoClient({ apiUrl, apiKey, timeout: 30000, retries: 3 });
```

## Key Methods

- `searchEvents(params)` — Rich filtering: dates, price, categories, cities, performers, venues
- `getEvent(eventId, currency)` — Single event detail
- `autocomplete(text)` — Real-time search suggestions
- `getAvailabilityWidget(eventId)` — Returns session_id + view_url for iframe embed
- `getVenues(params)` / `getVenue(venueId)` — Venue data
- `getMetadata()` — Available locations and categories

## Authentication

Header-based: `key` header with API key.

## Error Handling

- Native `fetch` with AbortController for timeout
- 4xx: No retry
- 5xx: Exponential backoff (2^attempt \* 1000ms)
- Reads `x-total-count` from response headers for pagination
