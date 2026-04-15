# Experience Marketplace Platform

## Local Development Setup

### Prerequisites

- **Node.js 20+** and **npm 10+**
- **GitHub CLI** (`gh`) — required for the PR workflow
- **Heroku CLI** — required for deploys, logs, and env vars
- **Redis** — local instance or Heroku Redis URL for job queues
- **PostgreSQL** — local instance or Heroku Postgres URL

### First-Time Setup

```bash
# 1. Clone and install
git clone https://github.com/ceverett10/experience-marketplace-platform.git
cd experience-marketplace-platform
npm install

# 2. Authenticate CLIs
gh auth login                    # GitHub — select HTTPS, authenticate via browser
heroku login                     # Heroku — opens browser for auth

# 3. Pull environment variables from Heroku
#    Copy .env.example and fill with real values from Heroku:
cp .env.example .env
heroku config --app holibob-experiences-demand-gen --shell > .env.heroku
#    Then copy the values you need from .env.heroku into .env
#    IMPORTANT: Never commit .env files — they contain production secrets

# 4. Or pull individual values:
heroku config:get DATABASE_URL --app holibob-experiences-demand-gen
heroku config:get REDIS_URL --app holibob-experiences-demand-gen
heroku config:get ANTHROPIC_API_KEY --app holibob-experiences-demand-gen

# 5. Generate Prisma client (required before first run)
npm run db:generate --workspace=@experience-marketplace/database

# 6. Build packages (apps depend on built package output)
npm run build:packages

# 7. Start development servers
npm run dev                      # All workspaces concurrently
```

### Local Port Mapping

| Service           | Port | Command                         |
| ----------------- | ---- | ------------------------------- |
| Website Platform  | 3000 | `npm run dev` (included)        |
| Admin Dashboard   | 3001 | `npm run dev` (included)        |
| MCP Server        | 3100 | `npm run dev` (included)        |
| Proxy (prod only) | 8080 | Not used locally                |
| Redis             | 6379 | Local Redis or Heroku Redis URL |
| PostgreSQL        | 5432 | Local Postgres or Heroku DB URL |

### Running Against Heroku Database Locally

For scripts that need the production database (migrations, data fixes):

```bash
# Prefix any command with DATABASE_URL from Heroku:
DATABASE_URL=$(heroku config:get DATABASE_URL --app holibob-experiences-demand-gen) \
  npx tsx packages/jobs/src/scripts/your-script.ts

# Run Prisma Studio against production (read-only inspection):
DATABASE_URL=$(heroku config:get DATABASE_URL --app holibob-experiences-demand-gen) \
  npx prisma studio --schema packages/database/prisma/schema.prisma
```

**Warning**: Scripts run against production DB affect live data. Always use `--dry-run` first
when available.

### Heroku App & CLI Reference

The production app is **`holibob-experiences-demand-gen`** (EU region). Common commands:

```bash
# View recent deploys and their status
heroku releases --app holibob-experiences-demand-gen

# View release logs (e.g., migration output)
heroku releases:output v1234 --app holibob-experiences-demand-gen

# Stream live logs
heroku logs --tail --app holibob-experiences-demand-gen

# Filter logs by dyno
heroku logs --tail --dyno worker-fast --app holibob-experiences-demand-gen

# Restart dynos (fixes connection exhaustion)
heroku ps:restart --app holibob-experiences-demand-gen

# Retry a failed release (e.g., after fixing a migration)
heroku releases:retry --app holibob-experiences-demand-gen

# Run a one-off script on Heroku
heroku run "npx tsx packages/jobs/src/scripts/your-script.ts" --app holibob-experiences-demand-gen

# Get all config vars
heroku config --app holibob-experiences-demand-gen
```

### GitHub CLI Reference

The `gh` CLI is required for the PR workflow documented below. Common commands:

```bash
# List open PRs
gh pr list --state open

# Check PR status and CI results
gh pr view <PR_NUMBER>

# View failed CI logs
gh run view --log-failed

# Create PR with auto-merge
gh pr create --title "..." --body "..."
gh pr merge --auto --squash

# Update a PR branch with main (no force push needed)
gh api repos/ceverett10/experience-marketplace-platform/pulls/<PR_NUMBER>/update-branch -X PUT
```

### Writing Prisma Migrations

Heroku Postgres essential plans do not support shadow databases, so `prisma migrate dev`
will fail against the production DB. Instead, write migrations by hand:

