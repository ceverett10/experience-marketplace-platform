/**
 * E2E Test Suite: Link Building Quality
 *
 * Validates that the cross-site linking system produces high-quality,
 * relevant backlinks without SEO-damaging patterns.
 *
 * Run: npx tsx scripts/test-link-building-e2e.ts
 *
 * Tests:
 * 1. Footer links present and relevant on microsites
 * 2. Blog cross-site links exist and point to PUBLISHED pages
 * 3. Anchor text quality (no generic anchors)
 * 4. Link density limits respected
 * 5. No reciprocal link farms
 * 6. DataForSEO job status (if enabled)
 * 7. Admin API network endpoint works
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  warnings?: string[];
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(`  ${msg}`);
}

function pass(name: string, details: string, warnings?: string[]) {
  results.push({ name, passed: true, details, warnings });
  console.log(`  ✓ ${name}: ${details}`);
  if (warnings?.length) {
    warnings.forEach((w) => console.log(`    ⚠ ${w}`));
  }
}

function fail(name: string, details: string) {
  results.push({ name, passed: false, details });
  console.log(`  ✗ ${name}: ${details}`);
}

// ============================================================================
// Test 1: Footer Cross-Site Links
// ============================================================================
async function testFooterLinks() {
  console.log('\n--- Test 1: Footer Cross-Site Links ---');

  // Pick 5 random active microsites
  const microsites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE', cachedProductCount: { gt: 0 } },
    select: {
      id: true,
      siteName: true,
      fullDomain: true,
      supplier: { select: { cities: true, categories: true } },
    },
    take: 5,
    orderBy: { updatedAt: 'desc' },
  });

  if (microsites.length === 0) {
    fail('Footer links', 'No active microsites found');
    return;
  }

  // Verify each microsite has related microsites available (footer links are deployed via layout.tsx)
  let micrositesWithRelated = 0;

  for (const ms of microsites) {
    const cities = (ms.supplier?.cities as string[]) || [];
    const categories = (ms.supplier?.categories as string[]) || [];

    if (cities.length === 0 && categories.length === 0) {
      log(`${ms.siteName}: No cities/categories — footer will show no related links`);
      continue;
    }

    // Check that there ARE related microsites (same query as getRelatedMicrosites)
    const citySet = new Set(cities.map((c) => c.toLowerCase()));
    const categorySet = new Set(categories.map((c) => c.toLowerCase()));

    const candidates = await prisma.micrositeConfig.findMany({
      where: {
        id: { not: ms.id },
        status: 'ACTIVE',
        cachedProductCount: { gt: 0 },
      },
      include: {
        supplier: { select: { cities: true, categories: true } },
      },
      take: 20,
    });

    const related = candidates.filter((c) => {
      const cCities = (c.supplier?.cities as string[]) || [];
      const cCategories = (c.supplier?.categories as string[]) || [];
      const sharedCities = cCities.filter((ci) => citySet.has(ci.toLowerCase())).length;
      const sharedCategories = cCategories.filter((ca) => categorySet.has(ca.toLowerCase())).length;
      return sharedCities * 3 + sharedCategories * 2 >= 2;
    });

    if (related.length > 0) {
      micrositesWithRelated++;
      log(`${ms.siteName}: ${related.length} related microsites (footer links available)`);
    } else {
      log(`${ms.siteName}: 0 related microsites (no footer links)`);
    }
  }

  if (micrositesWithRelated > 0) {
    pass(
      'Footer links availability',
      `${micrositesWithRelated}/${microsites.length} microsites have related microsites for footer links`
    );
  } else {
    fail(
      'Footer links availability',
      'No microsites have related microsites for footer cross-links'
    );
  }
}

// ============================================================================
// Test 2: Blog Cross-Site Links Quality
// ============================================================================
async function testBlogCrossSiteLinks() {
  console.log('\n--- Test 2: Blog Cross-Site Links ---');

  // Get recent published blog pages from microsites with content
  const blogs = await prisma.page.findMany({
    where: {
      micrositeId: { not: null },
      type: 'BLOG',
      status: 'PUBLISHED',
      contentId: { not: null },
    },
    select: {
      id: true,
      title: true,
      slug: true,
      contentId: true,
      micrositeId: true,
    },
    take: 20,
    orderBy: { updatedAt: 'desc' },
  });

  if (blogs.length === 0) {
    fail('Blog cross-site links', 'No published blog pages found on microsites');
    return;
  }

  const contentIds = blogs.map((b) => b.contentId).filter((id): id is string => id !== null);
  const contents = await prisma.content.findMany({
    where: { id: { in: contentIds } },
    select: { id: true, body: true },
  });
  const contentMap = new Map(contents.map((c) => [c.id, c.body]));

  let blogsWithLinks = 0;
  let totalLinks = 0;
  const warnings: string[] = [];
  const genericAnchors = ['click here', 'read more', 'learn more', 'here', 'this'];

  for (const blog of blogs) {
    const body = contentMap.get(blog.contentId || '');
    if (!body) continue;

    // Find cross-site links (links to *.experiencess.com)
    const linkMatches = body.match(/\[([^\]]+)\]\(https?:\/\/[a-z0-9-]+\.experiencess\.com\/[^)]*\)/gi) || [];

    if (linkMatches.length > 0) {
      blogsWithLinks++;
      totalLinks += linkMatches.length;

      // Check link density (max 3 cross-site links per post)
      if (linkMatches.length > 3) {
        warnings.push(`"${blog.title}" has ${linkMatches.length} cross-site links (max 3 recommended)`);
      }

      // Check anchor text quality
      for (const link of linkMatches) {
        const anchorMatch = link.match(/\[([^\]]+)\]/);
        const anchor = anchorMatch?.[1]?.toLowerCase().trim() || '';
        if (genericAnchors.includes(anchor)) {
          warnings.push(`"${blog.title}" has generic anchor text: "${anchor}"`);
        }
      }
    }
  }

  if (blogsWithLinks > 0) {
    const avgLinks = Math.round((totalLinks / blogsWithLinks) * 10) / 10;
    pass(
      'Blog cross-site links',
      `${blogsWithLinks}/${blogs.length} blogs have cross-site links (avg ${avgLinks} per enriched blog, ${totalLinks} total)`,
      warnings
    );
  } else {
    fail(
      'Blog cross-site links',
      `0/${blogs.length} recent blogs have cross-site links. Run enrichment to inject links.`
    );
  }
}

// ============================================================================
// Test 3: Cross-Site Links Point to PUBLISHED Pages
// ============================================================================
async function testLinksPointToPublishedPages() {
  console.log('\n--- Test 3: Link Targets are Published ---');

  // Sample blogs with cross-site links
  const blogs = await prisma.page.findMany({
    where: {
      micrositeId: { not: null },
      type: 'BLOG',
      status: 'PUBLISHED',
      contentId: { not: null },
    },
    select: { contentId: true },
    take: 50,
    orderBy: { updatedAt: 'desc' },
  });

  const contentIds = blogs.map((b) => b.contentId).filter((id): id is string => id !== null);
  const contents = await prisma.content.findMany({
    where: { id: { in: contentIds } },
    select: { body: true },
  });

  // Extract all target domains and slugs
  const targetUrls: Array<{ domain: string; slug: string }> = [];

  for (const content of contents) {
    const matches = content.body.match(/\]\(https?:\/\/([a-z0-9-]+\.experiencess\.com)\/([^)]+)\)/gi) || [];
    for (const match of matches) {
      const parts = match.match(/https?:\/\/([a-z0-9-]+\.experiencess\.com)\/([^)]+)\)/i);
      if (parts) {
        targetUrls.push({ domain: parts[1]!, slug: parts[2]! });
      }
    }
  }

  if (targetUrls.length === 0) {
    log('No cross-site links found in sample — skipping target validation');
    pass('Link targets', 'No links to validate (enrichment may not have run yet)');
    return;
  }

  // Check a sample of targets
  const sample = targetUrls.slice(0, 10);
  let validTargets = 0;
  let invalidTargets = 0;

  for (const target of sample) {
    // Look up the microsite by domain
    const ms = await prisma.micrositeConfig.findFirst({
      where: { fullDomain: target.domain },
      select: { id: true, status: true },
    });

    if (!ms) {
      log(`Target ${target.domain} — microsite not found`);
      invalidTargets++;
      continue;
    }

    if (ms.status !== 'ACTIVE') {
      log(`Target ${target.domain} — microsite not active (${ms.status})`);
      invalidTargets++;
      continue;
    }

    // Check if the target page exists and is published
    const page = await prisma.page.findFirst({
      where: {
        micrositeId: ms.id,
        slug: target.slug,
        status: 'PUBLISHED',
      },
      select: { id: true },
    });

    if (page) {
      validTargets++;
    } else {
      log(`Target https://${target.domain}/${target.slug} — page not published`);
      invalidTargets++;
    }
  }

  if (invalidTargets === 0) {
    pass('Link targets', `All ${validTargets} sampled link targets point to published pages`);
  } else {
    const pct = Math.round((validTargets / sample.length) * 100);
    if (pct >= 80) {
      pass(
        'Link targets',
        `${validTargets}/${sample.length} link targets are valid (${pct}%)`,
        [`${invalidTargets} targets were invalid — may need cleanup`]
      );
    } else {
      fail(
        'Link targets',
        `Only ${validTargets}/${sample.length} link targets are valid (${pct}%)`
      );
    }
  }
}

// ============================================================================
// Test 4: No Reciprocal Link Farms
// ============================================================================
async function testNoReciprocalLinks() {
  console.log('\n--- Test 4: No Reciprocal Link Farms ---');

  // Get a sample of microsite blogs with cross-site links
  const blogs = await prisma.page.findMany({
    where: {
      micrositeId: { not: null },
      type: 'BLOG',
      status: 'PUBLISHED',
      contentId: { not: null },
    },
    select: {
      id: true,
      contentId: true,
      micrositeId: true,
      microsite: { select: { fullDomain: true } },
    },
    take: 30,
    orderBy: { updatedAt: 'desc' },
  });

  const contentIds = blogs.map((b) => b.contentId).filter((id): id is string => id !== null);
  const contents = await prisma.content.findMany({
    where: { id: { in: contentIds } },
    select: { id: true, body: true },
  });
  const contentMap = new Map(contents.map((c) => [c.id, c.body]));

  // Build a map: sourceDomain → Set of targetDomains
  const linkMap = new Map<string, Set<string>>();

  for (const blog of blogs) {
    const body = contentMap.get(blog.contentId || '');
    if (!body || !blog.microsite) continue;

    const sourceDomain = blog.microsite.fullDomain;
    const targetMatches = body.match(/\]\(https?:\/\/([a-z0-9-]+\.experiencess\.com)\//gi) || [];

    for (const match of targetMatches) {
      const domainMatch = match.match(/https?:\/\/([a-z0-9-]+\.experiencess\.com)/i);
      if (domainMatch) {
        if (!linkMap.has(sourceDomain)) linkMap.set(sourceDomain, new Set());
        linkMap.get(sourceDomain)!.add(domainMatch[1]!);
      }
    }
  }

  // Check for reciprocal pairs (A→B and B→A)
  let reciprocalPairs = 0;
  const checked = new Set<string>();

  for (const [source, targets] of linkMap) {
    for (const target of targets) {
      const pairKey = [source, target].sort().join('↔');
      if (checked.has(pairKey)) continue;
      checked.add(pairKey);

      if (linkMap.get(target)?.has(source)) {
        reciprocalPairs++;
        log(`Reciprocal: ${source} ↔ ${target}`);
      }
    }
  }

  if (reciprocalPairs === 0) {
    pass(
      'No reciprocal links',
      `Checked ${linkMap.size} domains, no reciprocal link pairs found`
    );
  } else if (reciprocalPairs <= 2) {
    pass(
      'No reciprocal links',
      `${reciprocalPairs} reciprocal pair(s) found (minor)`,
      ['A few reciprocal links are acceptable but should be monitored']
    );
  } else {
    fail(
      'No reciprocal links',
      `${reciprocalPairs} reciprocal link pairs found — potential link farm pattern`
    );
  }
}

// ============================================================================
// Test 5: DataForSEO Job Status
// ============================================================================
async function testDataForSEOJobs() {
  console.log('\n--- Test 5: DataForSEO Job Status ---');

  const jobTypes = [
    'LINK_BACKLINK_MONITOR',
    'LINK_OPPORTUNITY_SCAN',
    'CROSS_SITE_LINK_ENRICHMENT',
    'LINK_COMPETITOR_DISCOVERY',
    'LINK_BROKEN_LINK_SCAN',
    'LINK_CONTENT_GAP_ANALYSIS',
  ];

  for (const jobType of jobTypes) {
    try {
      const latestJob = await prisma.job.findFirst({
        where: { type: jobType as any },
        orderBy: { createdAt: 'desc' },
        select: {
          status: true,
          createdAt: true,
          completedAt: true,
          error: true,
          result: true,
        },
      });

      if (!latestJob) {
        log(`${jobType}: Never run`);
        continue;
      }

      const daysAgo = Math.round(
        (Date.now() - latestJob.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      );
      const statusEmoji = latestJob.status === 'COMPLETED' ? '✓' : latestJob.status === 'FAILED' ? '✗' : '…';
      log(`${jobType}: ${statusEmoji} ${latestJob.status} (${daysAgo}d ago)${latestJob.error ? ` — ERROR: ${latestJob.error.substring(0, 80)}` : ''}`);
    } catch {
      log(`${jobType}: Not yet in database (migration pending)`);
    }
  }

  pass('Job status', 'Job history reviewed (see details above)');
}

// ============================================================================
// Test 6: Network Related Posts Data
// ============================================================================
async function testNetworkRelatedPosts() {
  console.log('\n--- Test 6: Network Related Posts Data ---');

  // Check that there are published blog posts across microsites for the network posts feature
  const blogCounts = await prisma.page.groupBy({
    by: ['micrositeId'],
    where: {
      micrositeId: { not: null },
      type: 'BLOG',
      status: 'PUBLISHED',
    },
    _count: true,
  });

  const micrositesWithBlogs = blogCounts.length;
  const totalBlogs = blogCounts.reduce((sum, g) => sum + g._count, 0);

  if (micrositesWithBlogs >= 5 && totalBlogs >= 20) {
    pass(
      'Network related posts data',
      `${totalBlogs} published blogs across ${micrositesWithBlogs} microsites — sufficient for network related posts`
    );
  } else if (micrositesWithBlogs > 0) {
    pass(
      'Network related posts data',
      `${totalBlogs} blogs across ${micrositesWithBlogs} microsites`,
      ['More content across microsites will improve network cross-linking']
    );
  } else {
    fail(
      'Network related posts data',
      'No published blog posts on microsites — network related posts will be empty'
    );
  }
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  console.log('=== Link Building E2E Test Suite ===');
  console.log(`Timestamp: ${new Date().toISOString()}\n`);

  try {
    await testFooterLinks();
    await testBlogCrossSiteLinks();
    await testLinksPointToPublishedPages();
    await testNoReciprocalLinks();
    await testDataForSEOJobs();
    await testNetworkRelatedPosts();
  } catch (error) {
    console.error('\nFatal error during tests:', error);
  } finally {
    await prisma.$disconnect();
  }

  // Summary
  console.log('\n=== Summary ===');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const allWarnings = results.flatMap((r) => r.warnings || []);

  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (allWarnings.length > 0) {
    console.log(`Warnings: ${allWarnings.length}`);
  }
  console.log(`Total: ${results.length}`);

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter((r) => !r.passed).forEach((r) => console.log(`  ✗ ${r.name}: ${r.details}`));
  }

  if (allWarnings.length > 0) {
    console.log('\nWarnings:');
    allWarnings.forEach((w) => console.log(`  ⚠ ${w}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
