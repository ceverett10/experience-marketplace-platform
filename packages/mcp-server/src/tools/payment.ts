import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import type { NextAction } from './helpers.js';
import { classifyError, computeBookingPhase, collectMissingQuestions } from './helpers.js';
import type { ServerContext } from '../server.js';
import { generateCheckoutToken } from '../auth/checkout-token.js';

export function registerPaymentTools(
  server: McpServer,
  client: HolibobClient,
  context?: ServerContext
): void {
  registerAppTool(
    server,
    'get_payment_info',
    {
      title: 'Payment Info',
      description:
        'Get payment information for a booking. Returns Stripe payment details if consumer payment is required, or indicates if the booking is on-account (no payment needed).',
      inputSchema: {
        bookingId: z.string().describe('The booking ID'),
      },
      _meta: {},
    },
    async ({ bookingId }) => {
      try {
        const paymentIntent = await client.getStripePaymentIntent({ id: bookingId });

        const sections: string[] = [];
        sections.push('## Payment Required');
        sections.push(
          `**Amount:** ${paymentIntent.amount / 100} (in minor currency units: ${paymentIntent.amount})`
        );

        // Generate a hosted checkout URL if server context is available
        let checkoutUrl: string | undefined;
        if (context?.publicUrl && context?.mcpApiKey) {
          const token = generateCheckoutToken({
            bookingId,
            mcpApiKey: context.mcpApiKey,
            amount: paymentIntent.amount,
            currency: 'GBP',
          });
          checkoutUrl = `${context.publicUrl}/checkout/${token}`;
          sections.push(`\n**Checkout URL:** ${checkoutUrl}`);
          sections.push(
            'Share this link with the customer to complete payment securely in their browser.'
          );
          sections.push('The link expires in 15 minutes.');
        } else {
          sections.push(`**Payment Intent ID:** ${paymentIntent.id}`);
          sections.push(`\n**Stripe Client Secret:** ${paymentIntent.clientSecret}`);
          sections.push(`**Stripe Publishable Key:** ${paymentIntent.apiKey}`);
          sections.push(
            '\nThe consumer needs to complete payment using Stripe before the booking can be committed.'
          );
        }
        sections.push('\nOnce payment is confirmed, use commit_booking to finalize.');

        return {
          content: [{ type: 'text' as const, text: sections.join('\n') }],
          structuredContent: {
            bookingId,
            status: 'payment_required' as const,
            checkoutUrl,
            payment: {
              amount: paymentIntent.amount / 100,
              amountMinor: paymentIntent.amount,
              paymentIntentId: paymentIntent.id,
              clientSecret: paymentIntent.clientSecret,
              publishableKey: paymentIntent.apiKey,
            },
            nextActions: [
              {
                tool: 'commit_booking',
                reason: 'Commit booking after consumer completes Stripe payment',
              },
            ] as NextAction[],
          },
        };
      } catch (error) {
        // If no payment intent is available, it's likely on-account
        const message = error instanceof Error ? error.message : String(error);

        // Check if this is a "no payment required" scenario
        if (
          message.includes('payment') ||
          message.includes('not found') ||
          message.includes('not required')
        ) {
          return {
            content: [
              {
                type: 'text' as const,
                text: '## No Payment Required\n\nThis booking is on-account. No consumer payment is needed.\n\nUse commit_booking to finalize the booking directly.',
              },
            ],
            structuredContent: {
              bookingId,
              status: 'no_payment_required' as const,
              nextActions: [
                {
                  tool: 'commit_booking',
                  reason: 'No payment needed — commit the booking directly',
                },
              ] as NextAction[],
            },
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Error getting payment info: ${message}` }],
          isError: true,
        };
      }
    }
  );

  registerAppTool(
    server,
    'commit_booking',
    {
      title: 'Commit Booking',
      description:
        'Finalize and commit a booking. PREREQUISITES: 1) All required questions must be answered (canCommit=true from answer_booking_questions). 2) If payment is required, payment must be completed first. Returns the booking confirmation with voucher URL.',
      inputSchema: {
        bookingId: z.string().describe('The booking ID to commit'),
        waitForConfirmation: z
          .boolean()
          .optional()
          .describe('Wait for supplier confirmation (default: true, may take up to 60 seconds)'),
      },
      _meta: {},
    },
    async ({ bookingId, waitForConfirmation = true }) => {
      try {
        const booking = await client.commitBooking({ id: bookingId });

        const sections: string[] = [];
        sections.push('## Booking Committed!');
        sections.push(`**Booking ID:** ${booking.id}`);
        if (booking.code) sections.push(`**Booking Code:** ${booking.code}`);
        sections.push(`**State:** ${booking.state}`);

        if (booking.totalPrice) {
          sections.push(
            `**Total:** ${booking.totalPrice.grossFormattedText ?? `${booking.totalPrice.currency} ${booking.totalPrice.gross}`}`
          );
        }

        const items =
          booking.availabilityList?.nodes?.map((avail) => ({
            name: avail.product?.name ?? 'Experience',
            date: avail.date,
            startTime: avail.startTime ?? undefined,
            price: avail.totalPrice?.grossFormattedText ?? undefined,
          })) ?? [];

        let finalState = booking.state;
        let voucherUrl = booking.voucherUrl;

        if (booking.state === 'PENDING' && waitForConfirmation) {
          sections.push('\nWaiting for supplier confirmation...');
          try {
            const confirmed = await client.waitForConfirmation(bookingId, {
              maxAttempts: 15,
              intervalMs: 2000,
            });
            sections.push(`**Status updated:** ${confirmed.state}`);
            finalState = confirmed.state;
            if (confirmed.voucherUrl) {
              voucherUrl = confirmed.voucherUrl;
              sections.push(`\n**Voucher URL:** ${confirmed.voucherUrl}`);
              sections.push('The customer can download their booking voucher from this link.');
            }
          } catch {
            sections.push(
              'Supplier confirmation is still pending. Use get_booking_status to check later.'
            );
          }
        } else if (booking.voucherUrl) {
          sections.push(`\n**Voucher URL:** ${booking.voucherUrl}`);
        }

        const nextActions: NextAction[] =
          finalState === 'CONFIRMED'
            ? []
            : [
                {
                  tool: 'get_booking_status',
                  reason: 'Check if booking has been confirmed by supplier',
                },
              ];

        return {
          content: [{ type: 'text' as const, text: sections.join('\n') }],
          structuredContent: {
            bookingId: booking.id,
            bookingCode: booking.code ?? undefined,
            status: finalState === 'CONFIRMED' ? ('confirmed' as const) : ('pending' as const),
            state: finalState,
            totalPrice: booking.totalPrice?.grossFormattedText ?? undefined,
            items,
            voucherUrl: voucherUrl ?? undefined,
            nextActions,
          },
        };
      } catch (error) {
        const structured = classifyError(error, { bookingId });

        if (structured.code === 'PAYMENT_REQUIRED') {
          return {
            content: [
              {
                type: 'text' as const,
                text: '## Payment Not Completed\n\nThe booking cannot be committed because payment has not been processed yet.\n\nUse `get_payment_info` to get the Stripe payment details. The consumer must complete payment via Stripe before the booking can be committed.\n\nOnce payment is confirmed, try `commit_booking` again.',
              },
            ],
            structuredContent: { error: structured, nextActions: structured.nextActions },
            isError: true,
          };
        }

        if (structured.code === 'MISSING_REQUIRED_QUESTIONS') {
          // Fetch actual missing questions for the model
          let missing: string[] = [];
          try {
            const bookingData = await client.getBookingQuestions(bookingId);
            missing = collectMissingQuestions(bookingData);
          } catch {
            // Fall back to error message if we can't fetch questions
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: `## Required Questions Not Answered\n\n${structured.message}\n\n${missing.length ? `**Missing:** ${missing.join(', ')}\n\n` : ''}**Fix:** Call \`get_booking_questions\` to see ALL unanswered questions, then use \`answer_booking_questions\` to answer them. Make sure to:\n- Provide \`leadPassengerName\` (the guest's full name)\n- Answer ALL questions including NAME_GIVEN, EMAIL, and PHONE_NUMBER\n- Check that \`canCommit = true\` in the response before calling commit_booking again.`,
              },
            ],
            structuredContent: {
              error: { ...structured, missing },
              nextActions: structured.nextActions,
            },
            isError: true,
          };
        }

        return {
          content: [
            { type: 'text' as const, text: `Error committing booking: ${structured.message}` },
          ],
          structuredContent: { error: structured, nextActions: structured.nextActions },
          isError: true,
        };
      }
    }
  );

  registerAppTool(
    server,
    'get_booking_status',
    {
      title: 'Booking Status',
      description:
        'Check the current status of a booking. Use this to check if a pending booking has been confirmed.',
      inputSchema: {
        bookingId: z.string().describe('The booking ID to check'),
      },
      _meta: {},
    },
    async ({ bookingId }) => {
      const booking = await client.getBooking(bookingId);

      if (!booking) {
        return {
          content: [{ type: 'text' as const, text: `Booking not found: ${bookingId}` }],
          isError: true,
        };
      }

      const sections: string[] = [];
      sections.push(`**Booking ID:** ${booking.id}`);
      if (booking.code) sections.push(`**Booking Code:** ${booking.code}`);
      sections.push(`**State:** ${booking.state}`);

      if (booking.leadPassengerName)
        sections.push(`**Lead Passenger:** ${booking.leadPassengerName}`);
      if (booking.paymentState) sections.push(`**Payment State:** ${booking.paymentState}`);

      if (booking.totalPrice) {
        sections.push(
          `**Total:** ${booking.totalPrice.grossFormattedText ?? `${booking.totalPrice.currency} ${booking.totalPrice.gross}`}`
        );
      }

      const items =
        booking.availabilityList?.nodes?.map((avail) => ({
          name: avail.product?.name ?? 'Experience',
          date: avail.date,
          startTime: avail.startTime ?? undefined,
          price: avail.totalPrice?.grossFormattedText ?? undefined,
        })) ?? [];

      if (items.length) {
        sections.push('\n## Items');
        booking.availabilityList!.nodes!.forEach((avail) => {
          const name = avail.product?.name ?? 'Experience';
          const price = avail.totalPrice?.grossFormattedText ?? '';
          sections.push(
            `- ${name} on ${avail.date}${avail.startTime ? ` at ${avail.startTime}` : ''} ${price}`
          );
        });
      }

      if (booking.voucherUrl) {
        sections.push(`\n**Voucher URL:** ${booking.voucherUrl}`);
      }

      const phase = computeBookingPhase(booking);
      const nextActions: NextAction[] =
        phase === 'CONFIRMED'
          ? []
          : phase === 'COMMITTED_PENDING'
            ? [
                {
                  tool: 'get_booking_status',
                  reason: 'Check again later for supplier confirmation',
                },
              ]
            : phase === 'NEEDS_PAYMENT'
              ? [{ tool: 'get_payment_info', reason: 'Payment is required' }]
              : phase === 'READY_TO_COMMIT'
                ? [{ tool: 'commit_booking', reason: 'Booking is ready to commit' }]
                : phase === 'NEEDS_QUESTIONS'
                  ? [{ tool: 'get_booking_questions', reason: 'Questions need answering' }]
                  : phase === 'DRAFT'
                    ? [{ tool: 'add_to_booking', reason: 'Add an availability slot to start' }]
                    : [];

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
        structuredContent: {
          bookingId: booking.id,
          bookingCode: booking.code ?? undefined,
          status:
            booking.state === 'CONFIRMED'
              ? ('confirmed' as const)
              : booking.state === 'PENDING'
                ? ('pending' as const)
                : booking.paymentState === 'AWAITING_PAYMENT'
                  ? ('payment_required' as const)
                  : ('open' as const),
          state: booking.state,
          bookingPhase: phase,
          leadPassenger: booking.leadPassengerName ?? undefined,
          paymentState: booking.paymentState ?? undefined,
          totalPrice: booking.totalPrice?.grossFormattedText ?? undefined,
          items,
          voucherUrl: booking.voucherUrl ?? undefined,
          nextActions,
        },
      };
    }
  );
}
