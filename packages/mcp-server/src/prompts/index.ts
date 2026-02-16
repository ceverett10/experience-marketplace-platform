import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer): void {
  server.prompt(
    'plan-trip',
    'Help plan a trip by searching for experiences, comparing options, and making bookings',
    {
      destination: z.string().describe('Where the trip is (e.g., "Barcelona, Spain")'),
      dates: z.string().optional().describe('When the trip is (e.g., "March 15-20, 2026")'),
      travelers: z.string().optional().describe('Who is traveling (e.g., "2 adults and 1 child")'),
      interests: z
        .string()
        .optional()
        .describe('What they are interested in (e.g., "food, culture, outdoor activities")'),
    },
    ({ destination, dates, travelers, interests }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Help me plan a trip to ${destination}${dates ? ` from ${dates}` : ''}${travelers ? ` for ${travelers}` : ''}.${interests ? ` We're interested in: ${interests}.` : ''}

Please:
1. Search for experiences matching our interests using search_experiences
2. Show us the top options with pricing and ratings
3. For any experience we're interested in, get full details with get_experience_details
4. Check availability for our dates with check_availability
5. Walk us through the booking process step by step
6. Handle payment information at the end

Start by searching for experiences in ${destination}${interests ? ` related to "${interests}"` : ''}.`,
          },
        },
      ],
    })
  );

  server.prompt(
    'book-experience',
    'Walk through the complete booking process for a specific experience',
    {
      experienceId: z.string().describe('The experience ID to book'),
      date: z.string().optional().describe('Preferred date (YYYY-MM-DD)'),
      travelers: z.string().optional().describe('Who is booking (e.g., "2 adults")'),
    },
    ({ experienceId, date, travelers }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `I want to book experience ${experienceId}${date ? ` on ${date}` : ''}${travelers ? ` for ${travelers}` : ''}.

Please walk me through the complete booking process:
1. First, show me the full details with get_experience_details
2. Check availability with check_availability${date ? ` around ${date}` : ''}
3. Help me select any required options (time slots, group size, etc.)
4. Create a booking and add the selected availability
5. Handle all required questions (I'll provide my details when asked)
6. Check payment requirements and provide payment information
7. Commit the booking and share the voucher

Start by getting the experience details.`,
          },
        },
      ],
    })
  );

  server.prompt(
    'explore-destination',
    'Discover what experiences and activities are available in a destination',
    {
      destination: z.string().describe('The destination to explore (e.g., "London, England")'),
      categories: z
        .string()
        .optional()
        .describe('Specific categories to focus on (e.g., "food tours, museums")'),
    },
    ({ destination, categories }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `I want to explore what's available in ${destination}${categories ? ` — especially ${categories}` : ''}.

Please:
1. Get suggestions for ${destination} using get_suggestions to see what categories and activities are popular
2. Search for top experiences using search_experiences
3. Organize results by category or type
4. Highlight best-rated and best-value options
5. For any standout experiences, get full details
6. Offer to check availability or start a booking for anything I'm interested in

Start by getting suggestions for ${destination}.`,
          },
        },
      ],
    })
  );
}
