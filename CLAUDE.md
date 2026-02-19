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
- Coverage target: 80%

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

## What NOT To Do

- Do not use `location_types` in Meta Ads targeting (deprecated)
- Do not use Heroku ACM with Cloudflare domains (Cloudflare handles SSL)
- Do not add Heroku domains without the SNI endpoint ID
- Do not commit `.env` files or secrets
- Do not use `git push --force` on `main`
- Do not skip pre-commit hooks with `--no-verify`
