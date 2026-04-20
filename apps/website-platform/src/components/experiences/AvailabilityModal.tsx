'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { CalendarGrid } from './CalendarGrid';
import { BookingStepper } from './BookingStepper';
import { BookingSummaryPanel } from './BookingSummaryPanel';

interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  primaryColor?: string;
  /** Product hero image for the summary panel */
  productImage?: string;
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
  productImage,
}: AvailabilityModalProps) {
  const router = useRouter();

  // Step state
  const [step, setStep] = useState<Step>('dates');

  // Calendar month state
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());

  // Date selection state
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);

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
  const [hasPricingResult, setHasPricingResult] = useState(false);
  // Stable max participants cap — set once when options/pricing first load,
  // not overwritten by subsequent setPricingCategories responses.
  const [maxGuestsCap, setMaxGuestsCap] = useState<number | null>(null);

  // Track initial per-person prices to detect group savings
  const initialUnitPricesRef = useRef<Record<string, number>>({});

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isBooking, setIsBooking] = useState(false);

  // Portal mounting state (for SSR safety)
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // All available slots from the single 90-day lookahead fetch.
  // Stored separately so we never re-fetch and invalidate Holibob session IDs.
  const [allSlots, setAllSlots] = useState<AvailabilitySlot[]>([]);
  const hasFetchedRef = useRef(false);

  // Single fetch on modal open — 90-day lookahead. No per-month re-fetches.
  useEffect(() => {
    if (!isOpen || step !== 'dates' || hasFetchedRef.current) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const today = new Date();
        const lookahead = new Date(today);
        lookahead.setDate(today.getDate() + 90);
        const pad = (n: number) => n.toString().padStart(2, '0');
        const fromStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        const toStr = `${lookahead.getFullYear()}-${pad(lookahead.getMonth() + 1)}-${pad(lookahead.getDate())}`;

        const result = await fetchAvailability(productId, fromStr, toStr);
        if (cancelled) return;

        const available = (result?.nodes ?? [])
          .filter((slot) => !slot.soldOut)
          .sort((a, b) => a.date.localeCompare(b.date));

        hasFetchedRef.current = true;
        setAllSlots(available);

        // Jump calendar to the month of the first available date
        if (available.length > 0) {
          const firstDate = new Date(available[0]!.date + 'T00:00:00');
          setCalendarYear(firstDate.getFullYear());
          setCalendarMonth(firstDate.getMonth());
          setSelectedSlot(available[0]!);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load availability');
        if (err instanceof Error)
          reportError(err, { component: 'AvailabilityModal', action: 'loadAvailability' });
        hasFetchedRef.current = true;
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, step, productId]);

  // Filter allSlots to the currently displayed calendar month (client-side only, no API call)
  useEffect(() => {
    const monthSlots = allSlots.filter((s) => {
      const d = new Date(s.date + 'T00:00:00');
      return d.getFullYear() === calendarYear && d.getMonth() === calendarMonth;
    });
    setAvailabilitySlots(monthSlots);
  }, [allSlots, calendarYear, calendarMonth]);

  // Derived calendar data
  const availableDates = useMemo(
    () => new Set(availabilitySlots.map((s) => s.date)),
    [availabilitySlots]
  );
  const dateToSlotId = useMemo(
    () => new Map(availabilitySlots.map((s) => [s.date, s.id])),
    [availabilitySlots]
  );

  const handleCalendarDateSelect = (dateStr: string) => {
    const slot = availabilitySlots.find((s) => s.date === dateStr);
    if (slot) {
      setSelectedSlot(slot);
      // Reset initial prices — new date may have different base pricing
      initialUnitPricesRef.current = {};
    }
  };

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarYear((y) => y - 1);
      setCalendarMonth(11);
    } else {
      setCalendarMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarYear((y) => y + 1);
      setCalendarMonth(0);
    } else {
      setCalendarMonth((m) => m + 1);
    }
  };

  // Initialize guest counts — default to minParticipants (or 1) for the first adult-like category
  const initializeGuestCounts = (categories: PricingCategory[]) => {
    const initialUnits: Record<string, number> = {};
    let defaultApplied = false;
    categories.forEach((cat) => {
      const isAdultCategory = /adult/i.test(cat.label);
      if (!defaultApplied && (isAdultCategory || categories.length === 1)) {
        initialUnits[cat.id] = cat.minParticipants || 1;
        defaultApplied = true;
      } else {
        initialUnits[cat.id] = 0;
      }
    });
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
      // Capture max participants cap from the first detail response
      if (detail.maxParticipants) {
        setMaxGuestsCap(detail.maxParticipants);
      }

      if (detail.optionList?.isComplete) {
        setOptionsComplete(true);
        const pricingDetail = await getAvailabilityDetails(slotId, true);
        if (!pricingDetail) {
          setError('Failed to load pricing. Please try again.');
          return;
        }
        setAvailabilityDetail(pricingDetail);
        // Also capture from pricing detail if not set yet
        if (pricingDetail.maxParticipants && !detail.maxParticipants) {
          setMaxGuestsCap(pricingDetail.maxParticipants);
        }
        const cats = pricingDetail.pricingCategoryList?.nodes ?? [];
        setPricingCategoriesState(cats);
        setCategoryUnits(initializeGuestCounts(cats));
        setStep('pricing');
      } else {
        setOptionsComplete(false);
        // Auto-select options that have only one choice
        const autoSelections: Record<string, string> = {};
        for (const opt of detail.optionList?.nodes ?? []) {
          if (opt.availableOptions?.length === 1) {
            autoSelections[opt.id] = opt.availableOptions[0]!.value;
          }
        }
        if (Object.keys(autoSelections).length > 0) {
          setOptionSelections((prev) => ({ ...prev, ...autoSelections }));
        }
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
        // More options surfaced — update detail so the UI shows them; no error needed
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set options');
      if (err instanceof Error)
        reportError(err, { component: 'AvailabilityModal', action: 'submitOptions' });
    } finally {
      setIsLoading(false);
    }
  };

  // Stable per-category caps — updated whenever we get category data from the API
  const categoryMaxRef = useRef<Map<string, number>>(new Map());

  // Keep categoryMaxRef in sync with the latest pricingCategories
  useEffect(() => {
    for (const cat of pricingCategories) {
      if (cat.maxParticipants && cat.maxParticipants > 0) {
        categoryMaxRef.current.set(cat.id, cat.maxParticipants);
      }
    }
  }, [pricingCategories]);

  // Handle category unit change — enforces per-category and availability-level caps
  const handleUnitChange = (categoryId: string, delta: number) => {
    setCategoryUnits((prev) => {
      const currentUnits = prev[categoryId] ?? 0;
      // Per-category cap: use the stable ref (survives re-renders), fall back to 99
      const categoryMax = categoryMaxRef.current.get(categoryId) ?? 99;
      let newUnits = Math.max(0, Math.min(categoryMax, currentUnits + delta));

      // Enforce total guest cap across all categories
      if (maxGuestsCap && delta > 0) {
        const otherGuests = Object.entries(prev)
          .filter(([id]) => id !== categoryId)
          .reduce((sum, [, u]) => sum + u, 0);
        newUnits = Math.min(newUnits, maxGuestsCap - otherGuests);
      }

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
        console.info('[AvailabilityModal] Pricing response:', {
          isValid: result.isValid,
          soldOut: result.soldOut,
          minParticipants: result.minParticipants,
          maxParticipants: result.maxParticipants,
          totalPrice: result.totalPrice,
          categories: result.pricingCategoryList?.nodes?.map((c) => ({
            id: c.id,
            label: c.label,
            units: c.units,
            min: c.minParticipants,
            max: c.maxParticipants,
          })),
        });
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

        if (result.pricingCategoryList) {
          const nodes = result.pricingCategoryList.nodes;
          setPricingCategoriesState(nodes);

          // Capture initial unit prices on first pricing load (for group savings comparison)
          if (Object.keys(initialUnitPricesRef.current).length === 0) {
            const initial: Record<string, number> = {};
            for (const cat of nodes) {
              if (cat.unitPrice?.gross != null) {
                initial[cat.id] = cat.unitPrice.gross;
              }
            }
            initialUnitPricesRef.current = initial;
          }
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
      hasFetchedRef.current = false;
      setAllSlots([]);
      setMaxGuestsCap(null);
      setError(null);
      // Reset calendar to current month
      const now = new Date();
      setCalendarYear(now.getFullYear());
      setCalendarMonth(now.getMonth());
    }
  }, [isOpen]);

  // Calculate total guests
  const totalGuests = Object.values(categoryUnits).reduce((sum, units) => sum + units, 0);

  // Format option/category labels
  const formatLabel = (label: string): string => {
    const paxMatch = label.match(/^(\d+)\s*PAX$/i);
    if (paxMatch?.[1]) return `Group of ${paxMatch[1]}`;
    const paxMatch2 = label.match(/^(\d+)\s*pax$/i);
    if (paxMatch2?.[1]) return `Group of ${paxMatch2[1]}`;
    return label;
  };

  // Validation hint
  const validationHint: string | null = (() => {
    if (isValid || isLoading || totalGuests === 0 || !hasPricingResult) return null;

    if (availabilityDetail?.soldOut) {
      return 'The selected options are currently sold out. Try selecting different options';
    }

    const minTotal = availabilityDetail?.minParticipants;
    const maxTotal = maxGuestsCap ?? availabilityDetail?.maxParticipants;
    if (minTotal && totalGuests < minTotal) {
      return `Minimum ${minTotal} guest${minTotal !== 1 ? 's' : ''} required for this date`;
    }
    if (maxTotal && totalGuests > maxTotal) {
      return `Maximum ${maxTotal} guest${maxTotal !== 1 ? 's' : ''} allowed for this date`;
    }

    for (const cat of pricingCategories) {
      const units = categoryUnits[cat.id] ?? 0;
      if (units > 0 && cat.minParticipants > 0 && units < cat.minParticipants) {
        return `Minimum ${cat.minParticipants} ${formatLabel(cat.label).toLowerCase()} required`;
      }
    }

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

  // Stepper always shows all three steps
  const stepperSteps = useMemo(
    () => [
      { key: 'dates', label: 'Select Your Date' },
      { key: 'options', label: 'Configure Options' },
      { key: 'pricing', label: 'Travellers' },
    ],
    []
  );

  const completedSteps = useMemo(() => {
    const set = new Set<string>();
    const stepOrder: Step[] = ['dates', 'options', 'pricing'];
    const currentIdx = stepOrder.indexOf(step);
    for (let i = 0; i < currentIdx; i++) {
      set.add(stepOrder[i]!);
    }
    return set;
  }, [step]);

  // Build selected options summary for the panel
  const selectedOptionsSummary = useMemo(() => {
    if (!availabilityDetail?.optionList?.nodes) return [];
    return availabilityDetail.optionList.nodes
      .filter((opt) => optionSelections[opt.id])
      .map((opt) => {
        const selected = opt.availableOptions?.find((o) => o.value === optionSelections[opt.id]);
        return {
          label: formatLabel(opt.label),
          value: selected ? formatLabel(selected.label) : '',
        };
      })
      .filter((s) => s.value);
  }, [availabilityDetail, optionSelections]);

  // Don't render until mounted (client-side) and isOpen
  if (!mounted || !isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center lg:items-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />

      {/* Modal — full-screen sheet on mobile, wide two-panel on desktop */}
      <div
        className="relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl lg:mx-4 lg:h-auto lg:max-h-[90vh] lg:max-w-4xl lg:min-h-[560px] lg:flex-row lg:rounded-2xl"
        data-testid="availability-modal"
      >
        {/* LEFT PANEL — Stepper + step content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Book Experience</h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 lg:hidden"
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
          </div>

          {/* Stepper + Content */}
          <div className="flex flex-1 overflow-hidden">
            {/* Stepper sidebar — hidden on mobile */}
            <div className="hidden w-48 shrink-0 border-r border-gray-100 p-4 lg:block">
              <BookingStepper
                steps={stepperSteps}
                currentStepKey={step}
                completedStepKeys={completedSteps}
                primaryColor={primaryColor}
              />
            </div>

            {/* Step content */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 lg:min-h-[340px]">
                {/* Error message */}
                {error && (
                  <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
                )}

                {/* Loading */}
                {isLoading && (
                  <div className="flex items-center justify-center py-12">
                    <svg
                      className="h-8 w-8 animate-spin text-gray-400"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
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

                {/* Step 1: Date Selection — Calendar */}
                {step === 'dates' && !isLoading && (
                  <div className="space-y-4">
                    {selectedSlot && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-900">
                          {formatDate(selectedSlot.date)}
                        </span>
                      </p>
                    )}

                    <CalendarGrid
                      year={calendarYear}
                      month={calendarMonth}
                      availableDates={availableDates}
                      selectedDate={selectedSlot?.date ?? null}
                      dateToSlotId={dateToSlotId}
                      onSelectDate={handleCalendarDateSelect}
                      onPrevMonth={handlePrevMonth}
                      onNextMonth={handleNextMonth}
                      primaryColor={primaryColor}
                    />

                    {availabilitySlots.length > 0 && (
                      <p className="text-xs text-gray-400">
                        {availabilitySlots.length} date
                        {availabilitySlots.length !== 1 ? 's' : ''} available
                      </p>
                    )}
                    {!isLoading && availabilitySlots.length === 0 && (
                      <div className="py-4 text-center text-sm text-gray-500">
                        No availability found for this month. Try another month.
                      </div>
                    )}
                  </div>
                )}

                {/* Step 2: Options Selection — chips for ≤8 options, dropdown for more */}
                {step === 'options' && !isLoading && availabilityDetail && (
                  <div className="space-y-5">
                    <p className="text-sm font-medium text-gray-700">Choose options</p>
                    {(availabilityDetail.optionList?.nodes ?? [])
                      .filter((opt) => opt.availableOptions && opt.availableOptions.length > 0)
                      .map((option) => {
                        const MAX_CHIPS = 8;
                        const choices = option.availableOptions ?? [];
                        const useChips = choices.length <= MAX_CHIPS;
                        const selectedValue = optionSelections[option.id] ?? '';

                        return (
                          <div key={option.id}>
                            <label className="mb-2 block text-sm font-medium text-gray-700">
                              {formatLabel(option.label)}
                            </label>
                            {useChips ? (
                              <div
                                className="flex flex-wrap gap-2"
                                data-testid={`option-select-${option.id}`}
                              >
                                {choices.map((opt) => {
                                  const isSelected = selectedValue === opt.value;
                                  return (
                                    <button
                                      key={opt.value}
                                      type="button"
                                      onClick={() => handleOptionChange(option.id, opt.value)}
                                      className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                                        isSelected
                                          ? 'border-transparent text-white'
                                          : 'border-gray-300 text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                                      }`}
                                      style={
                                        isSelected ? { backgroundColor: primaryColor } : undefined
                                      }
                                    >
                                      {formatLabel(opt.label)}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <select
                                data-testid={`option-select-${option.id}`}
                                value={selectedValue}
                                onChange={(e) => handleOptionChange(option.id, e.target.value)}
                                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                              >
                                <option value="">
                                  Select {formatLabel(option.label).toLowerCase()}
                                </option>
                                {choices.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {formatLabel(opt.label)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}

                    {(availabilityDetail.optionList?.nodes ?? []).filter(
                      (opt) => opt.availableOptions && opt.availableOptions.length > 0
                    ).length === 0 && (
                      <p className="py-4 text-center text-sm text-gray-500">
                        No options to configure
                      </p>
                    )}
                  </div>
                )}

                {/* Step 3: Pricing / Travellers */}
                {step === 'pricing' && !isLoading && (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-gray-700">Select guests</p>
                    {pricingCategories.map((category) => {
                      const currentPrice = category.unitPrice?.gross ?? 0;
                      const initialPrice = initialUnitPricesRef.current[category.id] ?? 0;
                      // Only show saving when price genuinely dropped by at least 1%
                      const priceDiff =
                        initialPrice > 0 && currentPrice > 0
                          ? (initialPrice - currentPrice) / initialPrice
                          : 0;
                      const hasSaving = priceDiff >= 0.01;
                      const savingPct = hasSaving ? Math.round(priceDiff * 100) : 0;

                      return (
                        <div
                          key={category.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-gray-200 p-4"
                          data-testid={`guest-category-${category.id}`}
                        >
                          <div className="min-w-0 pt-1">
                            <p className="font-medium text-gray-900">
                              {formatLabel(category.label)}
                            </p>
                            <p className="text-sm text-gray-500">
                              {category.unitPrice?.grossFormattedText ?? '—'} per person
                            </p>
                            {hasSaving && (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-gray-400 line-through">
                                  {new Intl.NumberFormat(undefined, {
                                    style: 'currency',
                                    currency: category.unitPrice?.currency ?? 'GBP',
                                  }).format(initialPrice)}
                                </span>
                                <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                                  Save {savingPct}%
                                </span>
                              </div>
                            )}
                            {category.minParticipants > 0 && (
                              <p className="text-xs text-gray-400">
                                Min: {category.minParticipants}
                              </p>
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
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M19.5 12h-15"
                                />
                              </svg>
                            </button>
                            <span className="w-8 text-center font-medium text-gray-900">
                              {categoryUnits[category.id] ?? 0}
                            </span>
                            <button
                              onClick={() => handleUnitChange(category.id, 1)}
                              disabled={
                                (categoryUnits[category.id] ?? 0) >=
                                  (categoryMaxRef.current.get(category.id) ??
                                    (category.maxParticipants || 99)) ||
                                (!!maxGuestsCap && totalGuests >= maxGuestsCap)
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
                      );
                    })}

                    {/* Max guests message */}
                    {(() => {
                      const categoryCaps = pricingCategories
                        .map((c) => categoryMaxRef.current.get(c.id) ?? c.maxParticipants)
                        .filter((v): v is number => v != null && v > 0);
                      const lowestCategoryCap =
                        categoryCaps.length > 0 ? Math.min(...categoryCaps) : null;
                      const effectiveCap = [maxGuestsCap, lowestCategoryCap]
                        .filter((v): v is number => v != null && v > 0)
                        .sort((a, b) => a - b)[0];
                      if (!effectiveCap) return null;
                      return (
                        <p className="text-xs text-gray-500">
                          Maximum {effectiveCap} {effectiveCap === 1 ? 'guest' : 'guests'} per
                          booking
                        </p>
                      );
                    })()}

                    {/* Price discrepancy notice */}
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
                        <div className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2.5 text-xs text-blue-700">
                          <p className="font-medium">Just a heads up on pricing!</p>
                          <p className="mt-0.5 text-blue-500">
                            We have noticed that the per-person pricing is slightly higher than what
                            you saw before. Our apologies for this. However, this is completely
                            normal, pricing varies by date, group size, and availability. All prices
                            come directly from our incredible suppliers.
                          </p>
                        </div>
                      );
                    })()}
                    {pricingCategories.length === 0 && (
                      <p className="py-4 text-center text-sm text-gray-500">
                        Loading pricing options...
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-gray-200 px-6 py-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {step === 'pricing' && totalPrice && (
                      <div>
                        <p className="text-sm text-gray-500">
                          {totalGuests} {totalGuests === 1 ? 'guest' : 'guests'}
                          {totalGuests > 0 && (
                            <span className="ml-1 text-gray-400">
                              &middot;{' '}
                              {new Intl.NumberFormat(undefined, {
                                style: 'currency',
                                currency: totalPrice.currency,
                              }).format(totalPrice.amount / totalGuests)}
                              /person
                            </span>
                          )}
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
        </div>

        {/* RIGHT PANEL — Product summary (hidden on mobile) */}
        <div className="hidden w-72 shrink-0 flex-col border-l border-gray-200 bg-gray-50 p-5 lg:flex">
          <button
            onClick={onClose}
            className="mb-4 self-end rounded-full p-2 text-gray-400 hover:bg-gray-200 hover:text-gray-500"
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

          <BookingSummaryPanel
            productName={productName}
            productImage={productImage}
            selectedDate={selectedSlot?.date}
            selectedOptions={selectedOptionsSummary}
            totalGuests={totalGuests}
            totalPrice={totalPrice}
            primaryColor={primaryColor}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
