/**
 * Discover all providers from Holibob product list
 * This is the strategy for building microsites - one per provider
 *
 * Run with: npx tsx scripts/discover-all-providers.ts
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
  console.log('Discovering All Providers from Holibob Product List');
  console.log('='.repeat(70));

  // Query to get all products with their provider info
  const query = `
    query AllProducts {
      productList {
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

  console.log('\nFetching all products from Holibob...\n');

  try {
    const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query)) as {
      productList: {
        recordCount: number;
        nodes: Array<{ id: string; provider?: { id: string; name: string } }>;
      };
    };

    console.log(`Total products in Holibob: ${result.productList.recordCount}`);
    console.log(`Products returned: ${result.productList.nodes.length}`);

    // Extract unique providers and count their products
    const providerMap = new Map<string, Provider>();

    for (const product of result.productList.nodes) {
      if (product.provider?.id) {
        const existing = providerMap.get(product.provider.id);
        if (existing) {
          existing.productCount++;
        } else {
          providerMap.set(product.provider.id, {
            id: product.provider.id,
            name: product.provider.name,
            productCount: 1,
          });
        }
      }
    }

    const providers = Array.from(providerMap.values());

    // Sort by product count descending
    providers.sort((a, b) => b.productCount - a.productCount);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`TOTAL UNIQUE PROVIDERS: ${providers.length}`);
    console.log(`${'='.repeat(70)}\n`);

    // Show top 50 providers by product count
    console.log('Top 50 Providers by Product Count:\n');
    console.log(
      `${'#'.padEnd(4)} ${'Provider Name'.padEnd(50)} ${'Products'.padStart(10)} Provider ID`
    );
    console.log('-'.repeat(100));

    for (let i = 0; i < Math.min(50, providers.length); i++) {
      const p = providers[i];
      console.log(
        `${(i + 1).toString().padEnd(4)} ${p.name.substring(0, 48).padEnd(50)} ${p.productCount.toString().padStart(10)} ${p.id}`
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
    console.log(`\n${'='.repeat(70)}`);
    console.log('MICROSITE POTENTIAL:');
    console.log('-'.repeat(70));
    console.log(`  Total providers that could have microsites: ${providers.length}`);
    console.log(
      `  Providers with 5+ products (good for catalog layout): ${providers.filter((p) => p.productCount >= 5).length}`
    );
    console.log(
      `  Providers with 1 product (spotlight layout): ${providers.filter((p) => p.productCount === 1).length}`
    );
    console.log(`${'='.repeat(70)}\n`);

    // Export to JSON for further analysis
    const outputPath = './scripts/discovered-providers.json';
    const fs = await import('fs');
    fs.writeFileSync(outputPath, JSON.stringify(providers, null, 2));
    console.log(`Full provider list exported to: ${outputPath}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

main().catch(console.error);
