// Temporary script: clean Redis, delete old DRAFTs, and trigger a fresh engine run
const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
  if (!redisUrl) throw new Error('No REDIS_URL');
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: parseInt(url.port),
    password: url.password,
    tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  };
}

async function main() {
  const p = new PrismaClient();
  const conn = getRedisConnection();

  // Step 1: Clean old BullMQ jobs across all queues to free Redis memory
  console.log('--- STEP 1: Clean Redis queues ---');
  const queueNames = ['content', 'seo', 'gsc', 'site', 'domain', 'analytics', 'abtest', 'microsite', 'sync', 'social', 'ads'];
  let totalCleaned = 0;

  for (const name of queueNames) {
    const q = new Queue(name, { connection: conn });
    try {
      const completed = await q.getCompletedCount();
      const failed = await q.getFailedCount();
      let cleaned = 0;
      if (completed > 0) {
        const c = await q.clean(0, 10000, 'completed');  // Remove ALL completed
        cleaned += c.length;
      }
      if (failed > 0) {
        const f = await q.clean(0, 10000, 'failed');  // Remove ALL failed
        cleaned += f.length;
      }
      if (cleaned > 0) {
        console.log('CLEANED=' + name + ':' + cleaned);
        totalCleaned += cleaned;
      }
    } catch (e) {
      console.log('CLEAN_ERR=' + name + ':' + e.message.substring(0, 100));
    }
    await q.close();
  }
  console.log('TOTAL_CLEANED=' + totalCleaned);

  // Step 2: Delete all DRAFT campaigns
  console.log('--- STEP 2: Delete DRAFTs ---');
  const deleted = await p.adCampaign.deleteMany({ where: { status: 'DRAFT' } });
  console.log('DELETED=' + deleted.count + ' draft campaigns');

  // Step 3: Clean up stale DB jobs too
  console.log('--- STEP 3: Clean stale DB jobs ---');
  const staleJobsDeleted = await p.job.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'FAILED'] },
      createdAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // older than 24h
    },
  });
  console.log('STALE_JOBS_DELETED=' + staleJobsDeleted.count);

  // Step 4: Add BIDDING_ENGINE_RUN job
  console.log('--- STEP 4: Trigger engine run ---');
  const job = await p.job.create({
    data: {
      type: 'BIDDING_ENGINE_RUN',
      queue: 'ads',
      payload: { mode: 'full' },
      status: 'PENDING',
      priority: 5,
      maxAttempts: 3,
    },
  });
  console.log('JOB_CREATED=' + job.id);

  // Step 5: Add to BullMQ
  const adsQueue = new Queue('ads', { connection: conn });
  try {
    const bullJob = await adsQueue.add(
      'BIDDING_ENGINE_RUN',
      { mode: 'full', dbJobId: job.id },
      { priority: 5, removeOnComplete: 100, removeOnFail: 50 }
    );
    console.log('BULLMQ_JOB=' + bullJob.id);
  } catch (e) {
    console.log('BULLMQ_ERR=' + e.message);
  }
  await adsQueue.close();

  await p.$disconnect();
  console.log('--- DONE ---');
}

main().catch(e => { console.error('FATAL=' + e.message); process.exit(1); });
