import { NextRequest, NextResponse } from 'next/server';
import { createHolibobClient } from '@experience-marketplace/holibob-api';

/**
 * GET /api/products
 * Fetches products from Holibob API
 *
 * Query params:
 * - first: number of products to fetch (default: 20)
 * - category: filter by category ID
 * - location: filter by place ID
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const first = parseInt(searchParams.get('first') ?? '20', 10);
    const categoryId = searchParams.get('category');
    const placeId = searchParams.get('location');

    // Create Holibob client with environment credentials
    const client = createHolibobClient({
      apiUrl: process.env['HOLIBOB_API_URL'] ?? 'https://api.sandbox.holibob.tech/graphql',
      apiKey: process.env['HOLIBOB_API_KEY'] ?? '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      partnerId: process.env['HOLIBOB_PARTNER_ID'] ?? 'holibob',
      timeout: 30000,
      retries: 3,
    });

    // Build filter
    const filter: {
      currency: string;
      adults?: number;
      categoryIds?: string[];
      placeIds?: string[];
    } = {
      currency: 'GBP',
      adults: 2,
    };

    if (categoryId) {
      filter.categoryIds = [categoryId];
    }

    if (placeId) {
      filter.placeIds = [placeId];
    }

    // Fetch products from Holibob
    const response = await client.discoverProducts(filter, { pageSize: first });

    // Map to our format
    const products = response.products.map((product) => ({
      id: product.id,
      title: product.name ?? 'Experience',
      slug: product.id, // Use product ID as slug for now
      shortDescription: product.shortDescription ?? '',
      imageUrl: product.imageUrl ?? '/placeholder-experience.jpg',
      price: {
        amount: product.priceFrom ?? 0,
        currency: product.currency ?? 'GBP',
        formatted: formatPrice(product.priceFrom ?? 0, product.currency ?? 'GBP'),
      },
      duration: {
        formatted: formatDuration(product.duration ?? 0),
      },
      rating: product.rating
        ? {
            average: product.rating,
            count: product.reviewCount ?? 0,
          }
        : null,
      location: {
        name: product.location?.name ?? '',
      },
    }));

    return NextResponse.json({
      success: true,
      products,
      totalCount: response.totalCount,
      hasMore: response.pageInfo?.hasNextPage ?? false,
    });
  } catch (error) {
    console.error('Error fetching products from Holibob:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch products',
        products: [],
        totalCount: 0,
        hasMore: false,
      },
      { status: 500 }
    );
  }
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return `${minutes}m`;
}
