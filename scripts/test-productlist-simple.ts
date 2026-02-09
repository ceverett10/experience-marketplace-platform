/**
 * Test productList with simplified query
 * Run with: npx tsx scripts/test-productlist-simple.ts
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
  console.log('Testing productList filter with simplified query');
  console.log('='.repeat(60));

  // Simplified query matching productDetail fields
  const query = `
    query ProductListByProvider($providerId: String!) {
      productList(filter: { providerId: $providerId }) {
        recordCount
        nodes {
          id
          name
          description
          guidePrice
          guidePriceFormattedText
          guidePriceCurrency
          maxDuration
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

  // Test with ITALY ROME TOUR
  console.log('\n--- Testing with ITALY ROME TOUR ---\n');
  const italyRomeTourId = 'ae48c64b-ab3d-4429-afad-e5f32ff93d65';

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query, {
      providerId: italyRomeTourId,
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
          maxDuration?: number;
          imageList?: Array<{ url: string }>;
          provider?: { id: string; name: string };
        }>;
      };
    };

    console.log(`SUCCESS! Products for ITALY ROME TOUR: ${result.productList.recordCount}`);
    console.log('');

    for (const product of result.productList.nodes) {
      console.log(`  - ${product.name}`);
      console.log(`    ID: ${product.id}`);
      console.log(
        `    Provider: ${product.provider?.name ?? 'N/A'} (${product.provider?.id ?? 'N/A'})`
      );
      console.log(
        `    Price: ${product.guidePriceCurrency ?? 'N/A'} ${product.guidePrice ? (product.guidePrice / 100).toFixed(2) : 'N/A'}`
      );
      console.log(
        `    Rating: ${product.reviewRating ?? 'N/A'} (${product.reviewCount ?? 0} reviews)`
      );
      console.log(`    Duration: ${product.maxDuration ?? 'N/A'} mins`);
      console.log(`    Image: ${product.imageList?.[0]?.url?.substring(0, 60) ?? 'N/A'}...`);
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test with Hong Kong a la carte
  console.log('\n--- Testing with Hong Kong a la carte ---\n');
  const hongKongId = 'b2a82637-7143-4b61-b500-05732740a8ed';

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query, {
      providerId: hongKongId,
    })) as {
      productList: { recordCount: number; nodes: Array<{ id: string; name: string }> };
    };
    console.log(`SUCCESS! Products for Hong Kong a la carte: ${result.productList.recordCount}`);
    for (const product of result.productList.nodes.slice(0, 5)) {
      console.log(`  - ${product.name}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test with The Chocolatarium
  console.log('\n--- Testing with The Chocolatarium ---\n');
  const chocolatariumId = '4150ef69-087e-41e9-b435-c59eb08d8832';

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query, {
      providerId: chocolatariumId,
    })) as {
      productList: { recordCount: number; nodes: Array<{ id: string; name: string }> };
    };
    console.log(`SUCCESS! Products for The Chocolatarium: ${result.productList.recordCount}`);
    for (const product of result.productList.nodes) {
      console.log(`  - ${product.name}`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
