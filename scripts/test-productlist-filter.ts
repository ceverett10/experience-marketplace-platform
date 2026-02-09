/**
 * Test productList with correct filter syntax
 * Run with: npx tsx scripts/test-productlist-filter.ts
 */

import { createHmac } from 'crypto';
import * as dotenv from 'dotenv';

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

async function main() {
  const apiUrl = process.env.HOLIBOB_API_URL!;
  const partnerId = process.env.HOLIBOB_PARTNER_ID!;
  const apiKey = process.env.HOLIBOB_API_KEY!;
  const apiSecret = process.env.HOLIBOB_API_SECRET!;

  console.log('='.repeat(60));
  console.log('Testing productList with providerId filter (String type)');
  console.log('='.repeat(60));

  // Test with known provider ID from previous test
  const testProviderId = '04e3a6a9-0193-415f-89a6-4cdb7f4f77ba'; // Runners Adventures
  const testProviderName = 'Runners Adventures';

  // Test 1: Try with String type
  console.log(`\n--- Testing filter with String type for ${testProviderName} ---\n`);

  const query1 = `
    query ProductListByProvider($providerId: String!) {
      productList(filter: { providerId: $providerId }) {
        recordCount
        nodes {
          id
          name
          guidePrice
          guidePriceCurrency
          reviewRating
          reviewCount
          imageList {
            id
            url
          }
          provider {
            id
            name
          }
          place {
            name
          }
          categoryList {
            nodes {
              id
              name
            }
          }
        }
      }
    }
  `;

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query1, {
      providerId: testProviderId,
    })) as {
      productList: {
        recordCount: number;
        nodes: Array<{
          id: string;
          name: string;
          guidePrice?: number;
          guidePriceCurrency?: string;
          reviewRating?: number;
          reviewCount?: number;
          imageList?: Array<{ url: string }>;
          provider?: { id: string; name: string };
          place?: { name: string };
          categoryList?: { nodes: Array<{ name: string }> };
        }>;
      };
    };

    console.log(`SUCCESS! Products for ${testProviderName}: ${result.productList.recordCount}`);
    console.log('');

    for (const product of result.productList.nodes.slice(0, 5)) {
      console.log(`  - ${product.name}`);
      console.log(`    ID: ${product.id}`);
      console.log(
        `    Price: ${product.guidePriceCurrency ?? 'N/A'} ${product.guidePrice ? (product.guidePrice / 100).toFixed(2) : 'N/A'}`
      );
      console.log(
        `    Rating: ${product.reviewRating ?? 'N/A'} (${product.reviewCount ?? 0} reviews)`
      );
      console.log(`    Location: ${product.place?.name ?? 'N/A'}`);
      console.log(`    Image: ${product.imageList?.[0]?.url ?? 'N/A'}`);
      console.log(
        `    Categories: ${product.categoryList?.nodes.map((c) => c.name).join(', ') || 'N/A'}`
      );
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 2: Test another provider
  console.log('\n--- Testing with another provider (The Chocolatarium) ---\n');
  const chocolatariumId = '4150ef69-087e-41e9-b435-c59eb08d8832';

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query1, {
      providerId: chocolatariumId,
    })) as {
      productList: { recordCount: number; nodes: Array<{ id: string; name: string }> };
    };
    console.log(`Products for The Chocolatarium: ${result.productList.recordCount}`);
    for (const product of result.productList.nodes.slice(0, 3)) {
      console.log(`  - ${product.name}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 3: Test one of the existing microsite supplier IDs
  console.log('\n--- Testing with existing microsite supplier ID ---\n');
  const italyRomeTourId = 'ae48c64b-ab3d-4429-afad-e5f32ff93d65'; // ITALY ROME TOUR

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query1, {
      providerId: italyRomeTourId,
    })) as {
      productList: {
        recordCount: number;
        nodes: Array<{ id: string; name: string; provider?: { name: string } }>;
      };
    };
    console.log(`Products for ITALY ROME TOUR: ${result.productList.recordCount}`);
    for (const product of result.productList.nodes) {
      console.log(`  - ${product.name}`);
      console.log(`    Provider: ${product.provider?.name ?? 'N/A'}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
