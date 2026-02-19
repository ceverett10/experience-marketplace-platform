import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { GoogleAnalytics } from './GoogleAnalytics';

// Mock next/script
vi.mock('next/script', () => ({
  default: ({ children, id, src }: { children?: string; id?: string; src?: string }) => (
    <div data-testid={id ?? 'script'} data-src={src}>
      {children}
    </div>
  ),
}));

// Track pathname for re-render tests
let mockPathname = '/';
const mockSearchParams = {
  toString: () => '',
};

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

describe('GoogleAnalytics component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPathname = '/';
    delete (window as any).gtag;
    // Clear cookies
    document.cookie = 'ai_referral_source=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  });

  afterEach(() => {
    delete (window as any).gtag;
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders gtag script tag with measurement ID', () => {
      const { getByTestId } = render(<GoogleAnalytics measurementId="G-TEST123" />);
      const scriptTag = getByTestId('script');
      expect(scriptTag.getAttribute('data-src')).toBe(
        'https://www.googletagmanager.com/gtag/js?id=G-TEST123'
      );
    });

    it('renders inline config script with measurement ID', () => {
      const { getByTestId } = render(<GoogleAnalytics measurementId="G-TEST123" />);
      const inlineScript = getByTestId('google-analytics');
      expect(inlineScript.textContent).toContain("gtag('config', 'G-TEST123'");
    });

    it('renders nothing when measurementId is null', () => {
      const { container } = render(<GoogleAnalytics measurementId={null} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when measurementId is undefined', () => {
      const { container } = render(<GoogleAnalytics measurementId={undefined} />);
      expect(container.innerHTML).toBe('');
    });
  });

  // ── Google Ads config ─────────────────────────────────────────────────

  describe('Google Ads config', () => {
    it('includes Google Ads config when googleAdsId is provided', () => {
      const { getByTestId } = render(
        <GoogleAnalytics measurementId="G-TEST123" googleAdsId="AW-999999" />
      );
      const inlineScript = getByTestId('google-analytics');
      expect(inlineScript.textContent).toContain("gtag('config', 'AW-999999')");
    });

    it('does not include Google Ads config when googleAdsId is null', () => {
      const { getByTestId } = render(
        <GoogleAnalytics measurementId="G-TEST123" googleAdsId={null} />
      );
      const inlineScript = getByTestId('google-analytics');
      expect(inlineScript.textContent).not.toContain('AW-');
    });

    it('does not include Google Ads config when googleAdsId is not provided', () => {
      const { getByTestId } = render(<GoogleAnalytics measurementId="G-TEST123" />);
      const inlineScript = getByTestId('google-analytics');
      // The inline script should NOT contain any AW- config
      expect(inlineScript.textContent).not.toContain('AW-');
    });
  });

  // ── Page view tracking ────────────────────────────────────────────────

  describe('page view tracking', () => {
    it('calls gtag config with page_path on mount', () => {
      const mockGtag = vi.fn();
      window.gtag = mockGtag;
      mockPathname = '/experiences/london-eye';

      render(<GoogleAnalytics measurementId="G-TEST123" />);

      expect(mockGtag).toHaveBeenCalledWith('config', 'G-TEST123', {
        page_path: '/experiences/london-eye',
      });
    });

    it('does not call gtag when measurementId is null', () => {
      const mockGtag = vi.fn();
      window.gtag = mockGtag;

      render(<GoogleAnalytics measurementId={null} />);

      expect(mockGtag).not.toHaveBeenCalled();
    });

    it('does not throw when window.gtag is undefined', () => {
      delete (window as any).gtag;
      mockPathname = '/test';

      expect(() => {
        render(<GoogleAnalytics measurementId="G-TEST123" />);
      }).not.toThrow();
    });
  });

  // ── AI referral tracking ──────────────────────────────────────────────

  describe('AI referral tracking', () => {
    it('fires ai_referral event when cookie is present', () => {
      const mockGtag = vi.fn();
      window.gtag = mockGtag;
      document.cookie = 'ai_referral_source=chatgpt';
      mockPathname = '/experiences';

      render(<GoogleAnalytics measurementId="G-TEST123" />);

      expect(mockGtag).toHaveBeenCalledWith('event', 'ai_referral', {
        ai_source: 'chatgpt',
        page_path: '/experiences',
      });
    });

    it('does not fire ai_referral event when cookie is absent', () => {
      const mockGtag = vi.fn();
      window.gtag = mockGtag;
      // Make sure cookie is cleared
      document.cookie = 'ai_referral_source=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      mockPathname = '/test';

      render(<GoogleAnalytics measurementId="G-TEST123" />);

      const aiCalls = mockGtag.mock.calls.filter(
        (call) => call[0] === 'event' && call[1] === 'ai_referral'
      );
      expect(aiCalls).toHaveLength(0);
    });
  });
});
