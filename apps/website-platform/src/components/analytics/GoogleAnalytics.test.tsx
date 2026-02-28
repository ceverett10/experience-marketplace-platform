import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GoogleAnalytics } from './GoogleAnalytics';

// Mock next/script to render inline script content
vi.mock('next/script', () => ({
  default: ({ children, id, src, ...props }: any) => {
    if (src) {
      return <script id={id} data-testid={id || 'gtag-script'} src={src} {...props} />;
    }
    return (
      <script id={id} data-testid={id || 'ga-script'} {...props}>
        {children}
      </script>
    );
  },
}));

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

  it('returns null when neither measurementId nor googleAdsId is provided', () => {
    const { container } = render(<GoogleAnalytics measurementId={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when both are undefined', () => {
    const { container } = render(<GoogleAnalytics measurementId={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders when only googleAdsId is provided (no GA4 measurement ID)', () => {
    render(<GoogleAnalytics measurementId={null} googleAdsId="AW-TESTADS123" />);
    const scriptTag = document.querySelector('script[src*="gtag/js"]');
    expect(scriptTag).toBeTruthy();
    expect(scriptTag?.getAttribute('src')).toContain('AW-TESTADS123');
    const inlineScript = document.querySelector('[data-testid="google-analytics"]');
    expect(inlineScript?.textContent).toContain('AW-TESTADS123');
    expect(inlineScript?.textContent).not.toContain("gtag('config', 'null'");
  });

  it('renders script tag with gtag.js src when measurementId is provided', () => {
    render(<GoogleAnalytics measurementId="G-TESTID123" />);
    const scriptTag = document.querySelector('script[src*="gtag/js"]');
    expect(scriptTag).toBeTruthy();
    expect(scriptTag?.getAttribute('src')).toContain('G-TESTID123');
  });

  it('renders inline analytics script', () => {
    render(<GoogleAnalytics measurementId="G-TESTID123" />);
    const inlineScript = document.querySelector('[data-testid="google-analytics"]');
    expect(inlineScript).toBeTruthy();
  });

  it('includes measurement ID in inline script content', () => {
    render(<GoogleAnalytics measurementId="G-TESTID123" />);
    const inlineScript = document.querySelector('[data-testid="google-analytics"]');
    expect(inlineScript?.textContent).toContain('G-TESTID123');
  });

  it('includes gtag config call in script content', () => {
    render(<GoogleAnalytics measurementId="G-TESTID123" />);
    const inlineScript = document.querySelector('[data-testid="google-analytics"]');
    expect(inlineScript?.textContent).toContain("gtag('config'");
  });

  it('includes Google Ads config when googleAdsId is provided', () => {
    render(<GoogleAnalytics measurementId="G-TESTID123" googleAdsId="AW-TESTADS123" />);
    const inlineScript = document.querySelector('[data-testid="google-analytics"]');
    expect(inlineScript?.textContent).toContain('AW-TESTADS123');
  });

  it('does not include Google Ads config when googleAdsId is null', () => {
    render(<GoogleAnalytics measurementId="G-TESTID123" googleAdsId={null} />);
    const inlineScript = document.querySelector('[data-testid="google-analytics"]');
    expect(inlineScript?.textContent).not.toContain('AW-');
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

  it('includes dataLayer initialization in script', () => {
    render(<GoogleAnalytics measurementId="G-TESTID123" />);
    const inlineScript = document.querySelector('[data-testid="google-analytics"]');
    expect(inlineScript?.textContent).toContain('window.dataLayer');
  });
});
