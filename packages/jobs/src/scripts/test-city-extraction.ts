/**
 * Test script: verify city extraction and seed quality from product names.
 * Run on Heroku: heroku run 'cd /app && node packages/jobs/dist/scripts/test-city-extraction.js'
 */
import { prisma } from '@experience-marketplace/database';
import { createHolibobClient } from '@experience-marketplace/holibob-api';

// Inline a subset of KNOWN_DESTINATIONS for testing
const KNOWN_DESTINATIONS = new Set([
  'london', 'paris', 'barcelona', 'rome', 'amsterdam', 'lisbon', 'madrid',
  'berlin', 'vienna', 'prague', 'budapest', 'dublin', 'edinburgh', 'athens',
  'florence', 'venice', 'milan', 'naples', 'seville', 'porto', 'nice',
  'munich', 'bruges', 'dubrovnik', 'split', 'york', 'cambridge',
  'tokyo', 'kyoto', 'osaka', 'bangkok', 'singapore', 'hong kong',
  'bali', 'dubai', 'colombo', 'kandy', 'cairo', 'cape town',
  'sydney', 'melbourne', 'auckland', 'queenstown',
  'sri lanka', 'italy', 'france', 'greece', 'japan', 'indonesia',
  'martinique', 'lucca', 'como', 'cebu', 'jakarta', 'savannah',
  'minneapolis', 'guayaquil',
]);

function extractCity(name: string): string | null {
  const nl = name.toLowerCase();
  let best: string | null = null;
  let bestLen = 0;
  for (const d of KNOWN_DESTINATIONS) {
    if (d.length > bestLen && nl.includes(d)) {
      const regex = new RegExp(`\\b${d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(nl)) {
        best = d;
        bestLen = d.length;
      }
    }
  }
  return best
    ? best.split(' ').map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')
    : null;
}

async function main() {
  const client = createHolibobClient({
    apiUrl: process.env['HOLIBOB_API_URL']!,
    partnerId: process.env['HOLIBOB_PARTNER_ID']!,
    apiKey: process.env['HOLIBOB_API_KEY']!,
    apiSecret: process.env['HOLIBOB_API_SECRET'],
  });

  // Test with 4 known experience-focused suppliers
  const supplierNames = ['Home Food S.r.l.', 'Lakpura LLC', 'VoiceMap', 'Cesarine'];
  const suppliers = await prisma.supplier.findMany({
    where: { name: { in: supplierNames }, microsite: { status: 'ACTIVE' } },
    select: { id: true, holibobSupplierId: true, name: true },
  });

  for (const sup of suppliers) {
    console.log(`\n=== ${sup.name} ===`);
    const resp = await client.getProductsByProvider(sup.holibobSupplierId, { pageSize: 10 });
    const cities = new Set<string>();

    for (const p of resp.nodes) {
      const city = extractCity(p.name);
      if (city) cities.add(city);
      const cats = (p.categoryList?.nodes || []).map((n: any) => n.name).filter(Boolean);
      console.log(`  ${p.name}`);
      console.log(`    → city=${city || 'NONE'}  cats=[${cats.join(', ')}]`);
    }
    console.log(`  Cities found: [${[...cities].join(', ')}]`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
