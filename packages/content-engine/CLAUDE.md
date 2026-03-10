# Content Engine (`@experience-marketplace/content-engine`)

Claude API-powered content generation pipeline. Used by `jobs` package for autonomous content creation.

## Pipeline

Draft → Quality Assess (0-100 score) → Rewrite (max 3 iterations) → Publish

- **Auto-publish**: Score >= 90
- **Pass threshold**: Score >= 75
- **Min improvement**: 5 points per rewrite to continue iterating
- **Max rewrites**: 3

## Models

Default: **Haiku** for all stages (draft, assess, rewrite) — ~75% cheaper than Sonnet.

Model mapping: haiku → claude-haiku-4-5, sonnet → claude-sonnet-4, opus → claude-opus-4-5

## Cost Controls

- Per-piece limit: $0.50
- Daily limit: $50.00
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

## Common Pitfalls

1. AI-generated content may hallucinate URLs — consumer code MUST sanitize links
2. Content generation is the most expensive autonomous operation — respect cost limits
3. Model defaults to Haiku — only use Sonnet/Opus for high-value content if justified
