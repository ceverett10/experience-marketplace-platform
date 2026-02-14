'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  fetchAvailability,
  getAvailabilityDetails,
  setAvailabilityOptions,
  setPricingCategories,
  startBookingFlow,
  formatDate,
  type AvailabilitySlot,
  type AvailabilityOption,
  type PricingCategory,
  type AvailabilityDetail,
} from '@/lib/booking-flow';
import { SessionTimer } from '@/components/booking/SessionTimer';
import { getProductPricingConfig, calculatePromoPrice } from '@/lib/pricing';

interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  primaryColor?: string;
}

type Step = 'dates' | 'options' | 'pricing' | 'review';

export function AvailabilityModal({
  isOpen,
  onClose,
  productId,
  productName,
  primaryColor = '#0d9488',
}: AvailabilityModalProps) {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<Step>('dates');

  // Date selection state
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(() => {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setDate(today.getDate() + 30);
    return {
      from: today.toISOString().split('T')[0] ?? '',
      to: nextMonth.toISOString().split('T')[0] ?? '',
    };
  });

  // Options state
  const [availabilityDetail, setAvailabilityDetail] = useState<AvailabilityDetail | null>(null);
  const [optionSelections, setOptionSelections] = useState<Record<string, string>>({});
  const [optionsComplete, setOptionsComplete] = useState(false);

  // Pricing state
  const [pricingCategories, setPricingCategoriesState] = useState<PricingCategory[]>([]);
  const [categoryUnits, setCategoryUnits] = useState<Record<string, number>>({});
  const [totalPrice, setTotalPrice] = useState<{
    formatted: string;
    amount: number;
    currency: string;
  } | null>(null);
  const [isValid, setIsValid] = useState(false);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Session timer state - starts when user moves past date selection
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);

  // Portal mounting state (for SSR safety)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch availability when modal opens or date range changes
  useEffect(() => {
    if (!isOpen || step !== 'dates') return;

    const loadAvailability = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchAvailability(productId, dateRange.from, dateRange.to);
        setAvailabilitySlots(result.nodes.filter((slot) => !slot.soldOut));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load availability');
      } finally {
        setIsLoading(false);
      }
    };

    loadAvailability();
  }, [isOpen, productId, dateRange, step]);

  // Load options when a slot is selected
  const loadOptions = useCallback(async (slotId: string) => {
    // Start the session timer when user moves past date selection
    setSessionStartTime(new Date());
    setIsLoading(true);
    setError(null);
    try {
      const detail = await getAvailabilityDetails(slotId);
      setAvailabilityDetail(detail);

      // Check if options are already complete
      if (detail.optionList?.isComplete) {
        setOptionsComplete(true);
        // Load pricing directly
        const pricingDetail = await getAvailabilityDetails(slotId, true);
        setAvailabilityDetail(pricingDetail);
        setPricingCategoriesState(pricingDetail.pricingCategoryList?.nodes ?? []);
        // Initialize category units
        const initialUnits: Record<string, number> = {};
        pricingDetail.pricingCategoryList?.nodes.forEach((cat) => {
          initialUnits[cat.id] = cat.minParticipants || 0;
        });
        setCategoryUnits(initialUnits);
        setStep('pricing');
      } else {
        setOptionsComplete(false);
        setStep('options');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load availability details');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle option selection
  const handleOptionChange = (optionId: string, value: string) => {
    setOptionSelections((prev) => ({ ...prev, [optionId]: value }));
  };

  // Submit options and check if complete
  const submitOptions = async () => {
    if (!selectedSlot) return;

    setIsLoading(true);
    setError(null);
    try {
      const options = Object.entries(optionSelections).map(([id, value]) => ({ id, value }));
      const result = await setAvailabilityOptions(selectedSlot.id, options);
      setAvailabilityDetail(result);

      if (result.optionList?.isComplete) {
        setOptionsComplete(true);
        // Load pricing
        const pricingDetail = await getAvailabilityDetails(selectedSlot.id, true);
        setAvailabilityDetail(pricingDetail);
        setPricingCategoriesState(pricingDetail.pricingCategoryList?.nodes ?? []);
        // Initialize category units
        const initialUnits: Record<string, number> = {};
        pricingDetail.pricingCategoryList?.nodes.forEach((cat) => {
          initialUnits[cat.id] = cat.minParticipants || 0;
        });
        setCategoryUnits(initialUnits);
        setStep('pricing');
      } else {
        // More options needed - update selections for new options
        setError('Please select all required options');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set options');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle category unit change
  const handleUnitChange = (categoryId: string, delta: number) => {
    setCategoryUnits((prev) => {
      const category = pricingCategories.find((c) => c.id === categoryId);
      if (!category) return prev;

      const currentUnits = prev[categoryId] ?? 0;
      const newUnits = Math.max(0, Math.min(category.maxParticipants || 99, currentUnits + delta));
      return { ...prev, [categoryId]: newUnits };
    });
  };

  // Update pricing when units change
  useEffect(() => {
    if (step !== 'pricing' || !selectedSlot) return;

    const updatePricing = async () => {
      const categories = Object.entries(categoryUnits)
        .filter(([, units]) => units > 0)
        .map(([id, units]) => ({ id, units }));

      if (categories.length === 0) {
        setIsValid(false);
        setTotalPrice(null);
        return;
      }

      try {
        const result = await setPricingCategories(selectedSlot.id, categories);
        setAvailabilityDetail(result);
        setIsValid(result.isValid ?? false);

        if (result.totalPrice) {
          setTotalPrice({
            formatted: result.totalPrice.grossFormattedText,
            amount: result.totalPrice.gross,
            currency: result.totalPrice.currency,
          });
        }

        // Update pricing categories with new totals
        if (result.pricingCategoryList) {
          setPricingCategoriesState(result.pricingCategoryList.nodes);
        }
      } catch (err) {
        console.error('Pricing update error:', err);
      }
    };

    const debounce = setTimeout(updatePricing, 300);
    return () => clearTimeout(debounce);
  }, [categoryUnits, step, selectedSlot]);

  // Handle booking
  const handleBook = async () => {
    if (!selectedSlot || !isValid) return;

    setIsBooking(true);
    setError(null);
    try {
      const bookingId = await startBookingFlow(selectedSlot.id);
      router.push(`/checkout/${bookingId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create booking');
      setIsBooking(false);
    }
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('dates');
      setSelectedSlot(null);
      setAvailabilityDetail(null);
      setOptionSelections({});
      setOptionsComplete(false);
      setPricingCategoriesState([]);
      setCategoryUnits({});
      setTotalPrice(null);
      setIsValid(false);
      setError(null);
      setSessionStartTime(null);
    }
  }, [isOpen]);

  // Calculate total guests
  const totalGuests = Object.values(categoryUnits).reduce((sum, units) => sum + units, 0);

  // Format option/category labels to be user-friendly
  const formatLabel = (label: string): string => {
    // Transform "6 PAX" -> "Group of 6"
    const paxMatch = label.match(/^(\d+)\s*PAX$/i);
    if (paxMatch?.[1]) return `Group of ${paxMatch[1]}`;
    // Transform "N pax" variations
    const paxMatch2 = label.match(/^(\d+)\s*pax$/i);
    if (paxMatch2?.[1]) return `Group of ${paxMatch2[1]}`;
    return label;
  };

  // Don't render until mounted (client-side) and isOpen
  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div className="relative z-10 mx-4 max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                {step === 'dates' && 'Select a date'}
                {step === 'options' && 'Choose options'}
                {step === 'pricing' && 'Select guests'}
                {step === 'review' && 'Review booking'}
              </h2>
              <p className="mt-1 line-clamp-1 text-sm text-gray-500">{productName}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Progress steps */}
          <div className="mt-4 flex gap-2">
            {['dates', 'options', 'pricing'].map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i <= ['dates', 'options', 'pricing'].indexOf(step) ? 'bg-teal-500' : 'bg-gray-200'
                }`}
                style={
                  i <= ['dates', 'options', 'pricing'].indexOf(step)
                    ? { backgroundColor: primaryColor }
                    : {}
                }
              />
            ))}
          </div>

          {/* Session timer - shows after date selection */}
          {sessionStartTime && step !== 'dates' && (
            <div className="mt-3">
              <SessionTimer
                startTime={sessionStartTime}
                durationMinutes={15}
                variant="banner"
                onExpire={() => {
                  setError('Your session has expired. Please select a date again.');
                  setStep('dates');
                  setSessionStartTime(null);
                  setSelectedSlot(null);
                }}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="max-h-[60vh] overflow-y-auto p-6">
          {/* Error message */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          {/* Loading */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
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
          )}

          {/* Step 1: Date Selection */}
          {step === 'dates' && !isLoading && (
            <div className="space-y-4">
              {/* Date range selector */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500">From</label>
                  <input
                    type="date"
                    value={dateRange.from}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, from: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500">To</label>
                  <input
                    type="date"
                    value={dateRange.to}
                    min={dateRange.from}
                    onChange={(e) => setDateRange((prev) => ({ ...prev, to: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Available slots */}
              {availabilitySlots.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">
                  No availability found for the selected dates. Try a different date range.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    {availabilitySlots.length} date{availabilitySlots.length !== 1 ? 's' : ''}{' '}
                    available
                  </p>
                  <div className="grid gap-2">
                    {availabilitySlots.map((slot) => (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedSlot(slot)}
                        className={`flex items-center justify-between rounded-xl border-2 p-4 text-left transition-all ${
                          selectedSlot?.id === slot.id
                            ? 'border-teal-500 bg-teal-50'
                            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                        style={
                          selectedSlot?.id === slot.id
                            ? { borderColor: primaryColor, backgroundColor: `${primaryColor}10` }
                            : {}
                        }
                      >
                        <div>
                          <p className="font-medium text-gray-900">{formatDate(slot.date)}</p>
                        </div>
                        {slot.guidePriceFormattedText && (
                          <p className="text-sm font-semibold" style={{ color: primaryColor }}>
                            from {slot.guidePriceFormattedText}
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Options Selection */}
          {step === 'options' && !isLoading && availabilityDetail && (
            <div className="space-y-4">
              {availabilityDetail.optionList?.nodes
                .filter((opt) => opt.availableOptions && opt.availableOptions.length > 0)
                .map((option) => (
                  <div key={option.id}>
                    <label className="block text-sm font-medium text-gray-700">
                      {formatLabel(option.label)}
                    </label>
                    <select
                      value={optionSelections[option.id] ?? ''}
                      onChange={(e) => handleOptionChange(option.id, e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    >
                      <option value="">Select {formatLabel(option.label).toLowerCase()}</option>
                      {option.availableOptions?.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {formatLabel(opt.label)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}

              {availabilityDetail.optionList?.nodes.filter(
                (opt) => opt.availableOptions && opt.availableOptions.length > 0
              ).length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">No options to configure</p>
              )}
            </div>
          )}

          {/* Step 3: Pricing Categories */}
          {step === 'pricing' && !isLoading && (
            <div className="space-y-4">
              {pricingCategories.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 p-4"
                >
                  <div>
                    <p className="font-medium text-gray-900">{formatLabel(category.label)}</p>
                    {(() => {
                      const config = getProductPricingConfig(productId);
                      const promo = calculatePromoPrice(category.unitPrice.grossFormattedText, category.unitPrice.gross, category.unitPrice.currency ?? 'GBP', config);
                      return promo.hasPromo ? (
                        <p className="text-sm text-gray-500">
                          <span className="text-gray-400 line-through">{promo.originalFormatted}</span>{' '}
                          <span className="font-medium text-gray-700">{category.unitPrice.grossFormattedText}</span> per person
                        </p>
                      ) : (
                        <p className="text-sm text-gray-500">
                          {category.unitPrice.grossFormattedText} per person
                        </p>
                      );
                    })()}
                    {category.minParticipants > 0 && (
                      <p className="text-xs text-gray-400">Min: {category.minParticipants}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleUnitChange(category.id, -1)}
                      disabled={(categoryUnits[category.id] ?? 0) <= 0}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
                      </svg>
                    </button>
                    <span className="w-8 text-center font-medium text-gray-900">
                      {categoryUnits[category.id] ?? 0}
                    </span>
                    <button
                      onClick={() => handleUnitChange(category.id, 1)}
                      disabled={
                        (categoryUnits[category.id] ?? 0) >= (category.maxParticipants || 99)
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
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
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              {pricingCategories.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">Loading pricing options...</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          {/* Total and action buttons */}
          <div className="flex items-center justify-between">
            <div>
              {step === 'pricing' && totalPrice && (() => {
                const config = getProductPricingConfig(productId);
                const promo = calculatePromoPrice(totalPrice.formatted, totalPrice.amount, totalPrice.currency, config);
                return (
                  <div>
                    <p className="text-sm text-gray-500">
                      {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                    </p>
                    {promo.hasPromo && (
                      <p className="text-xs text-gray-400 line-through">{promo.originalFormatted}</p>
                    )}
                    <p className="text-lg font-bold" style={{ color: primaryColor }}>
                      {totalPrice.formatted}
                    </p>
                  </div>
                );
              })()}
              {step === 'dates' && selectedSlot && (
                <p className="text-sm text-gray-600">{formatDate(selectedSlot.date)}</p>
              )}
            </div>

            <div className="flex gap-3">
              {step !== 'dates' && (
                <button
                  onClick={() => {
                    if (step === 'options') setStep('dates');
                    if (step === 'pricing') setStep(optionsComplete ? 'dates' : 'options');
                  }}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
              )}

              {step === 'dates' && (
                <button
                  onClick={() => selectedSlot && loadOptions(selectedSlot.id)}
                  disabled={!selectedSlot || isLoading}
                  className="rounded-lg px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  Continue
                </button>
              )}

              {step === 'options' && (
                <button
                  onClick={submitOptions}
                  disabled={isLoading || Object.keys(optionSelections).length === 0}
                  className="rounded-lg px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  Continue
                </button>
              )}

              {step === 'pricing' && (
                <button
                  onClick={handleBook}
                  disabled={!isValid || totalGuests === 0 || isBooking}
                  className="rounded-lg px-6 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: primaryColor }}
                >
                  {isBooking ? (
                    <span className="flex items-center gap-2">
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
                      Creating...
                    </span>
                  ) : (
                    'Book Now'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Use portal to render at document body level
  return createPortal(modalContent, document.body);
}
