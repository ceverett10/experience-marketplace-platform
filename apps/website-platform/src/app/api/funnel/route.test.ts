import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('next/headers', () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue('localhost:3000'),
    })
  ),
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn().mockReturnValue(undefined),
      set: vi.fn(),
    })
  ),
}));

vi.mock('@/lib/tenant', () => ({
  getSiteFromHostname: vi.fn().mockResolvedValue({
    id: 'test-site',
    name: 'Test Site',
    holibobPartnerId: 'partner-123',
    brand: { primaryColor: '#6366f1' },
  }),
}));

const { mockTrackFunnelEvent } = vi.hoisted(() => ({
  mockTrackFunnelEvent: vi.fn(),
}));

vi.mock('@/lib/funnel-tracking', () => ({
  trackFunnelEvent: mockTrackFunnelEvent,
  BookingFunnelStep: {
    LANDING_PAGE_VIEW: 'LANDING_PAGE_VIEW',
    EXPERIENCE_CLICKED: 'EXPERIENCE_CLICKED',
    AVAILABILITY_SELECTED: 'AVAILABILITY_SELECTED',
    BOOKING_CREATED: 'BOOKING_CREATED',
    PAYMENT_STARTED: 'PAYMENT_STARTED',
  },
}));

import { POST } from './route';

describe('Funnel Route - POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when step is missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/funnel', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid step');
  });

  it('returns 400 for disallowed funnel steps', async () => {
    const request = new NextRequest('http://localhost:3000/api/funnel', {
      method: 'POST',
      body: JSON.stringify({ step: 'PAYMENT_STARTED' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid step');
  });

  it('returns 400 for non-existent step values', async () => {
    const request = new NextRequest('http://localhost:3000/api/funnel', {
      method: 'POST',
      body: JSON.stringify({ step: 'TOTALLY_FAKE_STEP' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Invalid step');
  });

  it('tracks LANDING_PAGE_VIEW successfully', async () => {
    const request = new NextRequest('http://localhost:3000/api/funnel', {
      method: 'POST',
      body: JSON.stringify({
        step: 'LANDING_PAGE_VIEW',
        landingPage: '/experiences',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockTrackFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'LANDING_PAGE_VIEW',
        siteId: 'test-site',
        landingPage: '/experiences',
      })
    );
  });

  it('tracks EXPERIENCE_CLICKED successfully', async () => {
    const request = new NextRequest('http://localhost:3000/api/funnel', {
      method: 'POST',
      body: JSON.stringify({
        step: 'EXPERIENCE_CLICKED',
        productId: 'prod-123',
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockTrackFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'EXPERIENCE_CLICKED',
        siteId: 'test-site',
        productId: 'prod-123',
      })
    );
  });

  it('does not leak errors for tracking endpoint', async () => {
    const request = new NextRequest('http://localhost:3000/api/funnel', {
      method: 'POST',
      body: 'not-json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
  });

  it('handles missing optional fields gracefully', async () => {
    const request = new NextRequest('http://localhost:3000/api/funnel', {
      method: 'POST',
      body: JSON.stringify({
        step: 'LANDING_PAGE_VIEW',
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    expect(mockTrackFunnelEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        step: 'LANDING_PAGE_VIEW',
        siteId: 'test-site',
        productId: undefined,
        landingPage: undefined,
      })
    );
  });
});
