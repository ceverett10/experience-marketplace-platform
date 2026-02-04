#!/usr/bin/env node
/**
 * One-time Bulk SEO Optimization Script
 *
 * Runs SEO_AUTO_OPTIMIZE job for all active sites to:
 * - Fix missing/poor meta titles and descriptions
 * - Add missing structured data
 * - Set appropriate sitemap priorities
 * - Flag thin content for expansion
 */

import { prisma } from '@experience-marketplace/database';
import { addJob } from '../queues';

async function runBulkSEOOptimization() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔧 Bulk SEO Optimization - One-Time Operation           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    // Fetch all active sites
    const sites = await prisma.site.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        primaryDomain: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    if (sites.length === 0) {
      console.log('No active sites found. Nothing to optimize.');
      return;
    }

    console.log(`Found ${sites.length} active sites to optimize:\n`);
    sites.forEach((site, index) => {
      console.log(`  ${index + 1}. ${site.name} (${site.primaryDomain})`);
    });
    console.log();

    // Queue SEO_AUTO_OPTIMIZE jobs for each site
    console.log('Queuing optimization jobs (staggered by 3 minutes)...\n');

    const results: Array<{ siteId: string; siteName: string; jobId: string }> = [];

    for (let i = 0; i < sites.length; i++) {
      const site = sites[i]!;
      const delay = i * 3 * 60 * 1000; // Stagger by 3 minutes to avoid overwhelming the system

      try {
        const jobId = await addJob(
          'SEO_AUTO_OPTIMIZE',
          {
            siteId: site.id,
            scope: 'all',
          },
          {
            priority: 8,
            delay,
          }
        );

        results.push({
          siteId: site.id,
          siteName: site.name,
          jobId,
        });

        const delayMinutes = delay / 60000;
        console.log(`✓ Queued job for ${site.name} (Job ID: ${jobId}, Delay: ${delayMinutes}m)`);
      } catch (error) {
        console.error(`✗ Failed to queue job for ${site.name}:`, error);
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║  ✅ Bulk Optimization Complete                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    console.log(`Summary:`);
    console.log(`  - Sites found: ${sites.length}`);
    console.log(`  - Jobs queued: ${results.length}`);
    console.log(`  - Jobs failed: ${sites.length - results.length}`);
    console.log(
      `  - Total processing time: ~${(sites.length * 3).toFixed(0)} minutes (staggered)\n`
    );

    console.log('Jobs have been queued and will be processed by the demand-generation worker.');
    console.log('Monitor progress in the admin dashboard under Jobs > SEO Queue.\n');
  } catch (error) {
    console.error('Error running bulk optimization:', error);
    throw error;
  } finally {
    // Close database connection
    await prisma.$disconnect();
  }
}

// Run the script
runBulkSEOOptimization()
  .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
