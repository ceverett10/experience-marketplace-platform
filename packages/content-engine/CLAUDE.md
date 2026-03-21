# Content Engine (`@experience-marketplace/content-engine`)

Claude API-powered content generation pipeline. Used by `jobs` package for autonomous content creation.

## Pipeline

Draft → Quality Assess (0-100 score) → Rewrite (max 1 iteration) → Publish

- **Auto-publish**: Score >= 90
- **Pass threshold**: Score >= 75
- **Min improvement**: 5 points per rewrite to continue iterating
- **Max rewrites**: 1 (Sonnet produces high-quality drafts; extra rewrites add latency without meaningful gain)

## Models

Default: **Sonnet** for all stages (draft, assess, rewrite).

Previously used Haiku for cost savings, but a 200-article Sonnet review found:

- Haiku self-assessment inflated scores by ~45 points vs Sonnet review
- 0% of Haiku-written articles met publish quality (avg 40/100 vs self-rated 85/100)
- 51% of articles recommended for deletion, 49% for rewrite
- Systemic issues: truncation, link spam, irrelevant content

Model mapping: haiku → claude-haiku-4-5, sonnet → claude-sonnet-4, opus → claude-opus-4-5

## Cost Controls

- Per-piece limit: $2.00 (Sonnet ~4x Haiku, but fewer rewrites needed)
- Daily limit: $100.00
- Rate limit: 50 requests/min, 5 concurrent
- Cost tracking per operation with token usage logging

## Quality Assessment Dimensions

- `factualAccuracy` — vs source data
- `seoCompliance` — keyword usage, headings structure
- `readability` — Flesch-Kincaid conversion
- `uniqueness` — Original vs template content
- `engagement` — Hooks, CTAs, persuasiveness

Issues classified by severity: low | medium | high | critical

## Content Types

`destination`, `category`, `experience`, `blog`, `about`, `faq`, `meta_description`, `seo_title`

## Input Context

`ContentBrief`: type, keyword, tone, length, brand context, source data, competitor analysis
`BrandContext`: tone of voice, trust signals, brand story, content guidelines

## Token Limits

- Blog posts: 4096-6000 tokens (was 2500, causing truncation on ~40% of articles)
- Other content types: 4096 tokens
- Rewrites: 4096 tokens

## Internal Links

The content prompt explicitly tells the AI **not** to include markdown links. Internal links
are added automatically by the platform after publishing. This prevents hallucinated URLs
(a major issue when Haiku was generating 20-30 fake destination links per article).

## Common Pitfalls

1. AI-generated content may hallucinate URLs — prompt now forbids markdown links, but sanitize anyway
2. Content generation is the most expensive autonomous operation — respect cost limits
3. Do not downgrade back to Haiku without re-running the quality review script (`scripts/review-blog-quality.ts`)
4. Blog maxTokens must stay >= 4096 — lower values cause mid-sentence truncation
5. Quality self-assessment requires a different (or equal) quality model to the draft model — same-model review is unreliable
