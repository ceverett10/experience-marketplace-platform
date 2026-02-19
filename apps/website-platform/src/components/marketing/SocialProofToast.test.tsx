import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SocialProofToast } from './SocialProofToast';

// Mock next/navigation
const mockPathname = vi.fn(() => '/');
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}));

describe('SocialProofToast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    mockPathname.mockReturnValue('/');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show toast initially', () => {
    const { container } = render(<SocialProofToast />);
    expect(container.innerHTML).toBe('');
  });

  it('shows toast after 15 seconds on homepage', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('displays name and city in "{name} from {city}" format', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/\w+ from \w+/);
  });

  it('displays "just made a booking" text', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status').textContent).toContain('just made a booking');
  });

  it('displays a time-ago string', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status').textContent).toMatch(/ago/);
  });

  it('renders dismiss button with aria-label="Dismiss"', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('hides toast when dismiss button is clicked', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sets sessionStorage "social-proof-dismissed" on dismiss', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(sessionStorage.getItem('social-proof-dismissed')).toBe('true');
  });

  it('hides toast automatically after 4 seconds', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show when sessionStorage has "social-proof-dismissed"', () => {
    sessionStorage.setItem('social-proof-dismissed', 'true');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on /checkout path', () => {
    mockPathname.mockReturnValue('/checkout');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on /payment path', () => {
    mockPathname.mockReturnValue('/payment');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on /privacy path', () => {
    mockPathname.mockReturnValue('/privacy');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on /terms path', () => {
    mockPathname.mockReturnValue('/terms');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on /contact path', () => {
    mockPathname.mockReturnValue('/contact');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on /legal path', () => {
    mockPathname.mockReturnValue('/legal');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on /prize-draw-terms path', () => {
    mockPathname.mockReturnValue('/prize-draw-terms');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('does not show on sub-paths of excluded routes (e.g. /checkout/confirm)', () => {
    mockPathname.mockReturnValue('/checkout/confirm');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows on /experiences path (not excluded)', () => {
    mockPathname.mockReturnValue('/experiences/london-eye');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows on /blog path (not excluded)', () => {
    mockPathname.mockReturnValue('/blog/my-post');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders the first letter of the name in the avatar', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    const status = screen.getByRole('status');
    // The avatar shows a single character (first letter)
    const avatarDiv = status.querySelector('.rounded-full.bg-emerald-100');
    expect(avatarDiv).toBeTruthy();
    expect(avatarDiv!.textContent).toMatch(/^[A-Z]$/);
  });

  it('uses role="status" and aria-live="polite" for accessibility', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
