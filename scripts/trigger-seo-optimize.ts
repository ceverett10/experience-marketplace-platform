/**
 * Trigger SEO_AUTO_OPTIMIZE for sites with content
 *
 * Run with: npx tsx scripts/trigger-seo-optimize.ts
 */

import { config } from 'dotenv';
// Load .env.local first for production credentials
config({ path: '.env.local' });
config(); // Then load .env for any missing values

import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const prisma = new PrismaClient();

async function triggerSEOOptimize() {
  const redisUrl = process.env['REDIS_URL'] || 'redis://localhost:6379';
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const seoQueue = new Queue('seo', { connection });

  console.log('Finding ACTIVE sites with published content...\n');

  // Get ACTIVE sites with published pages
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      _count: {
        select: { pages: { where: { status: 'PUBLISHED' } } }
      }
    }
  });

  const sitesWithContent = sites.filter(s => s._count.pages > 0);
  console.log(`Found ${sitesWithContent.length} sites with published content:\n`);

  for (const site of sitesWithContent) {
    console.log(`  ${site.name}: ${site._count.pages} published pages`);
  }

  console.log('\nQueuing SEO_AUTO_OPTIMIZE jobs...\n');

  let queued = 0;
  for (const site of sitesWithContent) {
    // Check if there's already a pending/running job
    const existingJob = await prisma.job.findFirst({
      where: {
        siteId: site.id,
        type: 'SEO_AUTO_OPTIMIZE',
        status: { in: ['PENDING', 'RUNNING'] }
      }
    });

    if (existingJob) {
      console.log(`  ⏭ ${site.name}: Job already pending/running`);
      continue;
    }

    // Create database record
    const job = await prisma.job.create({
      data: {
        type: 'SEO_AUTO_OPTIMIZE',
        siteId: site.id,
        status: 'PENDING',
        priority: 5,
        payload: { siteId: site.id, scope: 'all' }
      }
    });

    // Add to BullMQ queue
    await seoQueue.add(
      'SEO_AUTO_OPTIMIZE',
      { siteId: site.id, scope: 'all', jobId: job.id },
      {
        priority: 5,
        delay: queued * 30000 // Stagger by 30 seconds
      }
    );

    console.log(`  ✓ ${site.name}: Queued (delay: ${queued * 30}s)`);
    queued++;
  }

  console.log(`\n✅ Queued ${queued} SEO_AUTO_OPTIMIZE jobs`);
  console.log('Jobs will be processed by the worker and populate the SEO Issues dashboard.\n');

  await seoQueue.close();
  await connection.quit();
  await prisma.$disconnect();
}

triggerSEOOptimize().catch(console.error);
