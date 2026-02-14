/**
 * Booking Flow Service
 *
 * Client-side utilities to orchestrate the Holibob Look-to-Book flow.
 * Handles availability discovery, option configuration, and booking creation.
 */

// Types for availability flow
export interface AvailabilitySlot {
  id: string;
  date: string;
  guidePriceFormattedText?: string;
  soldOut: boolean;
}

export interface AvailabilityOption {
  id: string;
  label: string;
  value?: string;
  dataType: string;
  dataFormat?: string;
  availableOptions?: Array<{ label: string; value: string }>;
  answerValue?: string;
  answerFormattedText?: string;
  required?: boolean;
}

export interface PricingCategory {
  id: string;
  label: string;
  minParticipants: number;
  maxParticipants: number;
  maxParticipantsDepends?: {
    pricingCategoryId: string;
    multiplier: number;
    explanation: string;
  };
  units: number;
  unitPrice: {
    netFormattedText: string;
    grossFormattedText: string;
    gross: number;
    net: number;
    currency: string;
  };
  totalPrice?: {
    grossFormattedText: string;
    gross: number;
    currency: string;
  };
}

export interface AvailabilityListResponse {
  sessionId: string;
  nodes: AvailabilitySlot[];
  optionList: {
    nodes: AvailabilityOption[];
  };
}

export interface AvailabilityDetail {
  id: string;
  date: string;
  optionList?: {
    isComplete: boolean;
    nodes: AvailabilityOption[];
  };
  maxParticipants?: number;
  minParticipants?: number;
  isValid?: boolean;
  totalPrice?: {
    grossFormattedText: string;
    netFormattedText: string;
    gross: number;
    net: number;
    currency: string;
  };
  pricingCategoryList?: {
    nodes: PricingCategory[];
  };
}

export interface BookingQuestion {
  id: string;
  label: string;
  type: string;
  dataType: string;
  dataFormat?: string;
  answerValue?: string;
  isRequired: boolean;
  autoCompleteValue?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface BookingPerson {
  id: string;
  pricingCategoryLabel?: string;
  isQuestionsComplete?: boolean;
  questionList?: {
    nodes: BookingQuestion[];
  };
}

export interface BookingAvailability {
  id: string;
  date: string;
  startTime?: string;
  product?: {
    id: string;
    name: string;
    shortDescription?: string;
    imageList?: { nodes: Array<{ url: string }> };
  };
  totalPrice?: {
    grossFormattedText: string;
    gross: number;
    currency: string;
  };
  questionList?: {
    nodes: BookingQuestion[];
  };
  personList?: {
    nodes: BookingPerson[];
  };
}

export interface Booking {
  id: string;
  code?: string;
  state?: 'OPEN' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';
  status?: 'OPEN' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'COMPLETED';
  canCommit?: boolean;
  isComplete?: boolean;
  voucherUrl?: string;
  leadPassengerName?: string;
  partnerExternalReference?: string;
  currency?: string;
  totalPrice?: {
    grossFormattedText: string;
    gross: number;
    currency: string;
  };
  questionList?: {
    nodes: BookingQuestion[];
  };
  availabilityList?: {
    nodes: BookingAvailability[];
  };
}

// API response types
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

/**
 * Fetch availability slots for a product within a date range
 */
export async function fetchAvailability(
  productId: string,
  dateFrom: string,
  dateTo: string
): Promise<AvailabilityListResponse> {
  const params = new URLSearchParams({
    productId,
    dateFrom,
    dateTo,
  });

  const response = await fetch(`/api/availability?${params}`);
  const result: ApiResponse<AvailabilityListResponse> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to fetch availability');
  }

  return result.data;
}

/**
 * Get availability details with options
 */
export async function getAvailabilityDetails(
  availabilityId: string,
  includePricing = false
): Promise<AvailabilityDetail> {
  const params = includePricing ? '?includePricing=true' : '';
  const response = await fetch(`/api/availability/${availabilityId}${params}`);
  const result: ApiResponse<AvailabilityDetail> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to fetch availability details');
  }

  return result.data;
}

/**
 * Set options for an availability (time slot, variant, etc.)
 * Must be called iteratively until optionList.isComplete = true
 */
export async function setAvailabilityOptions(
  availabilityId: string,
  options: Array<{ id: string; value: string }>
): Promise<AvailabilityDetail> {
  const response = await fetch(`/api/availability/${availabilityId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ optionList: options }),
  });

  const result: ApiResponse<AvailabilityDetail> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to set availability options');
  }

  return result.data;
}

/**
 * Set pricing categories (guest counts) for an availability
 */
export async function setPricingCategories(
  availabilityId: string,
  categories: Array<{ id: string; units: number }>
): Promise<AvailabilityDetail> {
  const response = await fetch(`/api/availability/${availabilityId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pricingCategoryList: categories }),
  });

  const result: ApiResponse<AvailabilityDetail> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to set pricing categories');
  }

  return result.data;
}

