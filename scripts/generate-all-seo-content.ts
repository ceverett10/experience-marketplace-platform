/**
 * Script to generate all SEO content types for existing active sites
 *
 * This script generates initial SEO content for sites that are already active:
 * - FAQ Hub Pages (1 per site)
 * - Destination Landing Pages (up to 5 per site)
 * - Comparison Pages (up to 3 per site)
 * - Local Guides (1 per site)
 * - Seasonal Content (up to 2 per site)
 *
 * Run with: npx tsx scripts/generate-all-seo-content.ts [options]
 *
 * Options:
 *   --site=<slug-or-id>   Generate for specific site
 *   --type=<content-type> Generate specific type: faq, destination, comparison, guide, seasonal, all
 *   --dry-run             Preview what would be generated without creating anything
 *
 * Examples:
 *   npx tsx scripts/generate-all-seo-content.ts                         # Generate all types for all active sites
 *   npx tsx scripts/generate-all-seo-content.ts --site=london-food-tours  # Generate for specific site
 *   npx tsx scripts/generate-all-seo-content.ts --type=faq              # Generate only FAQ content for all sites
 *   npx tsx scripts/generate-all-seo-content.ts --dry-run               # Preview only
 */

import 'dotenv/config';
import { PrismaClient, PageType, PageStatus } from '@prisma/client';
import { addJob } from '../packages/jobs/src/queues/index.js';

const prisma = new PrismaClient();

type ContentType = 'faq' | 'destination' | 'comparison' | 'guide' | 'seasonal' | 'all';

interface CLIOptions {
  siteId?: string;
  contentType: ContentType;
  dryRun: boolean;
}

interface SiteData {
  id: string;
  name: string;
  slug: string;
  status: string;
  seoConfig: any;
  homepageConfig: any;
  opportunities: {
    niche: string;
    location: string | null;
    priorityScore: number;
  }[];
  pages: {
    title: string;
    slug: string;
    type: string;
  }[];
  metrics: {
    query: string;
    impressions: number;
  }[];
}

interface GenerationResult {
  type: string;
  created: number;
  skipped: number;
  errors: string[];
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    contentType: 'all',
    dryRun: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--site=')) {
      options.siteId = arg.substring(7);
    } else if (arg.startsWith('--type=')) {
      options.contentType = arg.substring(7) as ContentType;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function generateSlug(text: unknown): string {
  const str = String(text || '');
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 50);
}

/**
 * Generate SEO-optimized meta title (under 60 chars)
 */
function generateMetaTitle(title: string, siteName: string): string {
  const MAX_LENGTH = 60;
  const withBrand = `${title} | ${siteName}`;

  if (withBrand.length <= MAX_LENGTH) {
    return withBrand;
  }

  // Truncate title at word boundary
  const availableLength = MAX_LENGTH - siteName.length - 3; // " | " = 3 chars
  if (availableLength < 20) {
    // Not enough room for brand, just use truncated title
    return title.substring(0, MAX_LENGTH - 3) + '...';
  }

  const words = title.split(' ');
  let truncated = '';
  for (const word of words) {
    if ((truncated + ' ' + word).trim().length <= availableLength) {
      truncated = (truncated + ' ' + word).trim();
    } else {
      break;
    }
  }

  return `${truncated || title.substring(0, availableLength)} | ${siteName}`;
}

/**
 * Generate FAQ Hub Pages
 * Creates FAQ pages from GSC queries + AI-generated questions
 */
