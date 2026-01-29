/**
 * Test endpoint to verify Holibob API connection
 * GET /api/test-holibob - Tests API credentials and fetches sample products
 */

import { NextResponse } from 'next/server';
import { createHolibobClient } from '@experience-marketplace/holibob-api';

export async function GET() {
  try {
    // Create client directly with env vars
    const client = createHolibobClient({
      apiUrl: process.env.HOLIBOB_API_URL || 'https://api.sandbox.holibob.tech/graphql',
      apiKey: process.env.HOLIBOB_API_KEY || '',
      apiSecret: process.env.HOLIBOB_API_SECRET,
      partnerId: process.env.HOLIBOB_PARTNER_ID || 'holibob',
      timeout: 30000,
      retries: 3,
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
      sampleProducts: products.items.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
      })),
    });
  } catch (error) {
    console.error('Holibob API test error:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        apiUrl: process.env.HOLIBOB_API_URL,
        partnerId: process.env.HOLIBOB_PARTNER_ID,
        hasApiKey: !!process.env.HOLIBOB_API_KEY,
        hasApiSecret: !!process.env.HOLIBOB_API_SECRET,
      },
      { status: 500 }
    );
  }
}
