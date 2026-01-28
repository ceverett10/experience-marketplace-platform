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

// Answer questions request schema
const AnswerQuestionsSchema = z.object({
  // Booking-level questions
  questionList: z.array(QuestionAnswerSchema).optional(),
  // Availability-level and person-level questions
  availabilityList: z.array(AvailabilityQuestionsSchema).optional(),
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
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    // Extract questions summary for easier consumption
    const questionsSummary = {
      bookingQuestions: booking.questionList?.nodes ?? [],
      availabilityQuestions: booking.availabilityList?.nodes.map((avail: BookingAvailabilityNode) => ({
        availabilityId: avail.id,
        productName: avail.product?.name,
        date: avail.date,
        questions: avail.questionList?.nodes ?? [],
        personQuestions: avail.personList?.nodes.map((person: BookingPersonNode) => ({
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
        return NextResponse.json(
          { error: 'Booking not found' },
          { status: 404 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to fetch booking questions' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/booking/[id]/questions - Answer booking questions
 * Body:
 * - questionList: Array of { id, value } for booking-level questions
 * - availabilityList: Array of { id, questionList, personList } for nested questions
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

    // Ensure at least one question is being answered
    const hasBookingQuestions = input.questionList && input.questionList.length > 0;
    const hasAvailabilityQuestions = input.availabilityList && input.availabilityList.length > 0;

    if (!hasBookingQuestions && !hasAvailabilityQuestions) {
      return NextResponse.json(
        { error: 'At least one question answer must be provided' },
        { status: 400 }
      );
    }

    // Get site configuration
    const headersList = await headers();
    const host = headersList.get('host') ?? 'localhost:3000';
    const site = await getSiteFromHostname(host);

    // Get Holibob client
    const client = getHolibobClient(site);

    // Answer questions
    const booking = await client.answerBookingQuestions(bookingId, input);

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
        return NextResponse.json(
          { error: 'Booking not found' },
          { status: 404 }
        );
      }
      if (error.message.includes('invalid')) {
        return NextResponse.json(
          { error: error.message },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: 'Failed to answer booking questions' },
      { status: 500 }
    );
  }
}
