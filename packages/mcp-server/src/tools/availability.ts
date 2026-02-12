import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import type { AvailabilitySlot, AvailabilityDetail, AvailabilityOption } from '@experience-marketplace/holibob-api/types';

function formatSlot(slot: AvailabilitySlot): string {
  const parts = [`- **${slot.date}** (Slot ID: \`${slot.id}\`)`];
  if (slot.guidePriceFormattedText) parts.push(`  Guide price: ${slot.guidePriceFormattedText}`);
  if (slot.soldOut) parts.push('  **SOLD OUT**');
  return parts.join('\n');
}

function formatOption(opt: AvailabilityOption): string {
  const answered = opt.answerValue != null && opt.answerValue !== '';
  const parts = [`- **${opt.label}** (ID: \`${opt.id}\`)`];
  if (answered) {
    parts.push(`  Answer: ${opt.answerFormattedText ?? opt.answerValue}`);
  }
  if (opt.dataType) parts.push(`  Data type: ${opt.dataType}`);
  if (opt.availableOptions?.length) {
    parts.push('  Available choices:');
    opt.availableOptions.forEach((choice) => {
      parts.push(`    - value: \`${choice.value}\` — ${choice.label}`);
    });
  }
  return parts.join('\n');
}

function formatAvailabilityDetail(avail: AvailabilityDetail): string {
  const sections: string[] = [];
  sections.push(`**Slot ID:** \`${avail.id}\``);
  sections.push(`**Date:** ${avail.date}`);
  if (avail.startTime) sections.push(`**Start time:** ${avail.startTime}`);

  // Options
  if (avail.optionList) {
    const isComplete = avail.optionList.isComplete;
    sections.push(`\n**Options complete:** ${isComplete ? 'YES' : 'NO'}`);

    if (avail.optionList.nodes.length) {
      const unanswered = avail.optionList.nodes.filter((o) => o.answerValue == null || o.answerValue === '');
      const answered = avail.optionList.nodes.filter((o) => o.answerValue != null && o.answerValue !== '');

      if (unanswered.length) {
        sections.push('\n## Options to Answer');
        sections.push('Use `answer_slot_options` with the slot ID and option selections:');
        unanswered.forEach((opt) => sections.push(formatOption(opt)));
      }

      if (answered.length) {
        sections.push('\n## Confirmed Selections');
        answered.forEach((opt) => sections.push(`- ${opt.label}: ${opt.answerFormattedText ?? opt.answerValue}`));
      }
    }

    if (isComplete) {
      sections.push('\n**Options complete!** Next: use `get_slot_pricing` to see pricing categories and set participant counts.');
    }
  }

  // Pricing (if available)
  if (avail.pricingCategoryList?.nodes?.length) {
    sections.push('\n## Pricing Categories');
    avail.pricingCategoryList.nodes.forEach((cat) => {
      const parts = [`- **${cat.label}** (ID: \`${cat.id}\`)`];
      if (cat.unitPrice?.grossFormattedText) parts.push(`  Unit price: ${cat.unitPrice.grossFormattedText}`);
      parts.push(`  Units: ${cat.units}`);
      if (cat.minParticipants != null) parts.push(`  Min: ${cat.minParticipants}`);
      if (cat.maxParticipants != null) parts.push(`  Max: ${cat.maxParticipants}`);
      if (cat.totalPrice?.grossFormattedText) parts.push(`  Total: ${cat.totalPrice.grossFormattedText}`);
      sections.push(parts.join('\n'));
    });
  }

  if (avail.totalPrice?.grossFormattedText) {
    sections.push(`\n**Total price:** ${avail.totalPrice.grossFormattedText}`);
  }
  if (avail.isValid != null) {
    sections.push(`**Valid for booking:** ${avail.isValid ? 'YES' : 'NO'}`);
  }
  if (avail.isValid) {
    sections.push('\n**Ready to book!** Use `create_booking` then `add_to_booking` with this slot ID.');
  }

  return sections.join('\n');
}

export function registerAvailabilityTools(server: McpServer, client: HolibobClient): void {
  // Step 3: Discover available dates
  server.tool(
    'check_availability',
    'Check which dates an experience is available within a date range. Returns date slots with guide prices. After picking a slot, use `get_slot_options` to configure it before booking.',
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

      if (result.nodes.length) {
        sections.push(`## Available Dates (${result.nodes.length})\n`);
        result.nodes.forEach((slot) => sections.push(formatSlot(slot)));
        sections.push('\n**Next step:** Pick a slot ID above and use `get_slot_options` to see what options need configuring (time slot, variant, etc.) before booking.');
      } else {
        sections.push('No available dates found in this range. Try different dates.');
      }

      return {
        content: [{ type: 'text' as const, text: sections.join('\n') }],
      };
    }
  );

  // Step 4a: Get slot options
  server.tool(
    'get_slot_options',
    'Get the configuration options for an availability slot (time slots, variants, language, etc.). Shows what needs answering before the slot can be added to a booking. If options are already complete, proceed to `get_slot_pricing`.',
    {
      slotId: z.string().describe('The availability slot ID from check_availability'),
    },
    async ({ slotId }) => {
      const avail = await client.getAvailability(slotId);
      return {
        content: [{ type: 'text' as const, text: formatAvailabilityDetail(avail) }],
      };
    }
  );

  // Step 4b: Answer slot options
  server.tool(
    'answer_slot_options',
    'Answer configuration options for an availability slot (e.g., select time, variant, language). Call iteratively until "Options complete: YES". Then use `get_slot_pricing` to configure pricing.',
    {
      slotId: z.string().describe('The availability slot ID'),
      options: z.array(
        z.object({
          id: z.string().describe('Option ID from get_slot_options'),
          value: z.string().describe('The selected value — use a value from "Available choices" if listed'),
        })
      ).describe('Array of option answers'),
    },
    async ({ slotId, options }) => {
      const avail = await client.setAvailabilityOptions(slotId, {
        optionList: options,
      });
      return {
        content: [{ type: 'text' as const, text: formatAvailabilityDetail(avail) }],
      };
    }
  );

  // Step 5a: Get pricing categories
  server.tool(
    'get_slot_pricing',
    'Get pricing categories for a fully configured availability slot (options must be complete first). Shows participant types (Adult, Child, etc.) with prices and min/max units. Use `set_slot_pricing` to set units.',
    {
      slotId: z.string().describe('The availability slot ID (must have options complete)'),
    },
    async ({ slotId }) => {
      const avail = await client.getAvailabilityPricing(slotId);
      return {
        content: [{ type: 'text' as const, text: formatAvailabilityDetail(avail) }],
      };
    }
  );

  // Step 5b: Set pricing units
  server.tool(
    'set_slot_pricing',
    'Set the number of participants for each pricing category (e.g., 2 Adults, 1 Child). After setting units, if isValid=true the slot is ready for `add_to_booking`.',
    {
      slotId: z.string().describe('The availability slot ID'),
      pricingCategories: z.array(
        z.object({
          id: z.string().describe('Pricing category ID from get_slot_pricing'),
          units: z.number().describe('Number of participants/units for this category'),
        })
      ).describe('Array of pricing category selections'),
    },
    async ({ slotId, pricingCategories }) => {
      const avail = await client.setAvailabilityPricing(slotId, pricingCategories);
      return {
        content: [{ type: 'text' as const, text: formatAvailabilityDetail(avail) }],
      };
    }
  );
}
