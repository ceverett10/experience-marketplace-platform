/**
 * Test actual Holibob API schema based on error messages
 * The errors from the first test told us:
 * - providerList uses 'sort' and 'filter' args, not 'first'/'after'
 * - Provider only has 'id' and 'name' fields
 * - ProviderList doesn't have 'pageInfo'
 *
 * Run with: npx tsx scripts/test-holibob-actual-schema.ts
 */

import { GraphQLClient } from 'graphql-request';
import { createHmac } from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env' });

function generateSignature(
  apiSecret: string,
  apiKey: string,
  timestamp: string,
  body: string
): string {
  const payload = `${timestamp}${apiKey}POST/graphql${body}`;
  const hmac = createHmac('sha1', apiSecret);
  hmac.update(payload);
  return hmac.digest('base64');
}

async function main() {
  const apiUrl = process.env.HOLIBOB_API_URL!;
  const partnerId = process.env.HOLIBOB_PARTNER_ID!;
  const apiKey = process.env.HOLIBOB_API_KEY!;
  const apiSecret = process.env.HOLIBOB_API_SECRET!;

  console.log('='.repeat(60));
  console.log('Testing Holibob API with Corrected Schema');
  console.log('='.repeat(60));

  // Test 1: Simple providerList query
  console.log('\n--- Test 1: providerList (minimal fields) ---\n');

  const providerListQuery = `
    query ProviderList {
      providerList {
        recordCount
        nodes {
          id
          name
        }
      }
    }
  `;

  try {
    const result = await executeQuery(apiUrl, partnerId, apiKey, apiSecret, providerListQuery);
    console.log('Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 2: Simple productList query
  console.log('\n--- Test 2: productList (minimal fields) ---\n');

  const productListQuery = `
    query ProductList {
      productList {
        recordCount
        nodes {
          id
          name
          provider {
            id
            name
          }
        }
      }
    }
  `;

  try {
    const result = await executeQuery(apiUrl, partnerId, apiKey, apiSecret, productListQuery);
    const typedResult = result as {
      productList: {
        recordCount: number;
        nodes: Array<{ id: string; name: string; provider?: { id: string; name: string } }>;
      };
    };
    console.log(`Total products: ${typedResult.productList?.recordCount ?? 'N/A'}`);
    console.log(`First 10 products:`);
    for (const product of (typedResult.productList?.nodes ?? []).slice(0, 10)) {
      console.log(`  - ${product.name}`);
      console.log(`    ID: ${product.id}`);
      console.log(
        `    Provider: ${product.provider?.name ?? 'N/A'} (${product.provider?.id ?? 'N/A'})`
      );
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 3: productList with filter by providerId
  console.log('\n--- Test 3: productList with providerId filter ---\n');

  // First, get a provider ID from the product list
  const productListForProvider = `
    query ProductListFirst {
      productList {
        nodes {
          provider {
            id
            name
          }
        }
      }
    }
  `;

  try {
    const firstResult = (await executeQuery(
      apiUrl,
      partnerId,
      apiKey,
      apiSecret,
      productListForProvider
    )) as {
      productList: { nodes: Array<{ provider?: { id: string; name: string } }> };
    };

    // Find a provider with products
    const providersWithProducts = firstResult.productList.nodes
      .filter((n) => n.provider?.id)
      .map((n) => n.provider!);

    const uniqueProviders = [...new Map(providersWithProducts.map((p) => [p.id, p])).values()];

    console.log(`Found ${uniqueProviders.length} unique providers in product list`);

    if (uniqueProviders.length > 0) {
      const testProvider = uniqueProviders[0];
      console.log(`\nTesting filter by provider: ${testProvider.name} (${testProvider.id})`);

      // Try with filter parameter
      const filteredQuery = `
        query ProductListByProvider($providerId: ID!) {
          productList(filter: { providerId: $providerId }) {
            recordCount
            nodes {
              id
              name
            }
          }
        }
      `;

      try {
        const filteredResult = (await executeQuery(
          apiUrl,
          partnerId,
          apiKey,
          apiSecret,
          filteredQuery,
          { providerId: testProvider.id }
        )) as {
          productList: { recordCount: number; nodes: Array<{ id: string; name: string }> };
        };
        console.log(
          `Products for ${testProvider.name}: ${filteredResult.productList?.recordCount ?? 'N/A'}`
        );
        for (const product of (filteredResult.productList?.nodes ?? []).slice(0, 5)) {
          console.log(`  - ${product.name} (${product.id})`);
        }
      } catch (filterError) {
        console.error(
          'Filter query error:',
          filterError instanceof Error ? filterError.message : filterError
        );
      }
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function executeQuery(
  apiUrl: string,
  partnerId: string,
  apiKey: string,
  apiSecret: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ query, variables });
  const signature = generateSignature(apiSecret, apiKey, timestamp, body);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-Partner-Id': partnerId,
      'X-Holibob-Date': timestamp,
      'X-Holibob-Signature': signature,
    },
    body,
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(JSON.stringify(result.errors, null, 2));
  }

  return result.data;
}

main().catch(console.error);
