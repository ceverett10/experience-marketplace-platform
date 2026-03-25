#!/usr/bin/env npx tsx
/**
 * Sanitize internal links in existing blog post content.
 *
 * Addresses two sources of broken links:
 * 1. Old Haiku-generated content (pre-sanitizer) containing AI-hallucinated links
 *    to pages that don't exist (e.g. /tours/camden, /guides/borough-market)
 * 2. Internal-linking service bug that created /destinations/destinations/... double-prefix
 *    URLs (fixed in code; this script cleans up content already saved with the bug)
 *
 * Strategy: strip any markdown link whose path does not match a known valid route prefix
 * AND is not a path to an existing page slug for that site/microsite.
 * External links (different domain) are preserved. Placeholder domains (example.com etc.) stripped.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/sanitize-blog-links.ts [options]
 *
 * Options:
 *   --dry-run    Show counts of links to be removed without applying changes
 *   --site-id=X  Only process a single site (useful for testing)
 */

import { prisma, PageType } from '@experience-marketplace/database';

const VALID_ROUTE_PREFIXES = [
  '/experiences',
  '/destinations',
  '/categories',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  '/blog',
];

const PLACEHOLDER_DOMAINS = [
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'placeholder.com',
  'yoursite.com',
  'yourdomain.com',
  'website.com',
  'domain.com',
  'sample.com',
  'demo.com',
  'localhost',
];

function extractPathFromUrl(
  url: string,
  siteDomain?: string
): { path: string; isExternal: boolean; isPlaceholder: boolean } {
  if (url.startsWith('/') || url.startsWith('#')) {
    return { path: url, isExternal: false, isPlaceholder: false };
  }

  try {
    const parsed = new URL(url);
    const urlDomain = parsed.hostname.toLowerCase().replace(/^www\./, '');

    const isPlaceholder = PLACEHOLDER_DOMAINS.some(
      (p) => urlDomain === p || urlDomain.endsWith('.' + p)
    );
    if (isPlaceholder) return { path: url, isExternal: true, isPlaceholder: true };

    if (siteDomain) {
      const normalizedDomain = siteDomain.toLowerCase().replace(/^www\./, '');
      if (urlDomain === normalizedDomain) {
        return { path: parsed.pathname + parsed.hash, isExternal: false, isPlaceholder: false };
      }
    }

    return { path: url, isExternal: true, isPlaceholder: false };
  } catch {
    return { path: url, isExternal: false, isPlaceholder: false };
  }
}

function sanitizeLinks(
  content: string,
  siteDomain: string | undefined,
  existingSlugs: Set<string>
): { sanitized: string; removedCount: number } {
  let removedCount = 0;

  const sanitized = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
    const { path, isExternal, isPlaceholder } = extractPathFromUrl(url, siteDomain);

    if (isPlaceholder) {
      removedCount++;
      return text;
    }

    // Keep external links (different domain, not placeholder)
    if (isExternal) return match;

    // Keep pure anchor links
    if (path.startsWith('#')) return match;

    const pathWithoutAnchor = path.split('#')[0] ?? path;
    // Strip query strings for prefix matching
    const pathWithoutQuery = pathWithoutAnchor.split('?')[0] ?? pathWithoutAnchor;

    // Check valid route prefix
    const isValidPrefix = VALID_ROUTE_PREFIXES.some(
      (prefix) => pathWithoutQuery === prefix || pathWithoutQuery.startsWith(prefix + '/')
    );
    if (isValidPrefix) {
      // Extra check: destination double-prefix bug — /destinations/destinations/...
      if (pathWithoutQuery.startsWith('/destinations/destinations/')) {
        removedCount++;
        return text;
      }
      return match;
    }

    // Check against existing page slugs (slugs stored with prefix in DB)
    // e.g. slug = 'blog/my-post', path = '/blog/my-post' → strip leading '/'
    const slugFromPath = pathWithoutQuery.replace(/^\//, '');
    if (existingSlugs.has(slugFromPath)) return match;

    // Unrecognised internal link — strip it
    removedCount++;
    return text;
  });

  return { sanitized, removedCount };
}

interface ScriptOptions {
  dryRun: boolean;
  siteId?: string;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const siteArg = args.find((a) => a.startsWith('--site-id='));
  return {
    dryRun: args.includes('--dry-run'),
    siteId: siteArg ? siteArg.split('=')[1] : undefined,
  };
}

