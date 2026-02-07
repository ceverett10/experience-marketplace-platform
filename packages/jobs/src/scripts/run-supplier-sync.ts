#!/usr/bin/env npx tsx
/**
 * Run supplier sync from Holibob API
 * Discovers operators via products and populates the Supplier table
 */

import 'dotenv/config';
import { syncSuppliersFromHolibob } from '../services/supplier-sync.js';

async function main() {
  console.log('Starting supplier sync from Holibob...');
  console.log('Environment check:');
  console.log(`  HOLIBOB_API_URL: ${process.env['HOLIBOB_API_URL'] ? 'set' : 'NOT SET'}`);
  console.log(`  HOLIBOB_PARTNER_ID: ${process.env['HOLIBOB_PARTNER_ID'] ? 'set' : 'NOT SET'}`);
  console.log(`  HOLIBOB_API_KEY: ${process.env['HOLIBOB_API_KEY'] ? 'set' : 'NOT SET'}`);
  console.log(`  HOLIBOB_API_SECRET: ${process.env['HOLIBOB_API_SECRET'] ? 'set' : 'NOT SET'}`);
  console.log(`  DATABASE_URL: ${process.env['DATABASE_URL'] ? 'set' : 'NOT SET'}`);
  console.log('');

  try {
    const result = await syncSuppliersFromHolibob();

    console.log('\n=== Sync Complete ===');
    console.log(`Success: ${result.success}`);
    console.log(`Suppliers Discovered: ${result.suppliersDiscovered}`);
    console.log(`Suppliers Created: ${result.suppliersCreated}`);
    console.log(`Suppliers Updated: ${result.suppliersUpdated}`);
    console.log(`Duration: ${result.duration}ms`);

    if (result.errors.length > 0) {
      console.log(`\nErrors (${result.errors.length}):`);
      result.errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
      if (result.errors.length > 10) {
        console.log(`  ... and ${result.errors.length - 10} more`);
      }
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error during sync:', error);
    process.exit(1);
  }
}

main();
