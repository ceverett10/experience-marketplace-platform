import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetEvent } = vi.hoisted(() => ({
  mockGetEvent: vi.fn(),
}));

vi.mock('@/lib/tickitto', () => ({
  getTickittoClient: vi.fn(() => ({
    getEvent: mockGetEvent,
  })),
  mapTickittoEventToExperience: vi.fn((event: { event_id: string; title: string }) => ({
    id: event.event_id,
    title: event.title,
  })),
}));

import { GET } from './route';

describe('Tickitto Events [id] Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a mapped event', async () => {
    mockGetEvent.mockResolvedValue({ event_id: 'evt-1', title: 'West End Show' });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events/evt-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'evt-1' }) });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.product.id).toBe('evt-1');
  });

  it('passes currency param to client', async () => {
    mockGetEvent.mockResolvedValue({ event_id: 'evt-1', title: 'Show' });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events/evt-1?currency=EUR');
    await GET(request, { params: Promise.resolve({ id: 'evt-1' }) });

    expect(mockGetEvent).toHaveBeenCalledWith('evt-1', 'EUR');
  });

  it('defaults to GBP currency', async () => {
    mockGetEvent.mockResolvedValue({ event_id: 'evt-1', title: 'Show' });

    const request = new NextRequest('http://localhost:3000/api/tickitto-events/evt-1');
    await GET(request, { params: Promise.resolve({ id: 'evt-1' }) });

    expect(mockGetEvent).toHaveBeenCalledWith('evt-1', 'GBP');
  });

  it('returns 404 when event not found', async () => {
    mockGetEvent.mockResolvedValue(null);

    const request = new NextRequest('http://localhost:3000/api/tickitto-events/missing');
    const response = await GET(request, { params: Promise.resolve({ id: 'missing' }) });
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Event not found');
  });

  it('returns 500 on error', async () => {
    mockGetEvent.mockRejectedValue(new Error('API error'));

    const request = new NextRequest('http://localhost:3000/api/tickitto-events/evt-1');
    const response = await GET(request, { params: Promise.resolve({ id: 'evt-1' }) });
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('API error');
  });
});
