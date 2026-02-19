import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { TrackFunnelEvent } from './TrackFunnelEvent';

describe('TrackFunnelEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing (returns null)', () => {
    const { container } = render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);
    expect(container.innerHTML).toBe('');
  });

  it('sends POST request to /api/funnel on mount', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    expect(global.fetch).toHaveBeenCalledWith('/api/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
      keepalive: true,
    });
  });

  it('includes step in the request body', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.step).toBe('LANDING_PAGE_VIEW');
  });

  it('includes productId in the request body when provided', () => {
    render(<TrackFunnelEvent step="EXPERIENCE_CLICKED" productId="prod-123" />);

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.step).toBe('EXPERIENCE_CLICKED');
    expect(body.productId).toBe('prod-123');
  });

  it('includes landingPage from window.location.pathname', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.landingPage).toBe(window.location.pathname);
  });

  it('sets keepalive: true on the fetch request', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/funnel',
      expect.objectContaining({ keepalive: true })
    );
  });

  it('does not throw when fetch fails', () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    expect(() => render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />)).not.toThrow();
  });

  it('sends productId as undefined when not provided', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);

    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.productId).toBeUndefined();
  });

  it('calls fetch exactly once on mount', () => {
    render(<TrackFunnelEvent step="LANDING_PAGE_VIEW" />);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
