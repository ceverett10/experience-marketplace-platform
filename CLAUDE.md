# Experience Marketplace Platform

## Required Checks Before Committing

**MANDATORY**: Run these before every commit. Do not skip or use `--no-verify`.

```bash
npm run lint          # ESLint across all workspaces
npm run typecheck     # TypeScript type checking
npm run format:check  # Prettier formatting validation
```

If any fail, fix the issues before committing. Use `npm run lint:fix` and `npm run format` for auto-fixes.

After fixing a lint/format issue, always run the full check again — auto-fixes can introduce new issues.

## Required Checks Before Pushing

Run tests for any workspace you changed:

```bash
npm run test --workspace=@experience-marketplace/website-platform
npm run test --workspace=@experience-marketplace/jobs
# etc.
```

Or run all tests: `npm run test`

## Branching & PRs

- **Main branch**: `main` (production). All PRs target `main`.
- **Branch naming**: `fix/short-description`, `feat/short-description`
- **No develop branch** — trunk-based development.
- Always branch from latest `main`: `git checkout main && git pull && git checkout -b fix/my-fix`
- Keep branches short-lived. One concern per branch.
- Rebase on `main` before pushing if your branch is behind.

### Merging PRs (Auto-Merge Workflow)

Branch protection requires PRs to be up-to-date with `main` before merging. To avoid
babysitting CI after every rebase, **always use auto-merge**:

```bash
# After creating the PR, enable auto-merge immediately:
gh pr merge --auto --squash

# If the branch is behind main, update it:
gh pr merge --auto --squash && git fetch origin main && git rebase origin/main && git push --force-with-lease
```

- `--auto` queues the merge — GitHub merges automatically once CI passes
- `--squash` keeps `main` history clean (one commit per PR)
- `--force-with-lease` is safe — it refuses to push if someone else pushed to your branch
- After enabling auto-merge, you do NOT need to wait for CI — move on to the next task
- If CI fails after rebase, fix the issue, push again, and auto-merge stays queued

## Commit Messages

- Imperative mood: "Fix bug", "Add feature", not "Fixed" or "Adds"
- Concise subject line (50-60 chars)
- Explain what and why, not how
- Always include: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Code Standards

### TypeScript

- Strict mode enabled (`strict: true`, `noUncheckedIndexedAccess: true`)
- Prefer `type` imports: `import type { Foo } from './bar'`
- Unused variables must be prefixed with `_`
- No `console.log` — use `console.warn`, `console.error`, or `console.info`

### Formatting (Prettier)

- 100 char line width
- 2-space indentation
- Single quotes
- Trailing commas (ES5)
- LF line endings

### Testing

- Framework: Vitest
- Test files: `*.test.ts` / `*.test.tsx`
- E2E: Playwright (website-platform only)
- Coverage thresholds vary by workspace (check each `vitest.config.ts`):
  - `ui-components`, `holibob-api`: 80%
  - `website-platform`: 65%
  - `database`: 35%
  - `admin`: 13%
  - Others: 20% (default)
- When writing tests, match the workspace's configured threshold, not a blanket 80%

### Existing Code Debt (Do Not Replicate)

The codebase has legacy `console.log` usage (~1700 occurrences) and `as any` casts (~400).
These exist as tech debt — **do not add new ones**. Follow the rules:

- Use `console.info`/`console.warn`/`console.error` instead of `console.log`
- Type properly instead of `as any` — only use when Prisma enum casts require it (documented friction point)

## Monorepo Structure

```
apps/
  website-platform/   # Multi-tenant consumer storefronts (Next.js 14, port 3000)
  admin/              # Admin dashboard (Next.js 14, port 3001)
  demand-generation/  # SEO & content generation service
  proxy/              # Heroku routing proxy (Express)

packages/
  shared/             # Types, utilities, constants, Zod schemas
  database/           # Prisma schema & client
  holibob-api/        # GraphQL client for Holibob product API
  tickitto-api/       # REST client for Tickitto events API
  ui-components/      # Shared React components (Tailwind)
  content-engine/     # Claude API-powered content generation
  jobs/               # Background job queue (BullMQ/Redis)
  mcp-server/         # MCP server for Holibob discovery
```

