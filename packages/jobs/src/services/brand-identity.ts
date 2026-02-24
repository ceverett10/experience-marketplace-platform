/**
 * Brand Identity Service
 *
 * Creates comprehensive brand identities for autonomous sites including:
 * - Visual identity (colors, fonts, logo)
 * - Tone of voice and messaging guidelines
 * - Trust signals and credibility factors
 * - Brand story and positioning
 */

import { createClaudeClient } from '@experience-marketplace/content-engine';
import { prisma } from '@experience-marketplace/database';
import { enrichHomepageConfigWithImages } from './unsplash-images.js';

interface OpportunityContext {
  keyword: string;
  location?: string;
  niche: string;
  searchVolume: number;
  intent: string;
  /** The actual entity name (supplier or product) — used for unique brand derivation */
  entityName?: string;
  /** Brief description of the entity for richer brand context */
  entityDescription?: string;
}

interface ComprehensiveBrandIdentity {
  // Visual Identity
  name: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string | null;
  logoDescription?: string; // For future logo generation

  // Brand Voice & Messaging
  toneOfVoice: {
    personality: string[]; // e.g., ["professional", "friendly", "expert"]
    writingStyle: string; // e.g., "conversational yet authoritative"
    doList: string[]; // Communication dos
    dontList: string[]; // Communication don'ts
  };

  // Trust & Credibility
  trustSignals: {
    expertise: string[]; // Areas of expertise
    certifications: string[]; // Relevant certifications or memberships
    yearsFounded?: number; // Implied establishment year
    valuePropositions: string[]; // Why customers should choose us
    guarantees: string[]; // Service guarantees
  };

  // Brand Story
  brandStory: {
    mission: string;
    vision: string;
    values: string[];
    targetAudience: string;
    uniqueSellingPoints: string[];
  };

  // SEO & Content Guidelines
  contentGuidelines: {
    keyThemes: string[];
    contentPillars: string[];
    semanticKeywords: string[];
  };
}

/**
 * Generate comprehensive brand identity using AI
 */
