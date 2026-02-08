#!/usr/bin/env npx tsx
/**
 * Test script to verify Holibob API returns provider data for products
 * Run with: npx tsx scripts/test-holibob-provider.ts
 */

import 'dotenv/config';
import { createHolibobClient } from '@experience-marketplace/holibob-api';

async function testProviderField() {
  const apiUrl = process.env['HOLIBOB_API_URL'];
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  if (!apiUrl || !partnerId || !apiKey) {
    console.error('Missing Holibob API configuration. Required env vars:');
    console.error('  HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY');
    process.exit(1);
  }

  console.log('Creating Holibob client...');
  console.log(`  API URL: ${apiUrl}`);
  console.log(`  Partner ID: ${partnerId}`);

  const client = createHolibobClient({
    apiUrl,
    partnerId,
    apiKey,
    apiSecret,
  });

  try {
    // Step 1: Discover some products
    console.log('\n--- Step 1: Discovering products in London ---');
    const response = await client.discoverProducts(
      { freeText: 'London', currency: 'GBP' },
      { pageSize: 5 }
    );

    console.log(`Found ${response.products.length} products`);

    // Step 2: Get full details for each product and check for provider
    console.log('\n--- Step 2: Checking provider field on products ---');

    let productsWithProvider = 0;
    let productsWithoutProvider = 0;

    for (const product of response.products) {
      console.log(`\nProduct: ${product.name} (${product.id})`);

      // Check provider field
      if (product.provider) {
        productsWithProvider++;
        console.log('  ✓ Provider found:');
        console.log(`    ID: ${product.provider.id}`);
        console.log(`    Name: ${product.provider.name}`);
        if (product.provider.description) {
          console.log(`    Description: ${product.provider.description.substring(0, 100)}...`);
        }
        if (product.provider.imageUrl) {
          console.log(`    Image: ${product.provider.imageUrl}`);
        }
        if (product.provider.websiteUrl) {
          console.log(`    Website: ${product.provider.websiteUrl}`);
        }
        if (product.provider.actorList?.nodes?.length) {
          console.log(`    Actors: ${product.provider.actorList.nodes.length}`);
          for (const actor of product.provider.actorList.nodes) {
            console.log(`      - ${actor.name} (${actor.type})`);
          }
        }
      } else {
        productsWithoutProvider++;
        console.log('  ✗ No provider data');
      }

      // Also check legacy fields for comparison
      if (product.supplierId || product.supplierName) {
        console.log(
          `  Legacy fields: supplierId=${product.supplierId}, supplierName=${product.supplierName}`
        );
      }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Products with provider: ${productsWithProvider}`);
    console.log(`Products without provider: ${productsWithoutProvider}`);

    if (productsWithProvider === 0) {
      console.log('\n⚠️  WARNING: No products returned provider data!');
      console.log('   The provider field may not be available in the API response,');
      console.log('   or additional fields may need to be requested.');
    } else {
      console.log('\n✓ Provider data is being returned by the Holibob API');
    }
  } catch (error) {
    console.error('\nError testing Holibob API:', error);
    process.exit(1);
  }
}

testProviderField();
