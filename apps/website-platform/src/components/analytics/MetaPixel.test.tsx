import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import {
  MetaPixel,
  trackMetaViewContent,
  trackMetaInitiateCheckout,
  trackMetaAddPaymentInfo,
  trackMetaPurchase,
} from './MetaPixel';

// Mock next/script — renders its children as a <div> so we can inspect
vi.mock('next/script', () => ({
  default: ({ children, id }: { children?: string; id?: string }) => (
    <div data-testid={id}>{children}</div>
  ),
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/experiences/london-eye'),
}));

describe('MetaPixel component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.fbq before each test
    delete (window as any).fbq;
  });

  // ── Rendering ─────────────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders Script with pixel initialization when pixelId is provided', () => {
      const { getByTestId } = render(<MetaPixel pixelId="123456789" />);
      const script = getByTestId('meta-pixel');
      expect(script).toBeInTheDocument();
      expect(script.textContent).toContain("fbq('init', '123456789')");
      expect(script.textContent).toContain("fbq('track', 'PageView')");
    });

    it('renders nothing when pixelId is null', () => {
      const { container } = render(<MetaPixel pixelId={null} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when pixelId is undefined', () => {
      const { container } = render(<MetaPixel pixelId={undefined} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when pixelId is empty string', () => {
      // Empty string is falsy, so the component should still render the Script
      // because the check is `if (!pixelId)` — empty string is falsy
      const { container } = render(<MetaPixel pixelId="" />);
      expect(container.innerHTML).toBe('');
    });
  });

  // ── PageView tracking on route change ─────────────────────────────────

  describe('pageview tracking on route change', () => {
    it('calls fbq track PageView when pathname changes and fbq exists', () => {
      const mockFbq = vi.fn();
      window.fbq = mockFbq;

      render(<MetaPixel pixelId="123456789" />);

      // useEffect fires on mount with the initial pathname
      expect(mockFbq).toHaveBeenCalledWith('track', 'PageView');
    });

    it('does not call fbq when pixelId is null', () => {
      const mockFbq = vi.fn();
      window.fbq = mockFbq;

      render(<MetaPixel pixelId={null} />);

      expect(mockFbq).not.toHaveBeenCalled();
    });

    it('does not throw when window.fbq is undefined', () => {
      delete (window as any).fbq;

      expect(() => {
        render(<MetaPixel pixelId="123456789" />);
      }).not.toThrow();
    });
  });
});

// ── Event helper functions ────────────────────────────────────────────────

describe('Meta Pixel event helpers', () => {
  let mockFbq: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFbq = vi.fn();
    window.fbq = mockFbq;
  });

  afterEach(() => {
    delete (window as any).fbq;
  });

  // ── trackMetaViewContent ──────────────────────────────────────────────

  describe('trackMetaViewContent', () => {
    it('fires ViewContent event with required fields', () => {
      trackMetaViewContent({ id: 'exp-1', name: 'London Eye' });

      expect(mockFbq).toHaveBeenCalledWith('track', 'ViewContent', {
        content_ids: ['exp-1'],
        content_name: 'London Eye',
        content_type: 'product',
        value: undefined,
        currency: 'GBP',
      });
    });

    it('includes value and currency when provided', () => {
      trackMetaViewContent({
        id: 'exp-2',
        name: 'Thames Cruise',
        value: 35.0,
        currency: 'EUR',
      });

      expect(mockFbq).toHaveBeenCalledWith('track', 'ViewContent', {
        content_ids: ['exp-2'],
        content_name: 'Thames Cruise',
        content_type: 'product',
        value: 35.0,
        currency: 'EUR',
      });
    });

    it('defaults currency to GBP when not provided', () => {
      trackMetaViewContent({ id: 'exp-3', name: 'Test' });

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'ViewContent',
        expect.objectContaining({ currency: 'GBP' })
      );
    });

    it('does not throw when fbq is not on window', () => {
      delete (window as any).fbq;
      expect(() => {
        trackMetaViewContent({ id: 'exp-1', name: 'Test' });
      }).not.toThrow();
    });
  });

  // ── trackMetaInitiateCheckout ─────────────────────────────────────────

  describe('trackMetaInitiateCheckout', () => {
    it('fires InitiateCheckout event', () => {
      trackMetaInitiateCheckout({ id: 'bk-1', value: 70.0, currency: 'GBP' });

      expect(mockFbq).toHaveBeenCalledWith('track', 'InitiateCheckout', {
        content_ids: ['bk-1'],
        value: 70.0,
        currency: 'GBP',
        num_items: 1,
      });
    });

    it('defaults currency to GBP', () => {
      trackMetaInitiateCheckout({ id: 'bk-2' });

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'InitiateCheckout',
        expect.objectContaining({ currency: 'GBP' })
      );
    });
  });

  // ── trackMetaAddPaymentInfo ───────────────────────────────────────────

  describe('trackMetaAddPaymentInfo', () => {
    it('fires AddPaymentInfo event', () => {
      trackMetaAddPaymentInfo({ id: 'bk-1', value: 50.0, currency: 'USD' });

      expect(mockFbq).toHaveBeenCalledWith('track', 'AddPaymentInfo', {
        content_ids: ['bk-1'],
        value: 50.0,
        currency: 'USD',
      });
    });

    it('defaults currency to GBP', () => {
      trackMetaAddPaymentInfo({ id: 'bk-3' });

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'AddPaymentInfo',
        expect.objectContaining({ currency: 'GBP' })
      );
    });
  });

  // ── trackMetaPurchase ─────────────────────────────────────────────────

  describe('trackMetaPurchase', () => {
    it('fires Purchase event', () => {
      trackMetaPurchase({ id: 'bk-1', value: 150.0, currency: 'EUR' });

      expect(mockFbq).toHaveBeenCalledWith('track', 'Purchase', {
        content_ids: ['bk-1'],
        value: 150.0,
        currency: 'EUR',
        content_type: 'product',
      });
    });

    it('defaults currency to GBP', () => {
      trackMetaPurchase({ id: 'bk-4' });

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'Purchase',
        expect.objectContaining({ currency: 'GBP' })
      );
    });

    it('does not throw when fbq is missing', () => {
      delete (window as any).fbq;
      expect(() => {
        trackMetaPurchase({ id: 'bk-5', value: 100 });
      }).not.toThrow();
    });
  });
});
