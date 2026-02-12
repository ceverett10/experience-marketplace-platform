import { z } from 'zod';
import { registerAppTool } from '@modelcontextprotocol/ext-apps/server';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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

function productToStructured(p: Product) {
  const price =
    p.guidePriceFormattedText || p.priceFromFormatted || (p.guidePrice ? `${p.guidePriceCurrency ?? 'GBP'} ${p.guidePrice}` : null);
  const rating = p.reviewRating ?? p.rating;
  const imgUrl = p.primaryImageUrl ?? p.imageUrl ?? p.imageList?.[0]?.url;

  return {
    id: p.id,
    name: p.name,
    price: price ?? undefined,
    rating: rating ?? undefined,
    reviewCount: p.reviewCount ?? undefined,
    shortDescription: p.shortDescription ?? undefined,
    imageUrl: imgUrl ?? undefined,
    location: p.place?.name ?? undefined,
    duration: p.durationText ?? undefined,
  };
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

  if (p.reviewList?.nodes?.length) {
    sections.push(`\n## Reviews (${p.reviewList.recordCount ?? p.reviewList.nodes.length} total)`);
    p.reviewList.nodes.slice(0, 3).forEach((r) => {
      sections.push(`- **${r.authorName ?? 'Anonymous'}** (${r.rating}/5): ${r.content ?? r.title ?? ''}`);
    });
  }

  if (p.imageList?.length) {
    sections.push('\n## Images');
    p.imageList.slice(0, 5).forEach((img) => {
      sections.push(`- ${img.url}${img.altText ? ` (${img.altText})` : ''}`);
    });
  }

  if (p.guideLanguageList?.nodes?.length) {
    const langs = p.guideLanguageList.nodes.map((l) => l.name).filter(Boolean);
    if (langs.length) sections.push(`**Languages:** ${langs.join(', ')}`);
  }

  if (p.categoryList?.nodes?.length) {
    const cats = p.categoryList.nodes.map((c) => c.name);
    sections.push(`**Categories:** ${cats.join(', ')}`);
  }

  return sections.join('\n');
}

function productToDetailStructured(p: Product) {
  const price =
    p.guidePriceFormattedText || (p.guidePrice ? `${p.guidePriceCurrency ?? 'GBP'} ${p.guidePrice}` : null);
  const rating = p.reviewRating ?? p.rating;
  const imgUrl = p.primaryImageUrl ?? p.imageUrl ?? p.imageList?.[0]?.url;

  const highlights = p.contentList?.nodes?.filter((n) => n.type === 'HIGHLIGHT').map((h) => h.name || h.description || '') ?? [];
  const inclusions = p.contentList?.nodes?.filter((n) => n.type === 'INCLUSION').map((i) => i.name || i.description || '') ?? [];
  const exclusions = p.contentList?.nodes?.filter((n) => n.type === 'EXCLUSION').map((e) => e.name || e.description || '') ?? [];

  const reviews = p.reviewList?.nodes?.slice(0, 5).map((r) => ({
    author: r.authorName ?? 'Anonymous',
    rating: r.rating,
    text: r.content ?? r.title ?? '',
  })) ?? [];

  const images = p.imageList?.slice(0, 6).map((img) => ({
    url: img.url,
    alt: img.altText ?? undefined,
  })) ?? [];

  let cancellationPolicy: string | undefined;
  if (p.cancellationPolicy?.penaltyList?.nodes?.length) {
    cancellationPolicy = p.cancellationPolicy.penaltyList.nodes.map((pen) => pen.formattedText).filter(Boolean).join('; ');
  } else if (p.cancellationPolicy?.description) {
    cancellationPolicy = p.cancellationPolicy.description;
  }

  const languages = p.guideLanguageList?.nodes?.map((l) => l.name).filter(Boolean).join(', ');

  return {
    id: p.id,
    name: p.name,
    description: p.description ?? undefined,
    price: price ?? undefined,
    rating: rating ?? undefined,
    reviewCount: p.reviewCount ?? undefined,
    imageUrl: imgUrl ?? undefined,
    images,
    location: p.place?.name ?? undefined,
    duration: p.durationText ?? undefined,
    highlights,
    inclusions,
    exclusions,
    reviews,
    cancellationPolicy,
    languages,
  };
}

