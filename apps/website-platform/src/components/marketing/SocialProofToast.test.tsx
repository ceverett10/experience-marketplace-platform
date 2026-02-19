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

  it('shows toast after 15 seconds', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows name and city text', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/\w+ from \w+/);
  });

  it('shows "just made a booking" text', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status').textContent).toContain('just made a booking');
  });

  it('shows dismiss button with aria-label="Dismiss"', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByLabelText('Dismiss')).toBeInTheDocument();
  });

  it('hides after clicking dismiss', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('sets sessionStorage on dismiss', () => {
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(sessionStorage.getItem('social-proof-dismissed')).toBe('true');
  });

  it('does not show on /checkout path', () => {
    mockPathname.mockReturnValue('/checkout');
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

  it('hides automatically after 4 seconds', () => {
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

  it('does not show when sessionStorage has social-proof-dismissed', () => {
    sessionStorage.setItem('social-proof-dismissed', 'true');
    render(<SocialProofToast />);
    act(() => {
      vi.advanceTimersByTime(15001);
    });
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
