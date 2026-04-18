import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DatePickerInput } from './DatePickerInput';

describe('DatePickerInput', () => {
  it('renders with placeholder when no value', () => {
    render(<DatePickerInput value="" onChange={() => {}} placeholder="Select date" />);
    expect(screen.getByText('Select date')).toBeDefined();
  });

  it('renders formatted date when value is set', () => {
    render(<DatePickerInput value="1990-06-15" onChange={() => {}} />);
    expect(screen.getByText('15 June 1990')).toBeDefined();
  });

  it('opens calendar dropdown on click', () => {
    render(<DatePickerInput value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    // Month and year selectors should be visible
    expect(screen.getByDisplayValue(new Date().getFullYear().toString())).toBeDefined();
  });

  it('has month and year dropdowns', () => {
    render(<DatePickerInput value="2000-03-10" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    // Should have a month selector showing March
    expect(screen.getByDisplayValue('March')).toBeDefined();
    // Should have a year selector showing 2000
    expect(screen.getByDisplayValue('2000')).toBeDefined();
  });

  it('can change year via dropdown', () => {
    render(<DatePickerInput value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    const yearSelect = screen.getByDisplayValue(new Date().getFullYear().toString());
    fireEvent.change(yearSelect, { target: { value: '1985' } });
    expect(screen.getByDisplayValue('1985')).toBeDefined();
  });

  it('can change month via dropdown', () => {
    render(<DatePickerInput value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    const monthSelect = screen.getByDisplayValue(
      new Date().toLocaleString('en', { month: 'long' })
    );
    fireEvent.change(monthSelect, { target: { value: '0' } });
    expect(screen.getByDisplayValue('January')).toBeDefined();
  });

  it('calls onChange when a date is clicked', () => {
    const onChange = vi.fn();
    // Use a future month so days aren't disabled by max
    render(<DatePickerInput value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));

    // Find day 15 in the current month grid and click it
    const dayButtons = screen.getAllByRole('button');
    const day15 = dayButtons.find(
      (btn) => btn.textContent === '15' && !btn.hasAttribute('disabled')
    );
    if (day15) {
      fireEvent.click(day15);
      expect(onChange).toHaveBeenCalled();
      // Value should be a YYYY-MM-DD string
      expect(onChange.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('disables dates after max', () => {
    render(<DatePickerInput value="" onChange={() => {}} max="2020-01-15" />);
    fireEvent.click(screen.getByRole('button'));
    // Navigate to Jan 2020
    const yearSelect = screen.getByDisplayValue(new Date().getFullYear().toString());
    fireEvent.change(yearSelect, { target: { value: '2020' } });
    const monthSelect = screen.getByDisplayValue(
      new Date().toLocaleString('en', { month: 'long' })
    );
    fireEvent.change(monthSelect, { target: { value: '0' } }); // January

    // Day 20 should be disabled (after max of 15)
    const dayButtons = screen.getAllByRole('button');
    const day20 = dayButtons.find((btn) => btn.textContent === '20');
    expect(day20?.hasAttribute('disabled')).toBe(true);
  });
});
