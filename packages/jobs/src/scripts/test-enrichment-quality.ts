/**
 * Test script: run enrichment dry-run and display seed quality.
 * Usage: node packages/jobs/dist/scripts/test-enrichment-quality.js [supplierCount] [productsPerSupplier]
 */
import { runBulkEnrichment } from '../services/keyword-enrichment';

async function main() {
  const supplierCount = parseInt(process.argv[2] || '30', 10);
  const productsPerSupplier = parseInt(process.argv[3] || '30', 10);

  console.log(`Testing enrichment with ${supplierCount} suppliers, ${productsPerSupplier} products each\n`);

  const result = await runBulkEnrichment({
    maxSuppliersPerRun: supplierCount,
    maxProductsPerSupplier: productsPerSupplier,
    skipDataForSeo: true,
    dryRun: true,
    location: 'United Kingdom',
  });

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
