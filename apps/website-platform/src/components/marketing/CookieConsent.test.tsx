import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CookieConsent } from './CookieConsent';

// Mock useBrand
vi.mock('@/lib/site-context', () => ({
  useBrand: () => ({ primaryColor: '#0d9488' }),
}));

// Provide a working localStorage mock since jsdom's may be incomplete
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
  key: vi.fn(),
  length: 0,
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

  it('does not render immediately (delayed display)', () => {
    render(<CookieConsent />);
    expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
  });

  it('displays the banner after 1.5 second delay', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByText(/cookies/i)).toBeInTheDocument();
  });

  it('renders Accept button when visible', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
  });

  it('renders Decline button when visible', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument();
  });

  it('renders Privacy Policy link pointing to /privacy', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const link = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/privacy');
  });

  it('hides banner and sets localStorage to "accepted" when Accept is clicked', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('holibob_cookie_consent', 'accepted');
  });

  it('hides banner and sets localStorage to "declined" when Decline is clicked', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('holibob_cookie_consent', 'declined');
  });

  it('does not show banner when consent was already accepted', () => {
    localStorageStore['holibob_cookie_consent'] = 'accepted';
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
  });

  it('does not show banner when consent was already declined', () => {
    localStorageStore['holibob_cookie_consent'] = 'declined';
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
  });

  it('applies brand primaryColor to Accept button', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    const acceptButton = screen.getByRole('button', { name: 'Accept' });
    expect(acceptButton).toHaveStyle({ backgroundColor: '#0d9488' });
  });

  it('displays the correct consent message text', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(
      screen.getByText(/we use cookies to enhance your browsing experience/i)
    ).toBeInTheDocument();
  });

  it('does not show before the delay timer fires', () => {
    render(<CookieConsent />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
  });
});
