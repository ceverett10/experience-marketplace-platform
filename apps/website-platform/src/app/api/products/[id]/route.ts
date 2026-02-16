import { NextRequest, NextResponse } from 'next/server';
import { createHolibobClient } from '@experience-marketplace/holibob-api';

/**
 * GET /api/products/[id]
 * Fetches a single product from Holibob API by ID
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Create Holibob client with environment credentials
    const client = createHolibobClient({
      apiUrl: process.env['HOLIBOB_API_URL'] ?? 'https://api.production.holibob.tech/graphql',
      apiKey: process.env['HOLIBOB_API_KEY'] ?? '',
      apiSecret: process.env['HOLIBOB_API_SECRET'],
      partnerId: process.env['HOLIBOB_PARTNER_ID'] ?? 'holibob',
      timeout: 30000,
      retries: 3,
    });

    // Fetch product from Holibob
    const product = await client.getProduct(id);

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    // Map to our format
    const experience = {
      id: product.id,
      title: product.name ?? 'Experience',
      slug: product.id,
      shortDescription: product.shortDescription ?? '',
      description: product.description ?? '',
      imageUrl: product.imageUrl ?? '/placeholder-experience.jpg',
      images: product.images?.map((img: { url?: string }) => img.url).filter(Boolean) ?? [],
      price: {
        amount: product.priceFrom ?? 0,
        currency: product.currency ?? 'GBP',
        formatted: formatPrice(product.priceFrom ?? 0, product.currency ?? 'GBP'),
      },
      duration: {
        value: product.duration ?? 0,
        unit: 'minutes',
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
        address: product.location?.address ?? '',
        lat: product.location?.lat ?? 0,
        lng: product.location?.lng ?? 0,
      },
      categories:
        product.categories?.map((cat: { id?: string; name?: string; slug?: string }) => ({
          id: cat.id ?? '',
          name: cat.name ?? '',
          slug: cat.slug ?? cat.id ?? '',
        })) ?? [],
      highlights: product.highlights ?? [],
      inclusions: product.inclusions ?? [],
      exclusions: product.exclusions ?? [],
      cancellationPolicy:
        typeof product.cancellationPolicy === 'string'
          ? product.cancellationPolicy
          : (product.cancellationPolicy?.description ?? ''),
    };

    return NextResponse.json({
      success: true,
      product: experience,
    });
  } catch (error) {
    console.error('Error fetching product from Holibob:', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch product',
      },
      { status: 500 }
    );
  }
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}

function formatDuration(minutes: number): string {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  return minutes > 0 ? `${minutes}m` : 'Varies';
}
