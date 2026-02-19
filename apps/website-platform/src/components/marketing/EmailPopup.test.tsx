import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';
import { EmailPopup } from './EmailPopup';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/experiences'),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useSite: vi.fn(() => ({ id: 'site-1', name: 'Test Site' })),
  useBrand: vi.fn(() => ({ primaryColor: '#0d9488', name: 'Test Brand' })),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

/** Helper to open the popup with fake timers */
function openPopup() {
  const result = render(<EmailPopup />);
  // Advance past the 5s delay, wrapped in act to flush React state updates
  act(() => {
    vi.advanceTimersByTime(5100);
  });
  return result;
}

describe('EmailPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]);
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing initially before delay', () => {
    const { container } = render(<EmailPopup />);
    expect(container.innerHTML).toBe('');
  });

  it('shows popup after 5-second delay', () => {
    openPopup();
    expect(document.body.textContent).toContain('Win £1,000');
    expect(document.body.querySelector('[aria-label="Close"]')).toBeTruthy();
  });

  it('does not show if previously dismissed', () => {
    localStorageStore['holibob_email_popup_dismissed'] = Date.now().toString();

    openPopup();
    expect(document.body.textContent).not.toContain('Win £1,000');
  });

  it('does not show if previously submitted', () => {
    localStorageStore['holibob_email_popup_submitted'] = Date.now().toString();

    openPopup();
    expect(document.body.textContent).not.toContain('Win £1,000');
  });

  it('does not show on excluded pages', async () => {
    const { usePathname } = await import('next/navigation');
    vi.mocked(usePathname).mockReturnValue('/checkout/abc');

    openPopup();
    expect(document.body.textContent).not.toContain('Win £1,000');

    vi.mocked(usePathname).mockReturnValue('/experiences');
  });

  it('does not show for PPC visitors', () => {
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: `utm_params=${encodeURIComponent(JSON.stringify({ gclid: 'abc123' }))}`,
    });

    openPopup();
    expect(document.body.textContent).not.toContain('Win £1,000');
  });

  it('dismisses on close button click and persists to localStorage', () => {
    openPopup();

    const closeBtn = document.body.querySelector('[aria-label="Close"]') as HTMLElement;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);

    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'holibob_email_popup_dismissed',
      expect.any(String)
    );
  });

  it('renders form with email input and marketing consent', () => {
    openPopup();

    expect(document.body.querySelector('input[type="email"]')).toBeTruthy();
    expect(document.body.querySelector('#popup-marketing-consent')).toBeTruthy();
    expect(document.body.textContent).toContain('Enter Prize Draw');
  });

  it('marketing consent is not pre-ticked (GDPR)', () => {
    openPopup();

    const checkbox = document.body.querySelector('#popup-marketing-consent') as HTMLInputElement;
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);
  });

  it('renders legal links', () => {
    openPopup();

    const links = document.body.querySelectorAll('a');
    const hrefs = Array.from(links).map((l) => l.getAttribute('href'));
    expect(hrefs).toContain('/prize-draw-terms');
    expect(hrefs).toContain('/privacy');
  });

  it('submits form and shows success message', async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    render(<EmailPopup />);

    await waitFor(
      () => {
        expect(document.body.textContent).toContain('Win £1,000');
      },
      { timeout: 7000 }
    );

    const emailInput = document.body.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const submitBtn = document.body.querySelector('button[type="submit"]') as HTMLElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(document.body.textContent).toContain("You're entered!");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/subscribe',
      expect.objectContaining({ method: 'POST' })
    );
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
      'holibob_email_popup_submitted',
      expect.any(String)
    );
  });

  it('shows error on submission failure', async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Invalid email' }),
    });

    render(<EmailPopup />);

    await waitFor(
      () => {
        expect(document.body.textContent).toContain('Win £1,000');
      },
      { timeout: 7000 }
    );

    const emailInput = document.body.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'bad@example.com' } });

    const submitBtn = document.body.querySelector('button[type="submit"]') as HTMLElement;
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(document.body.textContent).toContain('Invalid email');
    });
  });
});
