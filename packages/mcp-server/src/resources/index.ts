import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { HolibobClient } from '@experience-marketplace/holibob-api';

export function registerResources(server: McpServer, client: HolibobClient): void {
  // Booking resource — read current booking state
  server.resource(
    'booking',
    new ResourceTemplate('booking://{bookingId}', { list: undefined }),
    {
      description: 'Current state of a booking including items, pricing, and status',
      mimeType: 'application/json',
    },
    async (uri, { bookingId }) => {
      const id = String(Array.isArray(bookingId) ? bookingId[0] : bookingId);
      const booking = await client.getBooking(id);

      if (!booking) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/plain',
            text: `Booking not found: ${id}`,
          }],
        };
      }

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(booking, null, 2),
        }],
      };
    }
  );

  // Experience resource — read full experience details
  server.resource(
    'experience',
    new ResourceTemplate('experience://{experienceId}', { list: undefined }),
    {
      description: 'Full details of an experience including description, pricing, reviews, and images',
      mimeType: 'application/json',
    },
    async (uri, { experienceId }) => {
      const id = String(Array.isArray(experienceId) ? experienceId[0] : experienceId);
      const product = await client.getProduct(id);

      if (!product) {
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/plain',
            text: `Experience not found: ${id}`,
          }],
        };
      }

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(product, null, 2),
        }],
      };
    }
  );

  // Partner config resource — read-only partner info
  server.resource(
    'partner-config',
    'partner://config',
    {
      description: 'Partner configuration including payment model and capabilities',
      mimeType: 'application/json',
    },
    async (uri) => {
      const config = {
        capabilities: [
          'product_discovery',
          'availability_check',
          'booking',
          'payment',
        ],
        paymentModels: ['ON_ACCOUNT', 'REQUIRED'],
        supportedCurrencies: ['GBP', 'EUR', 'USD'],
        bookingFlow: [
          '1. search_experiences — Find experiences',
          '2. get_experience_details — View full details',
          '3. check_availability — Check dates and pricing',
          '4. answer_availability_options — Select options (if needed)',
          '5. create_booking — Create a booking basket',
          '6. add_to_booking — Add an availability slot',
          '7. get_booking_questions — See required info',
          '8. answer_booking_questions — Provide guest details',
          '9. get_payment_info — Check if payment is needed',
          '10. commit_booking — Finalize the booking',
        ],
      };

      return {
        contents: [{
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(config, null, 2),
        }],
      };
    }
  );
}
