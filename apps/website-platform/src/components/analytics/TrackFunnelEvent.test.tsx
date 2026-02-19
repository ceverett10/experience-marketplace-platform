import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TrackFunnelEvent } from './TrackFunnelEvent';

// Mock fetch
const mockFetch = vi.fn();

describe('TrackFunnelEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    mockFetch.mockResolvedValue({ ok: true });

    // Mock window.location
    Object.defineProperty(window, 'location', {
      value: { pathname: '/destinations/london' },
      writable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing (invisible component)', () => {
    const { container } = render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);
    expect(container.innerHTML).toBe('');
  });

  it('fires a POST request to /api/funnel on mount', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    expect(mockFetch).toHaveBeenCalledWith('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'LANDING_PAGE_VIEW',
        productId: undefined,
        landingPage: '/destinations/london',
      }),
      keepalive: true,
    });
  });

  it('includes productId in the request when provided', () => {
    render(<TrackFunnelEvent step="EXPERIENCE_CLICKED" productId="exp-abc-123" />);

    expect(mockFetch).toHaveBeenCalledWith('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        step: 'EXPERIENCE_CLICKED',
        productId: 'exp-abc-123',
        landingPage: '/destinations/london',
      }),
      keepalive: true,
    });
  });

  it('sends LANDING_PAGE_VIEW step correctly', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.step).toBe('LANDING_PAGE_VIEW');
  });

  it('sends EXPERIENCE_CLICKED step correctly', () => {
    render(<TrackFunnelEvent step="EXPERIENCE_CLICKED" productId="exp-1" />);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.step).toBe('EXPERIENCE_CLICKED');
  });

  it('does not throw when fetch fails', () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    expect(() => {
      render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);
    }).not.toThrow();
  });

  it('uses keepalive: true for the fetch request', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    expect(mockFetch.mock.calls[0][1].keepalive).toBe(true);
  });

  it('reads the current pathname from window.location', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/experiences/rome-colosseum' },
      writable: true,
    });

    render(<TrackFunnelEvent step="EXPERIENCE_CLICKED" productId="exp-rome" />);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.landingPage).toBe('/experiences/rome-colosseum');
  });
});
