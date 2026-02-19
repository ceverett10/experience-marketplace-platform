import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CookieConsent } from './CookieConsent';

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

const CONSENT_KEY = 'holibob_cookie_consent';

// Mock localStorage
const localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  }),
  length: 0,
  key: vi.fn(() => null),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage, writable: true });

describe('CookieConsent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initial display', () => {
    it('does not render immediately (hidden before delay)', () => {
      const { container } = render(<CookieConsent />);
      expect(container.innerHTML).toBe('');
    });

    it('renders after 1500ms delay when no consent stored', () => {
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText(/We use cookies/)).toBeInTheDocument();
    });

    it('does not render if consent was already accepted', () => {
      localStorageStore[CONSENT_KEY] = 'accepted';
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText(/We use cookies/)).not.toBeInTheDocument();
    });

    it('does not render if consent was already declined', () => {
      localStorageStore[CONSENT_KEY] = 'declined';
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText(/We use cookies/)).not.toBeInTheDocument();
    });
  });

  describe('content', () => {
    beforeEach(() => {
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });
    });

    it('displays cookie consent text', () => {
      expect(
        screen.getByText(/We use cookies to enhance your browsing experience/)
      ).toBeInTheDocument();
    });

    it('displays a Privacy Policy link', () => {
      const link = screen.getByText('Privacy Policy');
      expect(link).toHaveAttribute('href', '/privacy');
    });

    it('displays Accept button', () => {
      expect(screen.getByText('Accept')).toBeInTheDocument();
    });

    it('displays Decline button', () => {
      expect(screen.getByText('Decline')).toBeInTheDocument();
    });
  });

  describe('Accept button', () => {
    it('hides banner when Accept is clicked', () => {
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText(/We use cookies/)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Accept'));
      expect(screen.queryByText(/We use cookies/)).not.toBeInTheDocument();
    });

    it('stores "accepted" in localStorage when Accept is clicked', () => {
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      fireEvent.click(screen.getByText('Accept'));
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(CONSENT_KEY, 'accepted');
      expect(localStorageStore[CONSENT_KEY]).toBe('accepted');
    });
  });

  describe('Decline button', () => {
    it('hides banner when Decline is clicked', () => {
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(screen.getByText(/We use cookies/)).toBeInTheDocument();

      fireEvent.click(screen.getByText('Decline'));
      expect(screen.queryByText(/We use cookies/)).not.toBeInTheDocument();
    });

    it('stores "declined" in localStorage when Decline is clicked', () => {
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      fireEvent.click(screen.getByText('Decline'));
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(CONSENT_KEY, 'declined');
      expect(localStorageStore[CONSENT_KEY]).toBe('declined');
    });
  });

  describe('brand color styling', () => {
    it('applies brand primary color to Accept button background', () => {
      render(<CookieConsent />);
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      const acceptButton = screen.getByText('Accept');
      expect(acceptButton).toHaveStyle({ backgroundColor: '#0d9488' });
    });
  });

  describe('cleanup', () => {
    it('cleans up timer on unmount', () => {
      const { unmount } = render(<CookieConsent />);
      // Unmount before the timer fires
      unmount();
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      // No error should be thrown - timer was cleaned up
    });
  });
});