async function generateFAQContent(site: SiteData, dryRun: boolean): Promise<GenerationResult> {
  const result: GenerationResult = { type: 'FAQ', created: 0, skipped: 0, errors: [] };

  console.log(`\n   📝 Generating FAQ Hub Page`);

  // Check if FAQ page already exists
  const existingFAQ = site.pages.find((p) => p.type === 'FAQ');
  if (existingFAQ) {
    console.log(`   ⏭️  Skipping: FAQ page already exists`);
    result.skipped = 1;
    return result;
  }

  // Get questions from GSC queries (questions ending in ?)
  const seoConfig = site.seoConfig || {};
  const niche = site.opportunities?.[0]?.niche || seoConfig?.primaryKeywords?.[0] || 'experiences';
  const location = site.opportunities?.[0]?.location || seoConfig?.destination;

  const gscQuestions = site.metrics
    .filter((m) => m.query.includes('?') || m.query.toLowerCase().startsWith('how'))
    .filter((m) => m.impressions >= 10)
    .map((m) => m.query)
    .slice(0, 10);

  const title = location
    ? `Frequently Asked Questions About ${niche} in ${location}`
    : `Frequently Asked Questions About ${niche}`;

  const slug = `faq/${generateSlug(niche.toLowerCase().replace(/\s+/g, '-'))}-questions`;

  if (dryRun) {
    console.log(`   [DRY RUN] Would create: "${title}"`);
    console.log(`   [DRY RUN] Slug: ${slug}`);
    console.log(`   [DRY RUN] GSC questions found: ${gscQuestions.length}`);
    result.created = 1;
    return result;
  }

  try {
    // Create the FAQ page
    const faqPage = await prisma.page.create({
      data: {
        siteId: site.id,
        title,
        slug,
        type: PageType.FAQ,
        status: PageStatus.DRAFT,
        metaTitle: generateMetaTitle(title, site.name),
        metaDescription: `Find answers to common questions about ${niche}${location ? ` in ${location}` : ''}. Get helpful information about booking, experiences, and more.`,
      },
    });

    // Queue content generation
    await addJob('CONTENT_GENERATE', {
      siteId: site.id,
      pageId: faqPage.id,
      contentType: 'faq',
      targetKeyword: `${niche} FAQ`,
      secondaryKeywords: [
        `${niche} questions`,
        `how to book ${niche}`,
        location ? `${niche} ${location}` : '',
      ].filter(Boolean),
      sourceData: {
        questions: gscQuestions,
      },
    });

    console.log(`   ✅ Created: "${title}"`);
    result.created = 1;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.log(`   ❌ Error: ${msg}`);
    result.errors.push(msg);
  }

  return result;
}

/**
 * Generate Destination Landing Pages
 * Creates "[Activity] in [Location]" hub pages from SEO opportunities
 */
