import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import type { Booking, BookingQuestion } from '@experience-marketplace/holibob-api/types';
import type { NextAction } from './helpers.js';
import { classifyError } from './helpers.js';

function formatQuestion(q: BookingQuestion, prefix = ''): string {
  const parts = [
    `${prefix}- **${q.label}** (ID: ${q.id}, Type: ${q.type ?? 'text'})${q.isRequired ? ' *required*' : ''}`,
  ];
  if (q.answerValue) parts.push(`${prefix}  Current answer: ${q.answerValue}`);
  if (q.autoCompleteValue && !q.answerValue)
    parts.push(`${prefix}  Suggested: ${q.autoCompleteValue}`);
  if (q.availableOptions?.length) {
    parts.push(`${prefix}  Options:`);
    q.availableOptions.forEach((o) => parts.push(`${prefix}    - "${o.value}" — ${o.label}`));
  }
  return parts.join('\n');
}

function formatBookingSummary(booking: Booking): string {
  const sections: string[] = [];
  sections.push(`**Booking ID:** ${booking.id}`);
  if (booking.code) sections.push(`**Booking Code:** ${booking.code}`);
  sections.push(`**State:** ${booking.state ?? 'OPEN'}`);

  if (booking.canCommit !== undefined) {
    sections.push(
      `**Ready to commit:** ${booking.canCommit ? 'Yes' : 'No — answer all required questions first'}`
    );
  }

  if (booking.totalPrice) {
    sections.push(
      `**Total:** ${booking.totalPrice.grossFormattedText ?? `${booking.totalPrice.currency} ${booking.totalPrice.gross}`}`
    );
  }

  if (booking.availabilityList?.nodes?.length) {
    sections.push('\n## Items in Booking');
    booking.availabilityList.nodes.forEach((avail) => {
      const name = avail.product?.name ?? 'Experience';
      const price = avail.totalPrice?.grossFormattedText ?? '';
      sections.push(
        `- **${name}** on ${avail.date}${avail.startTime ? ` at ${avail.startTime}` : ''} ${price}`
      );
    });
  }

  if (booking.voucherUrl) {
    sections.push(`\n**Voucher:** ${booking.voucherUrl}`);
  }

  return sections.join('\n');
}

function questionToStructured(q: BookingQuestion) {
  return {
    id: q.id,
    label: q.label,
    type: q.type ?? 'text',
    isRequired: q.isRequired ?? false,
    answerValue: q.answerValue ?? undefined,
    autoCompleteValue: q.autoCompleteValue ?? undefined,
    options: q.availableOptions?.map((o) => ({ value: o.value, label: o.label })) ?? [],
  };
}

function bookingToStructured(booking: Booking) {
  const items =
    booking.availabilityList?.nodes?.map((avail) => ({
      name: avail.product?.name ?? 'Experience',
      date: avail.date,
      startTime: avail.startTime ?? undefined,
      price: avail.totalPrice?.grossFormattedText ?? undefined,
    })) ?? [];

  const bookingQuestions = booking.questionList?.nodes?.map(questionToStructured) ?? [];

  const availabilityQuestions: Array<{
    experienceName: string;
    questions: ReturnType<typeof questionToStructured>[];
  }> = [];
  const personQuestions: Array<{
    personId: string;
    label: string;
    questions: ReturnType<typeof questionToStructured>[];
  }> = [];

  booking.availabilityList?.nodes?.forEach((avail) => {
    const name = avail.product?.name ?? 'Experience';
    const aq = avail.questionList?.nodes?.map(questionToStructured) ?? [];
    if (aq.length) availabilityQuestions.push({ experienceName: name, questions: aq });

    avail.personList?.nodes?.forEach((person) => {
      const pq = person.questionList?.nodes?.map(questionToStructured) ?? [];
      if (pq.length)
        personQuestions.push({
          personId: person.id,
          label: person.pricingCategoryLabel ?? 'Guest',
          questions: pq,
        });
    });
  });

  return {
    bookingId: booking.id,
    bookingCode: booking.code ?? undefined,
    state: booking.state ?? 'OPEN',
    canCommit: booking.canCommit ?? false,
    totalPrice: booking.totalPrice?.grossFormattedText ?? undefined,
    items,
    bookingQuestions,
    availabilityQuestions,
    personQuestions,
    voucherUrl: booking.voucherUrl ?? undefined,
  };
}