### Workspace Dependencies

- `website-platform` depends on: shared, database, holibob-api, tickitto-api, ui-components
- `admin` depends on: holibob-api, shared, ui-components
- `demand-generation` depends on: database, jobs, shared, holibob-api, content-engine
- `jobs` depends on: content-engine, database, holibob-api, shared
- `content-engine` depends on: shared

When changing a package, check downstream consumers for breakage.

### Change Ripple Map (If You Change X, Also Update Y)

**Prisma schema** (`packages/database/prisma/schema.prisma`):

- Add enum value → update `packages/jobs/src/types/index.ts` (JOB_TYPE_TO_QUEUE, payload types)
- Add PageType → update 17+ files that switch/filter on page type (see `database/CLAUDE.md`)
- Add/change model → run `db:generate`, then `npm run typecheck` across all workspaces
- Add JobType → add to JOB_TYPE_TO_QUEUE + create worker handler + add payload type

**Shared package** (`packages/shared/`):

- Change types → affects ALL workspaces. Run full `npm run typecheck`
- Change `CATEGORY_DISPLAY_MAP` → affects content generation, microsite creation, keyword research
- Change utilities → verify behavior in jobs, website-platform, admin

**Bidding engine** (`packages/jobs/src/services/bidding-engine.ts`):

- Always check `landing-page-routing.ts` — they import from each other
- Also check `config/paid-traffic.ts`, `workers/ads.ts`, `google-ads-client.ts`

**Content generation** (content-engine or jobs content workers):

- Check `daily-content-generator.ts`, `content-optimizer.ts`, `workers/content.ts` together

### Keeping CLAUDE.md Files Current

When you make changes that affect patterns, conventions, or architecture documented in any
CLAUDE.md file, **update the relevant CLAUDE.md in the same PR**. Examples:

- Add a new queue → update `packages/jobs/CLAUDE.md`
- Add a new page type → update `packages/database/CLAUDE.md` and `apps/website-platform/CLAUDE.md`
- Change URL routing → update `apps/website-platform/CLAUDE.md`
- Add a new API route → update `apps/admin/CLAUDE.md`
- Hit a new bug or gotcha → add to "Common Pitfalls" in the relevant file

This is not optional — stale docs cause agents to repeat past mistakes.

## Architecture Patterns

### Multi-Tenant Sites

- Resolved via hostname: `getSiteFromHostname(hostname)` in `apps/website-platform/src/lib/tenant.ts`
- Returns: `id`, `name`, `brand`, `seoConfig`, `homepageConfig`, `micrositeContext`

### Experience URLs (CRITICAL)

- URL format: `/experiences/{holibobProductId}`
- The `[slug]` param is passed directly to `client.getProduct(id)` — it MUST be a Holibob product ID
- Human-readable slugs (from `product.slug` in Prisma) are for SEO/sitemap only, NOT for routing
- When mapping products for links, always use `product.holibobProductId`, not `product.slug`

### Slug Prefix Convention (Sitemap)

Page types store slugs WITH their route prefix in the database:

- BLOG: slug = `blog/my-post` -> URL `/{slug}`
- LANDING: slug = `destinations/city-name` -> URL `/{slug}`
- FAQ: slug = `faq/topic` -> URL `/{slug}`
- CATEGORY: slug = `food-tours` (no prefix) -> URL `/categories/{slug}`
- PRODUCT: slug = product ID (no prefix) -> URL `/experiences/{slug}`

### Meta Title Template

Layout.tsx uses `titleTemplate: '%s | Site Name'`. Pages must NOT manually append `| ${site.name}` to their `title` field. Only add it to `openGraph.title` and `twitter.title`.

### Holibob API Client

```typescript
import { createHolibobClient } from '@experience-marketplace/holibob-api';
// Env vars: HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY, HOLIBOB_API_SECRET
```

### Database

- ORM: Prisma
- Generate client: `npm run db:generate --workspace=@experience-marketplace/database`
- Migrations: `npm run db:migrate --workspace=@experience-marketplace/database`

