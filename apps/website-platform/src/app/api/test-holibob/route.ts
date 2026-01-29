/**
 * Test endpoint to verify Holibob API connection
 * GET /api/test-holibob - Tests API credentials and fetches sample products
 */

import { NextResponse } from 'next/server';
import { getHolibobClient } from '@/lib/holibob';

export async function GET() {
  try {
    // Create client with default config (uses env vars)
    const client = getHolibobClient({
      id: 'test',
      slug: 'test',
      name: 'Test Site',
      holibobPartnerId: process.env.HOLIBOB_PARTNER_ID || 'holibob',
    });

    // Try to fetch products from Holibob
    const products = await client.getProducts({
      first: 5, // Just get 5 products to test
    });

    return NextResponse.json({
      success: true,
      message: 'Holibob API connection successful!',
      apiUrl: process.env.HOLIBOB_API_URL,
      partnerId: process.env.HOLIBOB_PARTNER_ID,
      productsFound: products.totalCount,
      sampleProducts: products.items.map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
      })),
    });
  } catch (error) {
    console.error('Holibob API test error:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      apiUrl: process.env.HOLIBOB_API_URL,
      partnerId: process.env.HOLIBOB_PARTNER_ID,
      hasApiKey: !!process.env.HOLIBOB_API_KEY,
      hasApiSecret: !!process.env.HOLIBOB_API_SECRET,
    }, { status: 500 });
  }
}
