/**
 * Blog Topics Service
 * Generates SEO-focused blog topics based on site niche and location
 * Used for initial site creation and ongoing content strategy
 */

import { createClaudeClient } from '@experience-marketplace/content-engine';

export interface BlogTopicSuggestion {
  title: string;
  slug: string;
  targetKeyword: string;
  secondaryKeywords: string[];
  contentType: 'guide' | 'listicle' | 'how-to' | 'comparison' | 'tips';
  estimatedSearchVolume: 'high' | 'medium' | 'low';
  intent: 'informational' | 'commercial';
  outline?: string[];
}

export interface BlogTopicContext {
  siteName: string;
  niche: string;
  location?: string;
  destination?: string;
  existingTopics?: string[]; // To avoid duplicates
}

/**
 * Generate blog topics for a site based on its niche and location
 * Returns a mix of informational and commercial intent topics
 */
export async function generateBlogTopics(
  context: BlogTopicContext,
  count: number = 5
): Promise<BlogTopicSuggestion[]> {
  console.log(
    `[Blog Topics] Generating ${count} topics for ${context.siteName} (${context.niche})`
  );

  try {
    const client = createClaudeClient({
      apiKey: process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '',
    });

    const existingTopicsNote = context.existingTopics?.length
      ? `\n\nAVOID THESE EXISTING TOPICS (already covered):\n${context.existingTopics.map((t) => `- ${t}`).join('\n')}`
      : '';

    const prompt = `Generate ${count} SEO-optimized blog post ideas for a travel experience marketplace.

SITE CONTEXT:
- Site Name: ${context.siteName}
- Niche: ${context.niche}
- Location Focus: ${context.location || context.destination || 'General'}
${existingTopicsNote}

REQUIREMENTS:
1. Topics should drive organic search traffic
2. Mix of content types: guides, listicles, how-tos, tips, comparisons
3. Include both informational content (for top-of-funnel) and commercial content (for conversion)
4. Focus on long-tail keywords specific to the niche and location
5. Topics should be evergreen when possible
6. Each topic should have clear search intent

CONTENT TYPE DEFINITIONS:
- guide: Comprehensive destination or activity guides (e.g., "Complete Guide to Food Tours in London")
- listicle: Numbered lists (e.g., "10 Best Markets to Visit in London")
- how-to: Practical instructions (e.g., "How to Plan the Perfect Food Tour Experience")
- comparison: Compare options (e.g., "Walking Tours vs Food Tours: Which is Right for You")
- tips: Expert advice (e.g., "Insider Tips for Getting the Most Out of Your Food Tour")

Return a JSON array with exactly ${count} topics:
[
  {
    "title": "SEO-optimized title with primary keyword",
    "slug": "url-friendly-slug",
    "targetKeyword": "primary keyword phrase",
    "secondaryKeywords": ["related keyword 1", "related keyword 2", "related keyword 3"],
    "contentType": "guide|listicle|how-to|comparison|tips",
    "estimatedSearchVolume": "high|medium|low",
    "intent": "informational|commercial",
    "outline": ["Section 1", "Section 2", "Section 3"]
  }
]

Only return valid JSON, no other text.`;

    const response = await client.generate({
      model: client.getModelId('sonnet'),
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 3000,
      temperature: 0.8,
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const topics = JSON.parse(jsonMatch[0]) as BlogTopicSuggestion[];
      console.log(`[Blog Topics] Generated ${topics.length} topics`);
      return topics;
    }

    console.warn('[Blog Topics] Failed to parse AI response, using fallback topics');
    return generateFallbackTopics(context, count);
  } catch (error) {
    console.error('[Blog Topics] Error generating topics:', error);
    return generateFallbackTopics(context, count);
  }
}

/**
 * Generate fallback topics when AI generation fails
 */
function generateFallbackTopics(context: BlogTopicContext, count: number): BlogTopicSuggestion[] {
  const location = context.location || context.destination || '';
  const niche = context.niche;
  const nicheCapitalized = niche.charAt(0).toUpperCase() + niche.slice(1);
  const locationCapitalized = location ? location.charAt(0).toUpperCase() + location.slice(1) : '';

  const templates: BlogTopicSuggestion[] = [
    {
      title: location
        ? `The Complete Guide to ${nicheCapitalized} in ${locationCapitalized}`
        : `The Ultimate ${nicheCapitalized} Guide for Travelers`,
      slug: location
        ? `complete-guide-${niche.replace(/\s+/g, '-')}-${location.replace(/\s+/g, '-').toLowerCase()}`
        : `ultimate-${niche.replace(/\s+/g, '-')}-guide`,
      targetKeyword: location ? `${niche} in ${location}` : `${niche} guide`,
      secondaryKeywords: [`best ${niche}`, `${niche} tips`, `${niche} recommendations`],
      contentType: 'guide',
      estimatedSearchVolume: 'high',
      intent: 'informational',
      outline: ['What to Expect', 'Best Options', 'Booking Tips', 'What to Bring'],
    },
    {
      title: location
        ? `10 Best ${nicheCapitalized} Experiences in ${locationCapitalized}`
        : `10 Must-Try ${nicheCapitalized} Experiences`,
      slug: location
        ? `best-${niche.replace(/\s+/g, '-')}-${location.replace(/\s+/g, '-').toLowerCase()}`
        : `best-${niche.replace(/\s+/g, '-')}-experiences`,
      targetKeyword: location ? `best ${niche} ${location}` : `best ${niche}`,
      secondaryKeywords: [`top ${niche}`, `${niche} recommendations`, `popular ${niche}`],
      contentType: 'listicle',
      estimatedSearchVolume: 'high',
      intent: 'commercial',
      outline: ['Introduction', 'Top 10 List', 'How to Choose', 'Booking Tips'],
    },
    {
      title: `How to Plan the Perfect ${nicheCapitalized} Experience`,
      slug: `how-to-plan-${niche.replace(/\s+/g, '-')}-experience`,
      targetKeyword: `how to plan ${niche}`,
      secondaryKeywords: [`${niche} planning`, `${niche} tips`, `first time ${niche}`],
      contentType: 'how-to',
      estimatedSearchVolume: 'medium',
      intent: 'informational',
      outline: ['Before You Go', 'What to Expect', 'Tips for First-Timers', 'Common Mistakes'],
    },
    {
      title: location
        ? `Insider Tips for ${nicheCapitalized} in ${locationCapitalized}`
        : `Expert Tips for Getting the Most Out of Your ${nicheCapitalized}`,
      slug: location
        ? `insider-tips-${niche.replace(/\s+/g, '-')}-${location.replace(/\s+/g, '-').toLowerCase()}`
        : `expert-${niche.replace(/\s+/g, '-')}-tips`,
      targetKeyword: location ? `${niche} tips ${location}` : `${niche} tips`,
      secondaryKeywords: [`${niche} advice`, `${niche} secrets`, `${niche} hacks`],
      contentType: 'tips',
      estimatedSearchVolume: 'medium',
      intent: 'informational',
      outline: ['Best Times to Go', 'Money-Saving Tips', 'Hidden Gems', 'What Locals Know'],
    },
    {
      title: `What to Expect on a ${nicheCapitalized} Experience: A First-Timer's Guide`,
      slug: `what-to-expect-${niche.replace(/\s+/g, '-')}`,
      targetKeyword: `what to expect ${niche}`,
      secondaryKeywords: [`first ${niche}`, `${niche} beginner`, `${niche} expectations`],
      contentType: 'guide',
      estimatedSearchVolume: 'medium',
      intent: 'informational',
      outline: ['Before the Experience', 'During the Experience', 'After the Experience', 'FAQs'],
    },
  ];

  return templates.slice(0, count);
}

/**
 * Generate weekly blog topics for an active site
 * Focuses on seasonal, trending, and evergreen content mix
 */
export async function generateWeeklyBlogTopics(
  context: BlogTopicContext,
  weekNumber: number = 1
): Promise<BlogTopicSuggestion[]> {
  // For variety, rotate focus each week
  const weeklyFocus = ['seasonal', 'trending', 'evergreen', 'local-insights'][(weekNumber - 1) % 4];

  console.log(`[Blog Topics] Generating weekly topics with focus: ${weeklyFocus}`);

  try {
    const client = createClaudeClient({
      apiKey: process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '',
    });

    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    const currentSeason = getSeason();

    const prompt = `Generate 4 SEO-optimized blog post ideas for this week.

SITE CONTEXT:
- Site Name: ${context.siteName}
- Niche: ${context.niche}
- Location Focus: ${context.location || context.destination || 'General'}
- Current Month: ${currentMonth}
- Current Season: ${currentSeason}
- Weekly Focus: ${weeklyFocus}

EXISTING TOPICS TO AVOID:
${context.existingTopics?.map((t) => `- ${t}`).join('\n') || 'None yet'}

WEEKLY FOCUS GUIDELINES:
- seasonal: Topics relevant to current season/month (holidays, weather, events)
- trending: Popular search topics, current travel trends
- evergreen: Timeless content that performs year-round
- local-insights: Deep-dive into specific locations, neighborhoods, hidden gems

Generate 4 topics that will drive organic traffic. Mix informational and commercial intent.

Return a JSON array:
[
  {
    "title": "SEO title",
    "slug": "url-slug",
    "targetKeyword": "primary keyword",
    "secondaryKeywords": ["kw1", "kw2", "kw3"],
    "contentType": "guide|listicle|how-to|comparison|tips",
    "estimatedSearchVolume": "high|medium|low",
    "intent": "informational|commercial",
    "outline": ["Section 1", "Section 2", "Section 3"]
  }
]

Only return valid JSON.`;

    const response = await client.generate({
      model: client.getModelId('haiku'), // Use haiku for cost efficiency on weekly generation
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
      temperature: 0.9,
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    const jsonMatch = content.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const topics = JSON.parse(jsonMatch[0]) as BlogTopicSuggestion[];
      console.log(`[Blog Topics] Generated ${topics.length} weekly topics`);
      return topics;
    }

    return generateFallbackTopics(context, 4);
  } catch (error) {
    console.error('[Blog Topics] Error generating weekly topics:', error);
    return generateFallbackTopics(context, 4);
  }
}

function getSeason(): string {
  const month = new Date().getMonth();
  if (month >= 2 && month <= 4) return 'Spring';
  if (month >= 5 && month <= 7) return 'Summer';
  if (month >= 8 && month <= 10) return 'Autumn';
  return 'Winter';
}
