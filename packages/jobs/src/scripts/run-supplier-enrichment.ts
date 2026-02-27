#!/usr/bin/env npx tsx
/**
 * Run supplier enrichment — fetches city and category data from Holibob API
 * for suppliers with empty cities arrays (typically ~39K suppliers).
 *
 * Usage:
 *   npx tsx src/scripts/run-supplier-enrichment.ts [--dry-run] [--max=N]
 *
 * On Heroku:
 *   heroku run "cd packages/jobs && npx tsx src/scripts/run-supplier-enrichment.ts" --app holibob-experiences-demand-gen
 */

import 'dotenv/config';
import { enrichSupplierLocations } from '../services/supplier-enrichment.js';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxArg = args.find((a) => a.startsWith('--max='));
  const maxSuppliersPerRun = maxArg ? parseInt(maxArg.split('=')[1] ?? '0', 10) : undefined;

  console.info('=== Supplier Enrichment ===');
  console.info(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (maxSuppliersPerRun) console.info(`Max suppliers: ${maxSuppliersPerRun}`);
  console.info('');
  console.info('Environment check:');
  console.info(`  HOLIBOB_API_URL: ${process.env['HOLIBOB_API_URL'] ? 'set' : 'NOT SET'}`);
  console.info(`  HOLIBOB_PARTNER_ID: ${process.env['HOLIBOB_PARTNER_ID'] ? 'set' : 'NOT SET'}`);
  console.info(`  HOLIBOB_API_KEY: ${process.env['HOLIBOB_API_KEY'] ? 'set' : 'NOT SET'}`);
  console.info(`  HOLIBOB_API_SECRET: ${process.env['HOLIBOB_API_SECRET'] ? 'set' : 'NOT SET'}`);
  console.info(`  DATABASE_URL: ${process.env['DATABASE_URL'] ? 'set' : 'NOT SET'}`);
  console.info('');

  try {
    const result = await enrichSupplierLocations({
      dryRun,
      maxSuppliersPerRun,
    });

    console.info('\n=== Enrichment Complete ===');
    console.info(`Processed: ${result.processed}`);
    console.info(`Enriched (got cities): ${result.enriched}`);
    console.info(`Skipped (already had cities): ${result.skipped}`);
    console.info(`Already had cities: ${result.alreadyHadCities}`);
    console.info(`No products found: ${result.noProductsFound}`);
    console.info(`Duration: ${result.duration}ms (${Math.round(result.duration / 60000)}min)`);
    console.info(`Unique categories: ${result.categoryStats.uniqueCategories}`);
    console.info(`Top categories: ${result.categoryStats.topCategories.join(', ')}`);

    if (result.errors.length > 0) {
      console.info(`\nErrors (${result.errors.length}):`);
      result.errors.slice(0, 20).forEach((err, i) => {
        console.info(`  ${i + 1}. ${err}`);
      });
      if (result.errors.length > 20) {
        console.info(`  ... and ${result.errors.length - 20} more`);
      }
    }

    process.exit(result.errors.length === 0 ? 0 : 1);
  } catch (error) {
    console.error('Fatal error during enrichment:', error);
    process.exit(1);
  }
}

main();
