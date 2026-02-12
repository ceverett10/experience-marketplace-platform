import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import type { AvailabilityOption, AvailabilitySlot } from '@experience-marketplace/holibob-api/types';

function formatSlot(slot: AvailabilitySlot): string {
  const parts = [`- **${slot.date}** (ID: ${slot.id})`];
  if (slot.guidePriceFormattedText) parts.push(`  Price: ${slot.guidePriceFormattedText}`);
  if (slot.soldOut) parts.push('  **SOLD OUT**');
  return parts.join('\n');
}

function formatOption(opt: AvailabilityOption): string {
  const parts = [`- **${opt.label}** (ID: ${opt.id}, Type: ${opt.type ?? 'unknown'})${opt.required ? ' *required*' : ''}`];
  if (opt.answerValue) parts.push(`  Current answer: ${opt.answerValue}`);
  if (opt.answerFormattedText) parts.push(`  ${opt.answerFormattedText}`);
  if (opt.dataFormat) parts.push(`  Format: ${opt.dataFormat}`);
  if (opt.availableOptions?.length) {
    parts.push('  Options:');
    opt.availableOptions.forEach((choice) => {
      parts.push(`    - "${choice.value}" — ${choice.label}`);
    });
  }
  return parts.join('\n');
}

export function registerAvailabilityTools(server: McpServer, client: HolibobClient): void {
  server.tool(
    'check_availability',
    'Check availability and pricing for an experience within a date range. Returns available dates/slots and may require answering options (like selecting a time or group size) before pricing is shown.',
    {
      experienceId: z.string().describe('The experience ID to check availability for'),
      dateFrom: z.string().describe('Start date in YYYY-MM-DD format'),
      dateTo: z.string().describe('End date in YYYY-MM-DD format'),
    },
    async ({ experienceId, dateFrom, dateTo }) => {
      const result = await client.getAvailabilityList(experienceId, {
        startDate: dateFrom,
        endDate: dateTo,
      });

      const sections: string[] = [];
      sections.push(`**Session ID:** ${result.sessionId}`);
      sections.push(`(Save this — you'll need it for answer_availability_options)\n`);

      // Available slots
      if (result.nodes.length) {
        sections.push(`## Available Dates (${result.nodes.length})`);
        result.nodes.forEach((slot) => sections.push(formatSlot(slot)));
      } else {
        sections.push('No available dates found in this range.');
      }

      // Options that need answering
      if (result.optionList?.nodes?.length) {
        const unanswered = result.optionList.nodes.filter((o) => !o.answerValue);
        const answered = result.optionList.nodes.filter((o) => o.answerValue);

        if (unanswered.length) {
          sections.push('\n## Options to Answer');
          sections.push('Use answer_availability_options with the session ID and option selections:');
          unanswered.forEach((opt) => sections.push(formatOption(opt)));
        }

        if (answered.length) {
          sections.push('\n## Already Answered');
          answered.forEach((opt) => sections.push(formatOption(opt)));
        }
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    }
  );

  server.tool(
    'answer_availability_options',
    'Answer option questions for an availability check (e.g., select date, time slot, group size). Call this iteratively until all options are answered and pricing is shown.',
    {
      experienceId: z.string().describe('The experience ID'),
      sessionId: z.string().describe('The session ID from check_availability'),
      options: z.array(
        z.object({
          id: z.string().describe('Option ID'),
          value: z.string().describe('The selected value'),
        })
      ).describe('Array of option answers'),
    },
    async ({ experienceId, sessionId, options }) => {
      const result = await client.getAvailabilityList(
        experienceId,
        undefined,
        sessionId,
        options
      );

      const sections: string[] = [];
      sections.push(`**Session ID:** ${result.sessionId}\n`);

      // Slots with pricing
      if (result.nodes.length) {
        sections.push(`## Available Slots (${result.nodes.length})`);
        result.nodes.forEach((slot) => sections.push(formatSlot(slot)));
      }

      // Remaining options
      if (result.optionList?.nodes?.length) {
        const unanswered = result.optionList.nodes.filter((o) => !o.answerValue);
        const answered = result.optionList.nodes.filter((o) => o.answerValue);

        if (unanswered.length) {
          sections.push('\n## More Options to Answer');
          unanswered.forEach((opt) => sections.push(formatOption(opt)));
        } else {
          sections.push('\n**All options answered!** You can now select an availability slot and proceed to booking.');
          sections.push('Use create_booking to start a booking, then add_to_booking with a slot ID.');
        }

        if (answered.length) {
          sections.push('\n## Confirmed Selections');
          answered.forEach((opt) => sections.push(`- ${opt.label}: ${opt.answerFormattedText ?? opt.answerValue}`));
        }
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    }
  );
}
