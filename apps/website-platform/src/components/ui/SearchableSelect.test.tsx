import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchableSelect } from './SearchableSelect';

const options = [
  { label: 'Hilton Hotel', value: 'hilton' },
  { label: 'Marriott Downtown', value: 'marriott' },
  { label: 'Holiday Inn Express', value: 'holiday-inn' },
  { label: 'Best Western', value: 'best-western' },
  { label: 'Radisson Blu', value: 'radisson' },
];

describe('SearchableSelect', () => {
  it('renders with placeholder when no value selected', () => {
    render(
      <SearchableSelect
        options={options}
        value=""
        onChange={() => {}}
        placeholder="Pick a hotel..."
      />
    );
    expect(screen.getByText('Pick a hotel...')).toBeDefined();
  });

  it('shows selected option label', () => {
    render(<SearchableSelect options={options} value="marriott" onChange={() => {}} />);
    expect(screen.getByText('Marriott Downtown')).toBeDefined();
  });

  it('opens dropdown and shows all options on click', () => {
    render(<SearchableSelect options={options} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByPlaceholderText('Type to search...')).toBeDefined();
    expect(screen.getByText('Hilton Hotel')).toBeDefined();
    expect(screen.getByText('Radisson Blu')).toBeDefined();
  });

  it('filters options by search text', () => {
    render(<SearchableSelect options={options} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('Type to search...');
    fireEvent.change(searchInput, { target: { value: 'hilton' } });
    expect(screen.getByText('Hilton Hotel')).toBeDefined();
    expect(screen.queryByText('Marriott Downtown')).toBeNull();
  });

  it('shows no results message when search has no matches', () => {
    render(<SearchableSelect options={options} value="" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('Type to search...');
    fireEvent.change(searchInput, { target: { value: 'zzzzz' } });
    expect(screen.getByText('No results found')).toBeDefined();
  });

  it('calls onChange when an option is selected', () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={options} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByText('Radisson Blu'));
    expect(onChange).toHaveBeenCalledWith('radisson');
  });

  it('highlights the currently selected option', () => {
    render(<SearchableSelect options={options} value="hilton" onChange={() => {}} />);
    // Open dropdown — the trigger button already shows "Hilton Hotel"
    const trigger = screen.getAllByRole('button')[0]!;
    fireEvent.click(trigger);
    // In the dropdown, the selected option has teal background
    const dropdownButtons = screen
      .getAllByRole('button')
      .filter((btn) => btn.className.includes('bg-teal-50'));
    expect(dropdownButtons.length).toBeGreaterThan(0);
    expect(dropdownButtons[0]?.textContent).toContain('Hilton Hotel');
  });
});
