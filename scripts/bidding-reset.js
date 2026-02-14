// Temporary script: delete old DRAFTs without proposalData and trigger a fresh engine run
const { PrismaClient } = require('@prisma/client');

async function main() {
  const p = new PrismaClient();

  // Step 1: Delete all DRAFT campaigns
  const deleted = await p.adCampaign.deleteMany({ where: { status: 'DRAFT' } });
  console.log('DELETED=' + deleted.count + ' draft campaigns');

  // Step 2: Add a BIDDING_ENGINE_RUN job
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

  // Step 3: Add to BullMQ via the queue system
  // We need to use the actual queue, so let's import from the compiled jobs package
  try {
    const { Queue } = require('bullmq');
    const redisUrl = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
    if (redisUrl) {
      const url = new URL(redisUrl);
      const connection = {
        host: url.hostname,
        port: parseInt(url.port),
        password: url.password,
        tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      };
      const queue = new Queue('ads', { connection });
      const bullJob = await queue.add('BIDDING_ENGINE_RUN', { mode: 'full', dbJobId: job.id }, { priority: 5 });
      console.log('BULLMQ_JOB=' + bullJob.id);
      await queue.close();
    } else {
      console.log('NO_REDIS=true (job in DB only, worker will not pick it up)');
    }
  } catch (e) {
    console.log('BULLMQ_ERR=' + e.message);
  }

  await p.$disconnect();
}

main().catch(e => { console.error('FATAL=' + e.message); process.exit(1); });