1. Create directory: `packages/database/prisma/migrations/<timestamp>_<name>/migration.sql`
2. Write the SQL manually
3. **Check `@@map` directives** on every model you reference — if a model has `@@map("table_name")`,
   use `"table_name"` in SQL. If no `@@map`, Prisma uses the PascalCase model name (e.g., `"Site"`)
4. The release phase runs `prisma migrate deploy` automatically on every Heroku deploy
5. If a migration fails in production, mark it as rolled back before retrying:
   ```bash
   DATABASE_URL=$(heroku config:get DATABASE_URL --app holibob-experiences-demand-gen) \
     npx prisma migrate resolve --rolled-back <migration_name> \
     --schema packages/database/prisma/schema.prisma
   ```

**Current table name mapping** (models with `@@map`):

| Model                      | Table Name                      |
| -------------------------- | ------------------------------- |
| PlatformSettings           | `platform_settings`             |
| AdminUser                  | `admin_users`                   |
| AdminAuditLog              | `admin_audit_logs`              |
| Partner                    | `partners`                      |
| McpApiKey                  | `mcp_api_keys`                  |
| SiteAnalyticsSnapshot      | `site_analytics_snapshots`      |
| ManualTask                 | `manual_tasks`                  |
| AdCampaign                 | `ad_campaigns`                  |
| AdDailyMetric              | `ad_daily_metrics`              |
| BiddingProfile             | `bidding_profiles`              |
| AdAlert                    | `ad_alerts`                     |
| TrendSnapshot              | `trend_snapshots`               |
| FocusedStrategyConfig      | `focused_strategy_configs`      |
| AdReviewReport             | `ad_review_reports`             |
| Supplier                   | `suppliers`                     |
| Product                    | `products`                      |
| MicrositeConfig            | `microsite_configs`             |
| MicrositeAnalyticsSnapshot | `microsite_analytics_snapshots` |
| MicrositePerformanceMetric | `microsite_performance_metrics` |
| CuratedCollection          | `curated_collections`           |
| ProductCollection          | `product_collections`           |
| Subscriber                 | `subscribers`                   |
| ContactMessage             | `contact_messages`              |
| PrizeDraw                  | `prize_draws`                   |

Models **without** `@@map` use PascalCase table names: `"Site"`, `"Brand"`, `"Domain"`, `"Page"`,
`"Content"`, `"SEOOpportunity"`, `"Job"`, `"Booking"`, `"BookingFunnelEvent"`,
`"PerformanceMetric"`, `"ABTest"`, `"ABTestVariant"`, `"ErrorLog"`, `"SocialAccount"`,
`"SocialPost"`.

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

### PR Review Until Production (MANDATORY — Do Not Abandon PRs)

**Do not stop working on a PR until it has merged AND deployed to production.** Abandoned PRs
that fail CI silently are the #1 source of wasted time on this project. An agent that creates
a PR and walks away without confirming it merged has not completed its task.

After creating a PR with auto-merge:

1. Monitor CI checks until all pass (poll `gh pr view` every 60-90s)
2. If any check fails, investigate **immediately** — read `gh run view --log-failed`, fix the
   issue, push. Do NOT move on to other work while CI is red
3. If the branch is BEHIND main, update it (`gh api .../update-branch` or rebase + push)
4. Once all checks pass and the PR is still not merged (e.g., branch protection), update the branch
5. Confirm `"state": "MERGED"` in `gh pr view` — this is the minimum exit criteria
6. After merge, verify the deploy succeeded: `heroku releases --app holibob-experiences-demand-gen`
   — the latest release should show status `succeeded` and match your merge commit
7. If the deploy fails (e.g., migration error, build failure), you own the fix — do not leave
   a broken production deploy for someone else to discover

**The full lifecycle is: code → test locally → push → CI green → merge → deploy succeeds.**
An agent that exits before step 7 has not finished the job.

This prevents stale PRs, undetected CI failures, broken deploys, and merge conflicts from piling up.
The cost of watching a PR through to production (~10 minutes) is far less than debugging a stale
branch or broken deploy later.

## Commit Messages

- Imperative mood: "Fix bug", "Add feature", not "Fixed" or "Adds"
- Concise subject line (50-60 chars)
- Explain what and why, not how
- Always include: `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`

## Code Standards

### Pre-Push Quality Gate (MANDATORY — Zero Tolerance)

**Every agent and developer MUST pass all four checks locally before pushing.** CI failures
waste time, block other PRs, and delay deploys. Treat a CI failure you caused as a P0 incident.

```bash
npm run lint          # ESLint — catches console.log, unused imports, type-only imports
npm run typecheck     # TypeScript strict mode — catches type errors, missing properties
npm run format:check  # Prettier — catches formatting drift
npm run test          # Vitest — catches broken tests, missing mocks, undefined references
```

