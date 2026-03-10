# Shared Package (`@experience-marketplace/shared`)

Types, utilities, constants, and Zod schemas shared across all workspaces.

## Key Exports

### Types

`StorefrontConfig`, `ContentItem`, `SEOOpportunity`, `AnalyticsEvent`, `Job`, `ApiResponse`, `PaginationParams`

### Utilities

- `slugify()`, `generateId()`, `truncate()`, `formatCurrency()`, `formatDate()`
- `delay()`, `withRetry()` (exponential backoff), `debounce()`
- `isDefined()`, `safeJsonParse()`, `groupBy()`, `extractDomain()`

### Category Mapping (197 entries)

- `CATEGORY_DISPLAY_MAP` — Maps raw Holibob categories to SEO-friendly display names
- `getCategoryDisplayName()`, `getBestCategory()`
- `LOW_VALUE_CATEGORIES` — Generic/private/other categories marked for deprioritization

### Zod Schemas

Type-safe validation for storefronts, content items, SEO opportunities, jobs, events.

## Usage Convention

```typescript
import type { StorefrontConfig } from '@experience-marketplace/shared';
import { slugify, formatCurrency } from '@experience-marketplace/shared';
```

Always use `type` imports for types (TypeScript strict mode requirement).

## Downstream Consumers

ALL workspaces depend on this package. Changes here affect everything — verify no breakage.
