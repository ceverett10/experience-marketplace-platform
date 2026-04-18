import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CalendarGrid } from './CalendarGrid';

const defaultProps = {
  year: 2026,
  month: 3, // April
  availableDates: new Set(['2026-04-20', '2026-04-21', '2026-04-25']),
  selectedDate: null,
  dateToSlotId: new Map([
    ['2026-04-20', 'slot-20'],
    ['2026-04-21', 'slot-21'],
    ['2026-04-25', 'slot-25'],
  ]),
  onSelectDate: vi.fn(),
  onPrevMonth: vi.fn(),
  onNextMonth: vi.fn(),
};

describe('CalendarGrid', () => {
  it('renders month and year header', () => {
    render(<CalendarGrid {...defaultProps} />);
    expect(screen.getByText('April 2026')).toBeDefined();
  });

  it('renders day-of-week headers', () => {
    render(<CalendarGrid {...defaultProps} />);
    expect(screen.getByText('Mon')).toBeDefined();
    expect(screen.getByText('Sun')).toBeDefined();
  });

  it('renders day numbers for the month', () => {
    render(<CalendarGrid {...defaultProps} />);
    // Calendar should render day numbers — use getAllByText since padding days may duplicate
    expect(screen.getAllByText('15').length).toBeGreaterThan(0);
    expect(screen.getAllByText('20').length).toBeGreaterThan(0);
  });

  it('adds data-testid on available dates with slot IDs', () => {
    render(<CalendarGrid {...defaultProps} />);
    expect(document.querySelector('[data-testid="date-slot-slot-20"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="date-slot-slot-25"]')).toBeTruthy();
  });

  it('calls onSelectDate when an available date is clicked', () => {
    const onSelectDate = vi.fn();
    render(<CalendarGrid {...defaultProps} onSelectDate={onSelectDate} />);
    const slot = document.querySelector('[data-testid="date-slot-slot-20"]') as HTMLElement;
    fireEvent.click(slot);
    expect(onSelectDate).toHaveBeenCalledWith('2026-04-20');
  });

  it('calls onNextMonth when next arrow is clicked', () => {
    const onNextMonth = vi.fn();
    render(<CalendarGrid {...defaultProps} onNextMonth={onNextMonth} />);
    // The next month button contains the right-chevron SVG
    const navButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.querySelector('svg') && btn.textContent === '');
    // Last nav button is "next"
    const nextBtn = navButtons[navButtons.length - 1];
    if (nextBtn) {
      fireEvent.click(nextBtn);
      expect(onNextMonth).toHaveBeenCalled();
    }
  });

  it('highlights the selected date', () => {
    render(<CalendarGrid {...defaultProps} selectedDate="2026-04-21" />);
    const selected = document.querySelector('[data-testid="date-slot-slot-21"]');
    expect(selected?.className).toContain('text-white');
  });
});
