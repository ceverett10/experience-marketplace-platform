/**
 * SEO Health Check
 *
 * Automated monitor that catches SEO-damaging issues before they compound.
 * Runs daily via scheduler (9:30 AM UTC). Logs warnings for any failed check.
 *
 * Designed to catch the exact failures that caused ranking drops in March 2026:
 * 1. Published pages stuck with noIndex (invisible to search engines)
 * 2. Sitemaps returning zero pages (broken queries)
 * 3. Blog generation stopped for main sites
 * 4. Content quality pipeline stalled
 * 5. GSC sync not running
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/seo-health-check.ts
 */

import { prisma } from '@experience-marketplace/database';

export interface SEOHealthResult {
  check: string;
  status: 'PASS' | 'WARN' | 'CRITICAL';
  message: string;
  value: number;
  threshold: number;
}

export interface SEOHealthReport {
  timestamp: string;
  results: SEOHealthResult[];
  passed: number;
  warnings: number;
  critical: number;
}

function check(
  results: SEOHealthResult[],
  name: string,
  value: number,
  threshold: number,
  comparator: 'lt' | 'gt' | 'eq',
  severity: 'WARN' | 'CRITICAL',
  message: string
): void {
  let passed = false;
  switch (comparator) {
    case 'lt':
      passed = value < threshold;
      break;
    case 'gt':
      passed = value > threshold;
      break;
    case 'eq':
      passed = value === threshold;
      break;
  }

  const status = passed ? 'PASS' : severity;
  const icon = status === 'PASS' ? '[PASS]' : status === 'WARN' ? '[WARN]' : '[CRIT]';
  results.push({ check: name, status, message, value, threshold });
  console.info(`  ${icon} ${name}: ${message}`);
}

