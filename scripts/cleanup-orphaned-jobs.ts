/**
 * Cleanup Orphaned Planned Jobs
 *
 * Removes 'planned' queue jobs for sites that are ACTIVE or ARCHIVED,
 * since the autonomous roadmap processor no longer runs for these sites.
 *
 * Run with: npx tsx scripts/cleanup-orphaned-jobs.ts
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config();

import { PrismaClient, SiteStatus, JobStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanupOrphanedJobs() {
  console.log('Finding orphaned planned jobs for ACTIVE/ARCHIVED sites...\n');

  // Find all PENDING jobs with queue='planned' for ACTIVE or ARCHIVED sites
  const orphanedJobs = await prisma.job.findMany({
    where: {
      status: 'PENDING',
      queue: 'planned',
      site: {
        status: { in: ['ACTIVE', 'ARCHIVED'] }
      }
    },
    select: {
      id: true,
      type: true,
      createdAt: true,
      site: {
        select: { name: true, status: true }
      }
    }
  });

  if (orphanedJobs.length === 0) {
    console.log('✅ No orphaned planned jobs found.');
    return;
  }

  // Group by site status
  const byStatus: Record<string, typeof orphanedJobs> = {};
  orphanedJobs.forEach(j => {
    const status = j.site?.status || 'unknown';
    if (!byStatus[status]) byStatus[status] = [];
    byStatus[status].push(j);
  });

  console.log(`Found ${orphanedJobs.length} orphaned jobs:\n`);
  Object.entries(byStatus).forEach(([status, jobs]) => {
    console.log(`  ${status}: ${jobs.length} jobs`);
  });

  // Group by type
  const byType: Record<string, number> = {};
  orphanedJobs.forEach(j => {
    byType[j.type] = (byType[j.type] || 0) + 1;
  });

  console.log('\nBy job type:');
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  console.log('\nDeleting orphaned jobs...\n');

  let deleted = 0;
  for (const job of orphanedJobs) {
    const age = Math.round((Date.now() - job.createdAt.getTime()) / 1000 / 60 / 60);
    console.log(`  Deleting ${job.type} for ${job.site?.name} (${job.site?.status}, ${age}h old)`);

    await prisma.job.delete({ where: { id: job.id } });
    deleted++;
  }

  console.log(`\n✅ Deleted ${deleted} orphaned planned jobs.`);
}

async function main() {
  try {
    await cleanupOrphanedJobs();
  } catch (error) {
    console.error('Script failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
