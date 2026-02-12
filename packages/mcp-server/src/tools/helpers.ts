import type { Booking } from '@experience-marketplace/holibob-api/types';

export type NextAction = {
  tool: string;
  reason: string;
};

export interface StructuredError {
  code: string;
  message: string;
  nextActions: NextAction[];
  missing?: string[];
}

export function classifyError(error: unknown, context?: { bookingId?: string; slotId?: string }): StructuredError {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('question is not answered') || message.includes('BOOKING_COMMIT_ERROR')) {
    return {
      code: 'MISSING_REQUIRED_QUESTIONS',
      message,
      nextActions: [{ tool: 'get_booking_questions', reason: 'Check which questions still need answers' }],
    };
  }

  if (message.includes('payment') || message.includes('requires_payment_method')) {
    return {
      code: 'PAYMENT_REQUIRED',
      message: 'Payment must be completed before committing the booking.',
      nextActions: [{ tool: 'get_payment_info', reason: 'Get Stripe payment details' }],
    };
  }

  if (message.includes('availability') || message.includes('AVAILABILITY_ERROR')) {
    return {
      code: 'SLOT_NOT_CONFIGURED',
      message: 'The availability slot is not fully configured.',
      nextActions: [
        { tool: 'get_slot_options', reason: 'Check/answer configuration options' },
        { tool: 'get_slot_pricing', reason: 'Set pricing after options are complete' },
      ],
    };
  }

  if (message.includes('not found') || message.includes('NOT_FOUND')) {
    return {
      code: 'NOT_FOUND',
      message,
      nextActions: [],
    };
  }

  if (message.includes('sold out') || message.includes('SOLD_OUT')) {
    return {
      code: 'AVAILABILITY_SOLD_OUT',
      message: 'This slot is sold out. Try a different date or time.',
      nextActions: [{ tool: 'check_availability', reason: 'Check other available dates' }],
    };
  }

  return {
    code: 'UNKNOWN_ERROR',
    message,
    nextActions: [],
  };
}

/**
 * Compute a high-level booking phase from the booking's state fields.
 * DRAFT → NEEDS_QUESTIONS → NEEDS_PAYMENT → READY_TO_COMMIT → COMMITTED_PENDING → CONFIRMED
 */
export function computeBookingPhase(booking: Booking): string {
  if (booking.state === 'CONFIRMED' || booking.state === 'COMPLETED') return 'CONFIRMED';
  if (booking.state === 'PENDING') return 'COMMITTED_PENDING';
  if (booking.state === 'CANCELLED' || booking.state === 'REJECTED') return booking.state;

  // OPEN state — determine sub-phase
  if (!booking.availabilityList?.nodes?.length) return 'DRAFT';
  if (booking.paymentState === 'AWAITING_PAYMENT') return 'NEEDS_PAYMENT';
  if (booking.canCommit) return 'READY_TO_COMMIT';
  return 'NEEDS_QUESTIONS';
}

/**
 * Collect unanswered required questions from all levels of a booking.
 */
export function collectMissingQuestions(booking: Booking): string[] {
  const missing: string[] = [];

  booking.questionList?.nodes?.forEach((q) => {
    if (!q.answerValue && q.isRequired) missing.push(q.label);
  });

  booking.availabilityList?.nodes?.forEach((avail) => {
    avail.questionList?.nodes?.forEach((q) => {
      if (!q.answerValue && q.isRequired) missing.push(q.label);
    });
    avail.personList?.nodes?.forEach((person) => {
      person.questionList?.nodes?.forEach((q) => {
        if (!q.answerValue && q.isRequired) {
          missing.push(`${person.pricingCategoryLabel ?? 'Guest'}: ${q.label}`);
        }
      });
    });
  });

  return missing;
}