/**
 * Create a new booking (basket)
 */
export async function createBooking(): Promise<Booking> {
  const response = await fetch('/api/booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoFillQuestions: true,
    }),
  });

  const result: ApiResponse<Booking> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to create booking');
  }

  return result.data;
}

/**
 * Add configured availability to a booking
 */
export async function addAvailabilityToBooking(
  bookingId: string,
  availabilityId: string
): Promise<{ canCommit: boolean; booking: Booking }> {
  const response = await fetch(`/api/booking/${bookingId}/availability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ availabilityId }),
  });

  const result: ApiResponse<{ canCommit: boolean; booking: Booking }> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to add availability to booking');
  }

  return result.data;
}

/**
 * Get booking with questions at all levels
 */
export async function getBookingQuestions(bookingId: string): Promise<{
  booking: Booking;
  summary: {
    bookingQuestions: BookingQuestion[];
    availabilityQuestions: Array<{
      availabilityId: string;
      productName?: string;
      date: string;
      questions: BookingQuestion[];
      personQuestions: Array<{
        personId: string;
        category?: string;
        isComplete: boolean;
        questions: BookingQuestion[];
      }>;
    }>;
    canCommit: boolean;
  };
}> {
  const response = await fetch(`/api/booking/${bookingId}/questions`);
  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to fetch booking questions');
  }

  return result.data;
}

/**
 * Answer booking questions using simplified format
 */
export async function answerBookingQuestions(
  bookingId: string,
  data: {
    customerEmail?: string;
    customerPhone?: string;
    guests: Array<{
      firstName: string;
      lastName: string;
      email?: string;
      phone?: string;
      isLeadGuest?: boolean;
    }>;
    termsAccepted?: boolean;
    availabilityAnswers?: Array<{ questionId: string; value: string }>;
    questionAnswers?: Array<{ questionId: string; value: string }>;
  }
): Promise<{ canCommit: boolean; booking: Booking }> {
  const response = await fetch(`/api/booking/${bookingId}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  const result: ApiResponse<{ canCommit: boolean; booking: Booking }> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to answer booking questions');
  }

  return result.data;
}

/**
 * Commit a booking (finalize)
 * @param bookingId - The Holibob booking ID
 * @param waitForConfirmation - Whether to wait for supplier confirmation
 * @param productId - Optional product ID for booking analytics (urgency messaging)
 */
export async function commitBooking(
  bookingId: string,
  waitForConfirmation = true,
  productId?: string
): Promise<{
  booking: Booking;
  voucherUrl?: string;
  isConfirmed: boolean;
}> {
  const response = await fetch('/api/booking/commit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bookingId,
      waitForConfirmation,
      maxWaitSeconds: 60,
      productId,
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to commit booking');
  }

  return result.data;
}

/**
 * Get booking details
 */
export async function getBooking(bookingId: string): Promise<Booking> {
  const response = await fetch(`/api/booking?id=${bookingId}`);
  const result: ApiResponse<Booking> = await response.json();

  if (!response.ok || !result.success) {
    throw new Error(result.error ?? 'Failed to fetch booking');
  }

  return result.data;
}

/**
 * Complete availability configuration flow
 * Returns a fully configured availability ready to add to booking
 */
export async function configureAvailability(
  availabilityId: string,
  options: Array<{ id: string; value: string }>,
  pricingCategories: Array<{ id: string; units: number }>
): Promise<AvailabilityDetail> {
  // Step 1: Set options iteratively until complete
  let availability = await setAvailabilityOptions(availabilityId, options);

  // Keep setting options until complete
  while (!availability.optionList?.isComplete) {
    // In a real scenario, we'd need to handle new options that appear
    // For now, we assume the provided options are sufficient
    break;
  }

  // Step 2: Set pricing categories
  availability = await setPricingCategories(availabilityId, pricingCategories);

  // Step 3: Verify validity
  if (!availability.isValid) {
    throw new Error('Availability configuration is not valid');
  }

  return availability;
}

/**
 * Create booking and add availability in one flow
 * Returns booking ID ready for checkout
 */
export async function startBookingFlow(availabilityId: string): Promise<string> {
  // Step 1: Create booking
  const booking = await createBooking();

  // Step 2: Add availability to booking
  await addAvailabilityToBooking(booking.id, availabilityId);

  return booking.id;
}

/**
 * Format date for display
 */
export function formatDate(dateString: string): string {
  try {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return dateString;
  }
}

/**
 * Format price for display
 */
export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
  }).format(amount / 100);
}
