/**
 * Fix USA/UAE Title Casing
 *
 * The slug standardization migration produced "Austin, Usa" instead of "Austin, USA".
 * This script fixes titles containing "Usa" or "Uae" to use proper abbreviation casing.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/fix-usa-uae-casing.ts           # Dry run
 *   npx tsx packages/jobs/src/scripts/fix-usa-uae-casing.ts --apply   # Apply changes
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/fix-usa-uae-casing.js --apply'
 */
import { prisma } from '@experience-marketplace/database';

const CASING_FIXES: [RegExp, string][] = [
  [/\bUsa\b/g, 'USA'],
  [/\bUae\b/g, 'UAE'],
  [/\bUk\b/g, 'UK'],
];

async function main() {
  const apply = process.argv.includes('--apply');

  console.info('='.repeat(60));
  console.info('FIX USA/UAE TITLE CASING');
  console.info(apply ? '*** APPLYING CHANGES ***' : '*** DRY RUN ***');
  console.info('='.repeat(60));

  // Find pages with wrong casing in title or metaTitle
  const pages = await prisma.page.findMany({
    where: {
      type: 'LANDING',
      slug: { startsWith: 'destinations/' },
      OR: [
        { title: { contains: 'Usa' } },
        { title: { contains: 'Uae' } },
        { metaTitle: { contains: 'Usa' } },
        { metaTitle: { contains: 'Uae' } },
      ],
    },
    select: {
      id: true,
      slug: true,
      title: true,
      metaTitle: true,
      site: { select: { name: true } },
    },
  });

  console.info(`\nFound ${pages.length} pages with casing issues.\n`);

  let fixed = 0;

  for (const page of pages) {
    const siteName = page.site?.name ?? 'unknown';
    let newTitle = page.title;
    let newMetaTitle = page.metaTitle;

    for (const [pattern, replacement] of CASING_FIXES) {
      newTitle = newTitle.replace(pattern, replacement);
      if (newMetaTitle) {
        newMetaTitle = newMetaTitle.replace(pattern, replacement);
      }
    }

    const titleChanged = newTitle !== page.title;
    const metaTitleChanged = newMetaTitle !== page.metaTitle;

    if (!titleChanged && !metaTitleChanged) continue;

    if (apply) {
      await prisma.page.update({
        where: { id: page.id },
        data: {
          ...(titleChanged ? { title: newTitle } : {}),
          ...(metaTitleChanged ? { metaTitle: newMetaTitle } : {}),
        },
      });
      console.info(`  FIXED: ${page.slug} (${siteName})`);
      if (titleChanged) console.info(`    Title: "${page.title}" → "${newTitle}"`);
      if (metaTitleChanged) console.info(`    Meta:  "${page.metaTitle}" → "${newMetaTitle}"`);
    } else {
      console.info(`  WOULD FIX: ${page.slug} (${siteName})`);
      if (titleChanged) console.info(`    Title: "${page.title}" → "${newTitle}"`);
      if (metaTitleChanged) console.info(`    Meta:  "${page.metaTitle}" → "${newMetaTitle}"`);
    }
    fixed++;
  }

  console.info('\n' + '='.repeat(60));
  console.info(`Total fixed: ${fixed}`);
  console.info('');
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