export function registerBookingTools(server: McpServer, client: HolibobClient): void {
  registerAppTool(
    server,
    'create_booking',
    {
      title: 'Create Booking',
      description:
        'Create a new booking basket. This is the first step in the booking process after checking availability.',
      inputSchema: {},
      _meta: {},
    },
    async () => {
      const booking = await client.createBooking({ autoFillQuestions: true });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Booking created!\n\n${formatBookingSummary(booking)}\n\nNext: Use add_to_booking to add an availability slot to this booking.`,
          },
        ],
        structuredContent: {
          ...bookingToStructured(booking),
          nextActions: [
            {
              tool: 'add_to_booking',
              reason: 'Add a configured availability slot to this booking',
            },
          ] as NextAction[],
        },
      };
    }
  );

  registerAppTool(
    server,
    'add_to_booking',
    {
      title: 'Add to Booking',
      description:
        'Add a fully configured availability slot to a booking. PREREQUISITE: The slot MUST have isValid=true (from `set_slot_pricing`) before calling this. The required flow is: check_availability → get_slot_options → answer_slot_options → get_slot_pricing → set_slot_pricing (isValid=true) → create_booking → add_to_booking.',
      inputSchema: {
        bookingId: z.string().describe('The booking ID from create_booking'),
        availabilityId: z
          .string()
          .describe('The availability slot ID — must have isValid=true from set_slot_pricing'),
      },
      _meta: {},
    },
    async ({ bookingId, availabilityId }) => {
      try {
        const result = await client.addAvailabilityToBooking({
          bookingSelector: { id: bookingId },
          id: availabilityId,
        });

        const text = result.canCommit
          ? `Availability added to booking ${result.code ?? bookingId}. The booking is ready — use commit_booking to finalize.`
          : `Availability added to booking ${result.code ?? bookingId}. Questions need to be answered before the booking can be committed.\n\nUse get_booking_questions to see what information is needed.`;

        const nextActions: NextAction[] = result.canCommit
          ? [{ tool: 'get_payment_info', reason: 'Check if payment is required before committing' }]
          : [
              {
                tool: 'get_booking_questions',
                reason: 'Get required questions that need answering',
              },
            ];

        return {
          content: [{ type: 'text' as const, text }],
          structuredContent: {
            bookingId: result.id,
            bookingCode: result.code ?? undefined,
            state: result.state ?? 'OPEN',
            canCommit: result.canCommit ?? false,
            nextActions,
          },
        };
      } catch (error) {
        const structured = classifyError(error, { bookingId });
        return {
          content: [
            {
              type: 'text' as const,
              text:
                structured.code === 'SLOT_NOT_CONFIGURED'
                  ? `## Slot Not Ready\n\nThe availability slot could not be added because it is not fully configured.\n\n**Required steps before add_to_booking:**\n1. \`get_slot_options\` — check/answer configuration options\n2. \`get_slot_pricing\` — get pricing categories\n3. \`set_slot_pricing\` — set participant counts (e.g., 2 Adults)\n4. Verify \`isValid = true\` in the response\n\nPlease complete these steps first, then try add_to_booking again.`
                  : `Error adding to booking: ${structured.message}`,
            },
          ],
          structuredContent: { error: structured, nextActions: structured.nextActions },
          isError: true,
        };
      }
    }
  );

  registerAppTool(
    server,
    'get_booking_questions',
    {
      title: 'Booking Questions',
      description:
        'Get all questions that need to be answered for a booking (guest details, contact info, etc.).',
      inputSchema: {
        bookingId: z.string().describe('The booking ID'),
      },
      _meta: {},
    },
    async ({ bookingId }) => {
      const booking = await client.getBookingQuestions(bookingId);
      const sections: string[] = [];

      sections.push(formatBookingSummary(booking));

      // Booking-level questions
      if (booking.questionList?.nodes?.length) {
        const unanswered = booking.questionList.nodes.filter((q) => !q.answerValue);
        if (unanswered.length) {
          sections.push('\n## Booking Questions');
          unanswered.forEach((q) => sections.push(formatQuestion(q)));
        }
      }

      // Availability-level and person-level questions
      if (booking.availabilityList?.nodes?.length) {
        booking.availabilityList.nodes.forEach((avail) => {
          const name = avail.product?.name ?? 'Experience';

          // Availability questions
          const availQuestions = avail.questionList?.nodes?.filter((q) => !q.answerValue) ?? [];
          if (availQuestions.length) {
            sections.push(`\n## Questions for "${name}"`);
            availQuestions.forEach((q) => sections.push(formatQuestion(q)));
          }

          // Person questions
          if (avail.personList?.nodes?.length) {
            avail.personList.nodes.forEach((person) => {
              const personQuestions =
                person.questionList?.nodes?.filter((q) => !q.answerValue) ?? [];
              if (personQuestions.length) {
                sections.push(
                  `\n## Questions for ${person.pricingCategoryLabel ?? 'Guest'} (Person ID: ${person.id})`
                );
                personQuestions.forEach((q) => sections.push(formatQuestion(q, '  ')));
              }
            });
          }
        });
      }

      sections.push('\n---');
      sections.push(
        'Use answer_booking_questions to submit answers. Provide the question IDs and values.'
      );

      // Determine if there are unanswered required questions
      const hasUnanswered = [
        ...(booking.questionList?.nodes ?? []),
        ...(booking.availabilityList?.nodes?.flatMap((a) => [
          ...(a.questionList?.nodes ?? []),
          ...(a.personList?.nodes?.flatMap((p) => p.questionList?.nodes ?? []) ?? []),
        ]) ?? []),
      ].some((q) => !q.answerValue && q.isRequired);

      const nextActions: NextAction[] = hasUnanswered
        ? [
            {
              tool: 'answer_booking_questions',
              reason: 'Answer the required questions listed above',
            },
          ]
        : [
            {
              tool: 'get_payment_info',
              reason: 'All questions answered — check if payment is required',
            },
          ];

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
        structuredContent: { ...bookingToStructured(booking), nextActions },
      };
    }
  );

  registerAppTool(
    server,
    'answer_booking_questions',
    {
      title: 'Answer Questions',
      description:
        'Answer booking questions (guest name, email, phone, etc.). IMPORTANT: You MUST provide leadPassengerName AND answer ALL required questions from get_booking_questions (including NAME_GIVEN, EMAIL, PHONE_NUMBER). After calling this, check canCommit — only call commit_booking when canCommit is true.',
      inputSchema: {
        bookingId: z.string().describe('The booking ID'),
        leadPassengerName: z
          .string()
          .describe('Full name of the lead passenger (REQUIRED, e.g., "John Smith")'),
        answers: z
          .array(
            z.object({
              questionId: z.string().describe('Question ID from get_booking_questions'),
              value: z.string().describe('Answer value'),
            })
          )
          .describe(
            'Array of ALL required question answers — include every question from get_booking_questions'
          ),
      },
      _meta: {},
    },
    async ({ bookingId, leadPassengerName, answers }) => {
      const booking = await client.answerBookingQuestions(bookingId, {
        leadPassengerName,
        answerList: answers,
      });

      const sections: string[] = [];
      sections.push(formatBookingSummary(booking));

      if (booking.canCommit) {
        sections.push('\n**Booking is ready to commit!**');
        sections.push(
          'Use get_payment_info to check if payment is needed, then commit_booking to finalize.'
        );
      } else {
        // Check for remaining unanswered questions
        const remaining: string[] = [];
        booking.questionList?.nodes?.forEach((q) => {
          if (!q.answerValue && q.isRequired) remaining.push(q.label);
        });
        booking.availabilityList?.nodes?.forEach((avail) => {
          avail.questionList?.nodes?.forEach((q) => {
            if (!q.answerValue && q.isRequired) remaining.push(q.label);
          });
          avail.personList?.nodes?.forEach((person) => {
            person.questionList?.nodes?.forEach((q) => {
              if (!q.answerValue && q.isRequired)
                remaining.push(`${person.pricingCategoryLabel}: ${q.label}`);
            });
          });
        });

        if (remaining.length) {
          sections.push(`\n**Still need answers for:** ${remaining.join(', ')}`);
          sections.push('Call answer_booking_questions again with the remaining answers.');
        }
      }

      const nextActions: NextAction[] = booking.canCommit
        ? [{ tool: 'get_payment_info', reason: 'Check if payment is required before committing' }]
        : [
            {
              tool: 'answer_booking_questions',
              reason: 'More required questions still need answers',
            },
          ];

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
        structuredContent: { ...bookingToStructured(booking), nextActions },
      };
    }
  );
}