async function generateDestinationContent(
  site: SiteData,
  dryRun: boolean,
  maxPages: number = 5
): Promise<GenerationResult> {
  const result: GenerationResult = { type: 'Destination', created: 0, skipped: 0, errors: [] };

  console.log(`\n   📝 Generating Destination Landing Pages (up to ${maxPages})`);

  // Get destinations from opportunities, sorted by priority
  const opportunities = site.opportunities
    .filter((o) => o.location)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, maxPages);

  if (opportunities.length === 0) {
    console.log(`   ⏭️  No destination opportunities found`);
    return result;
  }

  const seoConfig = site.seoConfig || {};
  const niche = opportunities[0]?.niche || seoConfig?.primaryKeywords?.[0] || 'experiences';

  for (const opp of opportunities) {
    const location = opp.location!;
    const title = `${niche} in ${location}`;
    const slug = `destinations/${generateSlug(location)}`;

    // Check if page already exists
    const existingPage = site.pages.find(
      (p) => p.slug === slug || p.title.toLowerCase() === title.toLowerCase()
    );

    if (existingPage) {
      console.log(`   ⏭️  Skipping: ${location} page already exists`);
      result.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`   [DRY RUN] Would create: "${title}"`);
      result.created++;
      continue;
    }

    try {
      const landingPage = await prisma.page.create({
        data: {
          siteId: site.id,
          title,
          slug,
          type: PageType.LANDING,
          status: PageStatus.DRAFT,
          metaTitle: generateMetaTitle(title, site.name),
          metaDescription: `Discover the best ${niche.toLowerCase()} in ${location}. Book unique experiences, read reviews, and find insider tips.`,
        },
      });

      await addJob('CONTENT_GENERATE', {
        siteId: site.id,
        pageId: landingPage.id,
        contentType: 'destination',
        targetKeyword: `${niche} in ${location}`,
        secondaryKeywords: [
          `best ${niche} ${location}`,
          `things to do in ${location}`,
          `${location} activities`,
        ],
      });

      console.log(`   ✅ Created: "${title}"`);
      result.created++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ❌ Error creating ${location}: ${msg}`);
      result.errors.push(`${location}: ${msg}`);
    }
  }

  return result;
}

/**
 * Generate Comparison Pages
 * Creates "X vs Y" content for categories and destinations
 */
async function generateComparisonContent(
  site: SiteData,
  dryRun: boolean,
  maxPages: number = 3
): Promise<GenerationResult> {
  const result: GenerationResult = { type: 'Comparison', created: 0, skipped: 0, errors: [] };

  console.log(`\n   📝 Generating Comparison Pages (up to ${maxPages})`);

  const homepageConfig = site.homepageConfig || {};
  const seoConfig = site.seoConfig || {};
  // Categories might be objects with name property or strings
  const rawCategories = homepageConfig?.categories || [];
  const categories = rawCategories
    .map((c: unknown) => (typeof c === 'string' ? c : (c as { name?: string })?.name))
    .filter((c: unknown): c is string => typeof c === 'string' && c.length > 0);
  const destinations = site.opportunities
    .filter((o) => o.location)
    .map((o) => o.location!)
    .slice(0, 5);

  const comparisons: { item1: string; item2: string; type: 'category' | 'destination' }[] = [];

  // Generate category comparisons
  for (let i = 0; i < categories.length - 1 && comparisons.length < maxPages; i++) {
    comparisons.push({
      item1: categories[i],
      item2: categories[i + 1],
      type: 'category',
    });
  }

  // Generate destination comparisons
  for (let i = 0; i < destinations.length - 1 && comparisons.length < maxPages; i++) {
    comparisons.push({
      item1: destinations[i],
      item2: destinations[i + 1],
      type: 'destination',
    });
  }

  if (comparisons.length === 0) {
    console.log(`   ⏭️  Not enough categories/destinations for comparisons`);
    return result;
  }

  for (const comp of comparisons.slice(0, maxPages)) {
    const title = `${comp.item1} vs ${comp.item2}: Which is Better?`;
    // Note: Don't prefix with 'blog/' - the route is /blog/[slug]
    const slug = `${generateSlug(comp.item1)}-vs-${generateSlug(comp.item2)}`;

    // Check if page already exists
    const existingPage = site.pages.find(
      (p) => p.slug === slug || p.title.toLowerCase().includes(`${comp.item1.toLowerCase()} vs`)
    );

    if (existingPage) {
      console.log(`   ⏭️  Skipping: ${comp.item1} vs ${comp.item2} already exists`);
      result.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`   [DRY RUN] Would create: "${title}"`);
      result.created++;
      continue;
    }

    try {
      const blogPage = await prisma.page.create({
        data: {
          siteId: site.id,
          title,
          slug,
          type: PageType.BLOG,
          status: PageStatus.DRAFT,
          metaTitle: generateMetaTitle(title, site.name),
          metaDescription: `Compare ${comp.item1} and ${comp.item2}. Find out which option is best for your needs with our detailed comparison guide.`,
        },
      });

      await addJob('CONTENT_GENERATE', {
        siteId: site.id,
        pageId: blogPage.id,
        contentType: 'blog',
        targetKeyword: `${comp.item1} vs ${comp.item2}`,
        secondaryKeywords: [
          `${comp.item1} or ${comp.item2}`,
          `${comp.item1} compared to ${comp.item2}`,
          `best ${comp.type === 'category' ? 'experience type' : 'destination'}`,
        ],
        sourceData: {
          contentSubtype: 'comparison',
          comparedItems: [comp.item1, comp.item2],
          comparisonType: comp.type,
        },
      });

      console.log(`   ✅ Created: "${title}"`);
      result.created++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ❌ Error: ${msg}`);
      result.errors.push(msg);
    }
  }

  return result;
}

/**
 * Generate Local Guide Content
 * Creates "Complete Guide to [Destination] for First-Timers"
 */
