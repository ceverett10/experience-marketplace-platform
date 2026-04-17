'use client';

import { useMemo } from 'react';

interface CalendarGridProps {
  /** Currently displayed year */
  year: number;
  /** Currently displayed month (0-indexed) */
  month: number;
  /** Set of "YYYY-MM-DD" dates that are available */
  availableDates: Set<string>;
  /** Currently selected date ("YYYY-MM-DD") */
  selectedDate: string | null;
  /** Map from "YYYY-MM-DD" -> slot ID for test-id generation */
  dateToSlotId: Map<string, string>;
  /** Called when a user clicks an available date */
  onSelectDate: (dateStr: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  primaryColor?: string;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
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

export function CalendarGrid({
  year,
  month,
  availableDates,
  selectedDate,
  dateToSlotId,
  onSelectDate,
  onPrevMonth,
  onNextMonth,
  primaryColor = '#0d9488',
}: CalendarGridProps) {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);

  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday = 0, Sunday = 6  (ISO week)
    const startDow = (firstDay.getDay() + 6) % 7;

    const days: Array<{ date: string; day: number; inMonth: boolean }> = [];

    // Padding days from previous month
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        day: d.getDate(),
        inMonth: false,
      });
    }

    // Days in current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
      days.push({ date: dateStr, day: d, inMonth: true });
    }

    // Padding days from next month to fill last week
    while (days.length % 7 !== 0) {
      const d = new Date(year, month + 1, days.length - startDow - lastDay.getDate() + 1);
      days.push({
        date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        day: d.getDate(),
        inMonth: false,
      });
    }

    // Chunk into weeks
    const result: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [year, month]);

  const canGoPrev = useMemo(() => {
    const todayDate = new Date();
    return (
      year > todayDate.getFullYear() ||
      (year === todayDate.getFullYear() && month > todayDate.getMonth())
    );
  }, [year, month]);

  return (
    <div>
      {/* Month header */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onPrevMonth}
          disabled={!canGoPrev}
          className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h3 className="text-sm font-semibold text-gray-900">
          {MONTH_NAMES[month]} {year}
        </h3>
        <button
          onClick={onNextMonth}
          className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="mb-1 grid grid-cols-7 text-center text-xs font-medium text-gray-500">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell, idx) => {
          const isAvailable = cell.inMonth && availableDates.has(cell.date);
          const isSelected = cell.date === selectedDate;
          const isPast = cell.date < today;
          const slotId = dateToSlotId.get(cell.date);

          return (
            <button
              key={idx}
              disabled={!isAvailable || isPast}
              onClick={() => isAvailable && onSelectDate(cell.date)}
              data-testid={slotId ? `date-slot-${slotId}` : undefined}
              className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-full text-sm transition-colors ${
                !cell.inMonth
                  ? 'text-gray-300'
                  : isSelected
                    ? 'font-semibold text-white'
                    : isAvailable && !isPast
                      ? 'font-medium text-gray-900 hover:bg-gray-100'
                      : 'text-gray-300'
              }`}
              style={
                isSelected
                  ? { backgroundColor: primaryColor }
                  : isAvailable && !isPast && !isSelected
                    ? { backgroundColor: `${primaryColor}15` }
                    : undefined
              }
            >
              {cell.day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
