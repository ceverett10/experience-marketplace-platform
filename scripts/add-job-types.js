const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const jobTypes = [
  'GA4_DAILY_SYNC',
  'REFRESH_ANALYTICS_VIEWS',
  'MICROSITE_GSC_SYNC',
  'MICROSITE_ANALYTICS_SYNC',
];

async function main() {
  for (const jobType of jobTypes) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS '${jobType}'`);
      console.log(`Added: ${jobType}`);
    } catch (error) {
      console.log(`${jobType}: ${error.message}`);
    }
  }
  await prisma.$disconnect();
  console.log('Migration complete');
}

main().catch(console.error);
