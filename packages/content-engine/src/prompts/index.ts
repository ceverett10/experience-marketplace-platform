import type { ContentBrief, ContentType, QualityIssue } from '../types';

/**
 * Base system prompt for all content generation
 */
export const SYSTEM_PROMPTS = {
  contentWriter: `You are an expert travel content writer specializing in creating engaging, SEO-optimized content for experience and activity booking websites.

Your writing style is:
- Engaging and evocative, painting vivid pictures of experiences
- Action-oriented with clear calls-to-action
- Trustworthy with accurate, factual information
- SEO-conscious with natural keyword integration
- Conversion-focused while being genuinely helpful

Guidelines:
- Never make up facts about experiences, prices, or logistics
- Use the provided source data as the single source of truth
- Include practical information travelers actually need
- Create scannable content with clear headings and short paragraphs
- End with compelling reasons to book`,

  qualityAssessor: `You are an expert content quality assessor specializing in travel and tourism content. Your job is to evaluate content against strict quality standards.

Evaluation criteria:
1. Factual Accuracy (0-100): Does the content match provided source data? Are claims verifiable?
2. SEO Compliance (0-100): Is the target keyword naturally integrated? Are headings structured correctly?
3. Readability (0-100): Is the content easy to read? Appropriate sentence length and vocabulary?
4. Uniqueness (0-100): Is this original content, not generic template filler?
5. Engagement (0-100): Does it hook readers? Include compelling CTAs? Drive desire to book?

You must be critical and specific. Identify exact issues with line references where possible.
Output your assessment as valid JSON only.`,

  rewriter: `You are an expert content editor improving travel content based on specific feedback.

Your task is to:
- Address each identified issue directly
- Maintain the original tone and structure where not flagged
- Preserve accurate factual information from source data
- Improve the specific areas flagged while keeping good elements
- Ensure all fixes align with the overall content brief`,
};

/**
 * Destination page content prompt
 */
export function buildDestinationPrompt(brief: ContentBrief): string {
  const { targetKeyword, secondaryKeywords, destination, sourceData, tone, targetLength } = brief;

  return `Create a comprehensive destination page for "${destination}" targeting the keyword "${targetKeyword}".

## Content Requirements
- Target length: ${targetLength.min}-${targetLength.max} words
- Tone: ${tone}
- Secondary keywords to include naturally: ${secondaryKeywords.join(', ')}

## Required Sections
1. **Hero Introduction** (100-150 words)
   - Hook readers with what makes this destination special
   - Include the target keyword in the first paragraph
   - Set expectations for what experiences await

2. **Top Experiences** (200-300 words)
   - Highlight 4-6 must-do activities in ${destination}
   - Use evocative language that creates desire
   - Include practical details (duration, best time, etc.)

3. **When to Visit** (100-150 words)
   - Best seasons/times to visit
   - Weather considerations
   - Peak vs off-peak advice

4. **Practical Information** (100-150 words)
   - Getting there
   - Getting around
   - Essential tips

5. **Why Book with Us** (50-100 words)
   - Trust signals
   - Unique value proposition
   - Clear CTA

${
  sourceData
    ? `## Source Data (Use as factual reference)
${JSON.stringify(sourceData, null, 2)}`
    : ''
}

## Output Format
Return the content in HTML format with semantic headings (h2, h3), paragraphs, and lists where appropriate.
Do not include <html>, <head>, or <body> tags - just the content.`;
}

/**
 * Category page content prompt
 */
export function buildCategoryPrompt(brief: ContentBrief): string {
  const {
    targetKeyword,
    secondaryKeywords,
    category,
    destination,
    sourceData,
    tone,
    targetLength,
  } = brief;

  return `Create engaging category page content for "${category}" experiences${destination ? ` in ${destination}` : ''}, targeting the keyword "${targetKeyword}".

## Content Requirements
- Target length: ${targetLength.min}-${targetLength.max} words
- Tone: ${tone}
- Secondary keywords: ${secondaryKeywords.join(', ')}

## Required Sections
1. **Category Introduction** (100-150 words)
   - What makes these experiences special
   - Who they're perfect for
   - What to expect

2. **Types of ${category} Experiences** (150-200 words)
   - Break down subcategories or variations
   - Highlight unique options
   - Help visitors understand their choices

3. **What to Look For** (100-150 words)
   - Tips for choosing the right experience
   - Questions to consider
   - Value indicators

4. **Booking Tips** (50-100 words)
   - Best times to book
   - Group size considerations
   - Preparation advice

${
  sourceData
    ? `## Source Data
${JSON.stringify(sourceData, null, 2)}`
    : ''
}

## Output Format
Return HTML content with semantic structure. No wrapper tags.`;
}

/**
 * Experience description prompt
 */