export async function runSEOHealthCheck(): Promise<SEOHealthReport> {
  const results: SEOHealthResult[] = [];
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 3600 * 1000);

  console.info('SEO Health Check');
  console.info('='.repeat(60));
  console.info(`Run at: ${now.toISOString()}`);

  // ── 1. NOINDEX ORPHANS ──────────────────────────────────────────────
  // Pages that are PUBLISHED but noIndex=true (except CONTACT/LEGAL which are intentional)
  console.info('\n1. NoIndex Orphans');
  const noIndexOrphans = await prisma.page.count({
    where: {
      status: 'PUBLISHED',
      noIndex: true,
      type: { notIn: ['CONTACT', 'LEGAL'] },
    },
  });
  check(
    results,
    'Published pages with noIndex (excl. CONTACT/LEGAL)',
    noIndexOrphans,
    10,
    'lt',
    'CRITICAL',
    `${noIndexOrphans} pages are published but hidden from search engines`
  );

  // Breakdown by type if there are orphans
  if (noIndexOrphans > 0) {
    const orphansByType = await prisma.page.groupBy({
      by: ['type'],
      where: { status: 'PUBLISHED', noIndex: true, type: { notIn: ['CONTACT', 'LEGAL'] } },
      _count: { id: true },
    });
    for (const t of orphansByType) {
      console.info(`    -> ${t.type}: ${t._count.id}`);
    }
  }

  // ── 2. MAIN SITE BLOG FRESHNESS ────────────────────────────────────
  // Each main site should have at least 1 blog published in the last 7 days
  console.info('\n2. Main Site Blog Freshness');
  const activeSites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, name: true, primaryDomain: true },
  });

  let sitesWithRecentBlogs = 0;
  const staleSites: string[] = [];
  for (const site of activeSites) {
    const recentBlog = await prisma.page.findFirst({
      where: {
        siteId: site.id,
        type: 'BLOG',
        status: 'PUBLISHED',
        noIndex: false,
        updatedAt: { gte: sevenDaysAgo },
      },
    });
    if (recentBlog) {
      sitesWithRecentBlogs++;
    } else {
      staleSites.push(site.primaryDomain || site.name);
    }
  }
  check(
    results,
    'Main sites with fresh blog content (7 days)',
    sitesWithRecentBlogs,
    activeSites.length,
    'eq',
    'WARN',
    `${sitesWithRecentBlogs}/${activeSites.length} sites have recent blogs`
  );
  if (staleSites.length > 0) {
    for (const s of staleSites.slice(0, 10)) {
      console.info(`    -> No recent blog: ${s}`);
    }
    if (staleSites.length > 10) {
      console.info(`    -> ... and ${staleSites.length - 10} more`);
    }
  }

  // ── 3. SITEMAP PAGE COUNTS ─────────────────────────────────────────
  // Each main site should have >5 indexable pages in its sitemap
  console.info('\n3. Sitemap Page Counts');
  let sitesWithThinSitemaps = 0;
  for (const site of activeSites) {
    const indexablePages = await prisma.page.count({
      where: { siteId: site.id, status: 'PUBLISHED', noIndex: false },
    });
    if (indexablePages < 5) {
      sitesWithThinSitemaps++;
      console.info(
        `    -> Thin sitemap: ${site.primaryDomain || site.name} (${indexablePages} pages)`
      );
    }
  }
  check(
    results,
    'Main sites with thin sitemaps (<5 pages)',
    sitesWithThinSitemaps,
    1,
    'lt',
    'WARN',
    `${sitesWithThinSitemaps} sites have fewer than 5 indexable pages`
  );

  // ── 4. MICROSITE COVERAGE ──────────────────────────────────────────
  // Active microsites should have at least 1 indexable page
  console.info('\n4. Microsite Coverage');
  const totalActiveMicrosites = await prisma.micrositeConfig.count({ where: { status: 'ACTIVE' } });
  const micrositesWithPages = await prisma.page.findMany({
    where: { micrositeId: { not: null }, status: 'PUBLISHED', noIndex: false },
    select: { micrositeId: true },
    distinct: ['micrositeId'],
  });
  const emptyMicrosites = totalActiveMicrosites - micrositesWithPages.length;
  const coveragePercent =
    totalActiveMicrosites > 0 ? (micrositesWithPages.length / totalActiveMicrosites) * 100 : 100;
  check(
    results,
    'Microsite page coverage',
    coveragePercent,
    90,
    'gt',
    'WARN',
    `${micrositesWithPages.length}/${totalActiveMicrosites} (${coveragePercent.toFixed(1)}%) have indexable pages — ${emptyMicrosites} empty`
  );

  // ── 5. CONTENT PIPELINE ACTIVITY ───────────────────────────────────
  // At least some content should have been generated in the last 24 hours
  console.info('\n5. Content Pipeline Activity');
  const recentContentJobs = await prisma.job.count({
    where: {
      type: 'CONTENT_GENERATE' as never,
      status: 'COMPLETED',
      createdAt: { gte: twentyFourHoursAgo },
    },
  });
  check(
    results,
    'Content generation jobs (last 24h)',
    recentContentJobs,
    1,
    'gt',
    'WARN',
    `${recentContentJobs} content jobs completed in last 24h`
  );

  // ── 6. GSC SYNC FRESHNESS ─────────────────────────────────────────
  // GSC should have synced in the last 24 hours
  console.info('\n6. GSC Sync');
  const recentGSCSync = await prisma.job.count({
    where: {
      type: 'GSC_SYNC' as never,
      status: 'COMPLETED',
      createdAt: { gte: twentyFourHoursAgo },
    },
  });
  check(
    results,
    'GSC sync jobs (last 24h)',
    recentGSCSync,
    1,
    'gt',
    'WARN',
    `${recentGSCSync} GSC syncs completed in last 24h`
  );

  // ── 7. CONTENT QUALITY ─────────────────────────────────────────────
  // Recently published blogs should not have truncated content
  console.info('\n7. Content Quality');
  const recentBlogs = await prisma.page.findMany({
    where: {
      type: 'BLOG',
      status: 'PUBLISHED',
      noIndex: false,
      updatedAt: { gte: sevenDaysAgo },
    },
    select: { id: true },
  });
  let truncatedCount = 0;
  if (recentBlogs.length > 0) {
    const blogContents = await prisma.content.findMany({
      where: { page: { id: { in: recentBlogs.map((b) => b.id) } } },
      select: { body: true },
    });
    truncatedCount = blogContents.filter((c) => {
      const body = c.body || '';
      // Truncated articles typically end mid-sentence without a period
      return body.length > 500 && !body.trimEnd().match(/[.!?'")\]]$/);
    }).length;
  }
  check(
    results,
    'Recently published blogs with truncated content',
    truncatedCount,
    3,
    'lt',
    'WARN',
    `${truncatedCount}/${recentBlogs.length} recent blogs appear truncated`
  );

  // ── SUMMARY ────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.status === 'PASS').length;
  const warnings = results.filter((r) => r.status === 'WARN').length;
  const critical = results.filter((r) => r.status === 'CRITICAL').length;

  console.info('\n' + '='.repeat(60));
  console.info(`SUMMARY: ${passed} passed, ${warnings} warnings, ${critical} critical`);

  if (critical > 0) {
    console.error('\nCRITICAL ISSUES REQUIRING IMMEDIATE ACTION:');
    for (const r of results.filter((r) => r.status === 'CRITICAL')) {
      console.error(`  -> ${r.check}: ${r.message}`);
    }
  }

  return {
    timestamp: now.toISOString(),
    results,
    passed,
    warnings,
    critical,
  };
}

// CLI entry point
async function main() {
  try {
    const report = await runSEOHealthCheck();
    process.exit(report.critical > 0 ? 2 : report.warnings > 0 ? 1 : 0);
  } catch (error) {
    console.error('SEO health check failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectExecution = require.main === module || process.argv[1]?.includes('seo-health-check');
if (isDirectExecution) {
  main();
}
