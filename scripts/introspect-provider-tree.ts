/**
 * Introspect ProviderTree type to understand its structure
 * Run with: npx tsx scripts/introspect-provider-tree.ts
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
  query: string
): Promise<unknown> {
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ query });
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
    console.log('GraphQL Errors:', JSON.stringify(result.errors, null, 2));
    throw new Error('GraphQL query failed');
  }

  return result.data;
}

async function main() {
  const apiUrl = process.env.HOLIBOB_API_URL!;
  const partnerId = process.env.HOLIBOB_PARTNER_ID!;
  const apiKey = process.env.HOLIBOB_API_KEY!;
  const apiSecret = process.env.HOLIBOB_API_SECRET!;

  // Introspect ProviderTree
  console.log('='.repeat(70));
  console.log('Introspecting ProviderTree and ProviderTreeList types');
  console.log('='.repeat(70));

  const query = `
    query {
      providerTreeList: __type(name: "ProviderTreeList") {
        name
        fields {
          name
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
      providerTree: __type(name: "ProviderTree") {
        name
        fields {
          name
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
    }
  `;

  try {
    const result = await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Failed');
  }

  // Try to get providerTree data
  console.log('\n--- Testing providerTree with correct fields ---\n');

  const dataQuery = `
    query GetProviderTree {
      productList {
        providerTree {
          nodes {
            id
            count
          }
        }
      }
    }
  `;

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, dataQuery)) as {
      productList: {
        providerTree?: {
          nodes: Array<{ id: string; count: number }>;
        };
      };
    };

    if (result.productList.providerTree) {
      const providers = result.productList.providerTree.nodes;
      console.log(`Total providers from providerTree: ${providers.length}`);
      console.log('\nFirst 10 providers:');
      for (const p of providers.slice(0, 10)) {
        console.log(`  ${p.id}: ${p.count} products`);
      }
    }
  } catch (error) {
    console.error('providerTree data query failed');
  }
}

main().catch(console.error);