async function generateGuideContent(site: SiteData, dryRun: boolean): Promise<GenerationResult> {
  const result: GenerationResult = { type: 'Local Guide', created: 0, skipped: 0, errors: [] };

  console.log(`\n   📝 Generating Local Guide`);

  const seoConfig = site.seoConfig || {};
  const primaryLocation = site.opportunities?.[0]?.location || seoConfig?.destination;
  const niche = site.opportunities?.[0]?.niche || seoConfig?.primaryKeywords?.[0] || 'experiences';

  if (!primaryLocation) {
    console.log(`   ⏭️  No primary location found for guide`);
    return result;
  }

  const title = `Complete ${niche} Guide to ${primaryLocation} for First-Timers`;
  // Note: Don't prefix with 'blog/' - the route is /blog/[slug]
  const slug = `${generateSlug(primaryLocation)}-complete-guide`;

  // Check if guide already exists
  const existingGuide = site.pages.find(
    (p) =>
      p.slug === slug ||
      (p.title.toLowerCase().includes('guide') &&
        p.title.toLowerCase().includes(primaryLocation.toLowerCase()))
  );

  if (existingGuide) {
    console.log(`   ⏭️  Skipping: Guide for ${primaryLocation} already exists`);
    result.skipped = 1;
    return result;
  }

  if (dryRun) {
    console.log(`   [DRY RUN] Would create: "${title}"`);
    result.created = 1;
    return result;
  }

  try {
    const guidePage = await prisma.page.create({
      data: {
        siteId: site.id,
        title,
        slug,
        type: PageType.BLOG,
        status: PageStatus.DRAFT,
        metaTitle: generateMetaTitle(title, site.name),
        metaDescription: `Your ultimate guide to ${niche.toLowerCase()} in ${primaryLocation}. Everything first-time visitors need to know for an amazing experience.`,
      },
    });

    await addJob('CONTENT_GENERATE', {
      siteId: site.id,
      pageId: guidePage.id,
      contentType: 'blog',
      targetKeyword: `${niche} guide ${primaryLocation}`,
      secondaryKeywords: [
        `first time ${primaryLocation}`,
        `${primaryLocation} for beginners`,
        `${primaryLocation} tips`,
        `what to know ${primaryLocation}`,
      ],
      sourceData: {
        contentSubtype: 'beginner_guide',
        location: primaryLocation,
      },
    });

    console.log(`   ✅ Created: "${title}"`);
    result.created = 1;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.log(`   ❌ Error: ${msg}`);
    result.errors.push(msg);
  }

  return result;
}

/**
 * Generate Seasonal Content
 * Creates content for upcoming seasons/events
 */
async function generateSeasonalContent(
  site: SiteData,
  dryRun: boolean,
  maxPages: number = 2
): Promise<GenerationResult> {
  const result: GenerationResult = { type: 'Seasonal', created: 0, skipped: 0, errors: [] };

  console.log(`\n   📝 Generating Seasonal Content (up to ${maxPages})`);

  const seoConfig = site.seoConfig || {};
  const niche = site.opportunities?.[0]?.niche || seoConfig?.primaryKeywords?.[0] || 'experiences';
  const location = site.opportunities?.[0]?.location || seoConfig?.destination;

  // Determine current and upcoming seasons
  const now = new Date();
  const month = now.getMonth();
  const seasons: { name: string; keyword: string }[] = [];

  // Add upcoming season content
  if (month >= 2 && month <= 4) {
    seasons.push({ name: 'Spring', keyword: 'spring' });
    seasons.push({ name: 'Summer', keyword: 'summer' });
  } else if (month >= 5 && month <= 7) {
    seasons.push({ name: 'Summer', keyword: 'summer' });
    seasons.push({ name: 'Fall', keyword: 'fall autumn' });
  } else if (month >= 8 && month <= 10) {
    seasons.push({ name: 'Fall', keyword: 'fall autumn' });
    seasons.push({ name: 'Winter', keyword: 'winter christmas holiday' });
  } else {
    seasons.push({ name: 'Winter', keyword: 'winter christmas holiday' });
    seasons.push({ name: 'Spring', keyword: 'spring' });
  }

  for (const season of seasons.slice(0, maxPages)) {
    const title = location
      ? `Best ${season.name} ${niche} in ${location}`
      : `Best ${season.name} ${niche}`;
    // Note: Don't prefix with 'blog/' - the route is /blog/[slug]
    const slug = `${generateSlug(season.name.toLowerCase())}-${generateSlug(niche)}-${new Date().getFullYear()}`;

    // Check if seasonal content already exists
    const existingPage = site.pages.find(
      (p) =>
        p.slug === slug ||
        p.title.toLowerCase().includes(`${season.name.toLowerCase()} ${niche.toLowerCase()}`)
    );

    if (existingPage) {
      console.log(`   ⏭️  Skipping: ${season.name} content already exists`);
      result.skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`   [DRY RUN] Would create: "${title}"`);
      result.created++;
      continue;
    }

    try {
      const seasonalPage = await prisma.page.create({
        data: {
          siteId: site.id,
          title,
          slug,
          type: PageType.BLOG,
          status: PageStatus.DRAFT,
          metaTitle: generateMetaTitle(title, site.name),
          metaDescription: `Discover the best ${niche.toLowerCase()} for ${season.name.toLowerCase()}${location ? ` in ${location}` : ''}. Seasonal recommendations and insider tips.`,
        },
      });

      await addJob('CONTENT_GENERATE', {
        siteId: site.id,
        pageId: seasonalPage.id,
        contentType: 'blog',
        targetKeyword: `${season.name.toLowerCase()} ${niche}${location ? ` ${location}` : ''}`,
        secondaryKeywords: [
          `${season.keyword} ${niche}`,
          `${niche} ${season.name.toLowerCase()} ${new Date().getFullYear()}`,
          location ? `${location} ${season.name.toLowerCase()}` : '',
        ].filter(Boolean),
        sourceData: {
          contentSubtype: 'seasonal',
          season: season.name,
          year: new Date().getFullYear(),
        },
      });

      console.log(`   ✅ Created: "${title}"`);
      result.created++;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.log(`   ❌ Error: ${msg}`);
      result.errors.push(msg);
    }
  }

  return result;
}

