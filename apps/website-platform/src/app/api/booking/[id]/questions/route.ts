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

// Types for booking availability and person (matching Holibob API structure)
interface BookingQuestionNode {
  id: string;
  label: string;
  answerValue?: string | null;
  type?: string;
  dataType?: string;
  isRequired?: boolean;
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

// Answer questions request schema
const AnswerQuestionsSchema = z.object({
  // Raw Holibob format - booking level questions only
  questionList: z.array(QuestionAnswerSchema).optional(),
  // Simplified format (converted to Holibob format automatically)
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  guests: z.array(SimplifiedGuestSchema).optional(),
  termsAccepted: z.boolean().optional(),
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

    return NextResponse.json({
      success: true,
      data: {
        booking,
        summary: questionsSummary,
      },
    });
  } catch (error) {
    console.error('Get booking questions error:', error);

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

      // Get availabilities with person questions
      const availabilities = booking.availabilityList?.nodes ?? [];

      for (const availability of availabilities) {
        const persons = availability.personList?.nodes ?? [];

        for (let i = 0; i < persons.length; i++) {
          const person = persons[i];
          const guestData = input.guests[i] || input.guests[0]; // Use first guest data as fallback
          const questions = person.questionList?.nodes ?? [];

          console.log(`[Questions API] Person ${i + 1} has ${questions.length} questions`);

          // Find and answer common questions
          for (const question of questions) {
            const label = question.label?.toLowerCase() ?? '';
            let answerValue: string | undefined;

            // Map question labels to guest data
            if (label.includes('first') && label.includes('name')) {
              answerValue = guestData.firstName;
            } else if (label.includes('last') && label.includes('name') || label.includes('surname')) {
              answerValue = guestData.lastName;
            } else if (label.includes('email')) {
              answerValue = input.customerEmail || guestData.email;
            } else if (label.includes('phone') || label.includes('mobile') || label.includes('telephone')) {
              answerValue = input.customerPhone || guestData.phone;
            } else if (label.includes('full name') || label === 'name') {
              answerValue = `${guestData.firstName} ${guestData.lastName}`;
            }

            if (answerValue && !question.answerValue) {
              console.log(`[Questions API] Answering question "${question.label}" with "${answerValue}"`);
              // Note: Individual question answering might need a different API call
              // For now, log what we would answer
            }
          }
        }
      }

      // Try to answer booking-level questions using the booking query with input
      // Note: This is the Holibob way to answer questions
      try {
        const bookingQuestions = booking.questionList?.nodes ?? [];
        const questionAnswers: Array<{ id: string; value: string }> = [];

        for (const question of bookingQuestions) {
          const label = question.label?.toLowerCase() ?? '';

          // Use existing answerValue if already filled, otherwise fill from guest data
          // Note: autoCompleteValue is just a hint for browser autocomplete, NOT the actual answer
          let answerValue: string | undefined = question.answerValue;

          // Fill from guest data if not already answered
          if (!answerValue) {
            if (label.includes('first') && label.includes('name')) {
              answerValue = input.guests[0].firstName;
            } else if ((label.includes('last') && label.includes('name')) || label.includes('surname') || label.includes('family')) {
              answerValue = input.guests[0].lastName;
            } else if (label.includes('email')) {
              answerValue = input.customerEmail;
            } else if (label.includes('phone') || label.includes('tel') || label.includes('mobile')) {
              answerValue = input.customerPhone;
            } else if (label.includes('full name') || label === 'name') {
              answerValue = `${input.guests[0].firstName} ${input.guests[0].lastName}`;
            }
          }

          if (answerValue) {
            questionAnswers.push({ id: question.id, value: answerValue });
          }
        }

        if (questionAnswers.length > 0) {
          console.log('[Questions API] Sending question answers to Holibob:', JSON.stringify(questionAnswers, null, 2));

          // Introspect BookingInput to find correct field names
          try {
            const introspectionQuery = `
              query IntrospectBookingInput {
                __type(name: "BookingInput") {
                  name
                  inputFields {
                    name
                    type {
                      name
                      kind
                      ofType {
                        name
                        kind
                      }
                    }
                  }
                }
              }
            `;
            const introspectionResult = await (client as any).client.request(introspectionQuery);
            console.log('[Questions API] BookingInput schema:', JSON.stringify(introspectionResult, null, 2));
          } catch (introspectError) {
            console.error('[Questions API] Failed to introspect schema:', introspectError);
          }

          // Try different input formats based on what Holibob might accept
          // Format 1: Try with answerList instead of questionList
          try {
            const answeredBooking = await client.answerBookingQuestions(bookingId, {
              answerList: questionAnswers,
            } as any);
            console.log('[Questions API] Format 1 (answerList) worked! canCommit:', answeredBooking.canCommit);
            booking = answeredBooking;
          } catch (error1) {
            console.log('[Questions API] Format 1 (answerList) failed');

            // Format 2: Try with questions array
            try {
              const answeredBooking = await client.answerBookingQuestions(bookingId, {
                questions: questionAnswers,
              } as any);
              console.log('[Questions API] Format 2 (questions) worked! canCommit:', answeredBooking.canCommit);
              booking = answeredBooking;
            } catch (error2) {
              console.log('[Questions API] Format 2 (questions) failed');

              // Re-fetch to get current state
              booking = await client.getBookingQuestions(bookingId);
            }
          }
        }

        console.log('[Questions API] Final canCommit:', booking.canCommit);
      } catch (answerError) {
        console.error('[Questions API] Error answering questions:', answerError);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        canCommit: booking.canCommit ?? false,
        booking,
        // Store lead person details for reference (display purposes)
        leadPerson: input.guests?.[0] ? {
          firstName: input.guests[0].firstName,
          lastName: input.guests[0].lastName,
          email: input.customerEmail,
          phone: input.customerPhone,
        } : null,
      },
    });
  } catch (error) {
    console.error('Process booking questions error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Failed to process booking' }, { status: 500 });
  }
}
