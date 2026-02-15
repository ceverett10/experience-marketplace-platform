/**
 * Booking Questions API Route
 *
 * GET /api/booking/[id]/questions - Get booking questions at all levels
 * POST /api/booking/[id]/questions - Answer booking questions
 *
 * This implements Holibob Look-to-Book Step 8:
 * - Retrieve questions at Booking, Availability, and Person levels
 * - Answer questions iteratively until canCommit = true
 *
 * NOTE: With autoFillQuestions: true, most questions are auto-filled.
 * We only need to collect lead person details (name, email, phone).
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { getSiteFromHostname } from '@/lib/tenant';
import { getHolibobClient } from '@/lib/holibob';
import { trackFunnelEvent, BookingFunnelStep } from '@/lib/funnel-tracking';

// Types for booking availability and person (matching Holibob API structure)
interface BookingQuestionNode {
  id: string;
  label: string;
  answerValue?: string | null;
  type?: string;
  dataType?: string;
  dataFormat?: string;
  isRequired?: boolean;
  availableOptions?: Array<{ label: string; value: string }>;
}

interface BookingAvailabilityNode {
  id: string;
  date: string;
  product?: { name: string };
  questionList?: { nodes: BookingQuestionNode[] };
  personList?: { nodes: BookingPersonNode[] };
}

interface BookingPersonNode {
  id: string;
  pricingCategoryLabel?: string;
  isQuestionsComplete?: boolean;
  questionList?: { nodes: BookingQuestionNode[] };
}

// Question answer schema
const QuestionAnswerSchema = z.object({
  id: z.string(),
  value: z.string(),
});

// Simplified guest schema (for easier frontend integration)
const SimplifiedGuestSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isLeadGuest: z.boolean().optional(),
});

// Availability answer schema
const AvailabilityAnswerSchema = z.object({
  questionId: z.string(),
  value: z.string(),
});

// Answer questions request schema
const AnswerQuestionsSchema = z.object({
  // Raw Holibob format - booking level questions only
  questionList: z.array(QuestionAnswerSchema).optional(),
  // Simplified format (converted to Holibob format automatically)
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  guests: z.array(SimplifiedGuestSchema).optional(),
  termsAccepted: z.boolean().optional(),
  // Availability-level answers (e.g., risk waivers)
  availabilityAnswers: z.array(AvailabilityAnswerSchema).optional(),
  // Arbitrary question answers from dynamic form fields
  questionAnswers: z.array(AvailabilityAnswerSchema).optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/booking/[id]/questions - Get all booking questions
 * Returns questions at three levels:
 * - Booking level (general questions)
 * - Availability level (per-experience questions)
 * - Person level (per-guest questions)
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  try {
    const { id: bookingId } = await params;

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Fetch booking with questions
    const booking = await client.getBookingQuestions(bookingId);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Extract questions summary for easier consumption
    const questionsSummary = {
      bookingQuestions: booking.questionList?.nodes ?? [],
      availabilityQuestions:
        booking.availabilityList?.nodes.map((avail: BookingAvailabilityNode) => ({
          availabilityId: avail.id,
          productName: avail.product?.name,
          date: avail.date,
          questions: avail.questionList?.nodes ?? [],
          personQuestions:
            avail.personList?.nodes.map((person: BookingPersonNode) => ({
              personId: person.id,
              category: person.pricingCategoryLabel,
              isComplete: person.isQuestionsComplete,
              questions: person.questionList?.nodes ?? [],
            })) ?? [],
        })) ?? [],
      canCommit: booking.canCommit ?? false,
    };

    trackFunnelEvent({ step: BookingFunnelStep.CHECKOUT_LOADED, siteId: site.id, bookingId, durationMs: Date.now() - startTime });
    return NextResponse.json({
      success: true,
      data: {
        booking,
        summary: questionsSummary,
      },
    });
  } catch (error) {
    console.error('Get booking questions error:', error);

    trackFunnelEvent({ step: BookingFunnelStep.CHECKOUT_LOADED, siteId: 'unknown', errorCode: 'CHECKOUT_LOAD_ERROR', errorMessage: error instanceof Error ? error.message : 'Unknown error', durationMs: Date.now() - startTime });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to fetch booking questions' }, { status: 500 });
  }
}

/**
 * POST /api/booking/[id]/questions - Mark booking ready for commit
 *
 * With autoFillQuestions: true, questions are auto-filled by Holibob.
 * This endpoint validates the lead person details were collected and
 * confirms the booking is ready to commit.
 *
 * NOTE: The Holibob API with autoFillQuestions: true handles all question
 * answering automatically. We don't need to send question answers separately.
 * This endpoint just validates and returns the booking state.
 *
 * Body (simplified format):
 * - customerEmail: Lead guest email
 * - customerPhone: Lead guest phone (optional)
 * - guests: Array of { firstName, lastName }
 * - termsAccepted: boolean
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const startTime = Date.now();
  try {
    const { id: bookingId } = await params;

    // Parse and validate request body
    const body = await request.json();
    const validationResult = AnswerQuestionsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const input = validationResult.data;

    // Validate terms accepted
    if (!input.termsAccepted) {
      return NextResponse.json(
        { error: 'You must accept the terms and conditions' },
        { status: 400 }
      );
    }

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Get the current booking state with questions
    let booking = await client.getBookingQuestions(bookingId);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    console.log('[Questions API] Initial canCommit:', booking.canCommit);

    // If canCommit is false, we need to answer the person-level questions
    // Build question answers from the guest data
    if (!booking.canCommit && input.guests && input.guests.length > 0) {
      console.log('[Questions API] Attempting to answer person questions...');

      // Build answer list for all questions (booking, availability, and person levels)
      // Per Holibob docs: answerList uses { questionId, value } format
      const answerList: Array<{ questionId: string; value: string }> = [];

      // Helper to add answers for a question list
      const guests = input.guests!; // We've already checked input.guests exists above
      const processQuestions = (
        questions: Array<{ id: string; label?: string; answerValue?: string | null }>,
        guestIndex = 0
      ) => {
        const guestData = guests[guestIndex] ?? guests[0];
        if (!guestData) return; // Safety check

        for (const question of questions) {
          // Skip if already answered
          if (question.answerValue) continue;

          const label = question.label?.toLowerCase() ?? '';
          let answerValue: string | undefined;

          // Map question labels to guest data
          if (label.includes('first') && label.includes('name')) {
            answerValue = guestData.firstName;
          } else if (
            (label.includes('last') && label.includes('name')) ||
            label.includes('surname') ||
            label.includes('family')
          ) {
            answerValue = guestData.lastName;
          } else if (label.includes('email')) {
            answerValue = input.customerEmail ?? guestData.email;
          } else if (label.includes('phone') || label.includes('tel') || label.includes('mobile')) {
            answerValue = input.customerPhone ?? guestData.phone;
          } else if (label.includes('full name') || label === 'name') {
            answerValue = `${guestData.firstName} ${guestData.lastName}`;
          }

          if (answerValue) {
            answerList.push({ questionId: question.id, value: answerValue });
          }
        }
      };

      // Process booking-level questions
      const bookingQuestions = booking.questionList?.nodes ?? [];
      processQuestions(bookingQuestions);

      // Process availability and person-level questions
      const availabilities = booking.availabilityList?.nodes ?? [];
      for (const availability of availabilities) {
        // Availability-level questions
        const availQuestions = availability.questionList?.nodes ?? [];
        processQuestions(availQuestions);

        // Person-level questions
        const persons = availability.personList?.nodes ?? [];
        for (let i = 0; i < persons.length; i++) {
          const person = persons[i];
          if (person) {
            const personQuestions = person.questionList?.nodes ?? [];
            processQuestions(personQuestions, i);
          }
        }
      }

      // Add availability-level answers (e.g., risk waivers)
      if (input.availabilityAnswers && input.availabilityAnswers.length > 0) {
        for (const answer of input.availabilityAnswers) {
          answerList.push({
            questionId: answer.questionId,
            value: answer.value,
          });
        }
      }

      // Add arbitrary question answers from dynamic form fields
      if (input.questionAnswers && input.questionAnswers.length > 0) {
        for (const answer of input.questionAnswers) {
          // Avoid duplicating answers already set by label-matching
          if (!answerList.some((a) => a.questionId === answer.questionId)) {
            answerList.push({
              questionId: answer.questionId,
              value: answer.value,
            });
          }
        }
      }

      // Build the lead passenger name
      const leadGuest = guests[0];
      const leadPassengerName = leadGuest ? `${leadGuest.firstName} ${leadGuest.lastName}` : '';

      console.log('[Questions API] Lead passenger:', leadPassengerName);
      console.log('[Questions API] Answer list:', JSON.stringify(answerList, null, 2));

      // Submit answers to Holibob
      if (answerList.length > 0 || leadPassengerName) {
        try {
          const answeredBooking = await client.answerBookingQuestions(bookingId, {
            leadPassengerName,
            answerList,
          });
          console.log('[Questions API] Holibob response canCommit:', answeredBooking.canCommit);
          booking = answeredBooking;

          // Log remaining unanswered questions
          if (!answeredBooking.canCommit) {
            console.log('[Questions API] === REMAINING UNANSWERED QUESTIONS ===');

            // Booking-level - show ALL unanswered
            const unansweredBooking = (answeredBooking.questionList?.nodes ?? []).filter(
              (q: { answerValue?: string | null }) => !q.answerValue
            );
            if (unansweredBooking.length > 0) {
              console.log(
                '[Questions API] Booking-level:',
                JSON.stringify(unansweredBooking, null, 2)
              );
            }

            // Availability and Person-level
            for (const avail of answeredBooking.availabilityList?.nodes ?? []) {
              const unansweredAvail = (avail.questionList?.nodes ?? []).filter(
                (q: { answerValue?: string | null }) => !q.answerValue
              );
              if (unansweredAvail.length > 0) {
                console.log(
                  `[Questions API] Availability ${avail.id}:`,
                  JSON.stringify(unansweredAvail, null, 2)
                );
              }

              for (const person of avail.personList?.nodes ?? []) {
                // Check isQuestionsComplete flag
                console.log(
                  `[Questions API] Person ${person.id} (${person.pricingCategoryLabel}) isQuestionsComplete:`,
                  person.isQuestionsComplete
                );
                const unansweredPerson = (person.questionList?.nodes ?? []).filter(
                  (q: { answerValue?: string | null }) => !q.answerValue
                );
                if (unansweredPerson.length > 0) {
                  console.log(
                    `[Questions API] Person ${person.id} unanswered:`,
                    JSON.stringify(unansweredPerson, null, 2)
                  );
                }
              }
            }
            console.log('[Questions API] === END UNANSWERED QUESTIONS ===');
          }
        } catch (answerError) {
          console.error('[Questions API] Error submitting answers:', answerError);
          // Re-fetch to get current state
          booking = await client.getBookingQuestions(bookingId);
        }
      }

      console.log('[Questions API] Final canCommit:', booking.canCommit);
    }

    trackFunnelEvent({
      step: BookingFunnelStep.QUESTIONS_ANSWERED,
      siteId: site.id,
      bookingId,
      durationMs: Date.now() - startTime,
      ...(!booking.canCommit ? { errorCode: 'QUESTIONS_INCOMPLETE', errorMessage: 'canCommit is false after answering questions' } : {}),
    });
    return NextResponse.json({
      success: true,
      data: {
        canCommit: booking.canCommit ?? false,
        booking,
        // Store lead person details for reference (display purposes)
        leadPerson: input.guests?.[0]
          ? {
              firstName: input.guests[0].firstName,
              lastName: input.guests[0].lastName,
              email: input.customerEmail,
              phone: input.customerPhone,
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Process booking questions error:', error);

    trackFunnelEvent({ step: BookingFunnelStep.QUESTIONS_ANSWERED, siteId: 'unknown', errorCode: 'QUESTIONS_ERROR', errorMessage: error instanceof Error ? error.message : 'Unknown error', durationMs: Date.now() - startTime });

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to process booking' }, { status: 500 });
  }
}
