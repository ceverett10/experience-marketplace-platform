import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SessionTimer } from './SessionTimer';

describe('SessionTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Helper to create a startTime that results in a specific number of seconds remaining.
   */
  function createStartTimeWithSecondsLeft(secondsLeft: number, durationMinutes = 15): Date {
    const now = Date.now();
    const durationMs = durationMinutes * 60 * 1000;
    // startTime = now - (durationMs - secondsLeft*1000)
    return new Date(now - durationMs + secondsLeft * 1000);
  }

  describe('inline variant (default)', () => {
    it('renders time in mm:ss format', () => {
      // 10 minutes left
      const startTime = createStartTimeWithSecondsLeft(600);
      render(<SessionTimer startTime={startTime} />);
      expect(screen.getByText('10:00')).toBeInTheDocument();
    });

    it('pads seconds with leading zero', () => {
      // 9 minutes and 5 seconds = 545 seconds
      const startTime = createStartTimeWithSecondsLeft(545);
      render(<SessionTimer startTime={startTime} />);
      expect(screen.getByText('9:05')).toBeInTheDocument();
    });

    it('counts down every second', () => {
      const startTime = createStartTimeWithSecondsLeft(65);
      render(<SessionTimer startTime={startTime} />);
      expect(screen.getByText('1:05')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('1:04')).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText('1:03')).toBeInTheDocument();
    });

    it('renders nothing when time has expired', () => {
      const startTime = createStartTimeWithSecondsLeft(0);
      const { container } = render(<SessionTimer startTime={startTime} />);
      expect(container.innerHTML).toBe('');
    });

    it('renders nothing when startTime is in the past beyond duration', () => {
      // Started 20 minutes ago with 15 min duration = expired
      const startTime = new Date(Date.now() - 20 * 60 * 1000);
      const { container } = render(<SessionTimer startTime={startTime} />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('banner variant', () => {
    it('renders banner text with countdown', () => {
      const startTime = createStartTimeWithSecondsLeft(600);
      render(<SessionTimer startTime={startTime} variant="banner" />);
      expect(screen.getByText(/Complete your booking in 10:00/)).toBeInTheDocument();
    });

    it('counts down in banner variant', () => {
      const startTime = createStartTimeWithSecondsLeft(120);
      render(<SessionTimer startTime={startTime} variant="banner" />);
      expect(screen.getByText(/Complete your booking in 2:00/)).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByText(/Complete your booking in 1:59/)).toBeInTheDocument();
    });
  });

  describe('custom duration', () => {
    it('uses custom durationMinutes', () => {
      // 5 minute duration, started just now
      const startTime = new Date(Date.now());
      render(<SessionTimer startTime={startTime} durationMinutes={5} />);
      expect(screen.getByText('5:00')).toBeInTheDocument();
    });

    it('expires correctly with custom duration', () => {
      // 1 minute duration, started 30 seconds ago
      const startTime = createStartTimeWithSecondsLeft(30, 1);
      render(<SessionTimer startTime={startTime} durationMinutes={1} />);
      expect(screen.getByText('0:30')).toBeInTheDocument();
    });
  });

  describe('onExpire callback', () => {
    it('calls onExpire when timer reaches zero', () => {
      const onExpire = vi.fn();
      const startTime = createStartTimeWithSecondsLeft(2);
      render(<SessionTimer startTime={startTime} onExpire={onExpire} />);

      // Advance 2 seconds to reach 0
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(onExpire).toHaveBeenCalled();
    });

    it('calls onExpire immediately when already expired', () => {
      const onExpire = vi.fn();
      const startTime = createStartTimeWithSecondsLeft(0);
      render(<SessionTimer startTime={startTime} onExpire={onExpire} />);

      expect(onExpire).toHaveBeenCalled();
    });

    it('does not call onExpire while time remains', () => {
      const onExpire = vi.fn();
      const startTime = createStartTimeWithSecondsLeft(60);
      render(<SessionTimer startTime={startTime} onExpire={onExpire} />);

      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(onExpire).not.toHaveBeenCalled();
    });
  });

  describe('color-coded urgency states', () => {
    it('uses gray/normal styling when more than 5 minutes remain', () => {
      const startTime = createStartTimeWithSecondsLeft(600); // 10 min
      const { container } = render(<SessionTimer startTime={startTime} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('text-gray-600');
    });

    it('uses amber/warning styling when 5 minutes or less remain', () => {
      const startTime = createStartTimeWithSecondsLeft(299); // 4:59
      const { container } = render(<SessionTimer startTime={startTime} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('text-amber-700');
    });

    it('uses red/critical styling when 2 minutes or less remain', () => {
      const startTime = createStartTimeWithSecondsLeft(119); // 1:59
      const { container } = render(<SessionTimer startTime={startTime} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('text-red-700');
    });

    it('applies animate-pulse to icon when critical', () => {
      const startTime = createStartTimeWithSecondsLeft(60); // 1 min
      const { container } = render(<SessionTimer startTime={startTime} />);
      const svg = container.querySelector('svg');
      // SVG elements in jsdom use SVGAnimatedString for className, so use getAttribute
      expect(svg?.getAttribute('class')).toContain('animate-pulse');
    });

    it('does not apply animate-pulse when in warning (non-critical) state', () => {
      const startTime = createStartTimeWithSecondsLeft(250); // ~4 min
      const { container } = render(<SessionTimer startTime={startTime} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('class')).not.toContain('animate-pulse');
    });

    it('does not apply animate-pulse in normal state', () => {
      const startTime = createStartTimeWithSecondsLeft(600); // 10 min
      const { container } = render(<SessionTimer startTime={startTime} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('class')).not.toContain('animate-pulse');
    });
  });

  describe('banner variant urgency colors', () => {
    it('uses gray background in normal state', () => {
      const startTime = createStartTimeWithSecondsLeft(600);
      const { container } = render(<SessionTimer startTime={startTime} variant="banner" />);
      const banner = container.firstChild as HTMLElement;
      expect(banner.className).toContain('bg-gray-50');
      expect(banner.className).toContain('text-gray-600');
    });

    it('uses amber background in warning state', () => {
      const startTime = createStartTimeWithSecondsLeft(250);
      const { container } = render(<SessionTimer startTime={startTime} variant="banner" />);
      const banner = container.firstChild as HTMLElement;
      expect(banner.className).toContain('bg-amber-50');
      expect(banner.className).toContain('text-amber-700');
    });

    it('uses red background in critical state', () => {
      const startTime = createStartTimeWithSecondsLeft(60);
      const { container } = render(<SessionTimer startTime={startTime} variant="banner" />);
      const banner = container.firstChild as HTMLElement;
      expect(banner.className).toContain('bg-red-50');
      expect(banner.className).toContain('text-red-700');
    });
  });

  describe('transition between states', () => {
    it('transitions from warning to critical as time decreases', () => {
      // Start at 2:01 (warning)
      const startTime = createStartTimeWithSecondsLeft(121);
      const { container } = render(<SessionTimer startTime={startTime} />);
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('text-amber-700');

      // Advance 2 seconds to 1:59 (critical)
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(wrapper.className).toContain('text-red-700');
    });

    it('disappears when timer reaches zero', () => {
      const startTime = createStartTimeWithSecondsLeft(1);
      const { container } = render(<SessionTimer startTime={startTime} />);
      expect(container.innerHTML).not.toBe('');

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(container.innerHTML).toBe('');
    });
  });
});
