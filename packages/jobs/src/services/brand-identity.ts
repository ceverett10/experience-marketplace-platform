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

interface OpportunityContext {
  keyword: string;
  location?: string;
  niche: string;
  searchVolume: number;
  intent: string;
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

    const prompt = `You are a brand strategist creating a comprehensive brand identity for a new travel experience marketplace website.

Context:
- Target Market: ${opportunity.location || 'Multiple locations'}
- Niche: ${opportunity.niche}
- Primary Keyword: ${opportunity.keyword}
- Search Volume: ${opportunity.searchVolume}/month
- Search Intent: ${opportunity.intent}

Create a complete brand identity that positions this site as THE trusted authority for ${opportunity.niche} experiences in ${opportunity.location || 'this market'}.

Generate a comprehensive brand identity with:

1. VISUAL IDENTITY:
   - Brand name (memorable, professional, 2-3 words max)
   - Tagline (compelling, trust-building, under 60 chars)
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
      model: client.getModelId('sonnet'),
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
 * Create template-based brand identity as fallback
 */
function createTemplateBrandIdentity(opportunity: OpportunityContext): ComprehensiveBrandIdentity {
  const location = opportunity.location?.split(',')[0]?.trim() || 'Premium';
  const niche = capitalize(opportunity.niche);

  return {
    name: `${location} ${niche}`,
    tagline: `Your Trusted Source for ${niche} Experiences`,
    primaryColor: '#2563eb', // Professional blue
    secondaryColor: '#7c3aed', // Complementary purple
    accentColor: '#f59e0b', // Warm accent
    headingFont: 'Poppins',
    bodyFont: 'Inter',
    logoUrl: null,
    logoDescription: `Modern logo featuring ${niche.toLowerCase()} imagery with ${location} elements`,

    toneOfVoice: {
      personality: ['Professional', 'Knowledgeable', 'Trustworthy', 'Helpful'],
      writingStyle: 'Clear, authoritative yet approachable. We educate and guide rather than sell aggressively.',
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
 * Store extended brand information in database
 * Stores complex data in JSON fields
 */
export async function storeBrandIdentity(
  siteId: string,
  brandId: string,
  identity: ComprehensiveBrandIdentity
): Promise<void> {
  // Store extended brand data in seoConfig JSON field for now
  // In future, could extend Brand model with dedicated fields
  await prisma.site.update({
    where: { id: siteId },
    data: {
      seoConfig: {
        ...identity.contentGuidelines,
        toneOfVoice: identity.toneOfVoice,
        trustSignals: identity.trustSignals,
        brandStory: identity.brandStory,
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

4. TESTIMONIALS (3 items):
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
    {"name": "Area Name", "slug": "area-name", "icon": "emoji"}
  ],
  "testimonials": [
    {"name": "Name I.", "location": "City, Country", "text": "Review text", "rating": 5}
  ]
}`;

    const response = await client.generate({
      model: client.getModelId('sonnet'),
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      temperature: 0.7,
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const generated = JSON.parse(jsonMatch[0]);
      console.log(`[Homepage Config] Generated config for ${brandIdentity.name}`);
      return generated as HomepageConfig;
    }

    throw new Error('Failed to parse AI-generated homepage config');
  } catch (error) {
    console.error('[Homepage Config] AI generation failed:', error);
    return createTemplateHomepageConfig(opportunity, brandIdentity);
  }
}

/**
 * Create template-based homepage config as fallback
 */
function createTemplateHomepageConfig(
  opportunity: OpportunityContext,
  brandIdentity: ComprehensiveBrandIdentity
): HomepageConfig {
  const location = opportunity.location?.split(',')[0]?.trim() || '';
  const niche = opportunity.niche.toLowerCase();

  // Map niche to category path
  const nicheToCategory: Record<string, string> = {
    'food tours': 'food-wine-and-beer-experiences',
    'wine tours': 'food-wine-and-beer-experiences',
    'culinary': 'food-wine-and-beer-experiences',
    'food': 'food-wine-and-beer-experiences',
    'sightseeing': 'sightseeing-tours',
    'tours': 'sightseeing-tours',
    'adventure': 'outdoor-activities',
    'outdoor': 'outdoor-activities',
    'hiking': 'outdoor-activities',
    'cultural': 'cultural-experiences',
    'museums': 'cultural-experiences',
    'history': 'cultural-experiences',
    'water': 'water-activities',
    'boats': 'water-activities',
    'cruises': 'water-activities',
    'theme parks': 'theme-parks-and-attractions',
    'attractions': 'theme-parks-and-attractions',
    'shows': 'shows-and-events',
    'events': 'shows-and-events',
    'spa': 'wellness-and-spa',
    'wellness': 'wellness-and-spa',
  };

  const categoryPath = Object.entries(nicheToCategory).find(
    ([key]) => niche.includes(key)
  )?.[1] || 'sightseeing-tours';

  return {
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
          { name: 'Central', slug: `${location.toLowerCase()}-central`, icon: '🏛️' },
          { name: 'Old Town', slug: `${location.toLowerCase()}-old-town`, icon: '🏰' },
          { name: 'Waterfront', slug: `${location.toLowerCase()}-waterfront`, icon: '🌊' },
          { name: 'Markets', slug: `${location.toLowerCase()}-markets`, icon: '🛒' },
          { name: 'Historic', slug: `${location.toLowerCase()}-historic`, icon: '🏺' },
          { name: 'Modern', slug: `${location.toLowerCase()}-modern`, icon: '🏢' },
          { name: 'Suburban', slug: `${location.toLowerCase()}-suburban`, icon: '🌳' },
          { name: 'Downtown', slug: `${location.toLowerCase()}-downtown`, icon: '🌆' },
        ]
      : [
          // Default destinations for general sites
          { name: 'London', slug: 'london', icon: '🇬🇧' },
          { name: 'Paris', slug: 'paris', icon: '🇫🇷' },
          { name: 'Barcelona', slug: 'barcelona', icon: '🇪🇸' },
          { name: 'Rome', slug: 'rome', icon: '🇮🇹' },
          { name: 'Amsterdam', slug: 'amsterdam', icon: '🇳🇱' },
          { name: 'Edinburgh', slug: 'edinburgh', icon: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
          { name: 'Lisbon', slug: 'lisbon', icon: '🇵🇹' },
          { name: 'Berlin', slug: 'berlin', icon: '🇩🇪' },
        ],
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
}

/**
 * Store homepage config in database
 */
export async function storeHomepageConfig(
  siteId: string,
  config: HomepageConfig
): Promise<void> {
  await prisma.site.update({
    where: { id: siteId },
    data: {
      homepageConfig: config as any,
    },
  });

  console.log(`[Homepage Config] Stored homepage config for site ${siteId}`);
}

// Helper functions
function capitalize(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