export async function generateComprehensiveBrandIdentity(
  opportunity: OpportunityContext,
  providedConfig?: Partial<ComprehensiveBrandIdentity>
): Promise<ComprehensiveBrandIdentity> {
  try {
    const client = createClaudeClient({
      apiKey: process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '',
    });

    const entityName = opportunity.entityName || opportunity.keyword;
    const prompt = `You are a brand strategist creating a brand identity for a travel experience website.

Context:
- Business Name: ${entityName}
- Target Market: ${opportunity.location || 'Multiple locations'}
- Niche: ${opportunity.niche}
- Primary Keyword: ${opportunity.keyword}${opportunity.entityDescription ? `\n- Business Description: ${opportunity.entityDescription}` : ''}

CRITICAL RULES FOR THE BRAND NAME:
1. The brand name MUST be based on the actual business name "${entityName}"
2. You may clean up the business name (remove "Pty Ltd", "LLC", "Ltd", "Inc", "S.A.S", "GmbH", "S.R.L", etc.) but keep the core identity
3. You may shorten it if it is very long (e.g. "Adventures Vision Treks and Travels" → "Adventure Vision")
4. Do NOT invent a completely new name. Do NOT use generic names like "VoyageVault", "Wanderlust Collective", "ExploreHub", "Journey Craft", etc.
5. The name should be recognisable as belonging to this specific operator

Create a complete brand identity that positions this site as THE trusted authority for ${opportunity.niche} experiences in ${opportunity.location || 'this market'}.

Generate a comprehensive brand identity with:

1. VISUAL IDENTITY:
   - Brand name (cleaned-up version of "${entityName}" — see rules above)
   - Tagline (compelling, trust-building, under 60 chars, specific to this business)
   - Color palette (primary, secondary, accent hex codes that convey trust and quality)
   - Typography (2 Google Fonts: heading and body)
   - Logo description (for future generation - describe the ideal logo concept)

2. TONE OF VOICE:
   - 3-4 personality traits (e.g., professional, knowledgeable, approachable)
   - Writing style description
   - 5 communication "dos"
   - 5 communication "don'ts"

3. TRUST & CREDIBILITY:
   - 4-5 areas of expertise
   - Relevant industry certifications or memberships
   - Implied founding year (make it established but not too old, 2015-2020)
   - 5 value propositions (why customers should trust us)
   - 3 service guarantees

4. BRAND STORY:
   - Mission statement (1 sentence)
   - Vision statement (1 sentence)
   - 5 core values
   - Target audience description
   - 5 unique selling points

5. CONTENT GUIDELINES:
   - 5 key themes to cover
   - 4 content pillars
   - 10 semantic keywords related to the niche

Make this brand feel like an established, trustworthy authority in the ${opportunity.niche} space.

Return ONLY valid JSON with this exact structure:
{
  "name": "Brand Name",
  "tagline": "Compelling tagline",
  "primaryColor": "#hexcode",
  "secondaryColor": "#hexcode",
  "accentColor": "#hexcode",
  "headingFont": "Font Name",
  "bodyFont": "Font Name",
  "logoDescription": "Description of ideal logo",
  "toneOfVoice": {
    "personality": ["trait1", "trait2", "trait3"],
    "writingStyle": "Description of writing style",
    "doList": ["do1", "do2", "do3", "do4", "do5"],
    "dontList": ["dont1", "dont2", "dont3", "dont4", "dont5"]
  },
  "trustSignals": {
    "expertise": ["area1", "area2", "area3", "area4"],
    "certifications": ["cert1", "cert2", "cert3"],
    "yearsFounded": 2018,
    "valuePropositions": ["prop1", "prop2", "prop3", "prop4", "prop5"],
    "guarantees": ["guarantee1", "guarantee2", "guarantee3"]
  },
  "brandStory": {
    "mission": "One sentence mission",
    "vision": "One sentence vision",
    "values": ["value1", "value2", "value3", "value4", "value5"],
    "targetAudience": "Description of target audience",
    "uniqueSellingPoints": ["usp1", "usp2", "usp3", "usp4", "usp5"]
  },
  "contentGuidelines": {
    "keyThemes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
    "contentPillars": ["pillar1", "pillar2", "pillar3", "pillar4"],
    "semanticKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8", "keyword9", "keyword10"]
  }
}`;

    const response = await client.generate({
      model: client.getModelId('haiku'), // Changed from 'sonnet' for cost reduction
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 3000,
      temperature: 0.8, // Balanced between creativity and consistency
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const generated = JSON.parse(jsonMatch[0]);

      // Merge with provided config if any
      return {
        name: providedConfig?.name || generated.name,
        tagline: providedConfig?.tagline || generated.tagline,
        primaryColor: providedConfig?.primaryColor || generated.primaryColor,
        secondaryColor: providedConfig?.secondaryColor || generated.secondaryColor,
        accentColor: providedConfig?.accentColor || generated.accentColor,
        headingFont: providedConfig?.headingFont || generated.headingFont,
        bodyFont: providedConfig?.bodyFont || generated.bodyFont,
        logoUrl: providedConfig?.logoUrl || null,
        logoDescription: generated.logoDescription,
        toneOfVoice: providedConfig?.toneOfVoice || generated.toneOfVoice,
        trustSignals: providedConfig?.trustSignals || generated.trustSignals,
        brandStory: providedConfig?.brandStory || generated.brandStory,
        contentGuidelines: providedConfig?.contentGuidelines || generated.contentGuidelines,
      };
    }

    throw new Error('Failed to parse AI-generated brand identity');
  } catch (error) {
    console.error('[Brand Identity] AI generation failed:', error);

    // Fallback to template-based identity
    return createTemplateBrandIdentity(opportunity);
  }
}

/**
 * Lightweight brand generation for supplier/product microsites.
 * Only generates the 7 fields actually used: name, tagline, 3 colors, 2 fonts.
 * Uses ~200 tokens instead of ~3000, dramatically faster for bulk creation.
 */
export async function generateLightweightBrandIdentity(
  opportunity: OpportunityContext
): Promise<ComprehensiveBrandIdentity> {
  try {
    const client = createClaudeClient({
      apiKey: process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '',
    });

    const entityName = opportunity.entityName || opportunity.keyword;
    const location = opportunity.location || '';
    const niche = opportunity.niche;

    const prompt =
      'You are a brand strategist. Create a minimal brand identity for a travel experience website.\n\n' +
      'Business: ' +
      entityName +
      '\n' +
      (location ? 'Location: ' + location + '\n' : '') +
      'Niche: ' +
      niche +
      '\n\n' +
      'RULES:\n' +
      '1. Brand name MUST be based on "' +
      entityName +
      '" — clean up corporate suffixes (Ltd, LLC, GmbH, etc.) but keep the core identity\n' +
      '2. Do NOT invent a new name\n' +
      '3. Tagline under 60 chars, specific to this business\n' +
      '4. Colors as hex codes that suit the travel/experience niche\n' +
      '5. Use popular Google Fonts\n\n' +
      'Return ONLY valid JSON:\n' +
      '{"name":"...","tagline":"...","primaryColor":"#...","secondaryColor":"#...","accentColor":"#...","headingFont":"...","bodyFont":"..."}';

    const response = await client.generate({
      model: client.getModelId('haiku'),
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.7,
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const template = createTemplateBrandIdentity(opportunity);
      return {
        ...template,
        name: (parsed['name'] as string) || template.name,
        tagline: (parsed['tagline'] as string) || template.tagline,
        primaryColor: (parsed['primaryColor'] as string) || template.primaryColor,
        secondaryColor: (parsed['secondaryColor'] as string) || template.secondaryColor,
        accentColor: (parsed['accentColor'] as string) || template.accentColor,
        headingFont: (parsed['headingFont'] as string) || template.headingFont,
        bodyFont: (parsed['bodyFont'] as string) || template.bodyFont,
      };
    }

    throw new Error('Failed to parse lightweight brand identity JSON');
  } catch (error) {
    console.error('[Brand Identity] Lightweight generation failed:', error);
    return createTemplateBrandIdentity(opportunity);
  }
}

/**
 * Create template-based brand identity as fallback
 */
function createTemplateBrandIdentity(opportunity: OpportunityContext): ComprehensiveBrandIdentity {
  const location = opportunity.location?.split(',')[0]?.trim() || '';
  const niche = capitalize(opportunity.niche);
  const entityName = opportunity.entityName || opportunity.keyword;

  // Clean up entity name: remove corporate suffixes
  const brandName = cleanEntityName(entityName);
  const tagline = location
    ? `Discover the Best ${niche} in ${location}`
    : `Your Curated Guide to ${niche}`;

  return {
    name: brandName,
    tagline,
    primaryColor: '#2563eb', // Professional blue
    secondaryColor: '#7c3aed', // Complementary purple
    accentColor: '#f59e0b', // Warm accent
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    logoUrl: null,
    logoDescription: `Modern logo featuring ${niche.toLowerCase()} imagery with ${location} elements`,

    toneOfVoice: {
      personality: ['Professional', 'Knowledgeable', 'Trustworthy', 'Helpful'],
      writingStyle:
        'Clear, authoritative yet approachable. We educate and guide rather than sell aggressively.',
      doList: [
        'Use expert knowledge to build trust',
        'Provide detailed, accurate information',
        'Be transparent about pricing and processes',
        'Show genuine enthusiasm for experiences',
        'Use real examples and specific details',
      ],
      dontList: [
        'Use overly salesy or pushy language',
        'Make exaggerated claims',
        'Use jargon without explanation',
        'Be vague or ambiguous',
        'Sound generic or template-like',
      ],
    },

    trustSignals: {
      expertise: [
        `${niche} curation and vetting`,
        'Local destination knowledge',
        'Customer service excellence',
        'Secure booking processes',
      ],
      certifications: [
        'Licensed Travel Provider',
        'Tourism Board Certified',
        'Customer Service Excellence Award',
      ],
      yearsFounded: 2018,
      valuePropositions: [
        'Hand-picked, verified experiences only',
        'Best price guarantee on all bookings',
        'Expert local knowledge and insider tips',
        '24/7 customer support for your peace of mind',
        'Thousands of satisfied customers worldwide',
      ],
      guarantees: [
        '100% secure booking process',
        'Best price guarantee',
        'Free cancellation on select experiences',
      ],
    },

    brandStory: {
      mission: `To connect travelers with the most authentic and memorable ${niche.toLowerCase()} experiences in ${location}.`,
      vision: `To become the most trusted platform for discovering and booking ${niche.toLowerCase()} experiences worldwide.`,
      values: [
        'Quality over quantity',
        'Transparency and honesty',
        'Customer satisfaction',
        'Local expertise',
        'Sustainable tourism',
      ],
      targetAudience: `Discerning travelers seeking high-quality, authentic ${niche.toLowerCase()} experiences with the confidence of booking through a trusted expert.`,
      uniqueSellingPoints: [
        `Specialized focus on ${niche.toLowerCase()} experiences`,
        'Every experience personally vetted by our team',
        'Direct relationships with local providers',
        'Unbiased reviews from verified customers',
        'Expert destination guides and travel tips',
      ],
    },

    contentGuidelines: {
      keyThemes: [
        'Authenticity and quality',
        'Local expertise',
        'Customer satisfaction',
        'Destination insights',
        'Experience curation',
      ],
      contentPillars: [
        'Experience guides',
        'Destination highlights',
        'Travel tips and advice',
        'Customer stories',
      ],
      semanticKeywords: extractSemanticKeywords(opportunity),
    },
  };
}

/**
 * Extract semantic keywords for SEO
 */
function extractSemanticKeywords(opportunity: OpportunityContext): string[] {
  const niche = opportunity.niche.toLowerCase();
  const location = opportunity.location?.toLowerCase() || '';

  return [
    `best ${niche}`,
    `${niche} experiences`,
    `${location} ${niche}`,
    `book ${niche}`,
    `${niche} tickets`,
    `${niche} tours`,
    `top ${niche}`,
    `${niche} guide`,
    `${niche} booking`,
    `authentic ${niche}`,
  ].filter(Boolean);
}

/**
 * Generate SEO-optimized title template and metadata for a site.
 */
export function generateSeoTitleConfig(params: {
  brandName: string;
  niche: string;
  location?: string;
  keyword: string;
  tagline: string;
}): {
  titleTemplate: string;
  defaultTitle: string;
  defaultDescription: string;
  keywords: string[];
} {
  const { brandName, niche, location, keyword, tagline } = params;
  const nicheCap = capitalize(niche);

  // Title template: %s | Brand Name
  const titleTemplate = `%s | ${brandName}`;

  // Homepage default title: keyword-rich, under 60 chars
  let defaultTitle = `${brandName} - ${tagline}`;
  if (defaultTitle.length > 60) {
    defaultTitle = `${brandName} | ${nicheCap} in ${location || 'Your Destination'}`;
  }
  if (defaultTitle.length > 60) {
    defaultTitle = brandName;
  }

  // Meta description: keyword-rich, under 155 chars
  const locationStr = location || 'your destination';
  let defaultDescription = `Discover the best ${niche} experiences in ${locationStr}. ${tagline}. Book online with instant confirmation and free cancellation.`;
  if (defaultDescription.length > 155) {
    defaultDescription = `Discover the best ${niche} experiences in ${locationStr}. Book online with instant confirmation and free cancellation.`;
  }
  if (defaultDescription.length > 155) {
    defaultDescription = `Book the best ${niche} experiences in ${locationStr}. Instant confirmation & free cancellation.`;
  }

  // Keywords: niche + location combinations
  const keywords = [
    keyword,
    `${niche} experiences`,
    location ? `${location.toLowerCase()} ${niche}` : undefined,
    `best ${niche}`,
    `book ${niche}`,
    location ? `things to do in ${location.toLowerCase()}` : undefined,
    `${niche} tours`,
    `${niche} tickets`,
    location ? `${location.toLowerCase()} experiences` : undefined,
    brandName.toLowerCase(),
  ].filter((k): k is string => !!k);

  return { titleTemplate, defaultTitle, defaultDescription, keywords };
}

/**
 * Store extended brand information in database
 * Stores complex data in JSON fields, merged with SEO title config
 */
export async function storeBrandIdentity(
  siteId: string,
  brandId: string,
  identity: ComprehensiveBrandIdentity,
  seoTitleConfig?: {
    titleTemplate: string;
    defaultTitle: string;
    defaultDescription: string;
    keywords: string[];
  }
): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: {
      seoConfig: {
        ...identity.contentGuidelines,
        toneOfVoice: identity.toneOfVoice,
        trustSignals: identity.trustSignals,
        brandStory: identity.brandStory,
        ...(seoTitleConfig || {}),
      },
    },
  });

  console.log(`[Brand Identity] Stored comprehensive identity for site ${siteId}`);
}

