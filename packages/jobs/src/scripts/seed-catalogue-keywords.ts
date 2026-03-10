/**
 * Seed keyword candidates from the product catalogue.
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/seed-catalogue-keywords.js --dry-run'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/seed-catalogue-keywords.js --apply'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/seed-catalogue-keywords.js --reseed --apply'
 */
import { prisma } from '@experience-marketplace/database';
import { generateCatalogueKeywords } from '../services/catalogue-keyword-generator';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const reseed = args.includes('--reseed');

  if (reseed && !dryRun) {
    console.info('=== CATALOGUE KEYWORD RESEED (APPLYING) ===');
    console.info('Deleting existing catalogue keywords before re-inserting...\n');
    const deleted = await prisma.sEOOpportunity.deleteMany({
      where: { source: 'catalogue' },
    });
    console.info(`Deleted ${deleted.count} existing catalogue keywords.\n`);
  } else if (reseed && dryRun) {
    console.info('=== CATALOGUE KEYWORD RESEED (DRY RUN) ===');
    const existing = await prisma.sEOOpportunity.count({
      where: { source: 'catalogue' },
    });
    console.info(`Would delete ${existing} existing catalogue keywords before re-inserting.`);
    console.info('Pass --apply to actually reseed.\n');
  } else if (dryRun) {
    console.info('=== CATALOGUE KEYWORD SEED (DRY RUN) ===');
    console.info('Pass --apply to actually insert keywords.\n');
  } else {
    console.info('=== CATALOGUE KEYWORD SEED (APPLYING) ===\n');
  }

  const result = await generateCatalogueKeywords(dryRun);

  console.info('\n=== RESULTS ===');
  console.info(`Sites processed:    ${result.sitesProcessed}`);
  console.info(`Sites skipped:      ${result.sitesSkipped}`);
  console.info(`Keywords generated: ${result.totalKeywords}`);
  console.info(`Keywords inserted:  ${result.totalInserted}`);
  console.info(`Duplicates skipped: ${result.totalSkippedDuplicate}`);

  if (result.perSite.length > 0) {
    console.info('\n--- Per-site breakdown ---');
    for (const site of result.perSite) {
      console.info(
        `\n  ${site.domain} — ${site.keywordsGenerated} keywords, ${site.citiesMatched} cities`
      );
      for (const kw of site.sampleKeywords) {
        console.info(`    - ${kw}`);
      }
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
