import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { HolibobClient } from '@experience-marketplace/holibob-api';
import type { Product } from '@experience-marketplace/holibob-api/types';

function formatProduct(p: Product): string {
  const lines: string[] = [];
  lines.push(`**${p.name}** (ID: ${p.id})`);

  const price =
    p.guidePriceFormattedText || p.priceFromFormatted || (p.guidePrice ? `${p.guidePriceCurrency ?? 'GBP'} ${p.guidePrice}` : null);
  if (price) lines.push(`  Price: ${price}`);

  const rating = p.reviewRating ?? p.rating;
  if (rating) lines.push(`  Rating: ${rating}/5${p.reviewCount ? ` (${p.reviewCount} reviews)` : ''}`);

  if (p.shortDescription) lines.push(`  ${p.shortDescription}`);

  const imgUrl = p.primaryImageUrl ?? p.imageUrl ?? p.imageList?.[0]?.url;
  if (imgUrl) lines.push(`  Image: ${imgUrl}`);

  if (p.place?.name) lines.push(`  Location: ${p.place.name}`);

  return lines.join('\n');
}

function formatProductDetails(p: Product): string {
  const sections: string[] = [];

  sections.push(`# ${p.name}`);
  sections.push(`**ID:** ${p.id}`);

  if (p.description) sections.push(`\n## Description\n${p.description}`);

  const price =
    p.guidePriceFormattedText || (p.guidePrice ? `${p.guidePriceCurrency ?? 'GBP'} ${p.guidePrice}` : null);
  if (price) sections.push(`**Price:** ${price}`);

  const rating = p.reviewRating ?? p.rating;
  if (rating) sections.push(`**Rating:** ${rating}/5${p.reviewCount ? ` (${p.reviewCount} reviews)` : ''}`);

  if (p.place?.name) sections.push(`**Location:** ${p.place.name}`);
  if (p.startPlace?.formattedAddress) sections.push(`**Meeting Point:** ${p.startPlace.formattedAddress}`);

  // Content sections from API
  if (p.contentList?.nodes) {
    const highlights = p.contentList.nodes.filter((n) => n.type === 'HIGHLIGHT');
    const inclusions = p.contentList.nodes.filter((n) => n.type === 'INCLUSION');
    const exclusions = p.contentList.nodes.filter((n) => n.type === 'EXCLUSION');
    const notes = p.contentList.nodes.filter((n) => n.type === 'NOTE');
    const itinerary = p.contentList.nodes.filter((n) => n.type === 'ITINERARY');

    if (highlights.length) {
      sections.push('\n## Highlights');
      highlights.forEach((h) => sections.push(`- ${h.name || h.description || ''}`));
    }
    if (inclusions.length) {
      sections.push('\n## Inclusions');
      inclusions.forEach((i) => sections.push(`- ${i.name || i.description || ''}`));
    }
    if (exclusions.length) {
      sections.push('\n## Exclusions');
      exclusions.forEach((e) => sections.push(`- ${e.name || e.description || ''}`));
    }
    if (itinerary.length) {
      sections.push('\n## Itinerary');
      itinerary.forEach((it) => {
        if (it.name) sections.push(`**${it.name}**`);
        if (it.description) sections.push(it.description);
      });
    }
    if (notes.length) {
      sections.push('\n## Important Information');
      notes.forEach((n) => sections.push(`- ${n.name || n.description || ''}`));
    }
  }

  // Cancellation policy
  if (p.cancellationPolicy) {
    sections.push('\n## Cancellation Policy');
    if (p.cancellationPolicy.penaltyList?.nodes?.length) {
      p.cancellationPolicy.penaltyList.nodes.forEach((pen) => {
        if (pen.formattedText) sections.push(pen.formattedText);
      });
    } else if (p.cancellationPolicy.description) {
      sections.push(p.cancellationPolicy.description);
    }
  }

  // Reviews
  if (p.reviewList?.nodes?.length) {
    sections.push(`\n## Reviews (${p.reviewList.recordCount ?? p.reviewList.nodes.length} total)`);
    p.reviewList.nodes.slice(0, 3).forEach((r) => {
      sections.push(`- **${r.authorName ?? 'Anonymous'}** (${r.rating}/5): ${r.content ?? r.title ?? ''}`);
    });
  }

  // Images
  if (p.imageList?.length) {
    sections.push('\n## Images');
    p.imageList.slice(0, 5).forEach((img) => {
      sections.push(`- ${img.url}${img.altText ? ` (${img.altText})` : ''}`);
    });
  }

  // Languages
  if (p.guideLanguageList?.nodes?.length) {
    const langs = p.guideLanguageList.nodes.map((l) => l.name).filter(Boolean);
    if (langs.length) sections.push(`**Languages:** ${langs.join(', ')}`);
  }

  // Categories
  if (p.categoryList?.nodes?.length) {
    const cats = p.categoryList.nodes.map((c) => c.name);
    sections.push(`**Categories:** ${cats.join(', ')}`);
  }

  return sections.join('\n');
}

