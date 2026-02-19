import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockSearchEvents } = vi.hoisted(() => ({
  mockSearchEvents: vi.fn(),
}));

vi.mock('@/lib/tickitto', () => ({
  getTickittoClient: vi.fn(() => ({
    searchEvents: mockSearchEvents,
  })),
  mapTickittoEventToExperienceListItem: vi.fn((event: { event_id: string; title: string }) => ({
    id: event.event_id,
    title: event.title,
  })),
}));

import { GET } from './route';

describe('Tickitto Events Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns mapped experiences', async () => {
    mockSearchEvents.mockResolvedValue({
      events: [
        { event_id: 'evt-1', title: 'West End Show' },
        { event_id: 'evt-2', title: 'Concert' },
      ],
      totalCount: 2,
    });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.experiences).toHaveLength(2);
    expect(data.experiences[0].id).toBe('evt-1');
    expect(data.totalCount).toBe(2);
    expect(data.hasMore).toBe(false);
  });

  it('passes search params to client', async () => {
    mockSearchEvents.mockResolvedValue({ events: [], totalCount: 0 });

    const request = new NextRequest(
      'http://localhost:3000/api/tickitto-events?text=musical&category=Theatre,Musicals&city=London&country=GB&t1=2025-06-01&t2=2025-06-30&min_price=10&max_price=100&currency=EUR&skip=20&limit=10&sort_by=price_asc'
    );
    await GET(request);

    expect(mockSearchEvents).toHaveBeenCalledWith({
      text: 'musical',
      category: ['Theatre', 'Musicals'],
      city: ['London'],
      country: ['GB'],
      t1: '2025-06-01',
      t2: '2025-06-30',
      min_price: 10,
      max_price: 100,
      currency: 'EUR',
      skip: 20,
      limit: 10,
      sort_by: 'price_asc',
    });
  });

  it('defaults to GBP currency and limit 20', async () => {
    mockSearchEvents.mockResolvedValue({ events: [], totalCount: 0 });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events');
    await GET(request);

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'GBP',
        limit: 20,
        skip: 0,
      })
    );
  });

  it('caps limit at 100', async () => {
    mockSearchEvents.mockResolvedValue({ events: [], totalCount: 0 });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events?limit=500');
    await GET(request);

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 })
    );
  });

  it('calculates hasMore correctly', async () => {
    mockSearchEvents.mockResolvedValue({
      events: Array.from({ length: 20 }, (_, i) => ({ event_id: `e-${i}`, title: `T${i}` })),
      totalCount: 50,
    });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events?skip=0&limit=20');
    const response = await GET(request);
    const data = await response.json();

    expect(data.hasMore).toBe(true);
  });

  it('accepts q param as alias for text', async () => {
    mockSearchEvents.mockResolvedValue({ events: [], totalCount: 0 });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events?q=opera');
    await GET(request);

    expect(mockSearchEvents).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'opera' })
    );
  });

  it('returns 500 on error', async () => {
    mockSearchEvents.mockRejectedValue(new Error('Tickitto API down'));

    const request = new NextRequest('http://localhost:3000/api/tickitto-events');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.experiences).toEqual([]);
    expect(data.error).toBe('Tickitto API down');
  });
});