/**
 * Get brand identity for content generation
 */
export async function getBrandIdentityForContent(siteId: string): Promise<{
  toneOfVoice?: any;
  trustSignals?: any;
  brandStory?: any;
  contentGuidelines?: any;
}> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: { seoConfig: true },
  });

  if (site?.seoConfig && typeof site.seoConfig === 'object') {
    return site.seoConfig as any;
  }

  return {};
}

/**
 * Get brand identity from a Brand record (for microsites)
 * Returns default brand identity guidelines based on brand colors and fonts.
 */
export async function getBrandIdentityFromBrandId(brandId: string | null): Promise<{
  toneOfVoice?: any;
  trustSignals?: any;
  brandStory?: any;
  contentGuidelines?: any;
}> {
  if (!brandId) return {};

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { name: true, tagline: true },
  });

  if (!brand) return {};

  // Return basic brand identity for microsites
  return {
    toneOfVoice: {
      personality: ['professional', 'friendly', 'informative'],
      formality: 'conversational',
    },
    contentGuidelines: {
      brandName: brand.name,
      tagline: brand.tagline,
    },
  };
}

/**
 * Homepage configuration structure
 */
export interface HomepageConfig {
  hero?: {
    title?: string;
    subtitle?: string;
    backgroundImage?: string;
  };
  popularExperiences?: {
    title?: string;
    subtitle?: string;
    destination?: string;
    categoryPath?: string;
    searchTerms?: string[];
  };
  destinations?: Array<{
    name: string;
    slug: string;
    icon: string;
    imageUrl?: string; // Unsplash image URL (hotlinked as required)
    description?: string; // AI-generated description for /destinations page
    // Unsplash attribution (REQUIRED when displaying images)
    imageAttribution?: {
      photographerName: string;
      photographerUrl: string;
      unsplashUrl: string;
    };
  }>;
  categories?: Array<{
    name: string;
    slug: string;
    icon: string;
    imageUrl?: string; // Unsplash image URL (hotlinked as required)
    description?: string; // AI-generated description for /categories page
    // Unsplash attribution (REQUIRED when displaying images)
    imageAttribution?: {
      photographerName: string;
      photographerUrl: string;
      unsplashUrl: string;
    };
  }>;
  testimonials?: Array<{
    name: string;
    location: string;
    text: string;
    rating: number;
  }>;
}