export function registerDiscoveryTools(server: McpServer, client: HolibobClient): void {
  server.tool(
    'search_experiences',
    'Search for experiences and activities by destination, dates, and interests. Returns a list of available experiences with pricing and ratings.',
    {
      destination: z.string().describe('Destination to search (e.g., "Barcelona, Spain", "London, England")'),
      startDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
      endDate: z.string().optional().describe('End date in YYYY-MM-DD format'),
      travelers: z.string().optional().describe('Number of travelers (e.g., "2 adults, 1 child")'),
      searchTerm: z.string().optional().describe('Activity search term (e.g., "kayaking", "food tour", "museum")'),
    },
    async ({ destination, startDate, endDate, travelers, searchTerm }) => {
      // Parse travelers string into adults/children
      let adults = 2;
      let children = 0;
      if (travelers) {
        const adultMatch = travelers.match(/(\d+)\s*adult/i);
        const childMatch = travelers.match(/(\d+)\s*child/i);
        if (adultMatch) adults = parseInt(adultMatch[1]!, 10);
        if (childMatch) children = parseInt(childMatch[1]!, 10);
      }

      const result = await client.discoverProducts(
        {
          currency: 'GBP',
          freeText: destination,
          dateFrom: startDate,
          dateTo: endDate,
          adults,
          children,
          searchTerm,
        },
        { pageSize: 12 }
      );

      if (!result.products.length) {
        return {
          content: [{ type: 'text' as const, text: `No experiences found for "${destination}"${searchTerm ? ` matching "${searchTerm}"` : ''}. Try a different destination or broader search terms.` }],
        };
      }

      const formatted = result.products.map(formatProduct).join('\n\n---\n\n');
      const header = `Found ${result.products.length} experiences in ${destination}${searchTerm ? ` for "${searchTerm}"` : ''}${result.pageInfo.hasNextPage ? ' (more available — use load_more_experiences to see more)' : ''}:\n\n`;

      return {
        content: [{ type: 'text' as const, text: header + formatted }],
      };
    }
  );

  server.tool(
    'get_experience_details',
    'Get full details for a specific experience including description, highlights, inclusions, exclusions, reviews, cancellation policy, and images.',
    {
      experienceId: z.string().describe('The experience ID from search results'),
    },
    async ({ experienceId }) => {
      const product = await client.getProduct(experienceId);
      if (!product) {
        return {
          content: [{ type: 'text' as const, text: `Experience not found: ${experienceId}` }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: formatProductDetails(product) }],
      };
    }
  );

  server.tool(
    'get_suggestions',
    'Get destination and activity suggestions based on partial input. Useful for helping users refine their search.',
    {
      destination: z.string().optional().describe('Partial destination name'),
      searchTerm: z.string().optional().describe('Partial activity or interest'),
    },
    async ({ destination, searchTerm }) => {
      const suggestions = await client.getSuggestions({
        currency: 'GBP',
        freeText: destination,
        searchTerm,
      });

      const parts: string[] = [];

      if (suggestions.destination) {
        parts.push(`**Selected destination:** ${suggestions.destination.name}`);
      }

      if (suggestions.destinations.length) {
        parts.push('\n**Suggested destinations:**');
        suggestions.destinations.forEach((d) => parts.push(`- ${d.name}`));
      }

      if (suggestions.tags.length) {
        parts.push('\n**Suggested categories:**');
        suggestions.tags.forEach((t) => parts.push(`- ${t.name}`));
      }

      if (suggestions.searchTerms.length) {
        parts.push('\n**Suggested search terms:**');
        suggestions.searchTerms.forEach((s) => parts.push(`- ${s}`));
      }

      if (!parts.length) {
        return {
          content: [{ type: 'text' as const, text: 'No suggestions found. Try a different search.' }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: parts.join('\n') }],
      };
    }
  );

  server.tool(
    'load_more_experiences',
    'Load more experiences beyond the initial search results. Pass the IDs of experiences already seen to get new ones.',
    {
      destination: z.string().describe('The destination from the original search'),
      startDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
      endDate: z.string().optional().describe('End date in YYYY-MM-DD format'),
      searchTerm: z.string().optional().describe('Activity search term from original search'),
      seenExperienceIds: z.array(z.string()).describe('IDs of experiences already displayed'),
    },
    async ({ destination, startDate, endDate, searchTerm, seenExperienceIds }) => {
      const result = await client.discoverProducts(
        {
          currency: 'GBP',
          freeText: destination,
          dateFrom: startDate,
          dateTo: endDate,
          searchTerm,
        },
        { pageSize: 12, seenProductIdList: seenExperienceIds }
      );

      if (!result.products.length) {
        return {
          content: [{ type: 'text' as const, text: 'No more experiences available for this search.' }],
        };
      }

      const formatted = result.products.map(formatProduct).join('\n\n---\n\n');
      const header = `${result.products.length} more experiences${result.pageInfo.hasNextPage ? ' (even more available)' : ''}:\n\n`;

      return {
        content: [{ type: 'text' as const, text: header + formatted }],
      };
    }
  );
}
