import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import {
  MetaPixel,
  trackMetaViewContent,
  trackMetaInitiateCheckout,
  trackMetaAddPaymentInfo,
  trackMetaPurchase,
} from './MetaPixel';

// Mock next/script to render inline script content
vi.mock('next/script', () => ({
  default: ({ children, id, ...props }: any) => (
    <script id={id} data-testid={id} {...props}>
      {children}
    </script>
  ),
}));

let mockPathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('MetaPixel', () => {
  beforeEach(() => {
    mockPathname = '/';
    vi.clearAllMocks();
    // Reset fbq
    delete (window as any).fbq;
  });

  it('returns null when pixelId is null', () => {
    const { container } = render(<MetaPixel pixelId={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('returns null when pixelId is undefined', () => {
    const { container } = render(<MetaPixel pixelId={undefined} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders Script element when pixelId is provided', () => {
    render(<MetaPixel pixelId="123456789" />);
    const script = document.querySelector('[data-testid="meta-pixel"]');
    expect(script).toBeTruthy();
  });

  it('includes pixel ID in the script content', () => {
    render(<MetaPixel pixelId="123456789" />);
    const script = document.querySelector('[data-testid="meta-pixel"]');
    expect(script?.textContent).toContain('123456789');
  });

  it('includes fbq init call in script content', () => {
    render(<MetaPixel pixelId="123456789" />);
    const script = document.querySelector('[data-testid="meta-pixel"]');
    expect(script?.textContent).toContain("fbq('init'");
  });

  it('includes fbq PageView track call in script content', () => {
    render(<MetaPixel pixelId="123456789" />);
    const script = document.querySelector('[data-testid="meta-pixel"]');
    expect(script?.textContent).toContain("fbq('track', 'PageView')");
  });

  it('calls fbq PageView on route change when fbq is available', () => {
    const mockFbq = vi.fn();
    (window as any).fbq = mockFbq;

    render(<MetaPixel pixelId="123456789" />);

    expect(mockFbq).toHaveBeenCalledWith('track', 'PageView');
  });

  it('does not call fbq on route change when pixelId is null', () => {
    const mockFbq = vi.fn();
    (window as any).fbq = mockFbq;

    render(<MetaPixel pixelId={null} />);

    expect(mockFbq).not.toHaveBeenCalled();
  });
});

describe('Meta Pixel Event Helpers', () => {
  beforeEach(() => {
    delete (window as any).fbq;
  });

  describe('trackMetaViewContent', () => {
    it('calls fbq with ViewContent event', () => {
      const mockFbq = vi.fn();
      (window as any).fbq = mockFbq;

      trackMetaViewContent({ id: 'prod-1', name: 'London Eye', value: 35, currency: 'GBP' });

      expect(mockFbq).toHaveBeenCalledWith('track', 'ViewContent', {
        content_ids: ['prod-1'],
        content_name: 'London Eye',
        content_type: 'product',
        value: 35,
        currency: 'GBP',
      });
    });

    it('defaults currency to GBP when not provided', () => {
      const mockFbq = vi.fn();
      (window as any).fbq = mockFbq;

      trackMetaViewContent({ id: 'prod-1', name: 'Tour' });

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'ViewContent',
        expect.objectContaining({
          currency: 'GBP',
        })
      );
    });

    it('does not throw when fbq is not available', () => {
      expect(() => trackMetaViewContent({ id: 'prod-1', name: 'Tour' })).not.toThrow();
    });
  });

  describe('trackMetaInitiateCheckout', () => {
    it('calls fbq with InitiateCheckout event', () => {
      const mockFbq = vi.fn();
      (window as any).fbq = mockFbq;

      trackMetaInitiateCheckout({ id: 'booking-1', value: 100, currency: 'EUR' });

      expect(mockFbq).toHaveBeenCalledWith('track', 'InitiateCheckout', {
        content_ids: ['booking-1'],
        value: 100,
        currency: 'EUR',
        num_items: 1,
      });
    });

    it('defaults currency to GBP', () => {
      const mockFbq = vi.fn();
      (window as any).fbq = mockFbq;

      trackMetaInitiateCheckout({ id: 'booking-1' });

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'InitiateCheckout',
        expect.objectContaining({
          currency: 'GBP',
        })
      );
    });
  });

  describe('trackMetaAddPaymentInfo', () => {
    it('calls fbq with AddPaymentInfo event', () => {
      const mockFbq = vi.fn();
      (window as any).fbq = mockFbq;

      trackMetaAddPaymentInfo({ id: 'booking-1', value: 50 });

      expect(mockFbq).toHaveBeenCalledWith('track', 'AddPaymentInfo', {
        content_ids: ['booking-1'],
        value: 50,
        currency: 'GBP',
      });
    });
  });

  describe('trackMetaPurchase', () => {
    it('calls fbq with Purchase event', () => {
      const mockFbq = vi.fn();
      (window as any).fbq = mockFbq;

      trackMetaPurchase({ id: 'booking-1', value: 200, currency: 'USD' });

      expect(mockFbq).toHaveBeenCalledWith('track', 'Purchase', {
        content_ids: ['booking-1'],
        value: 200,
        currency: 'USD',
        content_type: 'product',
      });
    });

    it('defaults currency to GBP', () => {
      const mockFbq = vi.fn();
      (window as any).fbq = mockFbq;

      trackMetaPurchase({ id: 'booking-1', value: 200 });

      expect(mockFbq).toHaveBeenCalledWith(
        'track',
        'Purchase',
        expect.objectContaining({
          currency: 'GBP',
        })
      );
    });
  });
});
