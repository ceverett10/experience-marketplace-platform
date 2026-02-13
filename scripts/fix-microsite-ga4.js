const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const GA4_MEASUREMENT_ID = 'G-NRFP8WJLC0';

async function main() {
  const all = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, seoConfig: true },
  });

  const missingGa4 = all.filter(m => {
    const seo = m.seoConfig;
    return !seo || !seo.gaMeasurementId;
  });

  console.log(`Microsites missing GA4: ${missingGa4.length}`);

  let updated = 0;
  for (const m of missingGa4) {
    const existingConfig = m.seoConfig || {};
    await prisma.micrositeConfig.update({
      where: { id: m.id },
      data: {
        seoConfig: {
          ...existingConfig,
          gaMeasurementId: GA4_MEASUREMENT_ID,
        },
      },
    });
    updated++;
    if (updated % 100 === 0) console.log(`  Updated ${updated}/${missingGa4.length}...`);
  }

  console.log(`\nUpdated ${updated} microsites with GA4 measurement ID: ${GA4_MEASUREMENT_ID}`);

  // Verify
  const after = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    select: { seoConfig: true },
  });
  let withGa4 = 0;
  for (const m of after) {
    if (m.seoConfig && m.seoConfig.gaMeasurementId) withGa4++;
  }
  console.log(`Now with GA4: ${withGa4} / ${after.length}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
