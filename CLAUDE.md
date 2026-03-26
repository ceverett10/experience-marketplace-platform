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

### Cleanup After Merging (MANDATORY)

After your PR is merged, clean up:

1. **Delete your local feature branch**: `git checkout main && git branch -d feat/my-fix`
2. **Never leave temp scripts** with hardcoded credentials (DB URLs, Redis URLs, API keys).
   Delete any throwaway scripts before ending your session.
3. **Prune stale branches periodically**: If you notice >20 local branches, run:
   ```bash
   git fetch origin --prune
   git branch --merged origin/main | grep -v '^\*' | grep -v 'main' | xargs git branch -d
   ```

### Pre-Push Coordination (MANDATORY)

Before pushing a branch or creating a PR, check for other open PRs that may conflict:

```bash
# 1. List open PRs and their changed files
gh pr list --state open --json number,title,headRefName,files --jq '.[] | "\(.number) \(.title) [\(.headRefName)]"'

# 2. For each open PR, check if it touches the same files you changed
gh pr diff <PR_NUMBER> --name-only

# 3. Compare against your changes
git diff --name-only origin/main...HEAD
```

**If there is overlap in changed files:**

- Read the other PR's changes: `gh pr diff <PR_NUMBER>`
- Determine if your changes are compatible or will conflict
- If the other PR is close to merging (CI passing, approved), wait for it to merge first, then rebase
- If both PRs modify the same functions/logic, coordinate: rebase on top of the other branch or adjust your approach to avoid conflicts

**If no overlap:** proceed normally — push and create your PR.

This prevents merge conflicts, wasted CI runs, and the rebase cycle.

### Merging PRs (Auto-Merge Workflow)

Branch protection requires PRs to be up-to-date with `main` before merging. To avoid
babysitting CI after every rebase, **always use auto-merge**:

```bash
# After creating the PR, enable auto-merge immediately:
gh pr merge --auto --squash
```

- `--auto` queues the merge — GitHub merges automatically once CI passes
- `--squash` keeps `main` history clean (one commit per PR)
- If CI fails after a push, fix the issue and push again — auto-merge stays queued

### Keeping a Branch Up-To-Date With main

**Prefer the GitHub API update over a local rebase** — it creates a merge commit without a force push, and auto-merge handles it cleanly:

```bash
# Option 1 (preferred): GitHub creates a merge commit — no force push needed
gh api repos/ceverett10/experience-marketplace-platform/pulls/<PR_NUMBER>/update-branch -X PUT

# Option 2 (use only if merge conflicts require manual resolution):
git fetch origin main && git rebase origin/main
# Resolve any conflicts (see below), then:
git push --force-with-lease
```

Use Option 2 only when Option 1 fails due to conflicts that need manual resolution.

### Resolving Rebase Conflicts

**Lockfile conflicts** (`package-lock.json`) — do not manually merge these:

```bash
git checkout --theirs package-lock.json   # take main's version
npm install                                # regenerate from package.json
git add package-lock.json
git rebase --continue
```

**Prisma migration conflicts** (`packages/database/prisma/migrations/`) — high risk:

- Never delete or rename an existing migration file — it will break `prisma migrate deploy` in production
- If two branches added migrations: keep BOTH migration files, ensure they have unique timestamps
- Rename your branch's migration directory to have a later timestamp than main's latest if needed
- Run `npm run db:generate --workspace=@experience-marketplace/database` after resolving
- Test locally with `npm run db:migrate` before pushing

**Source code conflicts** — standard resolution: read both changes, merge intent not just text, run `npm run typecheck` after.

### PR Review Until Merge (MANDATORY)

**Do not stop working on a PR until it has merged.** After creating a PR with auto-merge:

1. Monitor CI checks until all pass (poll `gh pr view` every 60-90s)
2. If any check fails, investigate immediately — read `gh run view --log-failed`, fix the issue, push
3. If the branch is BEHIND main, update it (`gh api .../update-branch` or rebase + push)
4. Once all checks pass and the PR is still not merged (e.g., branch protection), update the branch
5. Only move on to the next task after confirming `"state": "MERGED"` in `gh pr view`

This prevents stale PRs, undetected CI failures, and merge conflicts from piling up.
The cost of watching a PR merge (~5 minutes) is far less than debugging a stale branch later.

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

**MANDATORY**: Update the relevant CLAUDE.md **in the same PR as your code change**. Do not defer
this to a follow-up. Stale docs are the primary cause of agents repeating past mistakes.

CLAUDE.md updates are required when you:

- Add a new queue, job type, or worker → update `packages/jobs/CLAUDE.md`
- Add or rename a PageType → update `packages/database/CLAUDE.md` (the explicit file list) and `packages/jobs/CLAUDE.md`
- Change URL routing or slug conventions → update `apps/website-platform/CLAUDE.md`
- Add or change an admin API route → update `apps/admin/CLAUDE.md` (HTTP method, params, response shape)
- Change which microsites get content generated → update `packages/jobs/CLAUDE.md` blog generation table
- Hit a new bug, gotcha, or silent failure → add to "Common Pitfalls" in the relevant file
- Change an architectural pattern → update both the package CLAUDE.md and the root CLAUDE.md if referenced there
- Discover that existing docs are wrong — fix them in the same PR, don't leave known-incorrect docs

