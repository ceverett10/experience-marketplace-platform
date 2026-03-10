# Admin Dashboard (`@experience-marketplace/admin`)

Internal management dashboard. Next.js 14, port 3001. In production, served via proxy at `/admin`.

## Authentication

- **Method**: AES-256-GCM encrypted stateless session cookies
- **Cookie**: `admin_session`, 24h TTL
- **Secret**: SHA-256 hash of `ADMIN_SESSION_SECRET` (fallback: `TOKEN_SECRET`, `HOLIBOB_API_SECRET`)
- **Middleware**: Validates session on all routes except `/login`, `/api/auth/*`, `/api/social/callback`
- **API routes**: Return 401 JSON on auth failure
- **Page routes**: Redirect to `/login` on auth failure

## basePath Configuration

- **Production**: `basePath = '/admin'` (served through Heroku proxy on port 8080)
- **Development**: `basePath = ''` (standalone on port 3001)
- `NEXT_PUBLIC_BASE_PATH` env var for client components

## Key Pages & API Routes

### Sites (`/sites`, `/api/sites`)

- CRUD for multi-tenant sites with status management
- Batch brand generation, archive/delete
- View metrics: visitors, bookings, revenue

### Domains (`/domains`, `/api/domains`)

- Full lifecycle: register → DNS → SSL → active
- Cloudflare Registrar integration + Heroku domain setup
- **CRITICAL**: All domain additions to Heroku MUST include SNI endpoint ID
- Actions: syncFromCloudflare, checkAvailability, createSiteFromDomain, syncHeroku

### Content (`/content`, `/api/content`)

- Browse/filter all pages by type and status
- Edit page titles and content body
- Queue `CONTENT_GENERATE` jobs for AI content
- Status mapping: DRAFT→pending, REVIEW→approved, PUBLISHED→published

### Operations (`/operations`, `/api/operations`)

- System health: healthy | degraded | critical
- Real-time BullMQ queue stats (11 queues)
- Circuit breaker status monitoring
- Database job metrics, throughput, recent failures
- Scheduled job listing with last-run status

### Bidding (`/operations/bidding`)

- Keyword management: Approve/Reject/Archive REVIEW keywords
- Campaign performance overview
- Budget allocation dashboard

### Microsites (`/microsites`, `/api/microsites`)

- Browse SUPPLIER, OPPORTUNITY, PRODUCT microsites
- Search by supplier name, keyword, product title
- View related data (product counts, cities, ratings)

### Settings (`/settings`, `/api/settings`)

- Autonomous mode control (feature flags, rate limits)
- Pause/resume all processes with reason logging
- Roadmap processor control

## API Conventions

- **Pagination**: `page` (default 1), `pageSize` (default 50, max 200)
- **Response**: `{ items: T[], pagination: { page, pageSize, totalCount, totalPages }, stats? }`
- **Filtering**: `search` (case-insensitive OR across fields), status/type enums
- **Parallel queries**: Use `Promise.all()` for independent DB calls
- **Error handling**: Zod validation → 400, not found → 404, catch-all → 500

## Common Pitfalls

1. API routes need session validation — check middleware coverage for new routes
2. Domain sync must include SNI endpoint (three code paths)
3. Content status mapping differs from DB enum names
4. Operations page depends on Redis — gracefully degrade when unavailable
