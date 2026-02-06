import { NextRequest, NextResponse } from 'next/server';
import { createHolibobClient } from '@experience-marketplace/holibob-api';
import { prisma } from '../../../lib/prisma';

/**
 * GET /api/products
 * Fetches products - from local DB for microsites, or from Holibob API for main site
 *
 * Query params:
 * - first: number of products to fetch (default: 20)
 * - offset: pagination offset (default: 0)
 * - supplierId: filter by supplier ID (for microsites - fetches from local DB)
 * - category: filter by category (name match for local, ID for Holibob)
 * - location: filter by place ID (Holibob only)
 * - city: filter by city name (local DB only)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const first = parseInt(searchParams.get('first') ?? '20', 10);
    const offset = parseInt(searchParams.get('offset') ?? '0', 10);
    const supplierId = searchParams.get('supplierId');
    const category = searchParams.get('category');
    const city = searchParams.get('city');
    const placeId = searchParams.get('location');

    // If supplierId is provided, fetch from local database (for microsites)
    if (supplierId) {
      return await fetchFromLocalDB(supplierId, { first, offset, category, city });
    }

    // Otherwise, fetch from Holibob API (for main site)
    return await fetchFromHolibob({ first, category, placeId });
  } catch (error) {
    console.error('Error fetching products:', error);

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

/**
 * Fetch products from local database (for operator microsites)
 */
async function fetchFromLocalDB(
  supplierId: string,
  options: { first: number; offset: number; category?: string | null; city?: string | null }
) {
  const { first, offset, category, city } = options;

  // Build where clause
  const where: {
    supplierId: string;
    categories?: { has: string };
    city?: { contains: string; mode: 'insensitive' };
  } = {
    supplierId,
  };

  if (category) {
    where.categories = { has: category };
  }

  if (city) {
    where.city = { contains: city, mode: 'insensitive' };
  }

  // Fetch products and total count in parallel
  const [products, totalCount] = await Promise.all([
    prisma.product.findMany({
      where,
      take: first,
      skip: offset,
      orderBy: [{ rating: 'desc' }, { reviewCount: 'desc' }],
      select: {
        id: true,
        holibobProductId: true,
        slug: true,
        title: true,
        shortDescription: true,
        primaryImageUrl: true,
        priceFrom: true,
        currency: true,
        duration: true,
        rating: true,
        reviewCount: true,
        city: true,
        categories: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  // Map to API response format
  const mappedProducts = products.map((product) => ({
    id: product.holibobProductId, // Use Holibob ID for booking
    title: product.title,
    slug: product.slug,
    shortDescription: product.shortDescription ?? '',
    imageUrl: product.primaryImageUrl ?? '/placeholder-experience.jpg',
    price: {
      amount: product.priceFrom ? Number(product.priceFrom) : 0,
      currency: product.currency,
      formatted: formatPrice(
        product.priceFrom ? Number(product.priceFrom) : 0,
        product.currency
      ),
    },
    duration: {
      formatted: product.duration ?? '',
    },
    rating: product.rating
      ? {
          average: product.rating,
          count: product.reviewCount,
        }
      : null,
    location: {
      name: product.city ?? '',
    },
    categories: product.categories,
  }));

  return NextResponse.json({
    success: true,
    products: mappedProducts,
    totalCount,
    hasMore: offset + first < totalCount,
    source: 'local', // Indicate this came from local DB
  });
}

/**
 * Fetch products from Holibob API (for main site)
 */
async function fetchFromHolibob(options: {
  first: number;
  category?: string | null;
  placeId?: string | null;
}) {
  const { first, category, placeId } = options;

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

  if (category) {
    filter.categoryIds = [category];
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
    source: 'holibob', // Indicate this came from Holibob API
  });
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