export function buildExperiencePrompt(brief: ContentBrief): string {
  const { targetKeyword, secondaryKeywords, sourceData, tone, targetLength } = brief;

  const experienceData = sourceData as
    | {
        title?: string;
        description?: string;
        duration?: string;
        price?: string;
        location?: string;
        highlights?: string[];
        inclusions?: string[];
        exclusions?: string[];
      }
    | undefined;

  return `Create a compelling experience description for "${experienceData?.title || 'this experience'}", targeting the keyword "${targetKeyword}".

## Experience Details
${
  experienceData
    ? `
- Title: ${experienceData.title || 'N/A'}
- Duration: ${experienceData.duration || 'N/A'}
- Price: ${experienceData.price || 'N/A'}
- Location: ${experienceData.location || 'N/A'}
- Highlights: ${experienceData.highlights?.join(', ') || 'N/A'}
- Inclusions: ${experienceData.inclusions?.join(', ') || 'N/A'}
- Exclusions: ${experienceData.exclusions?.join(', ') || 'N/A'}
`
    : 'Use general best practices for experience descriptions.'
}

## Content Requirements
- Target length: ${targetLength.min}-${targetLength.max} words
- Tone: ${tone}
- Secondary keywords: ${secondaryKeywords.join(', ')}

## Required Elements
1. **Opening Hook** (50-75 words)
   - Immediately capture attention
   - Promise the transformation/benefit
   - Include target keyword naturally

2. **Experience Overview** (100-150 words)
   - What happens during the experience
   - Sensory details and atmosphere
   - Unique selling points

3. **What You'll Discover** (75-100 words)
   - Key highlights and moments
   - What makes this special
   - Memorable takeaways

4. **Practical Details** (75-100 words)
   - Who this is for
   - What to bring/wear
   - Meeting point hints (if applicable)

5. **Call to Action** (25-50 words)
   - Create urgency
   - Reinforce value
   - Clear booking prompt

## Output Format
Return HTML content optimized for an experience detail page.`;
}

/**
 * Blog post prompt
 */
export function buildBlogPrompt(brief: ContentBrief): string {
  const {
    targetKeyword,
    secondaryKeywords,
    destination,
    category,
    sourceData,
    tone,
    targetLength,
    includeElements,
  } = brief;

  const blogType = includeElements?.includes('listicle')
    ? 'listicle'
    : includeElements?.includes('guide')
      ? 'guide'
      : includeElements?.includes('comparison')
        ? 'comparison'
        : 'guide';

  return `Create an engaging blog post targeting the keyword "${targetKeyword}".

## Blog Details
- Type: ${blogType}
- Topic: ${targetKeyword}
${destination ? `- Destination: ${destination}` : ''}
${category ? `- Category: ${category}` : ''}
- Target length: ${targetLength.min}-${targetLength.max} words
- Tone: ${tone}
- Secondary keywords: ${secondaryKeywords.join(', ')}

## Structure Requirements

${
  blogType === 'listicle'
    ? `
### Listicle Structure
1. **Introduction** (100-150 words)
   - Hook with a compelling question or statement
   - Preview what readers will learn
   - Include target keyword

2. **List Items** (8-15 items, 75-100 words each)
   - Clear, benefit-focused item titles
   - Practical details for each
   - Mix of popular and hidden gems
   - Include secondary keywords naturally

3. **Conclusion** (75-100 words)
   - Summarize key takeaways
   - Encourage action
   - CTA to explore experiences
`
    : blogType === 'guide'
      ? `
### Guide Structure
1. **Introduction** (100-150 words)
   - Set context and reader expectations
   - Include target keyword early

2. **Main Sections** (3-5 sections, 200-300 words each)
   - Clear section headings with keywords
   - Actionable information
   - Expert tips and insider knowledge
   - Internal linking opportunities

3. **Quick Tips/FAQ** (100-150 words)
   - Scannable bullet points
   - Common questions answered

4. **Conclusion** (75-100 words)
   - Action-oriented summary
   - Booking CTA
`
      : `
### Comparison Structure
1. **Introduction** (100-150 words)
   - Frame the comparison
   - Who this helps

2. **Comparison Criteria** (50-75 words)
   - Explain what you're comparing
   - Why these factors matter

3. **Option Comparisons** (150-200 words each)
   - Pros and cons for each
   - Best for scenarios
   - Price/value considerations

4. **Verdict** (100-150 words)
   - Clear recommendations by use case
   - CTA to explore options
`
}

${
  sourceData
    ? `## Source Data
${JSON.stringify(sourceData, null, 2)}`
    : ''
}

## Output Format
Return HTML with:
- H1 title (include target keyword)
- Semantic headings (h2, h3)
- Short paragraphs (3-4 sentences max)
- Lists where appropriate
- No wrapper tags`;
}

/**
 * Meta description prompt
 */
export function buildMetaDescriptionPrompt(brief: ContentBrief): string {
  const { targetKeyword, destination, category, sourceData } = brief;

  return `Create a compelling meta description for a page about "${targetKeyword}"${destination ? ` in ${destination}` : ''}${category ? ` (${category})` : ''}.

## Requirements
- Exactly 150-160 characters (this is critical for SEO)
- Include the target keyword naturally
- Create urgency or curiosity
- Include a subtle call-to-action
- Be specific, not generic

## Context
${sourceData ? JSON.stringify(sourceData, null, 2) : 'General travel/experience page'}

## Examples of good meta descriptions:
- "Discover 15 unforgettable things to do in Barcelona. From Gaudí masterpieces to hidden tapas bars. Book your perfect experience today!"
- "Skip-the-line Colosseum tickets from £25. Explore ancient Rome with expert guides. Limited availability - book your slot now."

## Output
Return ONLY the meta description text, nothing else. No quotes, no explanation.`;
}

