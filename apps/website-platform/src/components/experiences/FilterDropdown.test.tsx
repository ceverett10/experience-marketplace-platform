import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CheckboxFilter, ButtonGroupFilter, PriceRangeFilter } from './FilterDropdown';

describe('CheckboxFilter', () => {
  const options = [
    { name: 'Food Tours', count: 12 },
    { name: 'Walking Tours', count: 8 },
    { name: 'Museums', count: 5 },
  ];

  it('shows "No options available" when options are empty', () => {
    render(<CheckboxFilter options={[]} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('No options available')).toBeInTheDocument();
  });

  it('renders all option names', () => {
    render(<CheckboxFilter options={options} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Food Tours')).toBeInTheDocument();
    expect(screen.getByText('Walking Tours')).toBeInTheDocument();
    expect(screen.getByText('Museums')).toBeInTheDocument();
  });

  it('renders counts for each option', () => {
    render(<CheckboxFilter options={options} selected={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders checkboxes for each option', () => {
    render(<CheckboxFilter options={options} selected={[]} onToggle={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
  });

  it('marks selected options as checked', () => {
    render(<CheckboxFilter options={options} selected={['Food Tours']} onToggle={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).not.toBeChecked();
  });

  it('calls onToggle with option name when checkbox is clicked', () => {
    const onToggle = vi.fn();
    render(<CheckboxFilter options={options} selected={[]} onToggle={onToggle} />);
    fireEvent.click(screen.getAllByRole('checkbox')[1]!);
    expect(onToggle).toHaveBeenCalledWith('Walking Tours');
  });

  it('calls onToggle to deselect an already selected option', () => {
    const onToggle = vi.fn();
    render(<CheckboxFilter options={options} selected={['Food Tours']} onToggle={onToggle} />);
    fireEvent.click(screen.getAllByRole('checkbox')[0]!);
    expect(onToggle).toHaveBeenCalledWith('Food Tours');
  });

  it('renders a listbox with multiselectable attribute', () => {
    render(<CheckboxFilter options={options} selected={[]} onToggle={vi.fn()} />);
    const listbox = screen.getByRole('listbox');
    expect(listbox).toHaveAttribute('aria-multiselectable', 'true');
  });

  it('applies scrollable class when options exceed maxVisible', () => {
    const manyOptions = Array.from({ length: 10 }, (_, i) => ({
      name: `Option ${i}`,
      count: i,
    }));
    render(<CheckboxFilter options={manyOptions} selected={[]} onToggle={vi.fn()} />);
    const listbox = screen.getByRole('listbox');
    expect(listbox.className).toContain('max-h-64');
    expect(listbox.className).toContain('overflow-y-auto');
  });

  it('does not apply scrollable class when options are within maxVisible', () => {
    render(<CheckboxFilter options={options} selected={[]} onToggle={vi.fn()} />);
    const listbox = screen.getByRole('listbox');
    expect(listbox.className).not.toContain('max-h-64');
  });

  it('respects custom maxVisible prop', () => {
    render(<CheckboxFilter options={options} selected={[]} onToggle={vi.fn()} maxVisible={2} />);
    const listbox = screen.getByRole('listbox');
    expect(listbox.className).toContain('max-h-64');
  });
});

describe('ButtonGroupFilter', () => {
  const options = [
    { label: 'Under 2 hours', value: 'short', count: 10 },
    { label: '2-4 hours', value: 'half-day', count: 7 },
    { label: '4-8 hours', value: 'full-day', count: 3 },
  ];

  it('shows "No options available" when options are empty', () => {
    render(<ButtonGroupFilter options={[]} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('No options available')).toBeInTheDocument();
  });

  it('renders all option labels', () => {
    render(<ButtonGroupFilter options={options} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('Under 2 hours')).toBeInTheDocument();
    expect(screen.getByText('2-4 hours')).toBeInTheDocument();
    expect(screen.getByText('4-8 hours')).toBeInTheDocument();
  });

  it('renders counts for each option', () => {
    render(<ButtonGroupFilter options={options} selected={null} onSelect={vi.fn()} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders buttons with role="option"', () => {
    render(<ButtonGroupFilter options={options} selected={null} onSelect={vi.fn()} />);
    const optionButtons = screen.getAllByRole('option');
    expect(optionButtons).toHaveLength(3);
  });

  it('sets aria-selected=true on the selected option', () => {
    render(<ButtonGroupFilter options={options} selected="half-day" onSelect={vi.fn()} />);
    const optionButtons = screen.getAllByRole('option');
    expect(optionButtons[0]).toHaveAttribute('aria-selected', 'false');
    expect(optionButtons[1]).toHaveAttribute('aria-selected', 'true');
    expect(optionButtons[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('sets aria-selected=false on all options when none selected', () => {
    render(<ButtonGroupFilter options={options} selected={null} onSelect={vi.fn()} />);
    const optionButtons = screen.getAllByRole('option');
    optionButtons.forEach((btn) => {
      expect(btn).toHaveAttribute('aria-selected', 'false');
    });
  });

  it('calls onSelect with value when unselected option is clicked', () => {
    const onSelect = vi.fn();
    render(<ButtonGroupFilter options={options} selected={null} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole('option')[1]!);
    expect(onSelect).toHaveBeenCalledWith('half-day');
  });

  it('calls onSelect with null when selected option is clicked (deselect)', () => {
    const onSelect = vi.fn();
    render(<ButtonGroupFilter options={options} selected="half-day" onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole('option')[1]!);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('applies background color style to selected option', () => {
    render(
      <ButtonGroupFilter
        options={options}
        selected="short"
        onSelect={vi.fn()}
        primaryColor="#ff0000"
      />
    );
    const selectedBtn = screen.getAllByRole('option')[0]!;
    expect(selectedBtn).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('does not apply background color style to unselected options', () => {
    render(
      <ButtonGroupFilter
        options={options}
        selected="short"
        onSelect={vi.fn()}
        primaryColor="#ff0000"
      />
    );
    const unselectedBtn = screen.getAllByRole('option')[1]!;
    expect(unselectedBtn).not.toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('works with number values', () => {
    const numOptions = [
      { label: '4+', value: 4, count: 20 },
      { label: '4.5+', value: 4.5, count: 10 },
    ];
    const onSelect = vi.fn();
    render(<ButtonGroupFilter options={numOptions} selected={4} onSelect={onSelect} />);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getAllByRole('option')[1]!);
    expect(onSelect).toHaveBeenCalledWith(4.5);
  });
});

describe('PriceRangeFilter', () => {
  const ranges = [
    { label: 'GBP0-GBP25', min: 0, max: 25, count: 15 },
    { label: 'GBP25-GBP50', min: 25, max: 50, count: 10 },
    { label: 'GBP50+', min: 50, max: null, count: 5 },
  ];

  it('shows "No price data available" when ranges are empty', () => {
    render(
      <PriceRangeFilter ranges={[]} selectedMin={null} selectedMax={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText('No price data available')).toBeInTheDocument();
  });

  it('renders all range labels', () => {
    render(
      <PriceRangeFilter ranges={ranges} selectedMin={null} selectedMax={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText('GBP0-GBP25')).toBeInTheDocument();
    expect(screen.getByText('GBP25-GBP50')).toBeInTheDocument();
    expect(screen.getByText('GBP50+')).toBeInTheDocument();
  });

  it('renders counts for each range', () => {
    render(
      <PriceRangeFilter ranges={ranges} selectedMin={null} selectedMax={null} onSelect={vi.fn()} />
    );
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders buttons with role="option"', () => {
    render(
      <PriceRangeFilter ranges={ranges} selectedMin={null} selectedMax={null} onSelect={vi.fn()} />
    );
    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('marks the matching range as selected (with max)', () => {
    render(
      <PriceRangeFilter ranges={ranges} selectedMin="25" selectedMax="50" onSelect={vi.fn()} />
    );
    const optionButtons = screen.getAllByRole('option');
    expect(optionButtons[0]).toHaveAttribute('aria-selected', 'false');
    expect(optionButtons[1]).toHaveAttribute('aria-selected', 'true');
    expect(optionButtons[2]).toHaveAttribute('aria-selected', 'false');
  });

  it('marks the matching range as selected (with null max)', () => {
    render(
      <PriceRangeFilter ranges={ranges} selectedMin="50" selectedMax={null} onSelect={vi.fn()} />
    );
    const optionButtons = screen.getAllByRole('option');
    expect(optionButtons[0]).toHaveAttribute('aria-selected', 'false');
    expect(optionButtons[1]).toHaveAttribute('aria-selected', 'false');
    expect(optionButtons[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('calls onSelect with stringified min and max when unselected range is clicked', () => {
    const onSelect = vi.fn();
    render(
      <PriceRangeFilter ranges={ranges} selectedMin={null} selectedMax={null} onSelect={onSelect} />
    );
    fireEvent.click(screen.getAllByRole('option')[0]!);
    expect(onSelect).toHaveBeenCalledWith('0', '25');
  });

  it('calls onSelect with null max when range has null max', () => {
    const onSelect = vi.fn();
    render(
      <PriceRangeFilter ranges={ranges} selectedMin={null} selectedMax={null} onSelect={onSelect} />
    );
    fireEvent.click(screen.getAllByRole('option')[2]!);
    expect(onSelect).toHaveBeenCalledWith('50', null);
  });

  it('calls onSelect with (null, null) when selected range is clicked (deselect)', () => {
    const onSelect = vi.fn();
    render(
      <PriceRangeFilter ranges={ranges} selectedMin="0" selectedMax="25" onSelect={onSelect} />
    );
    fireEvent.click(screen.getAllByRole('option')[0]!);
    expect(onSelect).toHaveBeenCalledWith(null, null);
  });

  it('applies background color style to selected range', () => {
    render(
      <PriceRangeFilter
        ranges={ranges}
        selectedMin="0"
        selectedMax="25"
        onSelect={vi.fn()}
        primaryColor="#ff0000"
      />
    );
    const selectedBtn = screen.getAllByRole('option')[0]!;
    expect(selectedBtn).toHaveStyle({ backgroundColor: '#ff0000' });
  });

  it('does not apply background color style to unselected ranges', () => {
    render(
      <PriceRangeFilter
        ranges={ranges}
        selectedMin="0"
        selectedMax="25"
        onSelect={vi.fn()}
        primaryColor="#ff0000"
      />
    );
    const unselectedBtn = screen.getAllByRole('option')[1]!;
    expect(unselectedBtn).not.toHaveStyle({ backgroundColor: '#ff0000' });
  });
});
