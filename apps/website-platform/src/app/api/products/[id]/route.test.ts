import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetProduct } = vi.hoisted(() => ({
  mockGetProduct: vi.fn(),
}));

vi.mock('@experience-marketplace/holibob-api', () => ({
  createHolibobClient: vi.fn(() => ({
    getProduct: mockGetProduct,
  })),
}));

import { GET } from './route';

describe('Products [id] Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a mapped product', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-1',
      name: 'London Eye Tour',
      shortDescription: 'See the city',
      description: 'Full description',
      imageUrl: 'https://example.com/eye.jpg',
      images: [{ url: 'https://example.com/img1.jpg' }, { url: 'https://example.com/img2.jpg' }],
      priceFrom: 35,
      currency: 'GBP',
      duration: 90,
      rating: 4.5,
      reviewCount: 100,
      location: { name: 'London', address: 'South Bank', lat: 51.5, lng: -0.12 },
      categories: [{ id: 'cat-1', name: 'Tours', slug: 'tours' }],
      highlights: ['Great views'],
      inclusions: ['Ticket'],
      exclusions: ['Food'],
      cancellationPolicy: 'Free cancellation',
    });

    const request = new NextRequest('http://localhost:3000/api/products/prod-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'prod-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.product.id).toBe('prod-1');
    expect(data.product.title).toBe('London Eye Tour');
    expect(data.product.price.formatted).toBe('£35.00');
    expect(data.product.duration.formatted).toBe('1h 30m');
    expect(data.product.rating.average).toBe(4.5);
    expect(data.product.images).toHaveLength(2);
    expect(data.product.highlights).toEqual(['Great views']);
    expect(data.product.cancellationPolicy).toBe('Free cancellation');
  });

  it('returns 404 when product not found', async () => {
    mockGetProduct.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/products/missing');
    const response = await GET(request, { params: Promise.resolve({ id: 'missing' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Product not found');
  });

  it('handles null optional fields with defaults', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-2',
      name: null,
      shortDescription: null,
      description: null,
      imageUrl: null,
      images: null,
      priceFrom: null,
      currency: null,
      duration: null,
      rating: null,
      reviewCount: null,
      location: null,
      categories: null,
      highlights: null,
      inclusions: null,
      exclusions: null,
      cancellationPolicy: null,
    });

    const request = new NextRequest('http://localhost:3000/api/products/prod-2');
    const response = await GET(request, { params: Promise.resolve({ id: 'prod-2' }) });
    const data = await response.json();

    expect(data.product.title).toBe('Experience');
    expect(data.product.imageUrl).toBe('/placeholder-experience.jpg');
    expect(data.product.price.amount).toBe(0);
    expect(data.product.duration.formatted).toBe('Varies');
    expect(data.product.rating).toBeNull();
    expect(data.product.location.name).toBe('');
    expect(data.product.categories).toEqual([]);
  });

  it('formats duration for exact hours', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-3',
      name: 'Tour',
      duration: 120,
    });

    const request = new NextRequest('http://localhost:3000/api/products/prod-3');
    const response = await GET(request, { params: Promise.resolve({ id: 'prod-3' }) });
    const data = await response.json();

    expect(data.product.duration.formatted).toBe('2h');
  });

  it('handles cancellationPolicy as object', async () => {
    mockGetProduct.mockResolvedValue({
      id: 'prod-4',
      name: 'Tour',
      cancellationPolicy: { description: 'Cancel 24h before' },
    });

    const request = new NextRequest('http://localhost:3000/api/products/prod-4');
    const response = await GET(request, { params: Promise.resolve({ id: 'prod-4' }) });
    const data = await response.json();

    expect(data.product.cancellationPolicy).toBe('Cancel 24h before');
  });

  it('returns 500 on API error', async () => {
    mockGetProduct.mockRejectedValue(new Error('Holibob API timeout'));

    const request = new NextRequest('http://localhost:3000/api/products/prod-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'prod-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Holibob API timeout');
  });
});