export function registerDiscoveryTools(server: McpServer, client: HolibobClient): void {
  registerAppTool(
    server,
    'search_experiences',
    {
      title: 'Search Experiences',
      description: 'Search for experiences and activities by destination, dates, and interests. Returns a list of available experiences with pricing and ratings.',
      inputSchema: {
        destination: z.string().describe('Destination to search (e.g., "Barcelona, Spain", "London, England")'),
        startDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
        endDate: z.string().optional().describe('End date in YYYY-MM-DD format'),
        travelers: z.string().optional().describe('Number of travelers (e.g., "2 adults, 1 child")'),
        searchTerm: z.string().optional().describe('Activity search term (e.g., "kayaking", "food tour", "museum")'),
      },
      _meta: { ui: { resourceUri: 'ui://holibob/combined-experience.html' } },
    },
    async ({ destination, startDate, endDate, travelers, searchTerm }) => {
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
          structuredContent: { experiences: [], destination, hasMore: false },
        };
      }

      const formatted = result.products.map(formatProduct).join('\n\n---\n\n');
      const header = `Found ${result.products.length} experiences in ${destination}${searchTerm ? ` for "${searchTerm}"` : ''}${result.pageInfo.hasNextPage ? ' (more available — use load_more_experiences to see more)' : ''}:\n\n`;

      return {
        content: [{ type: 'text' as const, text: header + formatted }],
        structuredContent: {
          experiences: result.products.map(productToStructured),
          destination,
          hasMore: result.pageInfo.hasNextPage,
        },
      };
    }
  );

  registerAppTool(
    server,
    'get_experience_details',
    {
      title: 'Experience Details',
      description: 'Get full details for a specific experience including description, highlights, inclusions, exclusions, reviews, cancellation policy, and images.',
      inputSchema: {
        experienceId: z.string().describe('The experience ID from search results'),
      },
      _meta: { ui: { resourceUri: 'ui://holibob/combined-experience.html' } },
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
        structuredContent: { experience: productToDetailStructured(product) },
      };
    }
  );

  // get_suggestions — text-only tool, no widget
  registerAppTool(
    server,
    'get_suggestions',
    {
      title: 'Get Suggestions',
      description: 'Get destination and activity suggestions based on partial input. Useful for helping users refine their search.',
      inputSchema: {
        destination: z.string().optional().describe('Partial destination name'),
        searchTerm: z.string().optional().describe('Partial activity or interest'),
      },
      _meta: {},
    },
    async ({ destination, searchTerm }) => {
      const suggestions = await client.getSuggestions({
        currency: 'GBP',
        freeText: destination,
        searchTerm,
      });

      const parts: string[] = [];
      if (suggestions.destination) parts.push(`**Selected destination:** ${suggestions.destination.name}`);
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
        return { content: [{ type: 'text' as const, text: 'No suggestions found. Try a different search.' }] };
      }

      return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
    }
  );

  registerAppTool(
    server,
    'load_more_experiences',
    {
      title: 'Load More Experiences',
      description: 'Load more experiences beyond the initial search results. Pass the IDs of experiences already seen to get new ones.',
      inputSchema: {
        destination: z.string().describe('The destination from the original search'),
        startDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
        endDate: z.string().optional().describe('End date in YYYY-MM-DD format'),
        searchTerm: z.string().optional().describe('Activity search term from original search'),
        seenExperienceIds: z.array(z.string()).describe('IDs of experiences already displayed'),
      },
      _meta: { ui: { resourceUri: 'ui://holibob/combined-experience.html' } },
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
          structuredContent: { experiences: [], destination, hasMore: false },
        };
      }

      const formatted = result.products.map(formatProduct).join('\n\n---\n\n');
      const header = `${result.products.length} more experiences${result.pageInfo.hasNextPage ? ' (even more available)' : ''}:\n\n`;

      return {
        content: [{ type: 'text' as const, text: header + formatted }],
        structuredContent: {
          experiences: result.products.map(productToStructured),
          destination,
          hasMore: result.pageInfo.hasNextPage,
        },
      };
    }
  );

  registerAppTool(
    server,
    'plan_trip',
    {
      title: 'Plan Trip',
      description: 'Show an interactive trip planner. Use at the start of a conversation or when the user wants to explore experiences. Collects Where, When, Who, and What preferences via suggestion chips.',
      inputSchema: {
        knownDestination: z.string().optional().describe('Pre-fill destination if already known (e.g., "London")'),
        knownWhen: z.string().optional().describe('Pre-fill timing if already known (e.g., "This Weekend")'),
        knownWho: z.string().optional().describe('Pre-fill group type if already known (e.g., "Couple")'),
        knownWhat: z.string().optional().describe('Pre-fill activity interest if already known (e.g., "Walking Tours")'),
      },
      _meta: { ui: { resourceUri: 'ui://holibob/combined-experience.html' } },
    },
    async ({ knownDestination, knownWhen, knownWho, knownWhat }) => {
      let suggestions: {
        destination: { id: string; name: string } | null;
        destinations: Array<{ id: string; name: string }>;
        tags: Array<{ id: string; name: string }>;
        searchTerms: string[];
      } = { destination: null, destinations: [], tags: [], searchTerms: [] };

      if (knownDestination || knownWhat) {
        suggestions = await client.getSuggestions({
          currency: 'GBP',
          freeText: knownDestination,
          searchTerm: knownWhat,
        });
      }

      const prefilled: Record<string, string | null> = {
        where: knownDestination ?? null,
        when: knownWhen ?? null,
        who: knownWho ?? null,
        what: knownWhat ?? null,
      };

      return {
        content: [{ type: 'text' as const, text: 'Trip planner opened. The user can select their preferences using the interactive widget.' }],
        structuredContent: {
          suggestions: {
            destinations: suggestions.destinations,
            tags: suggestions.tags,
            searchTerms: suggestions.searchTerms,
          },
          prefilled,
          defaults: {
            where: ['London', 'Paris', 'Barcelona', 'Rome', 'Amsterdam', 'Edinburgh'],
            when: ['Today', 'Tomorrow', 'This Weekend', 'Next Week', 'Next Month'],
            who: ['Solo Traveller', 'Couple', 'Family with Kids', 'Group of Friends'],
            what: ['Walking Tours', 'Food & Drink', 'Museums', 'Outdoor Activities', 'Day Trips'],
          },
        },
      };
    }
  );
}
