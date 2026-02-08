#!/usr/bin/env npx ts-node
/**
 * Fix Site Brand Identity Script
 *
 * Regenerates brand identity, homepage config, and SEO config for a site
 * using the correct niche/location data derived from its domain name.
 *
 * This fixes cases where a site was created with mismatched opportunity data.
 *
 * Usage:
 *   npx ts-node scripts/fix-site-brand.ts <siteId>                    # Dry run
 *   npx ts-node scripts/fix-site-brand.ts <siteId> --fix              # Apply fixes
 *   npx ts-node scripts/fix-site-brand.ts --domain=honeymoonexperiences.com --fix
 */

// Load dotenv only if available (development)
try {
  require('dotenv/config');
} catch {
  // In production, env vars are set by the platform
}
import { PrismaClient } from '@prisma/client';
import { createClaudeClient } from '@experience-marketplace/content-engine';

const prisma = new PrismaClient();

// Map common domain keywords to appropriate niche/location
const DOMAIN_NICHE_MAP: Record<string, { niche: string; location?: string; keywords: string[] }> = {
  honeymoon: {
    niche: 'romantic honeymoon experiences',
    keywords: [
      'honeymoon activities',
      'romantic getaways',
      'couples experiences',
      'honeymoon destinations',
    ],
  },
  wedding: {
    niche: 'wedding experiences',
    keywords: ['wedding venues', 'destination weddings', 'wedding planning'],
  },
  adventure: {
    niche: 'adventure experiences',
    keywords: ['adventure tours', 'outdoor activities', 'extreme sports'],
  },
  food: {
    niche: 'food tours',
    keywords: ['food tours', 'culinary experiences', 'cooking classes'],
  },
  wine: {
    niche: 'wine tours',
    keywords: ['wine tasting', 'vineyard tours', 'wine experiences'],
  },
  spa: {
    niche: 'spa and wellness',
    keywords: ['spa experiences', 'wellness retreats', 'relaxation'],
  },
  corporate: {
    niche: 'corporate team building',
    keywords: ['team building', 'corporate events', 'company retreats'],
  },
};

interface BrandIdentity {
  name: string;
  tagline: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  headingFont: string;
  bodyFont: string;
  toneOfVoice: {
    personality: string[];
    writingStyle: string;
    doList: string[];
    dontList: string[];
  };
  trustSignals: {
    expertise: string[];
    certifications: string[];
    yearsFounded: number;
    valuePropositions: string[];
    guarantees: string[];
  };
  brandStory: {
    mission: string;
    vision: string;
    values: string[];
    targetAudience: string;
    uniqueSellingPoints: string[];
  };
  contentGuidelines: {
    keyThemes: string[];
    contentPillars: string[];
    semanticKeywords: string[];
  };
}

function extractNicheFromDomain(domain: string): {
  niche: string;
  location?: string;
  keywords: string[];
} {
  const domainBase = domain.replace(/\.(com|co\.uk|net|io|org)$/i, '').toLowerCase();

  // Check against known patterns
  for (const [keyword, config] of Object.entries(DOMAIN_NICHE_MAP)) {
    if (domainBase.includes(keyword)) {
      return config;
    }
  }

  // Default to generic experiences
  return {
    niche: 'travel experiences',
    keywords: ['travel experiences', 'tours', 'activities'],
  };
}

