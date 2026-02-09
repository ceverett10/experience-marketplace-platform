/**
 * Test script to query Holibob production API directly
 * Run with: npx tsx scripts/test-production-api.ts
 */
import 'dotenv/config';
import { createHolibobClient } from '../packages/holibob-api/src/index.js';

async function testAPI(apiUrl: string, label: string, providerId: string) {
  console.log(`\n=== Testing ${label}: ${apiUrl} ===\n`);
  console.log(`Provider ID: ${providerId}\n`);

  const client = createHolibobClient({
    apiUrl,
    apiKey: process.env.HOLIBOB_API_KEY || '',
    apiSecret: process.env.HOLIBOB_API_SECRET,
    partnerId: process.env.HOLIBOB_PARTNER_ID || 'holibob',
    timeout: 30000,
  });

  try {
    const response = await client.getProductsByProvider(providerId, { pageSize: 100, page: 1 });

    console.log('recordCount:', response.recordCount);
    console.log('unfilteredRecordCount:', response.unfilteredRecordCount);
    console.log('pages:', response.pages);
    console.log('nextPage:', response.nextPage);
    console.log('nodes count:', response.nodes?.length);

    // Show first 5 products
    console.log('\nFirst 5 products:');
    response.nodes?.slice(0, 5).forEach((p: any, i: number) => {
      console.log(`  ${i + 1}. ${p.name} (cityId: ${p.place?.cityId || 'no place'})`);
    });

    // Count unique cityIds
    const cityIds = new Set(response.nodes?.map((p: any) => p.place?.cityId).filter(Boolean));
    console.log(`\nUnique city IDs: ${cityIds.size}`);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  console.log('Environment check:');
  console.log('  HOLIBOB_API_KEY:', process.env.HOLIBOB_API_KEY ? 'set' : 'NOT SET');
  console.log('  HOLIBOB_API_SECRET:', process.env.HOLIBOB_API_SECRET ? 'set' : 'NOT SET');
  console.log('  HOLIBOB_PARTNER_ID:', process.env.HOLIBOB_PARTNER_ID || 'NOT SET (using holibob)');

  // The providerId for taxigo microsite - this is the actual Holibob supplier ID (UUID)
  const providerId = '26722af6-2b4e-4b45-946d-8ee218dddcf1';

  // Test both APIs
  await testAPI('https://api.sandbox.holibob.tech/graphql', 'SANDBOX', providerId);
  await testAPI('https://api.production.holibob.tech/graphql', 'PRODUCTION', providerId);
}

main().catch(console.error);
