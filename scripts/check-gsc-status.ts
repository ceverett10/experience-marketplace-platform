import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: {
      slug: true,
      primaryDomain: true,
      gscVerified: true,
      gscPropertyUrl: true,
    },
    orderBy: { gscVerified: 'desc' },
  });

  const verified = sites.filter((s) => s.gscVerified);
  const unverified = sites.filter((s) => s.gscVerified === false);

  console.log('=== GSC Status ===');
  console.log('Total active sites:', sites.length);
  console.log('GSC Verified:', verified.length);
  console.log('NOT Verified:', unverified.length);

  if (verified.length > 0) {
    console.log('\nVerified sites:');
    for (const s of verified.slice(0, 5)) {
      console.log('  V', s.primaryDomain || s.slug, '|', s.gscPropertyUrl);
    }
    if (verified.length > 5) console.log('  ... and', verified.length - 5, 'more');
  }

  if (unverified.length > 0) {
    console.log('\nUnverified sites (sample):');
    for (const s of unverified.slice(0, 10)) {
      console.log('  X', s.primaryDomain || s.slug);
    }
    if (unverified.length > 10) console.log('  ... and', unverified.length - 10, 'more');
  }

  const microsites = await prisma.micrositeConfig.findMany({
    where: { status: 'ACTIVE' },
    select: {
      fullDomain: true,
      parentDomain: true,
    },
  });

  console.log('\n=== Active Microsites ===');
  console.log('Total:', microsites.length);
  const onExp = microsites.filter((m) => m.parentDomain === 'experiencess.com');
  const custom = microsites.filter((m) => m.parentDomain !== 'experiencess.com');
  console.log('On experiencess.com (covered by sc-domain):', onExp.length);
  console.log('Custom domains:', custom.length);
  for (const m of custom.slice(0, 20)) {
    console.log('  -', m.fullDomain);
  }
  if (custom.length > 20) console.log('  ... and', custom.length - 20, 'more');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