/**
 * SEO title prompt
 */
export function buildSeoTitlePrompt(brief: ContentBrief): string {
  const { targetKeyword, destination, category, sourceData } = brief;

  return `Create an SEO-optimized page title for a page about "${targetKeyword}"${destination ? ` in ${destination}` : ''}${category ? ` (${category})` : ''}.

## Requirements
- 50-60 characters maximum (critical for search display)
- Target keyword at or near the beginning
- Include location if relevant
- Make it click-worthy but accurate
- Include brand placeholder at end: "| [Brand]"

## Context
${sourceData ? JSON.stringify(sourceData, null, 2) : 'General travel/experience page'}

## Examples:
- "Things to Do in Barcelona 2024 | Top Experiences | [Brand]"
- "Skip-the-Line Colosseum Tours | Best Rome Tickets | [Brand]"
- "Barcelona Food Tours | Local Tapas & Wine | [Brand]"

## Output
Return ONLY the title text with | [Brand] at the end. No quotes, no explanation.`;
}

/**
 * Quality assessment prompt
 */
export function buildQualityAssessmentPrompt(
  content: string,
  brief: ContentBrief,
  sourceData?: Record<string, unknown>
): string {
  return `Assess the quality of this content against our standards.

## Content to Assess
${content}

## Original Brief
- Type: ${brief.type}
- Target keyword: ${brief.targetKeyword}
- Secondary keywords: ${brief.secondaryKeywords.join(', ')}
- Target length: ${brief.targetLength.min}-${brief.targetLength.max} words
- Tone: ${brief.tone}

${
  sourceData
    ? `## Source Data (for fact-checking)
${JSON.stringify(sourceData, null, 2)}`
    : ''
}

## Assessment Criteria
Score each from 0-100:

1. **Factual Accuracy**: Does content match source data? Any unverifiable claims?
2. **SEO Compliance**: Is target keyword used naturally? Proper heading structure? Meta-friendly length?
3. **Readability**: Clear sentences? Appropriate vocabulary? Scannable format?
4. **Uniqueness**: Original phrasing? Not generic template content?
5. **Engagement**: Compelling hooks? Clear CTAs? Creates desire to book?

## Output Format (JSON only)
{
  "scores": {
    "factualAccuracy": <0-100>,
    "seoCompliance": <0-100>,
    "readability": <0-100>,
    "uniqueness": <0-100>,
    "engagement": <0-100>
  },
  "overallScore": <weighted average>,
  "passed": <true if overall >= 75>,
  "issues": [
    {
      "type": "<factual|seo|readability|uniqueness|engagement>",
      "severity": "<low|medium|high|critical>",
      "description": "<specific issue>",
      "location": "<where in content, if applicable>",
      "suggestion": "<how to fix>"
    }
  ],
  "suggestions": ["<general improvement suggestions>"],
  "strengths": ["<what's working well>"]
}

Return ONLY valid JSON, no markdown code blocks or explanation.`;
}

/**
 * Rewrite prompt based on quality issues
 */
export function buildRewritePrompt(
  originalContent: string,
  issues: QualityIssue[],
  brief: ContentBrief
): string {
  const issuesList = issues
    .map(
      (issue, i) =>
        `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}${issue.suggestion ? ` → ${issue.suggestion}` : ''}`
    )
    .join('\n');

  return `Rewrite this content to address the identified issues while preserving its strengths.

## Original Content
${originalContent}

## Issues to Address
${issuesList}

## Original Brief
- Type: ${brief.type}
- Target keyword: ${brief.targetKeyword}
- Secondary keywords: ${brief.secondaryKeywords.join(', ')}
- Tone: ${brief.tone}
- Target length: ${brief.targetLength.min}-${brief.targetLength.max} words

## Instructions
1. Address each issue directly - don't just make minor tweaks
2. Maintain the overall structure unless structure was flagged
3. Keep any elements that were working well
4. Ensure the target keyword still appears naturally
5. Match the requested tone

## Output
Return ONLY the rewritten content in the same HTML format. No explanation or commentary.`;
}

/**
 * Get the appropriate prompt builder for a content type
 */
export function getPromptBuilder(type: ContentType): (brief: ContentBrief) => string {
  const builders: Record<ContentType, (brief: ContentBrief) => string> = {
    destination: buildDestinationPrompt,
    category: buildCategoryPrompt,
    experience: buildExperiencePrompt,
    blog: buildBlogPrompt,
    meta_description: buildMetaDescriptionPrompt,
    seo_title: buildSeoTitlePrompt,
  };

  return builders[type] || buildDestinationPrompt;
}
