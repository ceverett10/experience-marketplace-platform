/**
 * Test script to verify Provider List and Product List by Provider endpoints
 * Run with: npx tsx scripts/test-provider-api.ts
 */

import { createHolibobClient } from '@experience-marketplace/holibob-api';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

async function main() {
  const apiUrl = process.env.HOLIBOB_API_URL;
  const partnerId = process.env.HOLIBOB_PARTNER_ID;
  const apiKey = process.env.HOLIBOB_API_KEY;
  const apiSecret = process.env.HOLIBOB_API_SECRET;

  if (!apiUrl || !partnerId || !apiKey) {
    console.error('Missing Holibob API configuration in .env');
    console.error('Required: HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('Testing Holibob Provider List & Product List Endpoints');
  console.log('='.repeat(60));
  console.log('API URL:', apiUrl);
  console.log('Partner ID:', partnerId);
  console.log('');

  const client = createHolibobClient({
    apiUrl,
    partnerId,
    apiKey,
    apiSecret,
  });

  // Test 1: Get providers
  console.log('TEST 1: Provider List Endpoint');
  console.log('-'.repeat(40));

  try {
    const providersResponse = await client.getProviders({ first: 20 });

    console.log(`Total providers in Holibob: ${providersResponse.recordCount}`);
    console.log(`Fetched: ${providersResponse.nodes.length}`);
    console.log(`Has more pages: ${providersResponse.pageInfo.hasNextPage}`);
    console.log('');

    if (providersResponse.nodes.length > 0) {
      console.log('Sample providers:');
      for (const provider of providersResponse.nodes.slice(0, 5)) {
        console.log(`  - ${provider.name} (ID: ${provider.id})`);
        console.log(
          `    Products: ${provider.productCount ?? 'N/A'}, Rating: ${provider.reviewRating ?? 'N/A'}`
        );
      }
      console.log('');

      // Test 2: Get products for first provider
      const testProvider = providersResponse.nodes[0];
      console.log('TEST 2: Product List by Provider Endpoint');
      console.log('-'.repeat(40));
      console.log(`Testing with provider: ${testProvider.name} (${testProvider.id})`);
      console.log('');

      try {
        const productsResponse = await client.getProductsByProvider(testProvider.id, { first: 20 });

        console.log(`Total products for this provider: ${productsResponse.recordCount}`);
        console.log(`Fetched: ${productsResponse.nodes.length}`);
        console.log(`Has more pages: ${productsResponse.pageInfo.hasNextPage}`);
        console.log('');

        if (productsResponse.nodes.length > 0) {
          console.log('Sample products:');
          for (const product of productsResponse.nodes.slice(0, 5)) {
            const price = product.guidePrice ?? product.priceFrom;
            const currency = product.guidePriceCurrency ?? product.priceCurrency ?? 'GBP';
            console.log(`  - ${product.name}`);
            console.log(`    ID: ${product.id}`);
            console.log(`    Price: ${price ? `${currency} ${(price / 100).toFixed(2)}` : 'N/A'}`);
            console.log(
              `    Rating: ${product.reviewRating ?? 'N/A'} (${product.reviewCount ?? 0} reviews)`
            );
            console.log(`    Location: ${product.place?.name ?? 'N/A'}`);
          }
        } else {
          console.log('No products returned for this provider');
        }
      } catch (productError) {
        console.error('Error fetching products:', productError);
      }
    } else {
      console.log('No providers returned');
    }
  } catch (providerError) {
    console.error('Error fetching providers:', providerError);
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Test complete');
  console.log('='.repeat(60));
}

main().catch(console.error);
