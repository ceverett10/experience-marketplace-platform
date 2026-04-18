'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

interface DatePickerInputProps {
  value: string; // "YYYY-MM-DD"
  onChange: (value: string) => void;
  placeholder?: string;
  max?: string; // "YYYY-MM-DD"
  min?: string; // "YYYY-MM-DD"
  className?: string;
  error?: boolean;
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = 'Select date',
  max,
  min,
  className = '',
  error = false,
}: DatePickerInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [year, setYear] = useState(() => {
    if (value) return new Date(value + 'T00:00:00').getFullYear();
    return new Date().getFullYear();
  });
  const [month, setMonth] = useState(() => {
    if (value) return new Date(value + 'T00:00:00').getMonth();
    return new Date().getMonth();
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7;

    const days: Array<{ date: string; day: number; inMonth: boolean }> = [];

    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        day: d.getDate(),
        inMonth: false,
      });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push({
        date: `${year}-${pad(month + 1)}-${pad(d)}`,
        day: d,
        inMonth: true,
      });
    }

    while (days.length % 7 !== 0) {
      const d = new Date(year, month + 1, days.length - startDow - lastDay.getDate() + 1);
      days.push({
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        day: d.getDate(),
        inMonth: false,
      });
    }

    const result: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [year, month]);

  const handlePrev = () => {
    if (month === 0) {
      setYear((y) => y - 1);
      setMonth(11);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNext = () => {
    if (month === 11) {
      setYear((y) => y + 1);
      setMonth(0);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleSelectDate = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  const borderClass = error
    ? 'border-red-300 focus-within:border-red-500 focus-within:ring-red-500'
    : 'border-gray-300 focus-within:border-teal-500 focus-within:ring-teal-500';

  return (
    <div ref={containerRef} className="relative">
      {/* Input trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-base transition-colors focus:outline-none focus:ring-2 sm:text-sm ${borderClass} ${className}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-400'}>
          {value ? formatDisplayDate(value) : placeholder}
        </span>
        <svg
          className="h-5 w-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="1.5"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
          />
        </svg>
      </button>

      {/* Dropdown calendar */}
      {isOpen && (
        <div className="absolute left-0 z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          {/* Month and year selectors */}
          <div className="mb-3 flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i} value={i}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-24 rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm font-medium text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
            >
              {Array.from({ length: 120 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-gray-500">
            {DAY_LABELS.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7">
            {weeks.flat().map((cell, idx) => {
              const isSelected = cell.date === value;
              const isDisabled =
                !cell.inMonth ||
                (max != null && cell.date > max) ||
                (min != null && cell.date < min);

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => !isDisabled && handleSelectDate(cell.date)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                    !cell.inMonth
                      ? 'text-gray-300'
                      : isSelected
                        ? 'bg-teal-600 font-semibold text-white'
                        : isDisabled
                          ? 'text-gray-300'
                          : 'text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
