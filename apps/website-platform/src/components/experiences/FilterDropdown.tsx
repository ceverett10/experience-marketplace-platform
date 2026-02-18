'use client';

/**
 * Dropdown content panels for different filter types.
 * Rendered inside FilterChip's dropdown area.
 */

interface CheckboxFilterProps {
  options: { name: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Max items to show before scrolling */
  maxVisible?: number;
}

/** Checkbox list with counts — used for Categories and Cities */
export function CheckboxFilter({
  options,
  selected,
  onToggle,
  maxVisible = 8,
}: CheckboxFilterProps) {
  if (options.length === 0) {
    return <p className="py-2 text-center text-sm text-gray-400">No options available</p>;
  }

  return (
    <div
      className={options.length > maxVisible ? 'max-h-64 overflow-y-auto' : ''}
      role="listbox"
      aria-multiselectable="true"
    >
      {options.map((option) => {
        const isSelected = selected.includes(option.name);
        return (
          <label
            key={option.name}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50"
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggle(option.name)}
              className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
            />
            <span className="flex-1 text-sm text-gray-700">{option.name}</span>
            <span className="text-xs text-gray-400">{option.count}</span>
          </label>
        );
      })}
    </div>
  );
}

interface ButtonGroupFilterProps<T extends string | number> {
  options: { label: string; value: T; count: number }[];
  selected: T | null;
  onSelect: (value: T | null) => void;
  primaryColor?: string;
}

/** Button group with counts — used for Price, Duration, Rating */
export function ButtonGroupFilter<T extends string | number>({
  options,
  selected,
  onSelect,
  primaryColor = '#0F766E',
}: ButtonGroupFilterProps<T>) {
  if (options.length === 0) {
    return <p className="py-2 text-center text-sm text-gray-400">No options available</p>;
  }

  return (
    <div className="flex flex-col gap-1" role="listbox">
      {options.map((option) => {
        const isSelected = selected === option.value;
        return (
          <button
            key={String(option.value)}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => onSelect(isSelected ? null : option.value)}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              isSelected ? 'text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            style={isSelected ? { backgroundColor: primaryColor } : undefined}
          >
            <span className="font-medium">{option.label}</span>
            <span className={`text-xs ${isSelected ? 'text-white/75' : 'text-gray-400'}`}>
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

interface PriceRangeFilterProps {
  ranges: { label: string; min: number; max: number | null; count: number }[];
  selectedMin: string | null;
  selectedMax: string | null;
  onSelect: (min: string | null, max: string | null) => void;
  primaryColor?: string;
}

/** Price range preset buttons */
export function PriceRangeFilter({
  ranges,
  selectedMin,
  selectedMax,
  onSelect,
  primaryColor = '#0F766E',
}: PriceRangeFilterProps) {
  if (ranges.length === 0) {
    return <p className="py-2 text-center text-sm text-gray-400">No price data available</p>;
  }

  return (
    <div className="flex flex-col gap-1" role="listbox">
      {ranges.map((range) => {
        const isSelected =
          selectedMin === String(range.min) &&
          (range.max === null ? selectedMax === null : selectedMax === String(range.max));

        return (
          <button
            key={range.label}
            type="button"
            role="option"
            aria-selected={isSelected}
            onClick={() => {
              if (isSelected) {
                onSelect(null, null);
              } else {
                onSelect(String(range.min), range.max !== null ? String(range.max) : null);
              }
            }}
            className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
              isSelected ? 'text-white' : 'text-gray-700 hover:bg-gray-50'
            }`}
            style={isSelected ? { backgroundColor: primaryColor } : undefined}
          >
            <span className="font-medium">{range.label}</span>
            <span className={`text-xs ${isSelected ? 'text-white/75' : 'text-gray-400'}`}>
              {range.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