/**
 * Generate homepage configuration using AI
 * Creates site-specific hero, experiences query, and destinations
 */
export async function generateHomepageConfig(
  opportunity: OpportunityContext,
  brandIdentity: ComprehensiveBrandIdentity
): Promise<HomepageConfig> {
  try {
    const client = createClaudeClient({
      apiKey: process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '',
    });

    const prompt = `You are configuring a homepage for a travel experience marketplace website.

Brand: ${brandIdentity.name}
Tagline: ${brandIdentity.tagline}
Location: ${opportunity.location || 'Multiple locations'}
Niche: ${opportunity.niche}
Primary Keyword: ${opportunity.keyword}

Generate a homepage configuration that will make this site highly relevant and personalized for this brand.

I need:

1. HERO SECTION:
   - Title: A compelling headline that incorporates the brand's focus (under 60 chars)
   - Subtitle: A supporting message that builds trust and excitement (under 100 chars)

2. POPULAR EXPERIENCES QUERY:
   - destination: The main city/location to query (e.g., "London") - just the city name
   - categoryPath: The Holibob category path that best matches this niche. Choose ONE from:
     * "food-wine-and-beer-experiences" - for food tours, wine tasting, culinary experiences
     * "sightseeing-tours" - for general tours and sightseeing
     * "outdoor-activities" - for adventure, hiking, nature
     * "cultural-experiences" - for museums, history, art
     * "water-activities" - for boats, cruises, water sports
     * "theme-parks-and-attractions" - for amusement parks, attractions
     * "shows-and-events" - for theater, concerts, events
     * "wellness-and-spa" - for spa, wellness, relaxation
   - searchTerms: 2-3 additional search terms to narrow results

3. DESTINATIONS (8 items):
   - For a location-specific brand (like "London Food Tours"), include NEIGHBORHOODS/AREAS within that city
   - For a general brand, include major cities
   - Each destination needs: name, slug (lowercase, hyphenated), icon (country flag or relevant emoji)
   - description: A compelling 2-3 sentence description of why this destination is great for experiences

4. CATEGORIES (6-8 items):
   - Generate niche-specific experience CATEGORIES relevant to the brand
   - For example, for "London Food Tours": wine tasting, brewery tours, fine dining, street food, cooking classes, pub crawls, market tours, afternoon tea
   - For "Adventure Tours": hiking, climbing, kayaking, ziplining, camping, caving, paragliding
   - Each category needs: name, slug (lowercase, hyphenated), icon (relevant emoji)
   - description: A compelling 2-3 sentence description of why this category of experiences is special

5. TESTIMONIALS (3 items):
   - Generate realistic-sounding testimonials from happy customers
   - Each needs: name (first name + initial), location, text (1-2 sentences), rating (4-5)

Return ONLY valid JSON:
{
  "hero": {
    "title": "Compelling headline",
    "subtitle": "Supporting message"
  },
  "popularExperiences": {
    "title": "Section title",
    "subtitle": "Section subtitle",
    "destination": "London",
    "categoryPath": "food-wine-and-beer-experiences",
    "searchTerms": ["term1", "term2"]
  },
  "destinations": [
    {"name": "Area Name", "slug": "area-name", "icon": "emoji", "description": "Why this destination is great"}
  ],
  "categories": [
    {"name": "Category Name", "slug": "category-slug", "icon": "emoji", "description": "Why this category is special"}
  ],
  "testimonials": [
    {"name": "Name I.", "location": "City, Country", "text": "Review text", "rating": 5}
  ]
}`;

    const response = await client.generate({
      model: client.getModelId('haiku'), // Changed from 'sonnet' for cost reduction
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      temperature: 0.7,
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const generated = JSON.parse(jsonMatch[0]) as HomepageConfig;
      console.log(`[Homepage Config] Generated config for ${brandIdentity.name}`);

      // Enrich with images from Unsplash (hero, destinations, and categories)
      try {
        const enriched = await enrichHomepageConfigWithImages(
          {
            hero: generated.hero,
            destinations: generated.destinations,
            categories: generated.categories,
          },
          {
            location: opportunity.location,
            niche: opportunity.niche,
          }
        );
        return {
          ...generated,
          hero: enriched.hero || generated.hero,
          destinations: enriched.destinations || generated.destinations,
          categories: enriched.categories || generated.categories,
        };
      } catch (imageError) {
        console.warn(
          '[Homepage Config] Failed to enrich with images, using config without images:',
          imageError
        );
        return generated;
      }
    }

    throw new Error('Failed to parse AI-generated homepage config');
  } catch (error) {
    console.error('[Homepage Config] AI generation failed:', error);
    return await createTemplateHomepageConfig(opportunity, brandIdentity);
  }
}

/**
 * Create template-based homepage config as fallback
 */
async function createTemplateHomepageConfig(
  opportunity: OpportunityContext,
  brandIdentity: ComprehensiveBrandIdentity
): Promise<HomepageConfig> {
  const location = opportunity.location?.split(',')[0]?.trim() || '';
  const niche = opportunity.niche.toLowerCase();

  // Map niche to category path
  const nicheToCategory: Record<string, string> = {
    'food tours': 'food-wine-and-beer-experiences',
    'wine tours': 'food-wine-and-beer-experiences',
    culinary: 'food-wine-and-beer-experiences',
    food: 'food-wine-and-beer-experiences',
    sightseeing: 'sightseeing-tours',
    tours: 'sightseeing-tours',
    adventure: 'outdoor-activities',
    outdoor: 'outdoor-activities',
    hiking: 'outdoor-activities',
    cultural: 'cultural-experiences',
    museums: 'cultural-experiences',
    history: 'cultural-experiences',
    water: 'water-activities',
    boats: 'water-activities',
    cruises: 'water-activities',
    'theme parks': 'theme-parks-and-attractions',
    attractions: 'theme-parks-and-attractions',
    shows: 'shows-and-events',
    events: 'shows-and-events',
    spa: 'wellness-and-spa',
    wellness: 'wellness-and-spa',
  };

  const categoryPath =
    Object.entries(nicheToCategory).find(([key]) => niche.includes(key))?.[1] ||
    'sightseeing-tours';

  // Generate niche-specific categories
  const nicheCategories: Record<
    string,
    Array<{ name: string; slug: string; icon: string; description: string }>
  > = {
    'food tours': [
      {
        name: 'Wine Tasting',
        slug: 'wine-tasting',
        icon: '🍷',
        description: 'Discover exceptional local wines and vineyards with expert sommeliers.',
      },
      {
        name: 'Brewery Tours',
        slug: 'brewery-tours',
        icon: '🍺',
        description: 'Explore craft breweries and taste unique local beers.',
      },
      {
        name: 'Fine Dining',
        slug: 'fine-dining',
        icon: '🍽️',
        description: 'Experience world-class restaurants and Michelin-starred cuisine.',
      },
      {
        name: 'Street Food',
        slug: 'street-food',
        icon: '🥙',
        description: 'Sample authentic local flavors from the best street vendors.',
      },
      {
        name: 'Cooking Classes',
        slug: 'cooking-classes',
        icon: '👨‍🍳',
        description: 'Learn traditional recipes from expert local chefs.',
      },
      {
        name: 'Market Tours',
        slug: 'market-tours',
        icon: '🛒',
        description: 'Explore vibrant local markets with a knowledgeable guide.',
      },
    ],
    sightseeing: [
      {
        name: 'Walking Tours',
        slug: 'walking-tours',
        icon: '🚶',
        description: 'Discover hidden gems on foot with expert local guides.',
      },
      {
        name: 'Bus Tours',
        slug: 'bus-tours',
        icon: '🚌',
        description: 'See all the highlights comfortably from an open-top bus.',
      },
      {
        name: 'Boat Tours',
        slug: 'boat-tours',
        icon: '🚢',
        description: 'Experience the city from a unique waterside perspective.',
      },
      {
        name: 'Night Tours',
        slug: 'night-tours',
        icon: '🌃',
        description: 'Discover the magic of the city after dark.',
      },
      {
        name: 'Photography Tours',
        slug: 'photography-tours',
        icon: '📸',
        description: 'Capture stunning photos at the best locations.',
      },
      {
        name: 'Private Tours',
        slug: 'private-tours',
        icon: '🎩',
        description: 'Enjoy an exclusive, personalized touring experience.',
      },
    ],
    adventure: [
      {
        name: 'Hiking',
        slug: 'hiking',
        icon: '🥾',
        description: 'Trek through stunning landscapes with experienced guides.',
      },
      {
        name: 'Kayaking',
        slug: 'kayaking',
        icon: '🛶',
        description: 'Paddle through scenic waterways and hidden coves.',
      },
      {
        name: 'Climbing',
        slug: 'climbing',
        icon: '🧗',
        description: 'Challenge yourself on world-class climbing routes.',
      },
      {
        name: 'Ziplining',
        slug: 'ziplining',
        icon: '🎿',
        description: 'Soar through the air on thrilling zipline adventures.',
      },
      {
        name: 'Caving',
        slug: 'caving',
        icon: '🦇',
        description: 'Explore underground wonders and ancient caves.',
      },
      {
        name: 'Rafting',
        slug: 'rafting',
        icon: '🚣',
        description: 'Navigate exciting rapids with professional guides.',
      },
    ],
  };

  // Find matching categories or use default
  const matchingCategories = Object.entries(nicheCategories).find(([key]) =>
    niche.includes(key)
  )?.[1] || [
    {
      name: 'Tours',
      slug: 'tours',
      icon: '🗺️',
      description: 'Guided tours to discover the best of the destination.',
    },
    {
      name: 'Activities',
      slug: 'activities',
      icon: '🎯',
      description: 'Exciting activities for all interests and skill levels.',
    },
    {
      name: 'Experiences',
      slug: 'experiences',
      icon: '✨',
      description: "Unique and memorable experiences you won't forget.",
    },
    {
      name: 'Classes',
      slug: 'classes',
      icon: '📚',
      description: 'Learn new skills from expert local instructors.',
    },
    {
      name: 'Day Trips',
      slug: 'day-trips',
      icon: '🚗',
      description: 'Explore beyond the city on exciting day excursions.',
    },
    {
      name: 'Private',
      slug: 'private',
      icon: '🌟',
      description: 'Exclusive private experiences tailored just for you.',
    },
  ];

  const config: HomepageConfig = {
    hero: {
      title: brandIdentity.tagline || `Discover ${capitalize(niche)} Experiences`,
      subtitle: `Book the best ${niche} experiences in ${location || 'your destination'}`,
    },
    popularExperiences: {
      title: `Popular ${capitalize(niche)} Experiences`,
      subtitle: `Discover the most loved ${niche} experiences`,
      destination: location || undefined,
      categoryPath,
      searchTerms: [niche],
    },
    destinations: location
      ? [
          // For location-specific sites, show areas within the city
          {
            name: 'Central',
            slug: `${location.toLowerCase()}-central`,
            icon: '🏛️',
            description: `Explore the heart of ${location} with its iconic landmarks and attractions.`,
          },
          {
            name: 'Old Town',
            slug: `${location.toLowerCase()}-old-town`,
            icon: '🏰',
            description: `Step back in time through charming historic streets and ancient architecture.`,
          },
          {
            name: 'Waterfront',
            slug: `${location.toLowerCase()}-waterfront`,
            icon: '🌊',
            description: `Enjoy stunning views and riverside experiences along the waterfront.`,
          },
          {
            name: 'Markets',
            slug: `${location.toLowerCase()}-markets`,
            icon: '🛒',
            description: `Discover vibrant markets bursting with local flavors and artisan goods.`,
          },
          {
            name: 'Historic',
            slug: `${location.toLowerCase()}-historic`,
            icon: '🏺',
            description: `Uncover centuries of history in beautifully preserved heritage sites.`,
          },
          {
            name: 'Modern',
            slug: `${location.toLowerCase()}-modern`,
            icon: '🏢',
            description: `Experience contemporary culture in the city's dynamic modern districts.`,
          },
          {
            name: 'Suburban',
            slug: `${location.toLowerCase()}-suburban`,
            icon: '🌳',
            description: `Escape to peaceful neighborhoods with local charm and hidden gems.`,
          },
          {
            name: 'Downtown',
            slug: `${location.toLowerCase()}-downtown`,
            icon: '🌆',
            description: `Feel the energy of downtown with world-class dining, shopping, and entertainment.`,
          },
        ]
      : [
          // Default destinations for general sites
          {
            name: 'London',
            slug: 'london',
            icon: '🇬🇧',
            description:
              'Experience world-class culture, history, and entertainment in the UK capital.',
          },
          {
            name: 'Paris',
            slug: 'paris',
            icon: '🇫🇷',
            description: 'Discover romance, art, and culinary excellence in the City of Light.',
          },
          {
            name: 'Barcelona',
            slug: 'barcelona',
            icon: '🇪🇸',
            description: 'Enjoy stunning architecture, beaches, and vibrant Catalan culture.',
          },
          {
            name: 'Rome',
            slug: 'rome',
            icon: '🇮🇹',
            description: 'Walk through ancient history and savor authentic Italian experiences.',
          },
          {
            name: 'Amsterdam',
            slug: 'amsterdam',
            icon: '🇳🇱',
            description: 'Explore charming canals, world-class museums, and Dutch hospitality.',
          },
          {
            name: 'Edinburgh',
            slug: 'edinburgh',
            icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
            description: 'Discover medieval charm and Scottish heritage in this historic capital.',
          },
          {
            name: 'Lisbon',
            slug: 'lisbon',
            icon: '🇵🇹',
            description:
              'Experience colorful neighborhoods, delicious cuisine, and coastal beauty.',
          },
          {
            name: 'Berlin',
            slug: 'berlin',
            icon: '🇩🇪',
            description: 'Explore modern culture, fascinating history, and creative energy.',
          },
        ],
    categories: matchingCategories,
    testimonials: [
      {
        name: 'Sarah M.',
        location: location ? `${location}, UK` : 'London, UK',
        text: `Absolutely fantastic ${niche} experience! The booking was seamless and exceeded all expectations.`,
        rating: 5,
      },
      {
        name: 'James T.',
        location: 'New York, US',
        text: `Great selection and competitive prices. The free cancellation policy gave us peace of mind.`,
        rating: 5,
      },
      {
        name: 'Maria L.',
        location: 'Barcelona, Spain',
        text: `We booked a ${niche} tour and it was perfectly organized. Easy to book and excellent support.`,
        rating: 4,
      },
    ],
  };

  // Try to enrich with images (hero, destinations, categories - non-blocking)
  try {
    const enriched = await enrichHomepageConfigWithImages(
      {
        hero: config.hero,
        destinations: config.destinations,
        categories: config.categories,
      },
      {
        location: opportunity.location,
        niche: opportunity.niche,
      }
    );
    return {
      ...config,
      hero: enriched.hero || config.hero,
      destinations: enriched.destinations || config.destinations,
      categories: enriched.categories || config.categories,
    };
  } catch (imageError) {
    console.warn('[Homepage Config] Failed to enrich template with images:', imageError);
    return config;
  }
}

/**
 * Store homepage config in database
 */
export async function storeHomepageConfig(siteId: string, config: HomepageConfig): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: {
      homepageConfig: config as any,
    },
  });

  console.log(`[Homepage Config] Stored homepage config for site ${siteId}`);
}

// Helper functions
/**
 * Clean up an entity name for use as a brand name.
 * Removes corporate suffixes (Pty Ltd, LLC, etc.) and trims.
 */
function cleanEntityName(name: string): string {
  return name
    .replace(
      /\s*(Pty\.?\s*Ltd\.?|Ltd\.?|LLC|Inc\.?|S\.?A\.?S\.?|GmbH|S\.?R\.?L\.?|S\.?L\.?|B\.?V\.?|P\.?L\.?C\.?|Co\.?\s*Ltd\.?|Corp\.?|CC|Ltda\.?|EIRL|Pte\.?\s*Ltd\.?)\s*$/gi,
      ''
    )
    .replace(/\s*[-–]\s*$/, '')
    .trim();
}

function capitalize(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
