'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { SiteConfig } from '@/lib/tenant';
import { QuestionsForm, type GuestData } from './QuestionsForm';
import { StripePaymentForm } from './StripePaymentForm';
import {
  getBooking,
  getBookingQuestions,
  answerBookingQuestions,
  commitBooking,
  formatDate,
  type Booking,
  type BookingQuestion,
  type BookingAvailability,
} from '@/lib/booking-flow';
import {
  trackBeginCheckout,
  trackAddPaymentInfo,
  trackPurchase,
  trackGoogleAdsConversion,
} from '@/lib/analytics';
import { trackMetaPurchase } from '@/components/analytics/MetaPixel';
import {
  getProductPricingConfig,
  calculatePromoPrice,
  DEFAULT_PRICING_CONFIG,
} from '@/lib/pricing';
import { MobileOrderSummary } from '@/components/checkout/MobileOrderSummary';

interface CheckoutClientProps {
  bookingId: string;
  site: SiteConfig;
}

export function CheckoutClient({ bookingId, site }: CheckoutClientProps) {
  const router = useRouter();
  const primaryColor = site.brand?.primaryColor ?? '#0d9488';

  // State
  const [booking, setBooking] = useState<Booking | null>(null);
  const [bookingQuestions, setBookingQuestions] = useState<BookingQuestion[]>([]);
  const [availabilities, setAvailabilities] = useState<BookingAvailability[]>([]);
  const [canCommit, setCanCommit] = useState(false);
  const [questionsAnswered, setQuestionsAnswered] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentComplete, setPaymentComplete] = useState(false);
  const [submitAttempts, setSubmitAttempts] = useState(0);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingNotFound, setBookingNotFound] = useState(false);
  const paymentSectionRef = useRef<HTMLDivElement>(null);
  const reviewSectionRef = useRef<HTMLDivElement>(null);

  // Fetch booking and questions on mount (client-side for E2E testability)
  useEffect(() => {
    const loadBooking = async () => {
      try {
        // Fetch booking data via /api/booking route (interceptable by Playwright)
        const bookingData = await getBooking(bookingId);

        // Handle booking status
        if (bookingData.status === 'CONFIRMED' || bookingData.status === 'COMPLETED') {
          router.replace(`/booking/confirmation/${bookingId}`);
          return;
        }
        if (bookingData.status === 'CANCELLED') {
          setBooking(bookingData);
          setIsLoading(false);
          return;
        }

        setBooking(bookingData);

        // Track begin_checkout
        trackBeginCheckout({
          id: bookingData.id,
          value: bookingData.totalPrice?.gross,
          currency: bookingData.totalPrice?.currency ?? 'GBP',
        });

        // Fetch questions
        const result = await getBookingQuestions(bookingId);
        setBooking(result.booking);
        setBookingQuestions(result.summary.bookingQuestions);
        setAvailabilities(result.booking.availabilityList?.nodes ?? []);
        setCanCommit(result.summary.canCommit);
      } catch (err) {
        console.error('Error loading booking:', err);
        setBookingNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };

    loadBooking();
  }, [bookingId, router]);

  // Handle questions form submission with iterative re-fetch for conditional questions
  const handleQuestionsSubmit = async (data: GuestData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await answerBookingQuestions(bookingId, data);
      setBooking(result.booking);
      setCanCommit(result.canCommit);

      if (result.canCommit) {
        setQuestionsAnswered(true);
      } else {
        // Re-fetch questions to discover newly revealed conditional questions
        const refreshed = await getBookingQuestions(bookingId);
        setBooking(refreshed.booking);
        setBookingQuestions(refreshed.summary.bookingQuestions);
        setAvailabilities(refreshed.booking.availabilityList?.nodes ?? []);
        setCanCommit(refreshed.summary.canCommit);

        if (refreshed.summary.canCommit) {
          setQuestionsAnswered(true);
        } else {
          // Count remaining unanswered required questions
          let unanswered = 0;
          unanswered += refreshed.summary.bookingQuestions.filter((q) => !q.answerValue).length;
          for (const avail of refreshed.summary.availabilityQuestions) {
            unanswered += avail.questions.filter((q) => !q.answerValue).length;
            for (const person of avail.personQuestions) {
              if (!person.isComplete) {
                unanswered += person.questions.filter((q) => !q.answerValue).length;
              }
            }
          }

          setSubmitAttempts((prev) => prev + 1);
          setError(
            unanswered > 0
              ? `There ${unanswered === 1 ? 'is' : 'are'} ${unanswered} additional question${unanswered === 1 ? '' : 's'} that require${unanswered === 1 ? 's' : ''} your attention. Please complete all fields below.`
              : 'Please complete all required information to continue.'
          );
          // Scroll to error banner
          setTimeout(() => {
            const errorBanner = document.querySelector('[data-testid="checkout-error"]');
            errorBanner?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 50);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guest information');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle proceed to payment
  const handleProceedToPayment = () => {
    if (!canCommit || !booking) return;
    setShowPayment(true);
    setError(null);
    trackAddPaymentInfo({
      id: bookingId,
      value: booking.totalPrice?.gross,
      currency: booking.totalPrice?.currency ?? 'GBP',
    });
  };

  // Auto-scroll to review section when guest details are completed
  useEffect(() => {
    if (questionsAnswered && reviewSectionRef.current) {
      setTimeout(() => {
        reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [questionsAnswered]);

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
    if (!booking) return;
    setPaymentComplete(true);
    setIsCommitting(true);
    setError(null);

    const firstAvail = booking.availabilityList?.nodes?.[0];
    const purchaseData = {
      id: bookingId,
      value: booking.totalPrice?.gross,
      currency: booking.totalPrice?.currency ?? 'GBP',
    };

    // GA4 purchase event
    trackPurchase({ ...purchaseData, itemName: firstAvail?.product?.name });

    // Meta Pixel purchase (client-side dedup with server CAPI via event_id = bookingId)
    trackMetaPurchase(purchaseData);

    // Google Ads conversion (if conversion action configured in seoConfig)
    const conversionAction = site.seoConfig?.googleAdsConversionAction;
    if (conversionAction) {
      trackGoogleAdsConversion(conversionAction, purchaseData);
    }

    try {
      // Pass productId for booking analytics (urgency messaging)
      const productId = firstAvail?.product?.id;
      const result = await commitBooking(bookingId, true, productId);

      if (result.isConfirmed) {
        router.push(`/booking/confirmation/${bookingId}`);
      } else {
        // Booking is pending - still redirect to confirmation
        router.push(`/booking/confirmation/${bookingId}?pending=true`);
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
          <div className="flex items-center justify-center py-20" data-testid="checkout-loading">
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

  // Booking not found
  if (bookingNotFound || !booking) {
    return (
      <main className="min-h-screen bg-gray-50 py-12">
        <div className="mx-auto max-w-2xl px-4">
          <div className="rounded-xl bg-white p-8 text-center shadow-lg">
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Booking Not Found</h1>
            <p className="mb-6 text-gray-600">
              We couldn&apos;t find this booking. It may have expired or been removed.
            </p>
            <a
              href="/experiences"
              className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-semibold text-white hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              Browse Experiences
            </a>
          </div>
        </div>
      </main>
    );
  }

  // Booking cancelled
  if (booking.status === 'CANCELLED') {
    return (
      <main className="min-h-screen bg-gray-50 py-12">
        <div className="mx-auto max-w-2xl px-4">
          <div className="rounded-xl bg-white p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-8 w-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth="2"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="mb-2 text-2xl font-bold text-gray-900">Booking Cancelled</h1>
            <p className="mb-6 text-gray-600">
              This booking has been cancelled and is no longer available.
            </p>
            <a
              href="/experiences"
              className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-6 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Browse Experiences
            </a>
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
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold sm:h-8 sm:w-8 ${
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
                      className={`mt-1 hidden text-xs font-medium sm:inline ${isActive ? 'text-gray-900' : 'text-gray-500'}`}
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

        {/* Mobile Order Summary - sticky bar visible only on mobile */}
        <MobileOrderSummary
          experienceName={firstAvailability?.product?.name ?? 'Experience'}
          date={firstAvailability ? formatDate(firstAvailability.date) : undefined}
          totalPrice={booking.totalPrice?.grossFormattedText}
          guestCount={totalGuests}
          imageUrl={firstAvailability?.product?.imageList?.nodes?.[0]?.url}
          primaryColor={primaryColor}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Error Message */}
            {error && (
              <div
                className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600"
                data-testid="checkout-error"
              >
                {error}
              </div>
            )}

            {/* Questions Form (if not completed) */}
            {!questionsAnswered && (
              <div data-testid="checkout-questions-step">
                <QuestionsForm
                  bookingId={bookingId}
                  bookingQuestions={bookingQuestions}
                  availabilities={availabilities}
                  onSubmit={handleQuestionsSubmit}
                  isSubmitting={isSubmitting}
                  primaryColor={primaryColor}
                  totalPrice={booking.totalPrice?.grossFormattedText}
                  isResubmission={submitAttempts > 0}
                  siteName={site.name}
                />
              </div>
            )}

            {/* Review Section (if questions completed) */}
            {questionsAnswered && (
              <div ref={reviewSectionRef} className="space-y-6" data-testid="checkout-review-step">
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
                        Free cancellation based on experience terms
                      </p>
                      <p className="mt-1">
                        Cancellation is subject to the terms of the experience you are booking.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Payment Section */}
                {showPayment ? (
                  <div
                    ref={paymentSectionRef}
                    className="rounded-xl bg-white p-6 shadow-lg"
                    data-testid="checkout-payment-step"
                  >
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
                        bookingId={bookingId}
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

          {/* Order Summary - hidden on mobile (shown via MobileOrderSummary instead) */}
          <div className="hidden lg:block">
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
                  {/* Promotional savings display - uses per-product pricing config */}
                  {booking.totalPrice?.gross &&
                    booking.totalPrice.gross > 0 &&
                    (() => {
                      const productId = firstAvailability?.product?.id;
                      const pricingConfig = productId
                        ? getProductPricingConfig(productId)
                        : DEFAULT_PRICING_CONFIG;
                      const promo = calculatePromoPrice(
                        booking.totalPrice!.grossFormattedText ?? '',
                        booking.totalPrice!.gross,
                        booking.totalPrice!.currency ?? 'GBP',
                        pricingConfig
                      );
                      return promo.hasPromo ? (
                        <div className="mb-2 space-y-1">
                          <div className="flex items-center justify-between text-sm text-gray-500">
                            <span>Subtotal</span>
                            <span className="line-through">{promo.originalFormatted}</span>
                          </div>
                          <div className="flex items-center justify-between text-sm font-medium text-emerald-600">
                            <span>Discount ({pricingConfig.markupPercentage}% off)</span>
                            <span>-{promo.savingsFormatted}</span>
                          </div>
                        </div>
                      ) : null;
                    })()}
                  <div className="flex items-center justify-between">
                    <span className="text-base font-semibold text-gray-900">You pay</span>
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
                    data-testid="proceed-to-payment"
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
              <div className="mt-6 space-y-2">
                <div className="flex flex-col items-center gap-2 text-xs text-gray-500 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-3">
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4 text-emerald-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Secure booking
                  </div>
                  <div className="flex items-center gap-1">
                    <svg
                      className="h-4 w-4 text-emerald-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Instant confirmation
                  </div>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="1.5"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                    />
                  </svg>
                  Secured by Stripe
                </div>
              </div>

              {/* Bank statement notice */}
              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-center">
                <p className="text-xs text-gray-500">
                  Charges will appear as{' '}
                  <span className="font-semibold">&quot;HOLIBOB LTD UK&quot;</span> on your bank
                  statement
                </p>
              </div>

              {/* Powered by */}
              <p className="mt-3 text-center text-xs text-gray-400">
                Powered by{' '}
                <a href="https://experiencess.com" className="text-gray-500 hover:text-gray-700">
                  Experiencess.com
                </a>{' '}
                &middot;{' '}
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
