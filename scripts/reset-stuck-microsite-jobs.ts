/**
 * Script to reset stuck MICROSITE_CONTENT_GENERATE jobs
 *
 * These jobs were stuck because the content worker didn't have a handler for them.
 * After deploying the fix, run this script to reset them so they can be reprocessed.
 *
 * Usage: npx ts-node scripts/reset-stuck-microsite-jobs.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Resetting stuck MICROSITE_CONTENT_GENERATE jobs ===\n');

  // Find all FAILED and RETRYING MICROSITE_CONTENT_GENERATE jobs
  const stuckJobs = await prisma.job.findMany({
    where: {
      type: 'MICROSITE_CONTENT_GENERATE',
      status: { in: ['FAILED', 'RETRYING'] },
    },
    select: {
      id: true,
      status: true,
      attempts: true,
      error: true,
      payload: true,
    },
  });

  console.log(`Found ${stuckJobs.length} stuck MICROSITE_CONTENT_GENERATE jobs\n`);

  if (stuckJobs.length === 0) {
    console.log('No jobs to reset.');
    return;
  }

  // Show breakdown
  const failed = stuckJobs.filter(j => j.status === 'FAILED').length;
  const retrying = stuckJobs.filter(j => j.status === 'RETRYING').length;
  console.log(`  FAILED: ${failed}`);
  console.log(`  RETRYING: ${retrying}\n`);

  // Reset jobs to PENDING so they can be picked up by the worker
  const result = await prisma.job.updateMany({
    where: {
      type: 'MICROSITE_CONTENT_GENERATE',
      status: { in: ['FAILED', 'RETRYING'] },
    },
    data: {
      status: 'PENDING',
      attempts: 0,
      error: null,
      startedAt: null,
      completedAt: null,
    },
  });

  console.log(`Reset ${result.count} jobs to PENDING status.\n`);

  // Get unique micrositeIds from the jobs
  const micrositeIds = new Set<string>();
  for (const job of stuckJobs) {
    const payload = job.payload as { micrositeId?: string };
    if (payload.micrositeId) {
      micrositeIds.add(payload.micrositeId);
    }
  }

  console.log(`These jobs belong to ${micrositeIds.size} microsites.`);
  console.log('\nThe jobs will be picked up automatically by the worker after deployment.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
