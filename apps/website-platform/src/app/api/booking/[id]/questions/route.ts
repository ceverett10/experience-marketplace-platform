/**
 * Booking Questions API Route
 *
 * GET /api/booking/[id]/questions - Get booking questions at all levels
 * POST /api/booking/[id]/questions - Answer booking questions
 *
 * This implements Holibob Look-to-Book Step 8:
 * - Retrieve questions at Booking, Availability, and Person levels
 * - Answer questions iteratively until canCommit = true
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

// Person questions schema
const PersonQuestionsSchema = z.object({
  id: z.string(),
  questionList: z.array(QuestionAnswerSchema).optional(),
});

// Availability questions schema
const AvailabilityQuestionsSchema = z.object({
  id: z.string(),
  questionList: z.array(QuestionAnswerSchema).optional(),
  personList: z.array(PersonQuestionsSchema).optional(),
});

// Simplified guest schema (for easier frontend integration)
const SimplifiedGuestSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  guestTypeId: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isLeadGuest: z.boolean().optional(),
});

// Answer questions request schema - supports both raw Holibob format and simplified format
const AnswerQuestionsSchema = z.object({
  // Raw Holibob format
  questionList: z.array(QuestionAnswerSchema).optional(),
  availabilityList: z.array(AvailabilityQuestionsSchema).optional(),
  // Simplified format (converted to Holibob format automatically)
  customerEmail: z.string().email().optional(),
  customerPhone: z.string().optional(),
  guests: z.array(SimplifiedGuestSchema).optional(),
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
 * POST /api/booking/[id]/questions - Answer booking questions
 * Body (raw Holibob format):
 * - questionList: Array of { id, value } for booking-level questions
 * - availabilityList: Array of { id, questionList, personList } for nested questions
 *
 * Body (simplified format - automatically converted):
 * - customerEmail: Lead guest email
 * - customerPhone: Lead guest phone (optional)
 * - guests: Array of { firstName, lastName, guestTypeId, email?, phone?, isLeadGuest? }
 *
 * Must iterate until canCommit = true in response
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

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Check if using simplified format (has guests array)
    if (input.guests && input.guests.length > 0) {
      // First, get the current booking with questions to understand the structure
      const currentBooking = await client.getBookingQuestions(bookingId);

      if (!currentBooking) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }

      // Build the questions payload from simplified guest data
      const availabilityList: Array<{
        id: string;
        personList: Array<{
          id: string;
          questionList: Array<{ id: string; value: string }>;
        }>;
      }> = [];

      // Process each availability in the booking
      const availabilities = currentBooking.availabilityList?.nodes ?? [];

      for (const availability of availabilities) {
        const persons = availability.personList?.nodes ?? [];
        const personListData: Array<{
          id: string;
          questionList: Array<{ id: string; value: string }>;
        }> = [];

        // Map guests to persons based on order
        for (let i = 0; i < persons.length && i < input.guests.length; i++) {
          const person = persons[i];
          const guest = input.guests[i];
          const questions = person?.questionList?.nodes ?? [];
          const questionAnswers: Array<{ id: string; value: string }> = [];

          // Map guest data to question answers
          for (const question of questions) {
            const questionLabel = question.label?.toLowerCase() ?? '';
            let value: string | undefined;

            if (questionLabel.includes('first') && questionLabel.includes('name')) {
              value = guest?.firstName;
            } else if (questionLabel.includes('last') && questionLabel.includes('name')) {
              value = guest?.lastName;
            } else if (questionLabel.includes('email')) {
              value = guest?.email ?? (guest?.isLeadGuest ? input.customerEmail : undefined);
            } else if (
              questionLabel.includes('phone') ||
              questionLabel.includes('mobile') ||
              questionLabel.includes('telephone')
            ) {
              value = guest?.phone ?? (guest?.isLeadGuest ? input.customerPhone : undefined);
            }

            if (value && question.id) {
              questionAnswers.push({ id: question.id, value });
            }
          }

          if (questionAnswers.length > 0 && person?.id) {
            personListData.push({
              id: person.id,
              questionList: questionAnswers,
            });
          }
        }

        if (personListData.length > 0 && availability.id) {
          availabilityList.push({
            id: availability.id,
            personList: personListData,
          });
        }
      }

      // Answer questions with converted data
      const booking = await client.answerBookingQuestions(bookingId, { availabilityList });

      return NextResponse.json({
        success: true,
        data: {
          canCommit: booking.canCommit ?? false,
          booking,
        },
      });
    }

    // Using raw Holibob format
    const hasBookingQuestions = input.questionList && input.questionList.length > 0;
    const hasAvailabilityQuestions = input.availabilityList && input.availabilityList.length > 0;

    if (!hasBookingQuestions && !hasAvailabilityQuestions) {
      return NextResponse.json(
        { error: 'At least one question answer must be provided' },
        { status: 400 }
      );
    }

    // Answer questions
    const booking = await client.answerBookingQuestions(bookingId, {
      questionList: input.questionList,
      availabilityList: input.availabilityList,
    });

    return NextResponse.json({
      success: true,
      data: {
        canCommit: booking.canCommit ?? false,
        booking,
      },
    });
  } catch (error) {
    console.error('Answer booking questions error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
      }
      if (error.message.includes('invalid')) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    return NextResponse.json({ error: 'Failed to answer booking questions' }, { status: 500 });
  }
}
