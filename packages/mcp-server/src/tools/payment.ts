import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HolibobClient } from '@experience-marketplace/holibob-api';

export function registerPaymentTools(server: McpServer, client: HolibobClient): void {
  server.tool(
    'get_payment_info',
    'Get payment information for a booking. Returns Stripe payment details if consumer payment is required, or indicates if the booking is on-account (no payment needed).',
    {
      bookingId: z.string().describe('The booking ID'),
    },
    async ({ bookingId }) => {
      try {
        const paymentIntent = await client.getStripePaymentIntent({ id: bookingId });

        const sections: string[] = [];
        sections.push('## Payment Required');
        sections.push(`**Amount:** ${paymentIntent.amount / 100} (in minor currency units: ${paymentIntent.amount})`);
        sections.push(`**Payment Intent ID:** ${paymentIntent.id}`);
        sections.push(`\n**Stripe Client Secret:** ${paymentIntent.clientSecret}`);
        sections.push(`**Stripe Publishable Key:** ${paymentIntent.apiKey}`);
        sections.push('\nThe consumer needs to complete payment using Stripe before the booking can be committed.');
        sections.push('Once payment is confirmed, use commit_booking to finalize.');

        return {
          content: [{ type: 'text' as const, text: sections.join('\n') }],
        };
      } catch (error) {
        // If no payment intent is available, it's likely on-account
        const message = error instanceof Error ? error.message : String(error);

        // Check if this is a "no payment required" scenario
        if (message.includes('payment') || message.includes('not found') || message.includes('not required')) {
          return {
            content: [{
              type: 'text' as const,
              text: '## No Payment Required\n\nThis booking is on-account. No consumer payment is needed.\n\nUse commit_booking to finalize the booking directly.',
            }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Error getting payment info: ${message}` }],
          isError: true,
        };
      }
    }
  );

  server.tool(
    'commit_booking',
    'Finalize and commit a booking. If payment is required, ensure payment is completed first. Returns the booking confirmation with voucher URL.',
    {
      bookingId: z.string().describe('The booking ID to commit'),
      waitForConfirmation: z.boolean().optional().describe('Wait for supplier confirmation (default: true, may take up to 60 seconds)'),
    },
    async ({ bookingId, waitForConfirmation = true }) => {
      const booking = await client.commitBooking({ id: bookingId });

      const sections: string[] = [];
      sections.push('## Booking Committed!');
      sections.push(`**Booking ID:** ${booking.id}`);
      if (booking.code) sections.push(`**Booking Code:** ${booking.code}`);
      sections.push(`**State:** ${booking.state}`);

      if (booking.totalPrice) {
        sections.push(`**Total:** ${booking.totalPrice.grossFormattedText ?? `${booking.totalPrice.currency} ${booking.totalPrice.gross}`}`);
      }

      if (booking.state === 'PENDING' && waitForConfirmation) {
        sections.push('\nWaiting for supplier confirmation...');
        try {
          const confirmed = await client.waitForConfirmation(bookingId, {
            maxAttempts: 15,
            intervalMs: 2000,
          });
          sections.push(`**Status updated:** ${confirmed.state}`);
          if (confirmed.voucherUrl) {
            sections.push(`\n**Voucher URL:** ${confirmed.voucherUrl}`);
            sections.push('The customer can download their booking voucher from this link.');
          }
        } catch {
          sections.push('Supplier confirmation is still pending. Use get_booking_status to check later.');
        }
      } else if (booking.voucherUrl) {
        sections.push(`\n**Voucher URL:** ${booking.voucherUrl}`);
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    }
  );

  server.tool(
    'get_booking_status',
    'Check the current status of a booking. Use this to check if a pending booking has been confirmed.',
    {
      bookingId: z.string().describe('The booking ID to check'),
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

      if (booking.leadPassengerName) sections.push(`**Lead Passenger:** ${booking.leadPassengerName}`);
      if (booking.paymentState) sections.push(`**Payment State:** ${booking.paymentState}`);

      if (booking.totalPrice) {
        sections.push(`**Total:** ${booking.totalPrice.grossFormattedText ?? `${booking.totalPrice.currency} ${booking.totalPrice.gross}`}`);
      }

      if (booking.availabilityList?.nodes?.length) {
        sections.push('\n## Items');
        booking.availabilityList.nodes.forEach((avail) => {
          const name = avail.product?.name ?? 'Experience';
          const price = avail.totalPrice?.grossFormattedText ?? '';
          sections.push(`- ${name} on ${avail.date}${avail.startTime ? ` at ${avail.startTime}` : ''} ${price}`);
        });
      }

      if (booking.voucherUrl) {
        sections.push(`\n**Voucher URL:** ${booking.voucherUrl}`);
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    }
  );
}