**Do not** require agents to review CLAUDE.md after every deployment — that produces superficial
updates. The rule is: the engineer (or agent) who makes the change owns the doc update, at the
time of the change, not after deployment.

## Business Model & Strategy

This is a **multi-tenant experience marketplace** — white-label storefronts selling tours, activities,
and attractions sourced from Holibob (and Tickitto for events). Revenue comes from commission on
bookings (default 18%). The platform automates everything: site creation, branding, content, SEO,
and paid traffic.

### Three-Tier Site Hierarchy

1. **Main Sites** — Custom-domain storefronts (e.g., `london-tours.com`, `food-tour-guide.com`).
   Full branding, SEO, content generation, paid traffic. Each has a `Site` record with custom
   `holibobPartnerId`, domain(s), and complete page set. These are the primary revenue drivers.

2. **Opportunity Microsites** — SEO-driven subdomains on `experiencess.com`
   (e.g., `kayaking-barcelona.experiencess.com`). Created from `SEOOpportunity` records when keyword
   research identifies high-value search terms. Full content generation (homepage, about, blog, FAQ,
   experiences), MARKETPLACE layout, comprehensive AI-generated branding. Each gets content refreshed
   every ~20 days (5% daily rotation).

3. **Supplier/Product Microsites** — Lightweight subdomains on `experiencess.com`
   (e.g., `adventure-co.experiencess.com`). Created from supplier or product data. Minimal content
   (homepage, about, experiences), lightweight branding. Layout auto-determined by product count:
   1 = PRODUCT_SPOTLIGHT, 2-50 = CATALOG, 50+ = MARKETPLACE.

**Parent domain** (`experiencess.com`) serves as the network hub and microsite namespace.

### Traffic Strategy: Paid + Organic Working Together

**Paid traffic** (Google Search + Meta Ads):

- Bidding engine discovers keywords → AI evaluates quality → scores profitability → creates campaigns
- Google uses STAG pattern (Single Theme Ad Groups) with phrase-match keywords and RSAs
- Meta uses consolidated CBO campaigns grouped by activity category
- Landing pages routed to the most relevant page type (blog > collection > destination > category)
- Profitability model: `maxCPC = (AOV × CVR × commission) / targetROAS`

**Organic traffic** (SEO):

- Daily AI content generation: blogs, destination pages, FAQ hubs, comparison pages, local guides
- GSC integration syncs every 6h — identifies underperforming pages for refresh
- Meta title maintenance ensures titles stay within 30-60 chars
- Structured data (Schema.org) on every indexable page
- Internal linking and cross-site linking between main sites and microsites

**The flywheel**: Paid traffic validates keywords → high-performing keywords get organic content →
organic content reduces paid dependency → freed budget tests new keywords.

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

**Holibob docs** (read these before working on product/booking features):

- `packages/holibob-api/CLAUDE.md` — 9-step booking flow, methods, auth, error handling, pitfalls
- `packages/holibob-api/src/client/index.ts` — Client class with all methods
- `packages/holibob-api/src/queries/index.ts` — All 56+ GraphQL queries/mutations
- `packages/holibob-api/src/types/index.ts` — Zod schemas for all API types
- `packages/mcp-server/CLAUDE.md` — MCP server tools for AI-assisted booking
- `docs/plans/campaign-pipeline-optimization.md` — How Holibob products feed the ad pipeline

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
- **Postgres**: Heroku essential-1, 25 total connections. Prisma pool capped at 4/process (auto-appended to DATABASE_URL). With multiple dynos, connections fill fast. Connection exhaustion blocks release phase (`prisma migrate deploy`) and any one-off `heroku run` dynos — fix with `heroku ps:restart` to free connections.
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
- **Booking DB write** (`/api/booking/commit`) → DB upsert is wrapped in try/catch; if Postgres is at connection limit, the booking commits in Holibob and Stripe charges the customer, but the record is never saved to our DB. The API still returns 200. A `BookingFunnelEvent` with `errorCode: DB_SAVE_FAILED` is logged but there is no active alert on it. **TODO**: build an alert on `DB_SAVE_FAILED` funnel events and a reconciliation job to auto-backfill missing bookings from Holibob.

### Database Backups

- **Automated daily backups**: scheduled at 02:00 UTC, 7-day retention (`heroku pg:backups:schedules`)
- **Continuous protection**: Heroku also maintains physical WAL-based backups (point-in-time recovery via Heroku support)
- **Manual capture**: `heroku pg:backups:capture --app holibob-experiences-demand-gen`
- **Restore**: `heroku pg:backups:restore <backup-id> DATABASE_URL --app holibob-experiences-demand-gen`
- If a deploy fails with "too many connections", run `heroku ps:restart` first to free connections, then `heroku releases:retry`

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
- Do not leave temp scripts with hardcoded credentials (DB URLs, Redis URLs, API keys) — delete before ending session
- Do not accumulate local branches — delete your feature branch after PR merge