async function generateBrandIdentity(
  domain: string,
  nicheConfig: { niche: string; location?: string; keywords: string[] }
): Promise<BrandIdentity> {
  const client = createClaudeClient({
    apiKey: process.env['ANTHROPIC_API_KEY'] || '',
  });

  // Generate brand name from domain
  const domainBase = domain.replace(/\.(com|co\.uk|net|io|org)$/i, '');
  const brandName = domainBase
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  const prompt = `You are a brand strategist creating a comprehensive brand identity for a travel experience marketplace.

Domain: ${domain}
Brand Name: ${brandName}
Niche: ${nicheConfig.niche}
${nicheConfig.location ? `Location: ${nicheConfig.location}` : 'Location: Global'}
Target Keywords: ${nicheConfig.keywords.join(', ')}

Create a complete brand identity that positions this site as THE trusted authority for ${nicheConfig.niche}.

Generate a comprehensive brand identity with:

1. VISUAL IDENTITY:
   - Tagline (compelling, trust-building, under 60 chars) - MUST relate to ${nicheConfig.niche}
   - Color palette (primary, secondary, accent hex codes)
   - Typography (2 Google Fonts)

2. TONE OF VOICE:
   - 3-4 personality traits appropriate for ${nicheConfig.niche}
   - Writing style description
   - 5 communication "dos"
   - 5 communication "don'ts"

3. TRUST & CREDIBILITY:
   - 4-5 areas of expertise for ${nicheConfig.niche}
   - Relevant industry certifications
   - Implied founding year (2015-2020)
   - 5 value propositions
   - 3 service guarantees

4. BRAND STORY:
   - Mission statement for ${nicheConfig.niche} (1 sentence)
   - Vision statement (1 sentence)
   - 5 core values
   - Target audience description for ${nicheConfig.niche}
   - 5 unique selling points

5. CONTENT GUIDELINES:
   - 5 key themes related to ${nicheConfig.niche}
   - 4 content pillars
   - 10 semantic keywords

IMPORTANT: Everything must be relevant to "${nicheConfig.niche}" - do NOT use generic or unrelated themes.

Return ONLY valid JSON with this structure:
{
  "name": "${brandName}",
  "tagline": "Tagline about ${nicheConfig.niche}",
  "primaryColor": "#hexcode",
  "secondaryColor": "#hexcode",
  "accentColor": "#hexcode",
  "headingFont": "Font Name",
  "bodyFont": "Font Name",
  "toneOfVoice": {
    "personality": ["trait1", "trait2", "trait3"],
    "writingStyle": "Description",
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
    "mission": "Mission for ${nicheConfig.niche}",
    "vision": "Vision statement",
    "values": ["value1", "value2", "value3", "value4", "value5"],
    "targetAudience": "Target audience for ${nicheConfig.niche}",
    "uniqueSellingPoints": ["usp1", "usp2", "usp3", "usp4", "usp5"]
  },
  "contentGuidelines": {
    "keyThemes": ["theme1", "theme2", "theme3", "theme4", "theme5"],
    "contentPillars": ["pillar1", "pillar2", "pillar3", "pillar4"],
    "semanticKeywords": ["kw1", "kw2", "kw3", "kw4", "kw5", "kw6", "kw7", "kw8", "kw9", "kw10"]
  }
}`;

  const response = await client.generate({
    model: client.getModelId('sonnet'),
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 3000,
    temperature: 0.7,
  });

  const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
  const jsonMatch = content.match(/\{[\s\S]*\}/);

  if (!jsonMatch) {
    throw new Error('Failed to parse AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

interface HomepageConfig {
  hero: {
    title: string;
    subtitle: string;
  };
  popularExperiences?: {
    title: string;
    subtitle: string;
    categoryPath?: string;
    searchTerms?: string[];
  };
  destinations?: Array<{ name: string; slug: string; icon: string; description: string }>;
  categories?: Array<{ name: string; slug: string; icon: string; description: string }>;
  testimonials?: Array<{ name: string; location: string; text: string; rating: number }>;
}

async function generateHomepageConfig(
  brandIdentity: BrandIdentity,
  nicheConfig: { niche: string; location?: string; keywords: string[] }
): Promise<HomepageConfig> {
  const client = createClaudeClient({
    apiKey: process.env['ANTHROPIC_API_KEY'] || '',
  });

  const prompt = `Generate a homepage configuration for a ${nicheConfig.niche} travel marketplace.

Brand: ${brandIdentity.name}
Tagline: ${brandIdentity.tagline}
Niche: ${nicheConfig.niche}
${nicheConfig.location ? `Location: ${nicheConfig.location}` : ''}

Create:
1. HERO: Title and subtitle that speak to ${nicheConfig.niche}
2. POPULAR EXPERIENCES: Query config with relevant category
3. DESTINATIONS: 6-8 popular destinations for ${nicheConfig.niche}
4. CATEGORIES: 6-8 experience categories relevant to ${nicheConfig.niche}
5. TESTIMONIALS: 3 realistic reviews about ${nicheConfig.niche}

IMPORTANT: All content must be specific to "${nicheConfig.niche}" - not generic travel.

Return ONLY valid JSON:
{
  "hero": {
    "title": "Hero title about ${nicheConfig.niche}",
    "subtitle": "Supporting message"
  },
  "popularExperiences": {
    "title": "Section title",
    "subtitle": "Section subtitle",
    "categoryPath": "relevant-category",
    "searchTerms": ["term1", "term2"]
  },
  "destinations": [
    {"name": "Destination", "slug": "destination", "icon": "emoji", "description": "Why great for ${nicheConfig.niche}"}
  ],
  "categories": [
    {"name": "Category", "slug": "category", "icon": "emoji", "description": "Description"}
  ],
  "testimonials": [
    {"name": "Name I.", "location": "City", "text": "Review about ${nicheConfig.niche}", "rating": 5}
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

  if (!jsonMatch) {
    throw new Error('Failed to parse AI response');
  }

  return JSON.parse(jsonMatch[0]);
}

async function main() {
  const args = process.argv.slice(2);
  const shouldFix = args.includes('--fix');
  const siteIdArg = args.find((arg) => !arg.startsWith('--'));
  const domainArg = args.find((arg) => arg.startsWith('--domain='));
  const targetDomain = domainArg?.split('=')[1];

  console.log('='.repeat(60));
  console.log('Fix Site Brand Identity Tool');
  console.log('='.repeat(60));

  // Find the site
  let site;
  if (siteIdArg) {
    site = await prisma.site.findUnique({
      where: { id: siteIdArg },
      include: { brand: true },
    });
  } else if (targetDomain) {
    site = await prisma.site.findFirst({
      where: { primaryDomain: targetDomain },
      include: { brand: true },
    });
  } else {
    console.error('\nUsage: npx ts-node scripts/fix-site-brand.ts <siteId> [--fix]');
    console.error('       npx ts-node scripts/fix-site-brand.ts --domain=example.com [--fix]');
    process.exit(1);
  }

  if (!site) {
    console.error('\nSite not found');
    process.exit(1);
  }

  console.log('\n[1/4] Current Site Data');
  console.log('-'.repeat(40));
  console.log('ID:', site.id);
  console.log('Name:', site.name);
  console.log('Domain:', site.primaryDomain);
  console.log('Current Brand Tagline:', site.brand?.tagline);

  const currentSeoConfig = site.seoConfig as any;
  console.log('Current Mission:', currentSeoConfig?.brandStory?.mission?.substring(0, 80) + '...');

  // Extract niche from domain
  const domain = site.primaryDomain || site.slug + '.com';
  const nicheConfig = extractNicheFromDomain(domain);

  console.log('\n[2/4] Detected Niche from Domain');
  console.log('-'.repeat(40));
  console.log('Domain:', domain);
  console.log('Detected Niche:', nicheConfig.niche);
  console.log('Keywords:', nicheConfig.keywords.join(', '));

  if (!shouldFix) {
    console.log('\n[DRY RUN] Would regenerate brand identity with:');
    console.log('  - Niche:', nicheConfig.niche);
    console.log('  - Keywords:', nicheConfig.keywords.join(', '));
    console.log('\nTo apply fixes, re-run with --fix flag');
    return;
  }

  // Generate new brand identity
  console.log('\n[3/4] Generating New Brand Identity...');
  console.log('-'.repeat(40));

  const newBrandIdentity = await generateBrandIdentity(domain, nicheConfig);
  console.log('New Tagline:', newBrandIdentity.tagline);
  console.log('New Mission:', newBrandIdentity.brandStory.mission);
  console.log(
    'New Target Audience:',
    newBrandIdentity.brandStory.targetAudience.substring(0, 80) + '...'
  );

  // Generate new homepage config
  console.log('\n[4/4] Generating New Homepage Config...');
  console.log('-'.repeat(40));

  const newHomepageConfig = await generateHomepageConfig(newBrandIdentity, nicheConfig);
  console.log('New Hero Title:', newHomepageConfig.hero.title);
  console.log('New Hero Subtitle:', newHomepageConfig.hero.subtitle);

  // Apply updates
  console.log('\nApplying updates to database...');

  // Update brand
  if (site.brand) {
    await prisma.brand.update({
      where: { id: site.brand.id },
      data: {
        tagline: newBrandIdentity.tagline,
        primaryColor: newBrandIdentity.primaryColor,
        secondaryColor: newBrandIdentity.secondaryColor,
        accentColor: newBrandIdentity.accentColor,
        headingFont: newBrandIdentity.headingFont,
        bodyFont: newBrandIdentity.bodyFont,
        generationPrompt: `Brand identity for ${nicheConfig.niche}`,
      },
    });
    console.log('  Updated Brand record');
  }

  // Update site with new SEO config and homepage config
  await prisma.site.update({
    where: { id: site.id },
    data: {
      seoConfig: {
        ...newBrandIdentity.contentGuidelines,
        toneOfVoice: newBrandIdentity.toneOfVoice,
        trustSignals: newBrandIdentity.trustSignals,
        brandStory: newBrandIdentity.brandStory,
      },
      homepageConfig: newHomepageConfig as any,
    },
  });
  console.log('  Updated Site seoConfig and homepageConfig');

  console.log('\n' + '='.repeat(60));
  console.log('SUCCESS: Brand identity regenerated for', site.primaryDomain);
  console.log('='.repeat(60));
  console.log('\nNew brand is now aligned with:', nicheConfig.niche);
  console.log('\nNote: You may want to regenerate page content to match the new brand.');
}

main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
