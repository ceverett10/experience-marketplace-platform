import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetAvailabilityWidget } = vi.hoisted(() => ({
  mockGetAvailabilityWidget: vi.fn(),
}));

vi.mock('@/lib/tickitto', () => ({
  getTickittoClient: vi.fn(() => ({
    getAvailabilityWidget: mockGetAvailabilityWidget,
  })),
}));

import { GET } from './route';

describe('Tickitto Availability Route - GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns widget session data', async () => {
    mockGetAvailabilityWidget.mockResolvedValue({
      session_id: 'sess-123',
      view_url: 'https://widget.tickitto.com/sess-123',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/tickitto-availability?eventId=evt-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.sessionId).toBe('sess-123');
    expect(data.data.widgetUrl).toBe('https://widget.tickitto.com/sess-123');
  });

  it('passes date params to client', async () => {
    mockGetAvailabilityWidget.mockResolvedValue({
      session_id: 'sess-456',
      view_url: 'https://widget.tickitto.com/sess-456',
    });

    const request = new NextRequest(
      'http://localhost:3000/api/tickitto-availability?eventId=evt-1&t1=2025-06-01&t2=2025-06-30'
    );
    await GET(request);

    expect(mockGetAvailabilityWidget).toHaveBeenCalledWith('evt-1', {
      t1: '2025-06-01',
      t2: '2025-06-30',
    });
  });

  it('returns 400 when eventId missing', async () => {
    const request = new NextRequest('http://localhost:3000/api/tickitto-availability');
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('eventId is required');
  });

  it('returns 500 on error', async () => {
    mockGetAvailabilityWidget.mockRejectedValue(new Error('Widget unavailable'));

    const request = new NextRequest(
      'http://localhost:3000/api/tickitto-availability?eventId=evt-1'
    );
    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Widget unavailable');
  });
});
