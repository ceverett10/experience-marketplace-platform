import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GoogleAnalytics } from './GoogleAnalytics';

let mockPathname = '/';
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: vi.fn() }),
}));

// Extend window for gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

describe('GoogleAnalytics', () => {
  beforeEach(() => {
    mockPathname = '/';
    vi.clearAllMocks();
    delete (window as any).gtag;
    // Clear any cookies
    document.cookie = 'ai_referral_source=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  it('renders nothing (gtag.js is loaded server-side in layout.tsx)', () => {
    const { container } = render(<GoogleAnalytics measurementId="G-TESTID123" />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when measurementId is null', () => {
    const { container } = render(<GoogleAnalytics measurementId={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when measurementId is undefined', () => {
    const { container } = render(<GoogleAnalytics measurementId={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('calls gtag config on route change when gtag is available', () => {
    const mockGtag = vi.fn();
    (window as any).gtag = mockGtag;

    render(<GoogleAnalytics measurementId="G-TESTID123" />);

    expect(mockGtag).toHaveBeenCalledWith('config', 'G-TESTID123', {
      page_path: '/',
    });
  });

  it('does not call gtag when measurementId is null', () => {
    const mockGtag = vi.fn();
    (window as any).gtag = mockGtag;

    render(<GoogleAnalytics measurementId={null} />);

    expect(mockGtag).not.toHaveBeenCalled();
  });

  it('tracks ai_referral event when cookie is present', () => {
    const mockGtag = vi.fn();
    (window as any).gtag = mockGtag;
    document.cookie = 'ai_referral_source=chatgpt';

    render(<GoogleAnalytics measurementId="G-TESTID123" />);

    expect(mockGtag).toHaveBeenCalledWith('event', 'ai_referral', {
      ai_source: 'chatgpt',
      page_path: '/',
    });
  });

  it('does not track ai_referral when cookie is not present', () => {
    const mockGtag = vi.fn();
    (window as any).gtag = mockGtag;

    render(<GoogleAnalytics measurementId="G-TESTID123" />);

    const aiRefCalls = mockGtag.mock.calls.filter(
      (call) => call[0] === 'event' && call[1] === 'ai_referral'
    );
    expect(aiRefCalls).toHaveLength(0);
  });
});
