/**
 * Test Provider List endpoint with updated permissions
 * Run with: npx tsx scripts/test-provider-list-v2.ts
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
  console.log('Testing Provider List Endpoint (v2 - checking permissions)');
  console.log('='.repeat(60));

  // Test 1: Simple providerList query
  console.log('\n--- Testing providerList ---\n');

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
    const result = (await executeQuery(
      apiUrl,
      partnerId,
      apiKey,
      apiSecret,
      providerListQuery
    )) as {
      providerList: { recordCount: number; nodes: Array<{ id: string; name: string }> };
    };
    console.log('SUCCESS!');
    console.log(`Total providers: ${result.providerList.recordCount}`);
    console.log(`\nFirst 20 providers:`);
    for (const provider of result.providerList.nodes.slice(0, 20)) {
      console.log(`  - ${provider.name} (${provider.id})`);
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 2: Check what fields are available on Provider
  console.log('\n--- Testing Provider fields ---\n');

  const providerFieldsQuery = `
    query ProviderListWithFields {
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
    const result = await executeQuery(apiUrl, partnerId, apiKey, apiSecret, providerFieldsQuery);
    console.log('Available fields on Provider type:');
    console.log(JSON.stringify(result, null, 2).substring(0, 500));
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }

  // Test 3: Check if providerList supports filter/sort/pagination
  console.log('\n--- Testing providerList arguments ---\n');

  // Test with filter
  const providerWithFilterQuery = `
    query ProviderListWithFilter {
      providerList(filter: {}) {
        recordCount
        nodes {
          id
          name
        }
      }
    }
  `;

  try {
    const result = await executeQuery(
      apiUrl,
      partnerId,
      apiKey,
      apiSecret,
      providerWithFilterQuery
    );
    console.log('providerList with filter: SUCCESS');
  } catch (error) {
    console.error('providerList with filter: FAILED -', (error as Error).message.substring(0, 200));
  }
}

main().catch(console.error);
