'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useBrand } from '@/lib/site-context';

export interface TimeSlot {
  id: string;
  time: string;
  price: number;
  currency: string;
  remainingCapacity?: number;
}

export interface AvailabilityOption {
  id: string;
  name: string;
  date: string;
  startTime?: string;
  price: number;
  currency: string;
  remainingCapacity?: number;
}

interface AvailabilityCalendarProps {
  productId: string;
  selectedDate: string | null;
  selectedTimeSlot: TimeSlot | null;
  onDateSelect: (date: string) => void;
  onTimeSlotSelect: (slot: TimeSlot | null) => void;
  adults?: number;
  children?: number;
}

export function AvailabilityCalendar({
  productId,
  selectedDate,
  selectedTimeSlot,
  onDateSelect,
  onTimeSlotSelect,
  adults = 2,
  children = 0,
}: AvailabilityCalendarProps) {
  const brand = useBrand();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availability, setAvailability] = useState<AvailabilityOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate month boundaries
  const monthStart = useMemo(() => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    return date;
  }, [currentMonth]);

  const monthEnd = useMemo(() => {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    return date;
  }, [currentMonth]);

  // Format date as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0] ?? '';
  };

  // Fetch availability for the current month
  const fetchAvailability = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const dateFrom = formatDate(monthStart);
      const dateTo = formatDate(monthEnd);

      const response = await fetch(
        `/api/availability?productId=${productId}&dateFrom=${dateFrom}&dateTo=${dateTo}&adults=${adults}&children=${children}`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch availability');
      }

      const data = await response.json();
      setAvailability(data.data?.options ?? []);
    } catch (err) {
      console.error('Error fetching availability:', err);
      setError('Unable to load availability. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [productId, monthStart, monthEnd, adults, children]);

  useEffect(() => {
    fetchAvailability();
  }, [fetchAvailability]);

  // Get available dates set for quick lookup
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    availability.forEach((opt) => {
      dates.add(opt.date);
    });
    return dates;
  }, [availability]);

  // Get time slots for selected date
  const timeSlotsForDate = useMemo(() => {
    if (!selectedDate) return [];
    return availability
      .filter((opt) => opt.date === selectedDate)
      .map((opt) => ({
        id: opt.id,
        time: opt.startTime ?? '00:00',
        price: opt.price,
        currency: opt.currency,
        remainingCapacity: opt.remainingCapacity,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [availability, selectedDate]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const days: (Date | null)[] = [];
    const firstDayOfWeek = monthStart.getDay();

    // Add empty cells for days before the month starts
    for (let i = 0; i < firstDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let day = 1; day <= monthEnd.getDate(); day++) {
      days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day));
    }

    return days;
  }, [monthStart, monthEnd, currentMonth]);

  // Navigate months
  const goToPreviousMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Don't allow navigating to past months
    if (newMonth >= new Date(today.getFullYear(), today.getMonth(), 1)) {
      setCurrentMonth(newMonth);
    }
  };

  const goToNextMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    const maxMonth = new Date();
    maxMonth.setMonth(maxMonth.getMonth() + 12);

    // Don't allow navigating more than 12 months ahead
    if (newMonth <= maxMonth) {
      setCurrentMonth(newMonth);
    }
  };

  // Check if a date is in the past
  const isPastDate = (date: Date): boolean => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Handle date selection
  const handleDateClick = (date: Date) => {
    const dateStr = formatDate(date);
    if (availableDates.has(dateStr) && !isPastDate(date)) {
      onDateSelect(dateStr);
      onTimeSlotSelect(null); // Reset time slot when date changes
    }
  };

  // Format price
  const formatPrice = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  // Week day headers
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={goToPreviousMonth}
          className="rounded-lg p-2 hover:bg-gray-100 disabled:opacity-50"
          disabled={currentMonth <= new Date(new Date().getFullYear(), new Date().getMonth(), 1)}
          aria-label="Previous month"
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
        <h3 className="text-lg font-semibold text-gray-900">
          {currentMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
        </h3>
        <button
          onClick={goToNextMonth}
          className="rounded-lg p-2 hover:bg-gray-100"
          aria-label="Next month"
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

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <svg className="h-6 w-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
      )}

      {/* Error State */}
      {error && !isLoading && (
        <div className="rounded-lg bg-red-50 p-4 text-center text-sm text-red-600">
          {error}
          <button onClick={fetchAvailability} className="ml-2 underline hover:no-underline">
            Retry
          </button>
        </div>
      )}

      {/* Calendar Grid */}
      {!isLoading && !error && (
        <>
          {/* Week days header */}
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => (
              <div key={day} className="py-2 text-center text-xs font-medium text-gray-500">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar days */}
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((date, index) => {
              if (!date) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }

              const dateStr = formatDate(date);
              const isAvailable = availableDates.has(dateStr);
              const isPast = isPastDate(date);
              const isSelected = selectedDate === dateStr;

              return (
                <button
                  key={dateStr}
                  onClick={() => handleDateClick(date)}
                  disabled={!isAvailable || isPast}
                  className={`
                    aspect-square rounded-lg text-sm font-medium transition-colors
                    ${isPast ? 'cursor-not-allowed text-gray-300' : ''}
                    ${!isPast && !isAvailable ? 'cursor-not-allowed text-gray-400' : ''}
                    ${!isPast && isAvailable && !isSelected ? 'cursor-pointer text-gray-900 hover:bg-gray-100' : ''}
                    ${isSelected ? 'text-white' : ''}
                  `}
                  style={
                    isSelected ? { backgroundColor: brand?.primaryColor ?? '#6366f1' } : undefined
                  }
                  aria-label={`${date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${isAvailable ? ' - Available' : ' - Not available'}`}
                >
                  {date.getDate()}
                  {isAvailable && !isPast && (
                    <span
                      className="mx-auto mt-0.5 block h-1 w-1 rounded-full"
                      style={{
                        backgroundColor: isSelected ? 'white' : (brand?.primaryColor ?? '#6366f1'),
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Time Slots */}
          {selectedDate && timeSlotsForDate.length > 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <h4 className="mb-3 text-sm font-medium text-gray-700">Available times</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {timeSlotsForDate.map((slot) => {
                  const isSlotSelected = selectedTimeSlot?.id === slot.id;

                  return (
                    <button
                      key={slot.id}
                      onClick={() => onTimeSlotSelect(isSlotSelected ? null : slot)}
                      className={`
                        rounded-lg border px-3 py-2 text-sm transition-colors
                        ${
                          isSlotSelected
                            ? 'border-transparent text-white'
                            : 'border-gray-200 text-gray-900 hover:border-gray-300'
                        }
                      `}
                      style={
                        isSlotSelected
                          ? { backgroundColor: brand?.primaryColor ?? '#6366f1' }
                          : undefined
                      }
                    >
                      <div className="font-medium">{slot.time}</div>
                      <div
                        className={`text-xs ${isSlotSelected ? 'text-white/80' : 'text-gray-500'}`}
                      >
                        {formatPrice(slot.price, slot.currency)}
                      </div>
                      {slot.remainingCapacity !== undefined && slot.remainingCapacity <= 5 && (
                        <div
                          className={`text-xs ${isSlotSelected ? 'text-white/80' : 'text-orange-600'}`}
                        >
                          {slot.remainingCapacity} left
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* No availability message */}
          {selectedDate && timeSlotsForDate.length === 0 && (
            <div className="mt-4 border-t border-gray-200 pt-4">
              <p className="text-center text-sm text-gray-500">
                No time slots available for this date
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
