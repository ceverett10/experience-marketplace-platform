import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SessionTimer } from './SessionTimer';

describe('SessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-19T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('inline variant (default)', () => {
    it('renders countdown in M:SS format', () => {
      const startTime = new Date('2026-02-19T11:50:00Z'); // 10 min ago, 5 min left
      render(<SessionTimer startTime={startTime} durationMinutes={15} />);
      expect(screen.getByText('5:00')).toBeInTheDocument();
    });

    it('counts down every second', () => {
      const startTime = new Date('2026-02-19T11:50:00Z'); // 10 min ago
      render(<SessionTimer startTime={startTime} durationMinutes={15} />);
      expect(screen.getByText('5:00')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('4:59')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('4:58')).toBeInTheDocument();
    });

    it('pads seconds with leading zero', () => {
      // startTime such that 14 min 5 sec are left
      const startTime = new Date('2026-02-19T11:59:55Z'); // 5 seconds ago, 14:55 left
      render(<SessionTimer startTime={startTime} durationMinutes={15} />);
      expect(screen.getByText('14:55')).toBeInTheDocument();
    });

    it('calls onExpire when timer reaches zero', () => {
      const onExpire = vi.fn();
      // 2 seconds left
      const startTime = new Date('2026-02-19T11:47:58Z'); // 12 min 2 sec ago with 15 min duration = 2:58 left
      // Better: make it precise
      const now = new Date('2026-02-19T12:00:00Z');
      const twoSecondsLeft = new Date(now.getTime() - (15 * 60 * 1000 - 2000));
      render(<SessionTimer startTime={twoSecondsLeft} durationMinutes={15} onExpire={onExpire} />);

      expect(onExpire).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onExpire).toHaveBeenCalled();
    });

    it('returns null when timer has already expired', () => {
      const startTime = new Date('2026-02-19T11:40:00Z'); // 20 min ago, 15 min duration = expired
      const { container } = render(<SessionTimer startTime={startTime} durationMinutes={15} />);
      expect(container.innerHTML).toBe('');
    });

    it('returns null after countdown completes', () => {
      const now = new Date('2026-02-19T12:00:00Z');
      const oneSecondLeft = new Date(now.getTime() - (15 * 60 * 1000 - 1000));
      const { container } = render(<SessionTimer startTime={oneSecondLeft} durationMinutes={15} />);

      expect(screen.getByText('0:01')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(container.innerHTML).toBe('');
    });

    it('uses default duration of 15 minutes', () => {
      // startTime = exactly now, so 15 min left
      const startTime = new Date('2026-02-19T12:00:00Z');
      render(<SessionTimer startTime={startTime} />);
      expect(screen.getByText('15:00')).toBeInTheDocument();
    });

    it('accepts custom duration', () => {
      const startTime = new Date('2026-02-19T12:00:00Z');
      render(<SessionTimer startTime={startTime} durationMinutes={10} />);
      expect(screen.getByText('10:00')).toBeInTheDocument();
    });
  });

  describe('color-coded urgency', () => {
    it('shows gray styling when time > 5 minutes', () => {
      const startTime = new Date('2026-02-19T12:00:00Z'); // 15 min left
      const { container } = render(<SessionTimer startTime={startTime} />);
      expect(container.querySelector('.text-gray-600')).toBeTruthy();
    });

    it('shows amber/warning styling when time <= 5 minutes', () => {
      const now = new Date('2026-02-19T12:00:00Z');
      const fiveMinLeft = new Date(now.getTime() - (15 * 60 * 1000 - 4 * 60 * 1000)); // 4 min left
      const { container } = render(<SessionTimer startTime={fiveMinLeft} durationMinutes={15} />);
      expect(container.querySelector('.text-amber-700')).toBeTruthy();
    });

    it('shows red/critical styling when time <= 2 minutes', () => {
      const now = new Date('2026-02-19T12:00:00Z');
      const twoMinLeft = new Date(now.getTime() - (15 * 60 * 1000 - 90 * 1000)); // 1.5 min left
      const { container } = render(<SessionTimer startTime={twoMinLeft} durationMinutes={15} />);
      expect(container.querySelector('.text-red-700')).toBeTruthy();
    });

    it('transitions from gray to amber as time decreases', () => {
      const now = new Date('2026-02-19T12:00:00Z');
      // Start at 5:01 left
      const startTime = new Date(now.getTime() - (15 * 60 * 1000 - 301 * 1000));
      const { container } = render(<SessionTimer startTime={startTime} durationMinutes={15} />);
      expect(container.querySelector('.text-gray-600')).toBeTruthy();

      // Advance to 5:00 exactly
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(container.querySelector('.text-amber-700')).toBeTruthy();
    });
  });

  describe('banner variant', () => {
    it('renders "Complete your booking in" text', () => {
      const startTime = new Date('2026-02-19T12:00:00Z');
      render(<SessionTimer startTime={startTime} variant="banner" />);
      expect(screen.getByText(/complete your booking in/i)).toBeInTheDocument();
    });

    it('renders countdown time within banner text', () => {
      const startTime = new Date('2026-02-19T12:00:00Z');
      render(<SessionTimer startTime={startTime} variant="banner" />);
      expect(screen.getByText(/15:00/)).toBeInTheDocument();
    });

    it('applies border-b class in banner variant', () => {
      const startTime = new Date('2026-02-19T12:00:00Z');
      const { container } = render(<SessionTimer startTime={startTime} variant="banner" />);
      expect(container.querySelector('.border-b')).toBeTruthy();
    });

    it('shows critical pulse animation when time <= 2 minutes', () => {
      const now = new Date('2026-02-19T12:00:00Z');
      const twoMinLeft = new Date(now.getTime() - (15 * 60 * 1000 - 60 * 1000)); // 1 min left
      const { container } = render(
        <SessionTimer startTime={twoMinLeft} durationMinutes={15} variant="banner" />
      );
      expect(container.querySelector('.animate-pulse')).toBeTruthy();
    });

    it('does not show pulse animation when time > 2 minutes', () => {
      const startTime = new Date('2026-02-19T12:00:00Z'); // 15 min left
      const { container } = render(<SessionTimer startTime={startTime} variant="banner" />);
      expect(container.querySelector('.animate-pulse')).toBeNull();
    });
  });
});
