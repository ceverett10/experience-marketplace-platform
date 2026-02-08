'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SiteConfig } from '@/lib/tenant';
import { QuestionsForm, type GuestData } from './QuestionsForm';
import { StripePaymentForm } from './StripePaymentForm';
import {
  getBookingQuestions,
  answerBookingQuestions,
  commitBooking,
  formatDate,
  type Booking,
  type BookingQuestion,
  type BookingAvailability,
} from '@/lib/booking-flow';
import { trackBeginCheckout, trackAddPaymentInfo, trackPurchase } from '@/lib/analytics';

interface CheckoutClientProps {
  booking: Booking;
  site: SiteConfig;
}

export function CheckoutClient({ booking: initialBooking, site }: CheckoutClientProps) {
  const router = useRouter();
  const primaryColor = site.brand?.primaryColor ?? '#0d9488';

  // State
  const [booking, setBooking] = useState<Booking>(initialBooking);
  const [bookingQuestions, setBookingQuestions] = useState<BookingQuestion[]>([]);
  const [availabilities, setAvailabilities] = useState<BookingAvailability[]>([]);
  const [canCommit, setCanCommit] = useState(false);
  const [questionsAnswered, setQuestionsAnswered] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paymentSectionRef = useRef<HTMLDivElement>(null);

  // Track begin_checkout on mount
  useEffect(() => {
    trackBeginCheckout({
      id: initialBooking.id,
      value: initialBooking.totalPrice?.gross,
      currency: initialBooking.totalPrice?.currency ?? 'GBP',
    });
  }, [initialBooking.id, initialBooking.totalPrice]);

  // Fetch booking questions on mount
  useEffect(() => {
    const loadQuestions = async () => {
      try {
        const result = await getBookingQuestions(initialBooking.id);
        setBooking(result.booking);
        setBookingQuestions(result.summary.bookingQuestions);
        setAvailabilities(result.booking.availabilityList?.nodes ?? []);
        setCanCommit(result.summary.canCommit);
        // Don't auto-skip form - user should always enter Lead Person Details first
        // setQuestionsAnswered(result.summary.canCommit);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load booking details');
      } finally {
        setIsLoading(false);
      }
    };

    loadQuestions();
  }, [initialBooking.id]);

  // Handle questions form submission
  const handleQuestionsSubmit = async (data: GuestData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await answerBookingQuestions(initialBooking.id, data);
      setBooking(result.booking);
      setCanCommit(result.canCommit);

      // Only proceed to review if canCommit is true
      if (result.canCommit) {
        setQuestionsAnswered(true);
      } else {
        setError('Please complete all required information');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guest information');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle proceed to payment
  const handleProceedToPayment = () => {
    if (!canCommit) return;
    setShowPayment(true);
    setError(null);
    trackAddPaymentInfo({
      id: initialBooking.id,
      value: booking.totalPrice?.gross,
      currency: booking.totalPrice?.currency ?? 'GBP',
    });
  };

  // Auto-scroll to payment section when it becomes visible
  useEffect(() => {
    if (showPayment && paymentSectionRef.current) {
      // Small delay to let Stripe Elements render
      setTimeout(() => {
        paymentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [showPayment]);

  // Handle payment success - now commit the booking
  const handlePaymentSuccess = async () => {
    setPaymentComplete(true);
    setIsCommitting(true);
    setError(null);

    const firstAvail = booking.availabilityList?.nodes?.[0];
    trackPurchase({
      id: initialBooking.id,
      value: booking.totalPrice?.gross,
      currency: booking.totalPrice?.currency ?? 'GBP',
      itemName: firstAvail?.product?.name,
    });

    try {
      // Pass productId for booking analytics (urgency messaging)
      const productId = firstAvail?.product?.id;
      const result = await commitBooking(initialBooking.id, true, productId);

      if (result.isConfirmed) {
        router.push(`/booking/confirmation/${initialBooking.id}`);
      } else {
        // Booking is pending - still redirect to confirmation
        router.push(`/booking/confirmation/${initialBooking.id}?pending=true`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete booking');
      setIsCommitting(false);
    }
  };

  // Handle payment error
  const handlePaymentError = (errorMessage: string) => {
    console.error('[Checkout] Payment error:', errorMessage);
    setError(errorMessage);
    setShowPayment(false);
  };

  // Get first availability for display
  const firstAvailability = availabilities[0];
  const totalGuests = availabilities.reduce(
    (sum, avail) => sum + (avail.personList?.nodes.length ?? 0),
    0
  );

  // Loading state
  if (isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 py-8">
        <div className="mx-auto max-w-4xl px-4">
          <div className="flex items-center justify-center py-20">
            <svg className="h-8 w-8 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
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
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8">
      <div className="mx-auto max-w-4xl px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/experiences"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth="2"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
              />
            </svg>
            Back to experiences
          </Link>
          <h1 className="mt-4 text-3xl font-bold text-gray-900">Complete Your Booking</h1>
          <p className="mt-2 text-gray-600">
            {questionsAnswered
              ? showPayment
                ? 'Complete your payment to confirm'
                : 'Review and confirm your booking'
              : 'Fill in your details to complete your booking'}
          </p>

          {/* Progress Steps */}
          <div className="mt-6 flex items-center gap-0">
            {[
              { label: 'Guest Details', step: 1 },
              { label: 'Review', step: 2 },
              { label: 'Payment', step: 3 },
            ].map((item, idx) => {
              const currentStep = showPayment ? 3 : questionsAnswered ? 2 : 1;
              const isActive = item.step === currentStep;
              const isCompleted = item.step < currentStep;
              return (
                <div key={item.step} className="flex flex-1 items-center">
                  <div className="flex flex-1 flex-col items-center">
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : isActive
                              ? 'text-white'
                              : 'bg-gray-200 text-gray-500'
                        }`}
                        style={isActive ? { backgroundColor: primaryColor } : {}}
                      >
                        {isCompleted ? (
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="3"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        ) : (
                          item.step
                        )}
                      </div>
                    </div>
                    <span
                      className={`mt-1 text-xs font-medium ${isActive ? 'text-gray-900' : 'text-gray-500'}`}
                    >
                      {item.label}
                    </span>
                  </div>
                  {idx < 2 && (
                    <div
                      className={`mb-5 h-0.5 flex-1 ${item.step < currentStep ? 'bg-green-500' : 'bg-gray-200'}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Error Message */}
            {error && (
              <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
            )}

            {/* Questions Form (if not completed) */}
            {!questionsAnswered && (
              <QuestionsForm
                bookingId={initialBooking.id}
                bookingQuestions={bookingQuestions}
                availabilities={availabilities}
                onSubmit={handleQuestionsSubmit}
                isSubmitting={isSubmitting}
                primaryColor={primaryColor}
                totalPrice={booking.totalPrice?.grossFormattedText}
              />
            )}

            {/* Review Section (if questions completed) */}
            {questionsAnswered && (
              <div className="space-y-6">
                {/* Booking Details */}
                <div className="rounded-xl bg-white p-6 shadow-lg">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">Booking Details</h2>

                  {firstAvailability && (
                    <div className="space-y-4">
                      {/* Experience */}
                      <div className="rounded-lg bg-gray-50 p-4">
                        <h3 className="font-medium text-gray-900">
                          {firstAvailability.product?.name ?? 'Experience'}
                        </h3>
                        <div className="mt-2 space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <svg
                              className="h-4 w-4"
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
                            {formatDate(firstAvailability.date)}
                          </div>
                          {firstAvailability.startTime && (
                            <div className="flex items-center gap-2">
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="1.5"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              {firstAvailability.startTime}
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="1.5"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                              />
                            </svg>
                            {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'} booked
                          </div>
                        </div>
                      </div>

                      {/* Guests */}
                      <div>
                        <h3 className="mb-3 font-medium text-gray-900">Guests</h3>
                        <div className="space-y-2">
                          {availabilities.flatMap(
                            (avail) =>
                              avail.personList?.nodes.map((person, index) => (
                                <div
                                  key={person.id}
                                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
                                >
                                  <div>
                                    <span className="font-medium text-gray-900">
                                      Guest {index + 1}
                                      {index === 0 && (
                                        <span className="ml-2 text-xs text-gray-500">
                                          (Lead guest)
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <span className="text-sm text-gray-500">
                                    {person.pricingCategoryLabel}
                                  </span>
                                </div>
                              )) ?? []
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Cancellation Policy */}
                <div className="rounded-xl bg-white p-6 shadow-lg">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">Cancellation Policy</h2>
                  <div className="flex items-start gap-3 text-sm text-gray-600">
                    <svg
                      className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-900">
                        Free cancellation up to 24 hours in advance
                      </p>
                      <p className="mt-1">
                        Cancel for free before the experience starts. After that, no refunds will be
                        given.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payment Section */}
                {showPayment ? (
                  <div ref={paymentSectionRef} className="rounded-xl bg-white p-6 shadow-lg">
                    <h2 className="mb-4 text-lg font-semibold text-gray-900">Payment</h2>
                    {paymentComplete ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="text-center">
                          <svg
                            className="mx-auto h-12 w-12 text-green-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="2"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p className="mt-2 font-medium text-gray-900">Payment successful!</p>
                          <p className="text-sm text-gray-500">Confirming your booking...</p>
                        </div>
                      </div>
                    ) : (
                      <StripePaymentForm
                        bookingId={initialBooking.id}
                        onSuccess={handlePaymentSuccess}
                        onError={handlePaymentError}
                        primaryColor={primaryColor}
                        totalPrice={booking.totalPrice?.grossFormattedText}
                      />
                    )}
                  </div>
                ) : (
                  <>
                    {/* Edit Button */}
                    <button
                      onClick={() => setQuestionsAnswered(false)}
                      className="text-sm font-medium hover:underline"
                      style={{ color: primaryColor }}
                    >
                      Edit guest information
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Order Summary */}
          <div>
            <div className="sticky top-8 rounded-xl bg-white p-6 shadow-lg">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Order Summary</h2>

              {/* Experience Image */}
              {firstAvailability?.product?.imageList?.nodes?.[0]?.url && (
                <div className="mb-4 overflow-hidden rounded-lg">
                  <img
                    src={firstAvailability.product.imageList.nodes[0].url}
                    alt={firstAvailability.product.name}
                    className="h-32 w-full object-cover"
                  />
                </div>
              )}

              {/* Experience Name */}
              <h3 className="mb-4 line-clamp-2 font-medium text-gray-900">
                {firstAvailability?.product?.name ?? 'Experience'}
              </h3>

              {/* Price Breakdown */}
              <div className="space-y-3 text-sm">
                {availabilities.map((avail) => {
                  const guestCount = avail.personList?.nodes.length ?? 0;
                  return (
                    <div key={avail.id}>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600">
                          {guestCount} {guestCount === 1 ? 'guest' : 'guests'} &times;{' '}
                          {formatDate(avail.date).split(',')[0]}
                        </span>
                        <span className="font-medium text-gray-900">
                          {avail.totalPrice?.grossFormattedText ?? '-'}
                        </span>
                      </div>
                      {/* Per-person breakdown */}
                      {avail.personList?.nodes && avail.personList.nodes.length > 0 && (
                        <div className="mt-1 space-y-0.5 pl-2">
                          {avail.personList.nodes.map((person, pIdx) => (
                            <div key={person.id} className="text-xs text-gray-400">
                              <span>{person.pricingCategoryLabel ?? `Guest ${pIdx + 1}`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="border-t border-gray-200 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-900">Total</span>
                    <span className="text-lg font-bold" style={{ color: primaryColor }}>
                      {booking.totalPrice?.grossFormattedText ?? '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Proceed to Payment Button (only show when questions answered and not in payment mode) */}
              {questionsAnswered && canCommit && !showPayment && (
                <>
                  <button
                    onClick={handleProceedToPayment}
                    className="mt-6 w-full rounded-xl py-4 text-base font-semibold text-white transition-all hover:shadow-lg"
                    style={{ backgroundColor: primaryColor }}
                  >
                    Proceed to Payment
                  </button>

                  <p className="mt-3 text-center text-xs text-gray-500">
                    You&apos;ll complete your payment on the next step.
                  </p>
                </>
              )}

              {/* Confirming indicator */}
              {isCommitting && (
                <div className="mt-6 flex items-center justify-center gap-2 text-gray-600">
                  <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
                  <span>Confirming your booking...</span>
                </div>
              )}

              {/* Trust badges */}
              <div className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-500">
                <div className="flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
                    />
                  </svg>
                  Secure booking
                </div>
                <div className="flex items-center gap-1">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Instant confirmation
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
