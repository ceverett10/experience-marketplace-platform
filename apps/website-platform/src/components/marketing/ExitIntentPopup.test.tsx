import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ExitIntentPopup } from './ExitIntentPopup';

// Mock next/navigation
const mockPathname = vi.fn(() => '/experiences/test-tour');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

// Mock site-context
vi.mock('@/lib/site-context', () => ({
  useBrand: vi.fn(() => ({ primaryColor: '#0d9488' })),
}));

describe('ExitIntentPopup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
    mockPathname.mockReturnValue('/experiences/test-tour');
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: '',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing initially', () => {
    const { container } = render(<ExitIntentPopup />);
    expect(container.innerHTML).toBe('');
  });

  it('shows on experience page when mouse leaves top of viewport', () => {
    render(<ExitIntentPopup />);

    // Wait past the 5s delay for listener registration
    vi.advanceTimersByTime(6000);

    // Simulate mouse leaving toward address bar
    fireEvent.mouseLeave(document, { clientY: 5 });

    expect(document.body.textContent).toContain('Still deciding?');
    expect(document.body.textContent).toContain('Continue browsing');
  });

  it('does not show when mouse is not near top (clientY > 10)', () => {
    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);

    fireEvent.mouseLeave(document, { clientY: 100 });

    expect(document.body.textContent).not.toContain('Still deciding?');
  });

  it('only shows once per session via sessionStorage', () => {
    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);

    // First trigger
    fireEvent.mouseLeave(document, { clientY: 5 });
    expect(document.body.textContent).toContain('Still deciding?');

    // Close it
    const closeBtn = document.body.querySelector('[aria-label="Close"]') as HTMLElement;
    fireEvent.click(closeBtn);

    // Second trigger should not show
    fireEvent.mouseLeave(document, { clientY: 5 });
    // Popup should not reappear after close since sessionStorage is set
    expect(sessionStorage.getItem('holibob_exit_popup_shown')).toBe('true');
  });

  it('closes on close button click', () => {
    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);
    fireEvent.mouseLeave(document, { clientY: 5 });

    const closeBtn = document.body.querySelector('[aria-label="Close"]') as HTMLElement;
    fireEvent.click(closeBtn);

    expect(document.body.textContent).not.toContain('Still deciding?');
  });

  it('closes on backdrop click', () => {
    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);
    fireEvent.mouseLeave(document, { clientY: 5 });

    const backdrop = document.body.querySelector('[aria-hidden="true"]') as HTMLElement;
    fireEvent.click(backdrop);

    expect(document.body.textContent).not.toContain('Still deciding?');
  });

  it('does not show on non-experience pages without PPC', () => {
    mockPathname.mockReturnValue('/about');

    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);
    fireEvent.mouseLeave(document, { clientY: 5 });

    expect(document.body.textContent).not.toContain('Still deciding?');
  });

  it('shows on homepage for PPC visitors', () => {
    mockPathname.mockReturnValue('/');
    Object.defineProperty(document, 'cookie', {
      writable: true,
      value: `utm_params=${encodeURIComponent(JSON.stringify({ gclid: 'abc' }))}`,
    });

    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);
    fireEvent.mouseLeave(document, { clientY: 5 });

    expect(document.body.textContent).toContain('Wait — check out these experiences!');
    expect(document.body.textContent).toContain('Browse Experiences');
  });

  it('does not show on /experiences page (list, not detail)', () => {
    mockPathname.mockReturnValue('/experiences');

    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);
    fireEvent.mouseLeave(document, { clientY: 5 });

    expect(document.body.textContent).not.toContain('Still deciding?');
  });

  it('renders trust signals (free cancellation, best price)', () => {
    render(<ExitIntentPopup />);
    vi.advanceTimersByTime(6000);
    fireEvent.mouseLeave(document, { clientY: 5 });

    expect(document.body.textContent).toContain('Reserve now, pay nothing today');
    expect(document.body.textContent).toContain('Free cancellation available');
    expect(document.body.textContent).toContain('Best price guarantee');
  });
});