async function generateContentForSite(
  site: SiteData,
  contentType: ContentType,
  dryRun: boolean
): Promise<GenerationResult[]> {
  console.log(`\n🏢 Processing: ${site.name}`);
  console.log(`   Status: ${site.status}`);
  console.log(`   Existing pages: ${site.pages.length}`);

  const results: GenerationResult[] = [];

  if (contentType === 'all' || contentType === 'faq') {
    results.push(await generateFAQContent(site, dryRun));
  }

  if (contentType === 'all' || contentType === 'destination') {
    results.push(await generateDestinationContent(site, dryRun));
  }

  if (contentType === 'all' || contentType === 'comparison') {
    results.push(await generateComparisonContent(site, dryRun));
  }

  if (contentType === 'all' || contentType === 'guide') {
    results.push(await generateGuideContent(site, dryRun));
  }

  if (contentType === 'all' || contentType === 'seasonal') {
    results.push(await generateSeasonalContent(site, dryRun));
  }

  return results;
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log('🚀 SEO Content Generation Script');
  console.log('================================');
  console.log(`Content Type: ${options.contentType}`);
  console.log(`Dry Run: ${options.dryRun}`);
  if (options.siteId) console.log(`Site: ${options.siteId}`);
  console.log('');

  try {
    let sites: SiteData[];

    const siteQuery = {
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        seoConfig: true,
        homepageConfig: true,
        opportunities: {
          select: {
            niche: true,
            location: true,
            priorityScore: true,
          },
          orderBy: { priorityScore: 'desc' as const },
          take: 10,
        },
        pages: {
          select: {
            title: true,
            slug: true,
            type: true,
          },
        },
        metrics: {
          where: {
            createdAt: {
              gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // Last 90 days
            },
            impressions: {
              gte: 10,
            },
          },
          select: {
            query: true,
            impressions: true,
          },
          orderBy: { impressions: 'desc' as const },
          take: 100,
        },
      },
    };

    if (options.siteId) {
      const site = await prisma.site.findFirst({
        where: {
          OR: [{ id: options.siteId }, { slug: options.siteId }],
        },
        ...siteQuery,
      });

      if (!site) {
        console.error(`❌ Site not found: ${options.siteId}`);
        process.exit(1);
      }

      sites = [site as unknown as SiteData];
    } else {
      sites = (await prisma.site.findMany({
        where: { status: 'ACTIVE' },
        ...siteQuery,
      })) as unknown as SiteData[];
    }

    console.log(`Found ${sites.length} site(s) to process\n`);

    if (sites.length === 0) {
      console.log('No sites found.');
      return;
    }

    const allResults: { site: string; results: GenerationResult[] }[] = [];

    for (const site of sites) {
      const results = await generateContentForSite(site, options.contentType, options.dryRun);
      allResults.push({ site: site.name, results });

      // Add delay between sites
      if (sites.length > 1) {
        console.log('\n   Waiting 3 seconds before next site...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    // Print summary
    console.log('\n================================');
    console.log('📊 SUMMARY');
    console.log('================================\n');

    let totalCreated = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const { site, results } of allResults) {
      console.log(`${site}:`);
      for (const r of results) {
        console.log(
          `  ${r.type}: ${r.created} created, ${r.skipped} skipped, ${r.errors.length} errors`
        );
        totalCreated += r.created;
        totalSkipped += r.skipped;
        totalErrors += r.errors.length;
      }
    }

    console.log('\n--------------------------------');
    console.log(`Total: ${totalCreated} created, ${totalSkipped} skipped, ${totalErrors} errors`);

    if (options.dryRun) {
      console.log('\n⚠️  DRY RUN - No content was actually created');
      console.log('Remove --dry-run flag to create content');
    } else {
      console.log('\n✅ Content generation complete!');
      console.log('Content generation jobs have been queued.');
      console.log('Monitor the job queue to see content being generated.');
    }
  } catch (error) {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
