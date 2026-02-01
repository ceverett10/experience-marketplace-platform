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

// Helper functions
function capitalize(str: string): string {
  return str
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
