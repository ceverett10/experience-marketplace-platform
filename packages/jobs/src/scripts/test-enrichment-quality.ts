/**
 * Test script: run enrichment with optional DataForSEO validation.
 *
 * Usage:
 *   node packages/jobs/dist/scripts/test-enrichment-quality.js [count] [products] [--validate] [--live]
 *
 * Flags:
 *   --validate  Enable DataForSEO validation (Phase 2)
 *   --live      Disable dryRun — actually write to DB (Phase 3)
 */
import { runBulkEnrichment } from '../services/keyword-enrichment';

async function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('--'));
  const nums = args.filter((a) => !a.startsWith('--'));

  const supplierCount = parseInt(nums[0] || '30', 10);
  const productsPerSupplier = parseInt(nums[1] || '30', 10);
  const skipDataForSeo = !flags.includes('--validate');
  const dryRun = !flags.includes('--live');

  console.log(`Enrichment: ${supplierCount} suppliers, ${productsPerSupplier} products each`);
  console.log(`DataForSEO validation: ${!skipDataForSeo ? 'ON' : 'OFF (dry-run)'}`);
  console.log(`DB writes: ${!dryRun ? 'ON (live)' : 'OFF (dry-run)'}\n`);

  const result = await runBulkEnrichment({
    maxSuppliersPerRun: supplierCount,
    maxProductsPerSupplier: productsPerSupplier,
    skipDataForSeo,
    dryRun,
    location: 'United Kingdom',
  });

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
