'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SiteConfig } from '@/lib/tenant';

interface BookingItem {
  availabilityId: string;
  productId: string;
  productName: string;
  date: string;
  startTime?: string;
  guests: {
    guestTypeId: string;
    firstName: string;
    lastName: string;
  }[];
  unitPrice: number;
  totalPrice: number;
  currency: string;
}

interface Booking {
  id: string;
  status?: string;
  items?: BookingItem[];
  subtotal?: number;
  fees?: number;
  taxes?: number;
  total?: number;
  currency?: string;
  customerEmail?: string;
  customerPhone?: string;
  createdAt?: string;
}

interface CheckoutClientProps {
  booking: Booking;
  site: SiteConfig;
}

export function CheckoutClient({ booking, site }: CheckoutClientProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format price
  const formatPrice = (amount: number, currency: string): string => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
    }).format(amount / 100);
  };

  // Format date
  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Commit booking and proceed to payment
  const handleProceedToPayment = async () => {
    setIsProcessing(true);
    setError(null);

    try {
      // First commit the booking
      const commitResponse = await fetch('/api/booking/commit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookingId: booking.id }),
      });

      if (!commitResponse.ok) {
        const data = await commitResponse.json();
        throw new Error(data.error ?? 'Failed to commit booking');
      }

      // Create Stripe checkout session
      const paymentResponse = await fetch('/api/payment/create-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookingId: booking.id }),
      });

      if (!paymentResponse.ok) {
        const data = await paymentResponse.json();
        throw new Error(data.error ?? 'Failed to create payment session');
      }

      const { url } = await paymentResponse.json();

      // Redirect to Stripe checkout
      if (url) {
        window.location.href = url;
      } else {
        throw new Error('No payment URL returned');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err instanceof Error ? err.message : 'Payment failed');
      setIsProcessing(false);
    }
  };

  const item = booking.items?.[0];
  const totalGuests = item?.guests.length ?? 0;
  const bookingCurrency = booking.currency ?? 'GBP';

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-4xl px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to experiences
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">Complete Your Booking</h1>
          <p className="mt-2 text-gray-600">Review your booking details and proceed to payment</p>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Booking Details */}
          <div className="lg:col-span-2">
            <div className="rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Booking Details</h2>

              {item && (
                <div className="space-y-4">
                  {/* Experience */}
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h3 className="font-medium text-gray-900">{item.productName}</h3>
                    <div className="mt-2 space-y-1 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                        </svg>
                        {formatDate(item.date)}
                      </div>
                      {item.startTime && (
                        <div className="flex items-center gap-2">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {item.startTime}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                        </svg>
                        {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                      </div>
                    </div>
                  </div>

                  {/* Guests */}
                  <div>
                    <h3 className="mb-3 font-medium text-gray-900">Guests</h3>
                    <div className="space-y-2">
                      {item.guests.map((guest, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                        >
                          <div>
                            <span className="font-medium text-gray-900">
                              {guest.firstName} {guest.lastName}
                            </span>
                            {index === 0 && (
                              <span className="ml-2 text-xs text-gray-500">(Lead guest)</span>
                            )}
                          </div>
                          <span className="text-sm text-gray-500 capitalize">
                            {guest.guestTypeId}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Contact */}
                  <div>
                    <h3 className="mb-3 font-medium text-gray-900">Contact Information</h3>
                    <div className="rounded-lg border border-gray-200 p-3">
                      {booking.customerEmail && (
                        <div className="text-sm">
                          <div className="text-gray-600">Email</div>
                          <div className="font-medium text-gray-900">{booking.customerEmail}</div>
                        </div>
                      )}
                      {booking.customerPhone && (
                        <div className="mt-2 text-sm">
                          <div className="text-gray-600">Phone</div>
                          <div className="font-medium text-gray-900">{booking.customerPhone}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Cancellation Policy */}
            <div className="mt-6 rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Cancellation Policy</h2>
              <div className="flex items-start gap-3 text-sm text-gray-600">
                <svg className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-900">Free cancellation up to 24 hours in advance</p>
                  <p className="mt-1">
                    Cancel for free before the experience starts. After that, no refunds will be given.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div>
            <div className="sticky top-8 rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Order Summary</h2>

              {item && (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">
                      {formatPrice(item.unitPrice, item.currency)} × {totalGuests} guests
                    </span>
                    <span className="font-medium text-gray-900">
                      {formatPrice(item.totalPrice, item.currency)}
                    </span>
                  </div>

                  {booking.fees !== undefined && booking.fees > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Service fee</span>
                      <span className="font-medium text-gray-900">
                        {formatPrice(booking.fees, bookingCurrency)}
                      </span>
                    </div>
                  )}

                  {booking.taxes !== undefined && booking.taxes > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Taxes</span>
                      <span className="font-medium text-gray-900">
                        {formatPrice(booking.taxes, bookingCurrency)}
                      </span>
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-base font-semibold text-gray-900">Total</span>
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(booking.total ?? 0, bookingCurrency)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </div>
              )}

              {/* Payment Button */}
              <button
                onClick={handleProceedToPayment}
                disabled={isProcessing}
                className="mt-6 w-full rounded-lg py-3 text-base font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: site.brand?.primaryColor ?? '#6366f1' }}
              >
                {isProcessing ? (
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
                  'Pay Now'
                )}
              </button>

              {/* Trust badges */}
              <div className="mt-4 flex items-center justify-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Secure payment
                </div>
                <div className="flex items-center gap-1">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                  SSL encrypted
                </div>
              </div>

              {/* Powered by */}
              <p className="mt-4 text-center text-xs text-gray-400">
                Powered by{' '}
                <a
                  href="https://holibob.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-500 hover:text-gray-700"
                >
                  Holibob
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
