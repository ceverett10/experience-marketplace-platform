const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const exec = p.$executeRawUnsafe.bind(p);

  await exec('ALTER TABLE "Booking" ALTER COLUMN "siteId" DROP NOT NULL');
  console.log('1. Made siteId nullable');

  await exec('ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "micrositeId" TEXT');
  console.log('2. Added micrositeId column');

  await exec('CREATE INDEX IF NOT EXISTS "Booking_micrositeId_idx" ON "Booking"("micrositeId")');
  console.log('3. Added micrositeId index');

  try {
    await exec(
      'ALTER TABLE "Booking" ADD CONSTRAINT "Booking_micrositeId_fkey" FOREIGN KEY ("micrositeId") REFERENCES "microsite_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE'
    );
    console.log('4. Added micrositeId FK constraint');
  } catch (e) {
    if (e.message && e.message.includes('already exists')) {
      console.log('4. FK constraint already exists');
    } else {
      throw e;
    }
  }

  await exec(
    "INSERT INTO _prisma_migrations (id, checksum, migration_name, finished_at, applied_steps_count) VALUES (gen_random_uuid(), md5(random()::text), '20260220140000_add_microsite_booking_support', NOW(), 1)"
  );
  console.log('5. Recorded migration');

  await p.$disconnect();
  console.log('Migration complete!');
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
