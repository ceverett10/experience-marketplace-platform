import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import type { AvailabilityOption, AvailabilitySlot } from '@experience-marketplace/holibob-api/types';

/** Check if an option has been answered — use both `value` and `answerValue` since either may be populated */
function isOptionAnswered(opt: AvailabilityOption): boolean {
  return !!(opt.answerValue || opt.value);
}

function getOptionAnswer(opt: AvailabilityOption): string {
  return opt.answerFormattedText ?? opt.answerValue ?? opt.value ?? '';
}

function formatSlot(slot: AvailabilitySlot): string {
  const parts = [`- **${slot.date}** (ID: \`${slot.id}\`)`];
  if (slot.guidePriceFormattedText) parts.push(`  Price: ${slot.guidePriceFormattedText}`);
  if (slot.soldOut) parts.push('  **SOLD OUT**');
  return parts.join('\n');
}

function formatOption(opt: AvailabilityOption): string {
  const parts = [`- **${opt.label}** (ID: \`${opt.id}\`, Type: ${opt.type ?? 'unknown'})${opt.required ? ' *required*' : ''}`];
  if (isOptionAnswered(opt)) parts.push(`  Current answer: ${getOptionAnswer(opt)}`);
  if (opt.dataFormat) parts.push(`  Format: ${opt.dataFormat}`);
  if (opt.dataType) parts.push(`  Data type: ${opt.dataType}`);
  if (opt.availableOptions?.length) {
    parts.push('  Options:');
    opt.availableOptions.forEach((choice) => {
      parts.push(`    - "${choice.value}" — ${choice.label}`);
    });
  }
  if (opt.errorList?.nodes?.length) {
    parts.push(`  Errors: ${opt.errorList.nodes.join(', ')}`);
  }
  return parts.join('\n');
}

export function registerAvailabilityTools(server: McpServer, client: HolibobClient): void {
  server.tool(
    'check_availability',
    'Check availability and pricing for an experience within a date range. Returns available dates/slots and may require answering options (like selecting a specific date, time or group size) before a slot can be added to a booking.',
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
      sections.push(`**Session ID:** \`${result.sessionId}\``);
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
        const unanswered = result.optionList.nodes.filter((o) => !isOptionAnswered(o));
        const answered = result.optionList.nodes.filter((o) => isOptionAnswered(o));

        if (result.optionList.isComplete) {
          sections.push('\n**All options resolved.** Pick a slot ID above and use add_to_booking.');
        } else if (unanswered.length) {
          sections.push('\n## Options to Answer');
          sections.push('Use answer_availability_options with the session ID and option selections:');
          unanswered.forEach((opt) => sections.push(formatOption(opt)));
        }

        if (answered.length) {
          sections.push('\n## Already Answered');
          answered.forEach((opt) => sections.push(`- ${opt.label}: ${getOptionAnswer(opt)}`));
        }
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    }
  );

  server.tool(
    'answer_availability_options',
    'Answer option questions for an availability check (e.g., select a specific date, time slot, group size). Call this iteratively until isComplete is true or all options have values, then use the slot ID with add_to_booking.',
    {
      experienceId: z.string().describe('The experience ID'),
      sessionId: z.string().describe('The session ID from check_availability'),
      options: z.array(
        z.object({
          id: z.string().describe('Option ID'),
          value: z.string().describe('The selected value — use the value from availableOptions if listed, or a date in YYYY-MM-DD format for date options'),
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
      sections.push(`**Session ID:** \`${result.sessionId}\``);

      // Check completion
      const isComplete = result.optionList?.isComplete ?? false;
      if (isComplete) {
        sections.push('**Status: COMPLETE** — All options are answered.\n');
      } else {
        sections.push('**Status: OPTIONS PENDING** — More options may need answering.\n');
      }

      // Slots with pricing
      if (result.nodes.length) {
        sections.push(`## Available Slots (${result.nodes.length})`);
        result.nodes.forEach((slot) => sections.push(formatSlot(slot)));
      }

      // Options status
      if (result.optionList?.nodes?.length) {
        const unanswered = result.optionList.nodes.filter((o) => !isOptionAnswered(o));
        const answered = result.optionList.nodes.filter((o) => isOptionAnswered(o));

        if (isComplete || unanswered.length === 0) {
          sections.push('\n**All options answered!** Pick a slot ID above and use:');
          sections.push('1. `create_booking` to start a booking');
          sections.push('2. `add_to_booking` with the slot ID to add this availability');
        } else {
          sections.push('\n## More Options to Answer');
          unanswered.forEach((opt) => sections.push(formatOption(opt)));
        }

        if (answered.length) {
          sections.push('\n## Confirmed Selections');
          answered.forEach((opt) => sections.push(`- ${opt.label}: ${getOptionAnswer(opt)}`));
        }
      } else if (isComplete) {
        sections.push('\n**Ready to book!** Pick a slot ID and use create_booking + add_to_booking.');
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    }
  );
}
