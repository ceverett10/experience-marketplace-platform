/**
 * Get ALL providers from Holibob using providerTree
 * This is the definitive list for building microsites
 *
 * Run with: npx tsx scripts/get-all-providers-final.ts
 */

import { createHmac } from 'crypto';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

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

  console.log('='.repeat(80));
  console.log('HOLIBOB PROVIDER DISCOVERY - Complete List for Microsite Creation');
  console.log('='.repeat(80));

  const query = `
    query GetAllProviders {
      productList {
        recordCount
        providerTree {
          recordCount
          nodes {
            id
            label
            count
          }
        }
      }
    }
  `;

  console.log('\nFetching all providers from Holibob providerTree...\n');

  const result = (await executeQuery(apiUrl, partnerId, apiKey, apiSecret, query)) as {
    productList: {
      recordCount: number;
      providerTree: {
        recordCount: number;
        nodes: Array<{ id: string; label: string; count: number }>;
      };
    };
  };

  const totalProducts = result.productList.recordCount;
  const providerNodes = result.productList.providerTree.nodes;

  // Map to our Provider interface
  const providers: Provider[] = providerNodes.map((p) => ({
    id: p.id,
    name: p.label,
    productCount: p.count,
  }));

  // Sort by product count descending
  providers.sort((a, b) => b.productCount - a.productCount);

  console.log('='.repeat(80));
  console.log(`TOTAL PRODUCTS IN HOLIBOB: ${totalProducts.toLocaleString()}`);
  console.log(`TOTAL UNIQUE PROVIDERS: ${providers.length.toLocaleString()}`);
  console.log('='.repeat(80));

  // Show top 30 providers
  console.log('\nTop 30 Providers by Product Count:\n');
  console.log(`${'#'.padEnd(5)} ${'Provider Name'.padEnd(55)} ${'Products'.padStart(10)}`);
  console.log('-'.repeat(75));

  for (let i = 0; i < Math.min(30, providers.length); i++) {
    const p = providers[i];
    console.log(
      `${(i + 1).toString().padEnd(5)} ${p.name.substring(0, 53).padEnd(55)} ${p.productCount.toLocaleString().padStart(10)}`
    );
  }

  // Distribution stats
  console.log(`\n${'='.repeat(80)}`);
  console.log('PRODUCT COUNT DISTRIBUTION:');
  console.log('-'.repeat(80));

  const ranges = [
    { min: 1000, max: Infinity, label: '1000+ products' },
    { min: 500, max: 999, label: '500-999 products' },
    { min: 100, max: 499, label: '100-499 products' },
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
    const percent = ((count / providers.length) * 100).toFixed(1);
    console.log(
      `  ${range.label.padEnd(20)}: ${count.toLocaleString().padStart(6)} providers (${percent}%)`
    );
  }

  // Microsite layout recommendations
  console.log(`\n${'='.repeat(80)}`);
  console.log('MICROSITE LAYOUT RECOMMENDATIONS:');
  console.log('-'.repeat(80));

  const spotlight = providers.filter((p) => p.productCount === 1);
  const smallCatalog = providers.filter((p) => p.productCount >= 2 && p.productCount <= 4);
  const catalog = providers.filter((p) => p.productCount >= 5 && p.productCount <= 50);
  const marketplace = providers.filter((p) => p.productCount > 50);

  console.log(
    `  PRODUCT_SPOTLIGHT (1 product):     ${spotlight.length.toLocaleString().padStart(6)} microsites`
  );
  console.log(
    `  CATALOG (2-50 products):           ${(smallCatalog.length + catalog.length).toLocaleString().padStart(6)} microsites`
  );
  console.log(
    `    - Small catalog (2-4):           ${smallCatalog.length.toLocaleString().padStart(6)}`
  );
  console.log(
    `    - Full catalog (5-50):           ${catalog.length.toLocaleString().padStart(6)}`
  );
  console.log(
    `  MARKETPLACE (51+ products):        ${marketplace.length.toLocaleString().padStart(6)} microsites`
  );
  console.log(`  ---------------------------------------------------------`);
  console.log(
    `  TOTAL POTENTIAL MICROSITES:        ${providers.length.toLocaleString().padStart(6)}`
  );

  // Summary
  const productsInMicrosites = providers.reduce((sum, p) => sum + p.productCount, 0);
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY:');
  console.log('-'.repeat(80));
  console.log(
    `  We can create ${providers.length.toLocaleString()} microsites covering ${productsInMicrosites.toLocaleString()} products`
  );
  console.log(
    `  This represents 100% of Holibob's ${totalProducts.toLocaleString()} total products`
  );
  console.log('='.repeat(80));

  // Export to JSON
  fs.writeFileSync('./scripts/holibob-providers-complete.json', JSON.stringify(providers, null, 2));
  console.log('\nFull provider list exported to: ./scripts/holibob-providers-complete.json');

  // Also create a CSV for easy viewing
  const csv = ['id,name,productCount']
    .concat(providers.map((p) => `${p.id},"${p.name.replace(/"/g, '""')}",${p.productCount}`))
    .join('\n');
  fs.writeFileSync('./scripts/holibob-providers-complete.csv', csv);
  console.log('CSV export: ./scripts/holibob-providers-complete.csv');
}

main().catch(console.error);