async function processSite(
  siteId: string,
  siteDomain: string | undefined,
  dryRun: boolean
): Promise<{ postsProcessed: number; linksRemoved: number }> {
  // Fetch all existing published page slugs for this site (for link validation)
  const allSlugs = await prisma.page.findMany({
    where: { siteId, status: 'PUBLISHED' },
    select: { slug: true },
  });
  const existingSlugs = new Set(allSlugs.map((p) => p.slug));

  // Fetch all published blog posts with content
  const blogPosts = await prisma.page.findMany({
    where: { siteId, type: PageType.BLOG, status: 'PUBLISHED' },
    select: {
      id: true,
      slug: true,
      content: { select: { id: true, body: true } },
    },
  });

  let postsProcessed = 0;
  let linksRemoved = 0;

  for (const post of blogPosts) {
    if (!post.content?.body) continue;

    const { sanitized, removedCount } = sanitizeLinks(post.content.body, siteDomain, existingSlugs);

    if (removedCount > 0) {
      linksRemoved += removedCount;
      postsProcessed++;

      if (!dryRun) {
        await prisma.content.update({
          where: { id: post.content.id },
          data: { body: sanitized },
        });
      }
    }
  }

  return { postsProcessed, linksRemoved };
}

async function processMicrosite(
  micrositeId: string,
  siteDomain: string | undefined,
  dryRun: boolean
): Promise<{ postsProcessed: number; linksRemoved: number }> {
  const allSlugs = await prisma.page.findMany({
    where: { micrositeId, status: 'PUBLISHED' },
    select: { slug: true },
  });
  const existingSlugs = new Set(allSlugs.map((p) => p.slug));

  const blogPosts = await prisma.page.findMany({
    where: { micrositeId, type: PageType.BLOG, status: 'PUBLISHED' },
    select: {
      id: true,
      slug: true,
      content: { select: { id: true, body: true } },
    },
  });

  let postsProcessed = 0;
  let linksRemoved = 0;

  for (const post of blogPosts) {
    if (!post.content?.body) continue;

    const { sanitized, removedCount } = sanitizeLinks(post.content.body, siteDomain, existingSlugs);

    if (removedCount > 0) {
      linksRemoved += removedCount;
      postsProcessed++;

      if (!dryRun) {
        await prisma.content.update({
          where: { id: post.content.id },
          data: { body: sanitized },
        });
      }
    }
  }

  return { postsProcessed, linksRemoved };
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.info('='.repeat(60));
  console.info('Sanitize Blog Post Internal Links');
  console.info(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be saved)' : 'LIVE'}`);
  if (options.siteId) console.info(`Scoped to site: ${options.siteId}`);
  console.info('='.repeat(60));

  let totalPosts = 0;
  let totalLinks = 0;

  // --- Process main sites ---
  const siteWhere = options.siteId ? { id: options.siteId } : {};
  const sites = await prisma.site.findMany({
    where: siteWhere,
    select: { id: true, name: true, primaryDomain: true },
  });

  console.info(`\nProcessing ${sites.length} main site(s)...`);
  for (const site of sites) {
    const { postsProcessed, linksRemoved } = await processSite(
      site.id,
      site.primaryDomain ?? undefined,
      options.dryRun
    );
    if (linksRemoved > 0) {
      console.info(
        `  ${site.name} (${site.primaryDomain}): ${postsProcessed} posts, ${linksRemoved} links removed`
      );
    }
    totalPosts += postsProcessed;
    totalLinks += linksRemoved;
  }

  // --- Process microsites (skip if filtering by siteId) ---
  if (!options.siteId) {
    const microsites = await prisma.micrositeConfig.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, siteName: true, fullDomain: true },
    });

    console.info(`\nProcessing ${microsites.length} microsite(s)...`);
    let micrositePostsTotal = 0;
    let micrositeLinksTotal = 0;

    for (const ms of microsites) {
      const { postsProcessed, linksRemoved } = await processMicrosite(
        ms.id,
        ms.fullDomain ?? undefined,
        options.dryRun
      );
      if (linksRemoved > 0) {
        console.info(
          `  ${ms.siteName} (${ms.fullDomain}): ${postsProcessed} posts, ${linksRemoved} links removed`
        );
        micrositePostsTotal += postsProcessed;
        micrositeLinksTotal += linksRemoved;
      }
    }

    if (micrositePostsTotal === 0) {
      console.info('  No broken links found in microsite blog posts.');
    }

    totalPosts += micrositePostsTotal;
    totalLinks += micrositeLinksTotal;
  }

  console.info('\n' + '='.repeat(60));
  console.info(`Total blog posts with broken links: ${totalPosts}`);
  console.info(`Total broken links removed: ${totalLinks}`);
  if (options.dryRun) {
    console.info('\nThis was a DRY RUN. Re-run without --dry-run to apply changes.');
  }
  console.info('='.repeat(60));

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