## CI/CD Pipeline

CI runs on all PRs to `main`:

1. **Lint & Type Check** — ESLint, TypeScript, Prettier
2. **Test** — Unit tests across all workspaces
3. **E2E** — Playwright (website-platform)
4. **Build** — Full production build
5. **Security** — npm audit

Deploy is automatic on `main` after CI passes (Heroku).

**Build order matters**: packages must build before apps (`npm run build:packages` then `build:apps`).
CI generates Prisma client first (`npm run db:generate` with dummy DATABASE_URL).

### Quick Test Commands

```bash
# Test a specific workspace
npm run test --workspace=@experience-marketplace/jobs
npm run test --workspace=@experience-marketplace/website-platform

# Test with coverage
npm run test:coverage --workspace=@experience-marketplace/website-platform

# E2E (website-platform only)
npm run test:e2e --workspace=@experience-marketplace/website-platform

# All checks (what CI runs)
npm run lint && npm run typecheck && npm run format:check && npm run test
```

### Common CI Failures

1. **Prettier formatting** — Run `npm run format` to auto-fix
2. **Type errors after schema change** — Run `npm run db:generate` first
3. **`console.log` violations** — Replace with `console.info`, `console.warn`, or `console.error`
4. **Unused imports** — Remove them or prefix with `_`
5. **Missing `type` keyword** — Use `import type { Foo }` for type-only imports
6. **Build fails with "module not found"** — Packages must build before apps

## Heroku Runtime Constraints

- **Memory**: Standard-2X dynos (1GB). All worker concurrency reduced to 1 to prevent R15 OOM kills. Do not increase without memory profiling.
- **Postgres**: Heroku essential-1, 20 total connections. Prisma pool capped at 4/process (auto-appended to DATABASE_URL). With multiple dynos, connections fill fast.
- **HTTP timeout**: 30 seconds — long Holibob API calls can cascade to 503s
- **Scheduler**: `ENABLE_SCHEDULER=true` on `worker-infra` dyno ONLY. Multiple dynos running scheduler = duplicate cron jobs.
- **Autonomous roadmap processor**: Permanently disabled (commented out in `demand-generation/src/index.ts`). Do not re-enable without memory profiling.
- **Release phase**: `prisma migrate deploy` runs automatically before every deploy. Failed migration = failed deploy.

### Dyno Layout (Procfile)

| Dyno           | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `web`          | Proxy (8080) → website (3000) + admin (3001) + MCP (3100)                |
| `worker`       | Generic demand-generation orchestrator                                   |
| `worker-fast`  | Content, SEO, analytics, social, microsites                              |
| `worker-heavy` | Long-running audits                                                      |
| `worker-infra` | Site/domain/GSC + **scheduler** (only dyno with `ENABLE_SCHEDULER=true`) |

### Redis

- TLS auto-detected via `rediss://` scheme (`rejectUnauthorized: false` for Heroku self-signed certs)
- BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false` — do not change
- Event streams capped at 50 entries to prevent Redis OOM
- Dedup keys: 2h TTL — re-queuing a killed job within 2h is silently dropped
- Daily budgets: fail-open (allow through if Redis unavailable)

### Silent Failure Modes

- Budget exceeded → returns fake job ID (`budget-exceeded:...`), not an error
- Dedup hit → silently dropped with warning log only
- `isProcessingAllowed()` → fails open on DB error (allows work through)
- Server component try/catch → `return null` for non-critical sections (renders nothing)

## What NOT To Do

- Do not use `location_types` in Meta Ads targeting (deprecated)
- Do not use Heroku ACM with Cloudflare domains (Cloudflare handles SSL)
- Do not add Heroku domains without the SNI endpoint ID
- Do not commit `.env` files or secrets
- Do not use `git push --force` on `main`
- Do not skip pre-commit hooks with `--no-verify`
- Do not increase worker concurrency above 1 (R15 OOM risk)
- Do not set `ENABLE_SCHEDULER=true` on more than one dyno
- Do not re-enable the autonomous roadmap processor
