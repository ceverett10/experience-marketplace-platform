/**
 * Discover all providers using correct Holibob API schema
 * - Uses page/pageSize for pagination
 * - Uses providerTree to get all providers at once
 *
 * Run with: npx tsx scripts/discover-providers-correct.ts
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

interface Provider {
  id: string;
  name: string;
  productCount: number;
}

async function main() {
  const apiUrl = process.env.HOLIBOB_API_URL!;
  const partnerId = process.env.HOLIBOB_PARTNER_ID!;
  const apiKey = process.env.HOLIBOB_API_KEY!;
  const apiSecret = process.env.HOLIBOB_API_SECRET!;

  console.log('='.repeat(70));
  console.log('Discovering All Providers Using Correct API Schema');
  console.log('='.repeat(70));

  // Test 1: Get providerTree from productList
  console.log('\n--- Method 1: Using providerTree ---\n');

  const providerTreeQuery = `
    query GetProviderTree {
      productList {
        recordCount
        providerTree {
          nodes {
            id
            name
            productCount
          }
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
      providerTreeQuery
    )) as {
      productList: {
        recordCount: number;
        providerTree?: {
          nodes: Array<{ id: string; name: string; productCount: number }>;
        };
      };
    };

    console.log(`Total products: ${result.productList.recordCount}`);

    if (result.productList.providerTree) {
      const providers = result.productList.providerTree.nodes;

      // Sort by product count descending
      providers.sort((a, b) => b.productCount - a.productCount);

      console.log(`\n${'='.repeat(70)}`);
      console.log(`TOTAL PROVIDERS: ${providers.length}`);
      console.log(`${'='.repeat(70)}\n`);

      // Show top 50
      console.log('Top 50 Providers by Product Count:\n');
      console.log(`${'#'.padEnd(4)} ${'Provider Name'.padEnd(50)} ${'Products'.padStart(10)}`);
      console.log('-'.repeat(70));

      for (let i = 0; i < Math.min(50, providers.length); i++) {
        const p = providers[i];
        console.log(
          `${(i + 1).toString().padEnd(4)} ${p.name.substring(0, 48).padEnd(50)} ${p.productCount.toString().padStart(10)}`
        );
      }

      // Distribution stats
      console.log(`\n${'='.repeat(70)}`);
      console.log('Product Count Distribution:');
      console.log('-'.repeat(70));

      const ranges = [
        { min: 100, max: Infinity, label: '100+ products' },
        { min: 50, max: 99, label: '50-99 products' },
        { min: 20, max: 49, label: '20-49 products' },
        { min: 10, max: 19, label: '10-19 products' },
        { min: 5, max: 9, label: '5-9 products' },
        { min: 2, max: 4, label: '2-4 products' },
        { min: 1, max: 1, label: '1 product' },
      ];

      for (const range of ranges) {
        const count = providers.filter(
          (p) => p.productCount >= range.min && p.productCount <= range.max
        ).length;
        console.log(`  ${range.label.padEnd(20)}: ${count} providers`);
      }

      // Summary
      const totalProducts = providers.reduce((sum, p) => sum + p.productCount, 0);
      console.log(`\n${'='.repeat(70)}`);
      console.log('MICROSITE POTENTIAL:');
      console.log('-'.repeat(70));
      console.log(`  Total unique providers: ${providers.length}`);
      console.log(`  Total products across all providers: ${totalProducts}`);
      console.log(
        `  Providers with 5+ products (CATALOG layout): ${providers.filter((p) => p.productCount >= 5).length}`
      );
      console.log(
        `  Providers with 2-4 products (small CATALOG): ${providers.filter((p) => p.productCount >= 2 && p.productCount <= 4).length}`
      );
      console.log(
        `  Providers with 1 product (SPOTLIGHT layout): ${providers.filter((p) => p.productCount === 1).length}`
      );
      console.log(`${'='.repeat(70)}\n`);

      // Export to JSON
      const fs = await import('fs');
      fs.writeFileSync('./scripts/all-providers.json', JSON.stringify(providers, null, 2));
      console.log('Full provider list exported to: ./scripts/all-providers.json');
    } else {
      console.log('providerTree not available');
    }
  } catch (error) {
    console.error('providerTree query failed, trying fallback...');
  }

  // Test 2: Pagination with pageSize
  console.log('\n--- Method 2: Using pageSize pagination ---\n');

  const paginatedQuery = `
    query ProductListPaginated($page: Int, $pageSize: Int) {
      productList(page: $page, pageSize: $pageSize) {
        recordCount
        pageCount
        nextPage
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
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, paginatedQuery, {
      page: 1,
      pageSize: 100,
    })) as {
      productList: {
        recordCount: number;
        pageCount: number;
        nextPage: number | null;
        nodes: Array<{ id: string; provider?: { id: string; name: string } }>;
      };
    };

    console.log(`recordCount: ${result.productList.recordCount}`);
    console.log(`pageCount: ${result.productList.pageCount}`);
    console.log(`nextPage: ${result.productList.nextPage}`);
    console.log(`nodes on page 1: ${result.productList.nodes.length}`);

    // Count unique providers from this page
    const providers = new Set<string>();
    result.productList.nodes.forEach((p) => {
      if (p.provider?.id) providers.add(p.provider.id);
    });
    console.log(`Unique providers on page 1: ${providers.size}`);
  } catch (error) {
    console.error('Paginated query failed');
  }
}

main().catch(console.error);
