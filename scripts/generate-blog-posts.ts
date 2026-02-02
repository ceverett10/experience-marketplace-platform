/**
 * Script to generate blog posts for existing active sites
 *
 * This script generates initial blog posts for sites that are already active
 * to build SEO authority through quality content.
 *
 * Run with: npx tsx scripts/generate-blog-posts.ts [site-slug-or-id]
 *
 * Examples:
 *   npx tsx scripts/generate-blog-posts.ts                    # Generate for all active sites
 *   npx tsx scripts/generate-blog-posts.ts london-food-tours  # Generate for specific site
 */

import 'dotenv/config';
import { PrismaClient, PageType, PageStatus } from '@prisma/client';
import { generateBlogTopics, BlogTopicContext } from '../packages/jobs/src/services/blog-topics.js';
import { addJob, createRedisConnection } from '../packages/jobs/src/queues/index.js';

const prisma = new PrismaClient();

interface SiteForBlogGeneration {
  id: string;
  name: string;
  status: string;
  seoConfig: any; // JSON field
  homepageConfig: any; // JSON field
  opportunity: {
    niche: string;
    location: string | null;
  } | null;
  pages: {
    title: string;
    slug: string;
  }[];
}

async function generateBlogPostsForSite(site: SiteForBlogGeneration, count: number = 5): Promise<void> {
  console.log(`\n📝 Generating ${count} blog posts for: ${site.name}`);
  console.log(`   Status: ${site.status}`);

  // Get existing blog post titles to avoid duplicates
  const existingTopics = site.pages
    .filter(p => p.slug.startsWith('blog/'))
    .map(p => p.title);

  console.log(`   Existing blog posts: ${existingTopics.length}`);

  // Build context for topic generation
  const seoConfig = site.seoConfig as any || {};
  const homepageConfig = site.homepageConfig as any || {};

  const niche = site.opportunity?.niche ||
    seoConfig?.primaryKeywords?.[0] ||
    homepageConfig?.popularExperiences?.searchTerms?.[0] ||
    'travel experiences';
  const location = site.opportunity?.location ||
    seoConfig?.destination ||
    homepageConfig?.popularExperiences?.destination ||
    undefined;

  const context: BlogTopicContext = {
    siteName: site.name,
    niche,
    location: location || undefined,
    existingTopics,
  };

  console.log(`   Niche: ${niche}`);
  console.log(`   Location: ${location || 'General'}`);

  try {
    // Generate blog topics
    const topics = await generateBlogTopics(context, count);
    console.log(`   Generated ${topics.length} topics`);

    // Create blog pages and queue content generation
    let createdCount = 0;
    for (const topic of topics) {
      // Check if slug already exists
      const existingPage = await prisma.page.findFirst({
        where: {
          siteId: site.id,
          slug: `blog/${topic.slug}`,
        },
      });

      if (existingPage) {
        console.log(`   ⏭️  Skipping existing: ${topic.slug}`);
        continue;
      }

      // Create the blog page
      const blogPage = await prisma.page.create({
        data: {
          siteId: site.id,
          title: topic.title,
          slug: `blog/${topic.slug}`,
          type: PageType.BLOG,
          status: PageStatus.DRAFT,
          metaDescription: `${topic.targetKeyword} - ${site.name}`,
        },
      });

      // Queue content generation
      await addJob('CONTENT_GENERATE', {
        siteId: site.id,
        pageId: blogPage.id,
        contentType: 'blog',
        targetKeyword: topic.targetKeyword,
        secondaryKeywords: topic.secondaryKeywords,
      });

      createdCount++;
      console.log(`   ✅ Created: "${topic.title}"`);
      console.log(`      Keyword: ${topic.targetKeyword}`);
      console.log(`      Type: ${topic.contentType}, Intent: ${topic.intent}`);
    }

    console.log(`   📊 Summary: ${createdCount} new posts created and queued for content generation`);
  } catch (error) {
    console.error(`   ❌ Error generating posts for ${site.name}:`, error);
  }
}

async function main(): Promise<void> {
  console.log('🚀 Blog Post Generation Script');
  console.log('================================\n');

  const siteArg = process.argv[2];

  try {
    let sites: SiteForBlogGeneration[];

    if (siteArg) {
      // Generate for specific site
      const site = await prisma.site.findFirst({
        where: {
          OR: [
            { id: siteArg },
            { slug: siteArg },
          ],
        },
        select: {
          id: true,
          name: true,
          status: true,
          seoConfig: true,
          homepageConfig: true,
          opportunity: {
            select: {
              niche: true,
              location: true,
            },
          },
          pages: {
            select: {
              title: true,
              slug: true,
            },
          },
        },
      });

      if (!site) {
        console.error(`❌ Site not found: ${siteArg}`);
        process.exit(1);
      }

      sites = [site as SiteForBlogGeneration];
      console.log(`Found site: ${site.name}`);
    } else {
      // Generate for all active sites
      sites = await prisma.site.findMany({
        where: {
          status: 'ACTIVE',
        },
        select: {
          id: true,
          name: true,
          status: true,
          seoConfig: true,
          homepageConfig: true,
          opportunity: {
            select: {
              niche: true,
              location: true,
            },
          },
          pages: {
            select: {
              title: true,
              slug: true,
            },
          },
        },
      }) as SiteForBlogGeneration[];

      console.log(`Found ${sites.length} active sites`);
    }

    if (sites.length === 0) {
      console.log('No sites found to generate blog posts for.');
      return;
    }

    // Process each site
    for (const site of sites) {
      await generateBlogPostsForSite(site, 5); // Generate 5 initial posts per site

      // Add a small delay between sites to avoid API rate limits
      if (sites.length > 1) {
        console.log('\n   Waiting 3 seconds before next site...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    console.log('\n================================');
    console.log('✅ Blog generation complete!');
    console.log('\nContent generation jobs have been queued.');
    console.log('Monitor the job queue to see content being generated.');

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
