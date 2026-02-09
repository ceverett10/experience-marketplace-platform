/**
 * Discover all providers with pagination exploration
 * Run with: npx tsx scripts/discover-providers-paginated.ts
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

  console.log('='.repeat(70));
  console.log('Testing productList Pagination Options');
  console.log('='.repeat(70));

  // Test 1: Check if 'first' parameter works
  console.log('\n--- Test 1: productList with first: 100 ---\n');

  const query1 = `
    query ProductListWithFirst($first: Int) {
      productList(first: $first) {
        recordCount
        nodes {
          id
          provider {
            id
            name
          }
        }
      }
    }
  `;

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query1, {
      first: 100,
    })) as {
      productList: {
        recordCount: number;
        nodes: Array<{ id: string; provider?: { id: string; name: string } }>;
      };
    };
    console.log(`recordCount: ${result.productList.recordCount}`);
    console.log(`nodes returned: ${result.productList.nodes.length}`);

    // Count unique providers
    const providers = new Set<string>();
    result.productList.nodes.forEach((p) => {
      if (p.provider?.id) providers.add(p.provider.id);
    });
    console.log(`Unique providers: ${providers.size}`);
  } catch (error) {
    console.error('Error or unsupported');
  }

  // Test 2: Check if pagination works
  console.log('\n--- Test 2: productList with first and after ---\n');

  const query2 = `
    query ProductListPaginated($first: Int, $after: String) {
      productList(first: $first, after: $after) {
        recordCount
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
        }
      }
    }
  `;

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query2, {
      first: 50,
    })) as {
      productList: {
        recordCount: number;
        pageInfo?: { hasNextPage: boolean; endCursor?: string };
        nodes: Array<{ id: string }>;
      };
    };
    console.log(`recordCount: ${result.productList.recordCount}`);
    console.log(`nodes returned: ${result.productList.nodes.length}`);
    console.log(`pageInfo:`, result.productList.pageInfo);
  } catch (error) {
    console.error('Error or unsupported');
  }

  // Test 3: Try without pagination to see default behavior
  console.log('\n--- Test 3: Check productList schema via introspection ---\n');

  const introspectQuery = `
    query {
      __type(name: "ProductList") {
        name
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  `;

  try {
    const result = await executeQuery(apiUrl, partnerId, apiKey, apiSecret, introspectQuery);
    console.log('ProductList type fields:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Introspection failed');
  }

  // Test 4: Try productList query arguments introspection
  console.log('\n--- Test 4: Check productList query arguments ---\n');

  const argsQuery = `
    query {
      __schema {
        queryType {
          fields(includeDeprecated: true) {
            name
            args {
              name
              type {
                name
                kind
                ofType {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, argsQuery)) as {
      __schema: {
        queryType: {
          fields: Array<{ name: string; args: Array<{ name: string; type: { name: string } }> }>;
        };
      };
    };

    const productListField = result.__schema.queryType.fields.find((f) => f.name === 'productList');
    if (productListField) {
      console.log('productList arguments:');
      for (const arg of productListField.args) {
        console.log(`  - ${arg.name}: ${JSON.stringify(arg.type)}`);
      }
    }
  } catch (error) {
    console.error('Schema introspection failed');
  }
}

main().catch(console.error);
