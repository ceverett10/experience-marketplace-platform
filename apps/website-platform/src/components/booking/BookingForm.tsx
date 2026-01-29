'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useBrand } from '@/lib/site-context';
import type { Experience } from '@/lib/holibob';
import { AvailabilityCalendar, type TimeSlot } from './AvailabilityCalendar';
import {
  GuestSelector,
  GuestDetailsForm,
  type GuestCount,
  type GuestDetails,
} from './GuestSelector';

interface BookingFormProps {
  experience: Experience;
  onBookingCreated?: (bookingId: string) => void;
}

type BookingStep = 'date' | 'guests' | 'details' | 'review';

export function BookingForm({ experience, onBookingCreated }: BookingFormProps) {
  const router = useRouter();
  const brand = useBrand();

  // Form state
  const [currentStep, setCurrentStep] = useState<BookingStep>('date');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<TimeSlot | null>(null);
  const [guestCounts, setGuestCounts] = useState<GuestCount[]>([
    { typeId: 'adult', count: 2 },
    { typeId: 'child', count: 0 },
    { typeId: 'infant', count: 0 },
  ]);
  const [guestDetails, setGuestDetails] = useState<GuestDetails[]>([]);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate totals
  const totalGuests = guestCounts.reduce((sum, gc) => sum + gc.count, 0);
  const adults = guestCounts.find((gc) => gc.typeId === 'adult')?.count ?? 0;
  const children = guestCounts.find((gc) => gc.typeId === 'child')?.count ?? 0;

  // Calculate price
  const totalPrice = useMemo(() => {
    if (selectedTimeSlot) {
      return selectedTimeSlot.price * totalGuests;
    }
    return experience.price.amount * totalGuests;
  }, [selectedTimeSlot, experience.price.amount, totalGuests]);

  const formattedTotalPrice = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: selectedTimeSlot?.currency ?? experience.price.currency,
  }).format(totalPrice / 100);

  // Update guest count
  const handleGuestCountChange = (typeId: string, count: number) => {
    setGuestCounts((prev) => prev.map((gc) => (gc.typeId === typeId ? { ...gc, count } : gc)));
  };

  // Step validation
  const canProceedFromDate = selectedDate !== null && selectedTimeSlot !== null;
  const canProceedFromGuests = totalGuests > 0 && adults > 0;
  const canProceedFromDetails = useMemo(() => {
    // Check that all guests have required fields filled
    const requiredGuestCount = totalGuests;
    if (guestDetails.length < requiredGuestCount) return false;

    return guestDetails.slice(0, requiredGuestCount).every((detail, index) => {
      const isLeadGuest = index === 0;
      if (!detail.firstName || !detail.lastName) return false;
      if (isLeadGuest && !detail.email) return false;
      return true;
    });
  }, [guestDetails, totalGuests]);

  // Handle step navigation
  const goToStep = (step: BookingStep) => {
    setError(null);
    setCurrentStep(step);
  };

  const handleNext = () => {
    setError(null);
    if (currentStep === 'date' && canProceedFromDate) {
      setCurrentStep('guests');
    } else if (currentStep === 'guests' && canProceedFromGuests) {
      // Initialize guest details if needed
      if (guestDetails.length < totalGuests) {
        const newDetails: GuestDetails[] = [];
        guestCounts.forEach((gc) => {
          for (let i = 0; i < gc.count; i++) {
            newDetails.push({
              guestTypeId: gc.typeId,
              firstName: '',
              lastName: '',
            });
          }
        });
        setGuestDetails(newDetails);
      }
      setCurrentStep('details');
    } else if (currentStep === 'details' && canProceedFromDetails) {
      // Set customer email from lead guest
      if (!customerEmail && guestDetails[0]?.email) {
        setCustomerEmail(guestDetails[0].email);
      }
      if (!customerPhone && guestDetails[0]?.phone) {
        setCustomerPhone(guestDetails[0].phone);
      }
      setCurrentStep('review');
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep === 'guests') {
      setCurrentStep('date');
    } else if (currentStep === 'details') {
      setCurrentStep('guests');
    } else if (currentStep === 'review') {
      setCurrentStep('details');
    }
  };

  // Submit booking - orchestrates the multi-step Holibob booking flow
  const handleSubmit = async () => {
    if (!selectedTimeSlot || !customerEmail) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Step 1: Create booking (empty basket)
      const createResponse = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoFillQuestions: true }),
      });

      if (!createResponse.ok) {
        const data = await createResponse.json();
        throw new Error(data.error ?? 'Failed to create booking');
      }

      const createData = await createResponse.json();
      const bookingId = createData.data.id;

      // Step 2: Add availability to booking
      const addAvailabilityResponse = await fetch(`/api/booking/${bookingId}/availability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availabilityId: selectedTimeSlot.id }),
      });

      if (!addAvailabilityResponse.ok) {
        const data = await addAvailabilityResponse.json();
        throw new Error(data.error ?? 'Failed to add experience to booking');
      }

      // Step 3: Answer booking questions (guest details)
      const questionsResponse = await fetch(`/api/booking/${bookingId}/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail,
          customerPhone: customerPhone || undefined,
          guests: guestDetails.slice(0, totalGuests).map((guest, index) => ({
            ...guest,
            isLeadGuest: index === 0,
            email: index === 0 ? customerEmail : guest.email,
            phone: index === 0 ? customerPhone : guest.phone,
          })),
        }),
      });

      if (!questionsResponse.ok) {
        const data = await questionsResponse.json();
        throw new Error(data.error ?? 'Failed to save guest details');
      }

      if (onBookingCreated) {
        onBookingCreated(bookingId);
      } else {
        // Redirect to checkout
        router.push(`/checkout/${bookingId}`);
      }
    } catch (err) {
      console.error('Booking error:', err);
      setError(err instanceof Error ? err.message : 'Failed to create booking');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Format date for display
  const formatSelectedDate = () => {
    if (!selectedDate) return '';
    return new Date(selectedDate).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // Step indicators
  const steps: { id: BookingStep; label: string }[] = [
    { id: 'date', label: 'Date & Time' },
    { id: 'guests', label: 'Guests' },
    { id: 'details', label: 'Details' },
    { id: 'review', label: 'Review' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-lg">
      {/* Header with price */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900">{experience.price.formatted}</span>
          <span className="text-gray-500">per person</span>
        </div>
        {experience.rating && (
          <div className="mt-2 flex items-center gap-1">
            <svg className="h-4 w-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-sm font-medium">{experience.rating.average.toFixed(1)}</span>
            <span className="text-sm text-gray-500">({experience.rating.count} reviews)</span>
          </div>
        )}
      </div>

      {/* Step indicators */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const isActive = step.id === currentStep;
            const isCompleted = index < currentStepIndex;
            const isClickable = isCompleted;

            return (
              <button
                key={step.id}
                onClick={() => isClickable && goToStep(step.id)}
                disabled={!isClickable}
                className={`
                  flex items-center gap-2 text-sm font-medium
                  ${isActive ? 'text-gray-900' : isCompleted ? 'cursor-pointer text-gray-600 hover:text-gray-900' : 'cursor-default text-gray-400'}
                `}
              >
                <span
                  className={`
                    flex h-6 w-6 items-center justify-center rounded-full text-xs
                    ${isActive ? 'text-white' : isCompleted ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'}
                  `}
                  style={
                    isActive ? { backgroundColor: brand?.primaryColor ?? '#6366f1' } : undefined
                  }
                >
                  {isCompleted ? (
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
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form content */}
      <div className="p-6">
        {/* Error message */}
        {error && <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">{error}</div>}

        {/* Date & Time step */}
        {currentStep === 'date' && (
          <AvailabilityCalendar
            productId={experience.id}
            selectedDate={selectedDate}
            selectedTimeSlot={selectedTimeSlot}
            onDateSelect={setSelectedDate}
            onTimeSlotSelect={setSelectedTimeSlot}
            adults={adults}
            children={children}
          />
        )}

        {/* Guests step */}
        {currentStep === 'guests' && (
          <GuestSelector
            guestCounts={guestCounts}
            onGuestCountChange={handleGuestCountChange}
            maxGuests={20}
            minGuests={1}
          />
        )}

        {/* Details step */}
        {currentStep === 'details' && (
          <GuestDetailsForm
            guestCounts={guestCounts}
            guestDetails={guestDetails}
            onGuestDetailsChange={setGuestDetails}
          />
        )}

        {/* Review step */}
        {currentStep === 'review' && (
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-gray-700">Booking Summary</h4>

            {/* Experience */}
            <div className="rounded-lg bg-gray-50 p-4">
              <h5 className="font-medium text-gray-900">{experience.title}</h5>
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
                  {formatSelectedDate()}
                </div>
                {selectedTimeSlot && (
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
                    {selectedTimeSlot.time}
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
                  {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                  {adults > 0 && ` (${adults} adult${adults > 1 ? 's' : ''}`}
                  {children > 0 && `, ${children} child${children > 1 ? 'ren' : ''}`}
                  {adults > 0 && ')'}
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-3">
              <div>
                <label htmlFor="customerEmail" className="block text-sm font-medium text-gray-700">
                  Contact email *
                </label>
                <input
                  type="email"
                  id="customerEmail"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  required
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                  style={
                    { '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties
                  }
                  placeholder="email@example.com"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Booking confirmation will be sent to this email
                </p>
              </div>

              <div>
                <label htmlFor="customerPhone" className="block text-sm font-medium text-gray-700">
                  Phone number
                </label>
                <input
                  type="tel"
                  id="customerPhone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2"
                  style={
                    { '--tw-ring-color': brand?.primaryColor ?? '#6366f1' } as React.CSSProperties
                  }
                  placeholder="+44 7000 000000"
                />
              </div>
            </div>

            {/* Price breakdown */}
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {selectedTimeSlot
                    ? new Intl.NumberFormat('en-GB', {
                        style: 'currency',
                        currency: selectedTimeSlot.currency,
                      }).format(selectedTimeSlot.price / 100)
                    : experience.price.formatted}{' '}
                  × {totalGuests} guests
                </span>
                <span className="font-medium text-gray-900">{formattedTotalPrice}</span>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2">
                <span className="font-semibold text-gray-900">Total</span>
                <span className="text-lg font-bold text-gray-900">{formattedTotalPrice}</span>
              </div>
            </div>

            {/* Terms */}
            <p className="text-center text-xs text-gray-500">
              By proceeding, you agree to our Terms of Service and acknowledge our Privacy Policy
            </p>
          </div>
        )}
      </div>

      {/* Footer with navigation */}
      <div className="border-t border-gray-200 p-6">
        <div className="flex items-center justify-between gap-3">
          {currentStep !== 'date' && (
            <button
              onClick={handleBack}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          )}
          {currentStep === 'date' && <div />}

          {currentStep !== 'review' ? (
            <button
              onClick={handleNext}
              disabled={
                (currentStep === 'date' && !canProceedFromDate) ||
                (currentStep === 'guests' && !canProceedFromGuests) ||
                (currentStep === 'details' && !canProceedFromDetails)
              }
              className="flex-1 rounded-lg py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:flex-none sm:px-6"
              style={{ backgroundColor: brand?.primaryColor ?? '#6366f1' }}
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !customerEmail}
              className="flex-1 rounded-lg py-3 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50 sm:flex-none sm:px-6"
              style={{ backgroundColor: brand?.primaryColor ?? '#6366f1' }}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
                  Processing...
                </span>
              ) : (
                'Proceed to Payment'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
