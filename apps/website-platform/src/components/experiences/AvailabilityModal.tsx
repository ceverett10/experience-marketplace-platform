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
  type PricingCategory,
  type AvailabilityDetail,
} from '@/lib/booking-flow';
import { reportError } from '@/lib/error-reporting';

interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  primaryColor?: string;
}

type Step = 'dates' | 'options' | 'pricing' | 'review';

/** Extract numeric price from formatted text like "£74.00" or "€ 120,50" */
function parsePrice(formatted: string): number | null {
  const cleaned = formatted.replace(/[^0-9.,]/g, '').replace(',', '.');
  const value = parseFloat(cleaned);
  return isNaN(value) ? null : value;
}

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
  // True once the first setPricingCategories response has come back — prevents
  // the validation hint from flashing during the initial 300ms debounce window
  const [hasPricingResult, setHasPricingResult] = useState(false);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Portal mounting state (for SSR safety)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch availability when modal opens or date range changes
  useEffect(() => {
    if (!isOpen || step !== 'dates') return;
    if (!dateRange.from || !dateRange.to || dateRange.from >= dateRange.to) return;

    const loadAvailability = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchAvailability(productId, dateRange.from, dateRange.to);
        const available = (result?.nodes ?? [])
          .filter((slot) => !slot.soldOut)
          .sort((a, b) => a.date.localeCompare(b.date));
        setAvailabilitySlots(available);
        // Pre-select the first available date
        if (available.length > 0 && !selectedSlot) {
          setSelectedSlot(available[0]!);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load availability');
        if (err instanceof Error)
          reportError(err, { component: 'AvailabilityModal', action: 'loadAvailability' });
      } finally {
        setIsLoading(false);
      }
    };

    loadAvailability();
  }, [isOpen, productId, dateRange, step]);

  // Initialize guest counts — default to 2 adults for the first adult-like category
  const initializeGuestCounts = (categories: PricingCategory[]) => {
    const initialUnits: Record<string, number> = {};
    let defaultApplied = false;
    categories.forEach((cat) => {
      const isAdultCategory = /adult/i.test(cat.label);
      if (!defaultApplied && (isAdultCategory || categories.length === 1)) {
        // Default to minParticipants (the guaranteed valid minimum).
        // Defaulting higher (e.g. 2) risks an immediately-invalid state for
        // products where the API only accepts exactly the minimum count.
        initialUnits[cat.id] = cat.minParticipants || 1;
        defaultApplied = true;
      } else {
        // Non-primary categories (children, infants) always start at 0.
        // minParticipants is the minimum IF the category is used, not a required default.
        initialUnits[cat.id] = 0;
      }
    });
    // If no adult category found, default first category to its minimum
    if (!defaultApplied && categories.length > 0) {
      const first = categories[0]!;
      initialUnits[first.id] = first.minParticipants || 1;
    }
    return initialUnits;
  };

  // Load options when a slot is selected
  const loadOptions = useCallback(async (slotId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const detail = await getAvailabilityDetails(slotId);
      if (!detail) {
        setError('Availability details not found. Please select a different date.');
        return;
      }
      setAvailabilityDetail(detail);

      // Check if options are already complete
      if (detail.optionList?.isComplete) {
        setOptionsComplete(true);
        // Load pricing directly — skip options step entirely
        const pricingDetail = await getAvailabilityDetails(slotId, true);
        if (!pricingDetail) {
          setError('Failed to load pricing. Please try again.');
          return;
        }
        setAvailabilityDetail(pricingDetail);
        const cats = pricingDetail.pricingCategoryList?.nodes ?? [];
        setPricingCategoriesState(cats);
        setCategoryUnits(initializeGuestCounts(cats));
        setStep('pricing');
      } else {
        setOptionsComplete(false);
        setStep('options');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load availability details');
      if (err instanceof Error)
        reportError(err, { component: 'AvailabilityModal', action: 'loadOptions' });
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
      if (!result) {
        setError('Failed to set options. Please try again.');
        return;
      }
      setAvailabilityDetail(result);

      if (result.optionList?.isComplete) {
        setOptionsComplete(true);
        // Load pricing
        const pricingDetail = await getAvailabilityDetails(selectedSlot.id, true);
        if (!pricingDetail) {
          setError('Failed to load pricing. Please try again.');
          return;
        }
        setAvailabilityDetail(pricingDetail);
        const cats = pricingDetail.pricingCategoryList?.nodes ?? [];
        setPricingCategoriesState(cats);
        setCategoryUnits(initializeGuestCounts(cats));
        setStep('pricing');
      } else {
        // More options needed - update selections for new options
        setError('Please select all required options');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set options');
      if (err instanceof Error)
        reportError(err, { component: 'AvailabilityModal', action: 'submitOptions' });
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
        setHasPricingResult(true);

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
        if (err instanceof Error)
          reportError(err, { component: 'AvailabilityModal', action: 'updatePricing' });
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
      if (err instanceof Error)
        reportError(err, { component: 'AvailabilityModal', action: 'startBooking' });
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
      setHasPricingResult(false);
      setError(null);
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

  // Derive a human-readable validation hint from API constraints when isValid = false
  const validationHint: string | null = (() => {
    if (isValid || isLoading || totalGuests === 0 || !hasPricingResult) return null;

    // Sold out takes priority — Holibob sets this when the chosen configuration
    // exceeds remaining capacity for the slot
    if (availabilityDetail?.soldOut) {
      return 'The selected options are currently sold out. Try selecting different options';
    }

    // Total participant bounds (at availability level)
    const minTotal = availabilityDetail?.minParticipants;
    const maxTotal = availabilityDetail?.maxParticipants;
    if (minTotal && totalGuests < minTotal) {
      return `Minimum ${minTotal} guest${minTotal !== 1 ? 's' : ''} required for this date`;
    }
    if (maxTotal && totalGuests > maxTotal) {
      return `Maximum ${maxTotal} guest${maxTotal !== 1 ? 's' : ''} allowed for this date`;
    }

    // Per-category minimum (applies only when the category is in use)
    for (const cat of pricingCategories) {
      const units = categoryUnits[cat.id] ?? 0;
      if (units > 0 && cat.minParticipants > 0 && units < cat.minParticipants) {
        return `Minimum ${cat.minParticipants} ${formatLabel(cat.label).toLowerCase()} required`;
      }
    }

    // Cross-category dependency (e.g. children cannot exceed adults)
    for (const cat of pricingCategories) {
      const units = categoryUnits[cat.id] ?? 0;
      if (units > 0 && cat.maxParticipantsDepends) {
        const dep = cat.maxParticipantsDepends;
        const dependsCat = pricingCategories.find((c) => c.id === dep.pricingCategoryId);
        if (dependsCat) {
          const dependsUnits = categoryUnits[dependsCat.id] ?? 0;
          const maxAllowed = Math.floor(dependsUnits * dep.multiplier);
          if (units > maxAllowed) {
            return (
              dep.explanation ||
              `Number of ${formatLabel(cat.label).toLowerCase()} cannot exceed ${formatLabel(dependsCat.label).toLowerCase()}`
            );
          }
        }
      }
    }

    return 'Please adjust your guest selection to continue';
  })();

  // Don't render until mounted (client-side) and isOpen
  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Modal */}
      <div
        className="relative z-10 mx-4 max-h-[90vh] w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl"
        data-testid="availability-modal"
      >
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
              className="rounded-full p-3 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
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

          {/* Progress steps — skip options bar when options auto-complete */}
          {(() => {
            const steps = optionsComplete ? ['dates', 'pricing'] : ['dates', 'options', 'pricing'];
            return (
              <div className="mt-4 flex gap-2" data-testid="progress-steps">
                {steps.map((s, i) => (
                  <div
                    key={s}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= steps.indexOf(step) ? 'bg-teal-500' : 'bg-gray-200'
                    }`}
                    style={i <= steps.indexOf(step) ? { backgroundColor: primaryColor } : {}}
                  />
                ))}
              </div>
            );
          })()}
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
                    onChange={(e) => {
                      const newFrom = e.target.value;
                      setDateRange((prev) => {
                        if (newFrom >= prev.to) {
                          const newTo = new Date(newFrom);
                          newTo.setDate(newTo.getDate() + 30);
                          return {
                            from: newFrom,
                            to: newTo.toISOString().split('T')[0] ?? prev.to,
                          };
                        }
                        return { ...prev, from: newFrom };
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500">To</label>
                  <input
                    type="date"
                    value={dateRange.to}
                    min={(() => {
                      const d = new Date(dateRange.from);
                      d.setDate(d.getDate() + 1);
                      return d.toISOString().split('T')[0];
                    })()}
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
                        data-testid={`date-slot-${slot.id}`}
                        className={`flex items-center justify-between gap-2 rounded-lg border p-3 sm:rounded-xl sm:border-2 sm:p-4 text-left transition-all ${
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
                        <div className="min-w-0">
                          <p className="text-sm sm:text-base font-medium text-gray-900">
                            {formatDate(slot.date)}
                          </p>
                        </div>
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
              {(availabilityDetail.optionList?.nodes ?? [])
                .filter((opt) => opt.availableOptions && opt.availableOptions.length > 0)
                .map((option) => (
                  <div key={option.id}>
                    <label className="block text-sm font-medium text-gray-700">
                      {formatLabel(option.label)}
                    </label>
                    <select
                      data-testid={`option-select-${option.id}`}
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

              {(availabilityDetail.optionList?.nodes ?? []).filter(
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
                  className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 p-4"
                  data-testid={`guest-category-${category.id}`}
                >
                  <div className="min-w-0 pt-1">
                    <p className="font-medium text-gray-900">{formatLabel(category.label)}</p>
                    <p className="text-sm text-gray-500">
                      {category.unitPrice?.grossFormattedText ?? '—'} per person
                    </p>
                    {category.minParticipants > 0 && (
                      <p className="text-xs text-gray-400">Min: {category.minParticipants}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      onClick={() => handleUnitChange(category.id, -1)}
                      disabled={(categoryUnits[category.id] ?? 0) <= 0}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      data-testid={`guest-decrement-${category.id}`}
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
                      data-testid={`guest-increment-${category.id}`}
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

              {/* Price discrepancy notice — guide price vs actual per-person pricing */}
              {(() => {
                const guidePrice = selectedSlot?.guidePriceFormattedText
                  ? parsePrice(selectedSlot.guidePriceFormattedText)
                  : null;
                const unitPrices = pricingCategories
                  .map((c) => c.unitPrice?.gross ?? 0)
                  .filter((p) => p > 0);
                const lowestUnit = unitPrices.length > 0 ? Math.min(...unitPrices) : null;
                if (
                  guidePrice == null ||
                  guidePrice === 0 ||
                  lowestUnit == null ||
                  lowestUnit === 0
                )
                  return null;
                const diff = Math.abs(lowestUnit - guidePrice) / guidePrice;
                if (diff <= 0.3) return null;
                return (
                  <div className="rounded-lg bg-blue-50/70 border border-blue-100 px-3 py-2.5 text-xs text-blue-700">
                    <p className="font-medium">Just a heads up on pricing!</p>
                    <p className="mt-0.5 text-blue-500">
                      We have noticed that the per-person pricing is slightly higher than what you
                      saw before. Our apologies for this. However, this is completely normal,
                      pricing varies by date, group size, and availability. All prices come directly
                      from our incredible suppliers.
                    </p>
                  </div>
                );
              })()}
              {pricingCategories.length === 0 && (
                <p className="py-4 text-center text-sm text-gray-500">Loading pricing options...</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4">
          {/* Total and action buttons */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {step === 'pricing' && totalPrice && (
                <div>
                  <p className="text-sm text-gray-500">
                    {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                  </p>
                  <p className="text-lg font-bold" style={{ color: primaryColor }}>
                    {totalPrice.formatted}
                  </p>
                </div>
              )}
              {step === 'pricing' && validationHint && (
                <p className="text-xs text-amber-600">{validationHint}</p>
              )}
              {step === 'dates' && selectedSlot && (
                <p className="text-sm text-gray-600">{formatDate(selectedSlot.date)}</p>
              )}
            </div>

            <div className="flex gap-3 self-end sm:self-auto">
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
                  data-testid="book-now-button"
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
                  ) : totalPrice ? (
                    `Book for ${totalPrice.formatted}`
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
