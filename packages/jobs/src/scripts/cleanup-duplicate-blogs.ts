/**
 * Cleanup Duplicate Blogs Script
 *
 * Scans all sites and microsites for near-duplicate blog posts using
 * Jaccard similarity on titles. Archives duplicates, keeping the one
 * with the highest quality score (or the oldest if scores are equal).
 *
 * Run with:
 *   npx tsx packages/jobs/src/scripts/cleanup-duplicate-blogs.ts              # Dry run (default)
 *   npx tsx packages/jobs/src/scripts/cleanup-duplicate-blogs.ts --apply       # Actually archive duplicates
 *   npx tsx packages/jobs/src/scripts/cleanup-duplicate-blogs.ts --site <id>   # Single site only
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { clusterDuplicateTitles, DEFAULT_SIMILARITY_THRESHOLD } from '../services/blog-dedup.js';

const prisma = new PrismaClient();

interface BlogPage {
  id: string;
  title: string;
  slug: string;
  status: string;
  createdAt: Date;
  publishedAt: Date | null;
  pageViews: number;
  content: {
    qualityScore: number | null;
  } | null;
}

interface SiteGroup {
  siteId: string | null;
  micrositeId: string | null;
  siteName: string;
  blogs: BlogPage[];
}

async function loadAllBlogsBySite(): Promise<SiteGroup[]> {
  // Load all non-archived blog pages grouped by site
  const siteBlogs = await prisma.page.findMany({
    where: {
      type: 'BLOG',
      status: { in: ['PUBLISHED', 'DRAFT', 'REVIEW'] },
      siteId: { not: null },
    },
    include: {
      content: { select: { qualityScore: true } },
      site: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const micrositeBlogs = await prisma.page.findMany({
    where: {
      type: 'BLOG',
      status: { in: ['PUBLISHED', 'DRAFT', 'REVIEW'] },
      micrositeId: { not: null },
    },
    include: {
      content: { select: { qualityScore: true } },
      microsite: { select: { siteName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by site
  const siteMap = new Map<string, SiteGroup>();

  for (const page of siteBlogs) {
    const key = `site:${page.siteId}`;
    if (!siteMap.has(key)) {
      siteMap.set(key, {
        siteId: page.siteId,
        micrositeId: null,
        siteName: page.site?.name || 'Unknown',
        blogs: [],
      });
    }
    siteMap.get(key)!.blogs.push(page);
  }

  for (const page of micrositeBlogs) {
    const key = `microsite:${page.micrositeId}`;
    if (!siteMap.has(key)) {
      siteMap.set(key, {
        siteId: null,
        micrositeId: page.micrositeId,
        siteName: page.microsite?.siteName || 'Unknown',
        blogs: [],
      });
    }
    siteMap.get(key)!.blogs.push(page);
  }

  return Array.from(siteMap.values());
}

/**
 * Pick the best blog to keep from a cluster of near-duplicates.
 * Prefers: highest quality score > most page views > earliest creation date.
 */
function pickCanonical(blogs: BlogPage[]): BlogPage {
  return blogs.sort((a, b) => {
    // Higher quality score wins
    const scoreA = a.content?.qualityScore ?? 0;
    const scoreB = b.content?.qualityScore ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    // More page views wins
    if (a.pageViews !== b.pageViews) return b.pageViews - a.pageViews;

    // Oldest wins (was indexed first by search engines)
    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const siteFilter = args.includes('--site') ? args[args.indexOf('--site')! + 1] : null;

  console.info(`Blog Duplicate Cleanup ${dryRun ? '(DRY RUN)' : '(APPLYING CHANGES)'}`);
  console.info(`Similarity threshold: ${DEFAULT_SIMILARITY_THRESHOLD}`);
  console.info('='.repeat(60));

  let siteGroups = await loadAllBlogsBySite();

  if (siteFilter) {
    siteGroups = siteGroups.filter((g) => g.siteId === siteFilter || g.micrositeId === siteFilter);
    if (siteGroups.length === 0) {
      console.error(`No site found with ID: ${siteFilter}`);
      process.exit(1);
    }
  }

  let totalArchived = 0;
  let totalKept = 0;
  let sitesWithDuplicates = 0;

  for (const group of siteGroups) {
    if (group.blogs.length < 2) continue;

    const titles = group.blogs.map((b) => b.title);
    const clusters = clusterDuplicateTitles(titles);

    // Only care about clusters with more than 1 item
    const dupClusters = clusters.filter((c) => c.length > 1);
    if (dupClusters.length === 0) continue;

    sitesWithDuplicates++;
    const siteLabel = group.siteId
      ? `Site: ${group.siteName} (${group.siteId})`
      : `Microsite: ${group.siteName} (${group.micrositeId})`;
    console.info(`\n${siteLabel}`);
    console.info(`  Total blogs: ${group.blogs.length}, Duplicate clusters: ${dupClusters.length}`);

    for (const cluster of dupClusters) {
      const clusterBlogs = cluster.map((c) => group.blogs[c.index]!);
      const canonical = pickCanonical(clusterBlogs);
      const toArchive = clusterBlogs.filter((b) => b.id !== canonical.id);

      console.info(`  Cluster (${cluster.length} posts):`);
      for (const blog of clusterBlogs) {
        const isKeep = blog.id === canonical.id;
        const score = blog.content?.qualityScore ?? 'n/a';
        const label = isKeep ? 'KEEP' : 'ARCHIVE';
        console.info(
          `    [${label}] "${blog.title}" (quality: ${score}, views: ${blog.pageViews}, slug: ${blog.slug})`
        );
      }

      if (!dryRun) {
        const archiveIds = toArchive.map((b) => b.id);
        await prisma.page.updateMany({
          where: { id: { in: archiveIds } },
          data: { status: 'ARCHIVED', noIndex: true },
        });
      }

      totalArchived += toArchive.length;
      totalKept += 1;
    }
  }

  console.info('\n' + '='.repeat(60));
  console.info('Summary:');
  console.info(`  Sites with duplicates: ${sitesWithDuplicates}`);
  console.info(`  Posts to archive: ${totalArchived}`);
  console.info(`  Canonical posts kept: ${totalKept}`);
  console.info(`  Total sites scanned: ${siteGroups.length}`);

  if (dryRun && totalArchived > 0) {
    console.info('\nThis was a DRY RUN. Run with --apply to actually archive duplicates.');
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});
