'use client';

import { useState } from 'react';
import { useBrand } from '@/lib/site-context';
import type { Experience } from '@/lib/holibob';

interface BookingWidgetProps {
  experience: Experience;
}

export function BookingWidget({ experience }: BookingWidgetProps) {
  const brand = useBrand();
  const [selectedDate, setSelectedDate] = useState('');
  const [guests, setGuests] = useState(2);
  const [isLoading, setIsLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];
  const maxDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const totalPrice = experience.price.amount * guests;
  const formattedTotal = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: experience.price.currency,
  }).format(totalPrice / 100);

  const handleBooking = async () => {
    if (!selectedDate) {
      alert('Please select a date');
      return;
    }

    setIsLoading(true);

    // In production, this would:
    // 1. Check availability
    // 2. Create a booking via Holibob API
    // 3. Redirect to checkout

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Would redirect to checkout
      alert('Booking functionality coming soon! This would redirect to checkout.');
    } catch (error) {
      console.error('Booking error:', error);
      alert('There was an error processing your booking. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-lg">
      {/* Price */}
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">
          {experience.price.formatted}
        </span>
        <span className="text-gray-500">per person</span>
      </div>

      {/* Rating */}
      {experience.rating && (
        <div className="mt-2 flex items-center gap-1">
          <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
          <span className="text-sm font-medium">{experience.rating.average.toFixed(1)}</span>
          <span className="text-sm text-gray-500">({experience.rating.count} reviews)</span>
        </div>
      )}

      <div className="mt-6 space-y-4">
        {/* Date Selection */}
        <div>
          <label htmlFor="booking-date" className="block text-sm font-medium text-gray-700">
            Select date
          </label>
          <input
            type="date"
            id="booking-date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            min={today}
            max={maxDate}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2"
            style={{ '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties}
          />
        </div>

        {/* Guests Selection */}
        <div>
          <label htmlFor="booking-guests" className="block text-sm font-medium text-gray-700">
            Number of guests
          </label>
          <div className="mt-1 flex items-center rounded-lg border border-gray-300">
            <button
              type="button"
              onClick={() => setGuests((g) => Math.max(1, g - 1))}
              className="flex h-12 w-12 items-center justify-center text-gray-600 hover:bg-gray-50"
              disabled={guests <= 1}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
              </svg>
            </button>
            <span className="flex-1 text-center text-sm font-medium">
              {guests} {guests === 1 ? 'guest' : 'guests'}
            </span>
            <button
              type="button"
              onClick={() => setGuests((g) => Math.min(20, g + 1))}
              className="flex h-12 w-12 items-center justify-center text-gray-600 hover:bg-gray-50"
              disabled={guests >= 20}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
        </div>

        {/* Price Breakdown */}
        <div className="rounded-lg bg-gray-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {experience.price.formatted} × {guests} guests
            </span>
            <span className="font-medium text-gray-900">{formattedTotal}</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="text-lg font-bold text-gray-900">{formattedTotal}</span>
          </div>
        </div>

        {/* Book Button */}
        <button
          onClick={handleBooking}
          disabled={isLoading}
          className="w-full rounded-lg py-4 text-base font-semibold text-white transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50"
          style={{
            backgroundColor: brand?.primaryColor ?? '#6366f1',
            '--tw-ring-color': brand?.primaryColor ?? '#6366f1',
          } as React.CSSProperties}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing...
            </span>
          ) : (
            'Check Availability'
          )}
        </button>

        {/* Guarantee */}
        <p className="text-center text-xs text-gray-500">
          Free cancellation up to 24 hours in advance
        </p>
      </div>

      {/* Trust Badges */}
      <div className="mt-6 flex items-center justify-center gap-4 border-t border-gray-100 pt-6">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
          </svg>
          Secure booking
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Instant confirmation
        </div>
      </div>
    </div>
  );
}
