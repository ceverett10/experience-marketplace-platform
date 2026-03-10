/**
 * Seed keyword candidates from the product catalogue.
 *
 * Usage:
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/seed-catalogue-keywords.js --dry-run'
 *   heroku run 'cd /app && node packages/jobs/dist/scripts/seed-catalogue-keywords.js --apply'
 */
import { generateCatalogueKeywords } from '../services/catalogue-keyword-generator';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');

  if (dryRun) {
    console.info('=== CATALOGUE KEYWORD SEED (DRY RUN) ===');
    console.info('Pass --apply to actually insert keywords.\n');
  } else {
    console.info('=== CATALOGUE KEYWORD SEED (APPLYING) ===\n');
  }

  const result = await generateCatalogueKeywords(dryRun);

  console.info('\n=== RESULTS ===');
  console.info(`City × Category combos: ${result.cityCategoryCombos}`);
  console.info(`Keywords generated:     ${result.keywordsGenerated}`);
  console.info(`Keywords inserted:      ${result.keywordsInserted}`);
  console.info(`Duplicates skipped:     ${result.keywordsSkippedDuplicate}`);

  if (result.sampleKeywords.length > 0) {
    console.info('\nSample keywords:');
    for (const kw of result.sampleKeywords) {
      console.info(`  - ${kw}`);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