**If you skip these and CI fails, you own the fix immediately — do not move to other work.**

### TypeScript (Strict Mode — No Exceptions)

- Strict mode enabled (`strict: true`, `noUncheckedIndexedAccess: true`)
- **Every new file must compile cleanly** — zero `// @ts-ignore` or `// @ts-expect-error` without
  an explanatory comment and a linked issue
- Prefer `type` imports: `import type { Foo } from './bar'` — ESLint enforces this
- Unused variables must be prefixed with `_`
- No `console.log` — use `console.warn`, `console.error`, or `console.info`
- No `as any` — type properly. The only acceptable use is Prisma enum casts (documented friction)
- No `as unknown as SomeType` to bypass type safety — fix the actual type instead
- When adding a property to an interface or schema, **search the codebase for all consumers** and
  update them. Common culprits: Zod schemas, API route handlers, test mocks, component props
- When adding an enum value (Prisma or TypeScript), update every `switch`/`if` chain that
  handles that enum — search with `grep -r "EnumName" --include="*.ts"` before pushing

### Type Safety Patterns

```typescript
// GOOD: Exhaustive switch with never check
function handleStatus(status: BookingStatus): string {
  switch (status) {
    case 'PENDING':
      return 'Waiting';
    case 'CONFIRMED':
      return 'Done';
    case 'CANCELLED':
      return 'Cancelled';
    default: {
      const _exhaustive: never = status;
      throw new Error(`Unhandled status: ${_exhaustive}`);
    }
  }
}

// BAD: Partial handling that silently breaks when new values are added
function handleStatus(status: BookingStatus): string {
  if (status === 'PENDING') return 'Waiting';
  return 'Unknown'; // Will silently swallow new statuses
}
```

### Formatting (Prettier)

- 100 char line width
- 2-space indentation
- Single quotes
- Trailing commas (ES5)
- LF line endings

### Testing (MANDATORY for Changed Code)

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

**Testing rules that prevent CI failures:**

1. **Run tests for every workspace you changed** before pushing:
   ```bash
   npm run test --workspace=@experience-marketplace/<workspace-name>
   ```
2. **If you add a new API route**, add a test file. Copy the pattern from adjacent route tests
3. **If you modify an existing API route**, run its existing tests first — if they fail, fix them
   as part of your PR, not in a follow-up
4. **Mock boundaries, not internals** — mock Prisma, external APIs (Holibob, Stripe), Redis.
   Do NOT mock internal functions unless absolutely necessary
5. **When adding new enum values or types**, update all test mocks that reference those types.
   Search for the type name in `*.test.ts` files
6. **Admin component tests**: If your component reads from an API response, ensure the mock data
   matches the actual API response shape. The most common admin test failure is `Cannot read
properties of undefined` from stale mock data
7. **Never push with a known test failure** — "it was already broken" is not acceptable. Either
   fix the pre-existing failure or explicitly skip the test with `it.skip()` and a comment
   explaining why

### React / Next.js Patterns

- Server Components by default — only add `'use client'` when you need hooks, event handlers,
  or browser APIs
- Use `import type` for types used only in type positions
- API routes: always validate input with Zod, return typed responses
- Error boundaries: server components use try/catch returning `null` for non-critical sections;
  client components use React error boundaries
- When referencing Prisma enums in React components, import from `@prisma/client` — do NOT
  duplicate enum values as string literals

### Existing Code Debt (Do Not Replicate)

The codebase has legacy `console.log` usage (~1700 occurrences) and `as any` casts (~400).
These exist as tech debt — **do not add new ones**. Follow the rules:

- Use `console.info`/`console.warn`/`console.error` instead of `console.log`
- Type properly instead of `as any` — only use when Prisma enum casts require it (documented friction point)
- Do not copy patterns from legacy code without checking if they follow current standards

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
- **Booking DB write** (`/api/booking/commit`) → DB upsert is wrapped in try/catch; if Postgres is at connection limit, the booking commits in Holibob and Stripe charges the customer, but the record is never saved to our DB. The API still returns 200. A `BookingFunnelEvent` with `errorCode: DB_SAVE_FAILED` is logged. **`BOOKING_ERROR_ALERT`** (every 5 min, see `packages/jobs/src/workers/booking-health.ts`) now pages on this and any other funnel `errorCode` once 3+ events appear in a 10-min window. Reconciliation job to auto-backfill missing bookings from Holibob is still **TODO**.

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
