import type { ContentBrief, GeneratedContent, PipelineConfig, QualityAssessment } from '../types';
import { DEFAULT_PIPELINE_CONFIG } from '../types';
import { ClaudeClient } from '../client';

export interface PipelineResult {
  content: GeneratedContent;
  success: boolean;
  error?: string;
}

export type PipelineEventHandler = (event: PipelineEvent) => void;

export interface PipelineEvent {
  type:
    | 'draft_start'
    | 'draft_complete'
    | 'quality_start'
    | 'quality_complete'
    | 'rewrite_start'
    | 'rewrite_complete'
    | 'complete'
    | 'error';
  data?: any;
}

export class ContentPipeline {
  private config: PipelineConfig;
  private client: ClaudeClient;
  private eventHandlers: PipelineEventHandler[] = [];

  constructor(client: ClaudeClient, config?: Partial<PipelineConfig>) {
    this.client = client;
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  onEvent(handler: PipelineEventHandler): void {
    this.eventHandlers.push(handler);
  }

  private emit(event: PipelineEvent): void {
    this.eventHandlers.forEach((h) => h(event));
  }

  async generate(brief: ContentBrief): Promise<PipelineResult> {
    try {
      this.emit({ type: 'draft_start', data: brief });

      const draft = await this.generateDraft(brief);
      this.emit({ type: 'draft_complete', data: draft });

      if (!this.config.qualityThreshold) {
        return { content: draft, success: true };
      }

      this.emit({ type: 'quality_start' });
      const assessment = await this.assessQuality(draft, brief);
      this.emit({ type: 'quality_complete', data: assessment });

      draft.qualityAssessment = assessment;

      if (assessment.overallScore >= this.config.qualityThreshold) {
        this.emit({ type: 'complete', data: draft });
        return { content: draft, success: true };
      }

      let currentDraft = draft;
      let currentAssessment = assessment;

      for (let i = 0; i < this.config.maxRewrites; i++) {
        this.emit({ type: 'rewrite_start', data: { attempt: i + 1 } });
        const rewritten = await this.rewriteContent(currentDraft, currentAssessment, brief);
        const newAssessment = await this.assessQuality(rewritten, brief);

        rewritten.qualityAssessment = newAssessment;
        this.emit({
          type: 'rewrite_complete',
          data: { attempt: i + 1, score: newAssessment.overallScore },
        });

        if (newAssessment.overallScore >= this.config.qualityThreshold) {
          this.emit({ type: 'complete', data: rewritten });
          return { content: rewritten, success: true };
        }

        currentDraft = rewritten;
        currentAssessment = newAssessment;
      }

      this.emit({ type: 'complete', data: currentDraft });
      return { content: currentDraft, success: false, error: 'Quality threshold not met' };
    } catch (error) {
      this.emit({ type: 'error', data: error });
      throw error;
    }
  }

  private async generateDraft(brief: ContentBrief): Promise<GeneratedContent> {
    const prompt = this.buildPrompt(brief);
    const model = this.client.getModelId(this.config.draftModel);
    const startTime = Date.now();

    // Build system prompt based on brand context
    const coreGuidelines = `
CRITICAL GUIDELINES - You MUST follow these:
1. NEVER make up or fabricate any information, facts, statistics, or details
2. NEVER invent contact details (phone numbers, email addresses, physical addresses)
3. This is a marketplace of travel experiences powered by Holibob - the content must reflect this
4. Focus on the type of experience and destination, not specific operational details you don't know
5. Use general calls-to-action like "Book now" or "Explore our experiences" rather than specific contact methods
6. If you don't know something, describe the experience category generally rather than inventing specifics
7. LEGAL JURISDICTION: The legal jurisdiction is always the United Kingdom. Any legal references, consumer rights, regulations, or compliance mentions must be based on UK law`;

    // Build comprehensive brand context section
    const buildBrandSection = () => {
      const ctx = brief.brandContext;
      if (!ctx) return '';

      const sections: string[] = [];

      // Site/Brand name
      if (ctx.siteName) {
        sections.push(`BRAND: ${ctx.siteName}`);
      }

      // Tone of voice
      if (ctx.toneOfVoice) {
        const tov = ctx.toneOfVoice;
        sections.push(`
BRAND VOICE:
- Personality: ${tov.personality?.join(', ') || 'professional, trustworthy'}
- Writing Style: ${tov.writingStyle || 'clear and authoritative'}
${tov.doList?.length ? `- DO: ${tov.doList.join('; ')}` : ''}
${tov.dontList?.length ? `- DON'T: ${tov.dontList.join('; ')}` : ''}`);
      }

      // Brand story
      if (ctx.brandStory) {
        const bs = ctx.brandStory;
        sections.push(`
BRAND STORY:
${bs.mission ? `- Mission: ${bs.mission}` : ''}
${bs.targetAudience ? `- Target Audience: ${bs.targetAudience}` : ''}
${bs.uniqueSellingPoints?.length ? `- Unique Selling Points: ${bs.uniqueSellingPoints.join('; ')}` : ''}
${bs.values?.length ? `- Core Values: ${bs.values.join(', ')}` : ''}`);
      }

      // Trust signals
      if (ctx.trustSignals) {
        const ts = ctx.trustSignals;
        sections.push(`
TRUST ELEMENTS TO WEAVE IN:
${ts.expertise?.length ? `- Areas of Expertise: ${ts.expertise.join(', ')}` : ''}
${ts.valuePropositions?.length ? `- Value Propositions: ${ts.valuePropositions.join('; ')}` : ''}
${ts.guarantees?.length ? `- Guarantees: ${ts.guarantees.join(', ')}` : ''}
${ts.certifications?.length ? `- Certifications: ${ts.certifications.join(', ')}` : ''}`);
      }

      // Content guidelines
      if (ctx.contentGuidelines) {
        const cg = ctx.contentGuidelines;
        sections.push(`
CONTENT THEMES:
${cg.keyThemes?.length ? `- Key Themes: ${cg.keyThemes.join(', ')}` : ''}
${cg.contentPillars?.length ? `- Content Pillars: ${cg.contentPillars.join(', ')}` : ''}`);
      }

      return sections.filter((s) => s.trim()).join('\n');
    };

    const brandSection = buildBrandSection();
    const brandName = brief.brandContext?.siteName || 'the brand';

    let systemPrompt = `You are an expert travel content writer creating SEO-optimized, engaging content for ${brandName}, a travel experience marketplace powered by Holibob.
${coreGuidelines}`;

    if (brief.brandContext?.toneOfVoice) {
      const { personality, writingStyle } = brief.brandContext.toneOfVoice;
      systemPrompt = `You are an expert travel content writer creating SEO-optimized content for ${brandName}, a travel experience marketplace powered by Holibob.

Your writing style is: ${writingStyle || 'clear, authoritative, and trustworthy'}
Your personality traits are: ${personality?.join(', ') || 'professional, knowledgeable, helpful'}

You write content that builds trust and positions ${brandName} as an authority in the travel industry.
Every piece of content should feel authentic, expert-driven, and aligned with the brand's voice.
${brandSection}
${coreGuidelines}`;
    } else if (brandSection) {
      systemPrompt = `You are an expert travel content writer creating SEO-optimized, engaging content for ${brandName}, a travel experience marketplace powered by Holibob.
${brandSection}
${coreGuidelines}`;
    }

    // Limit maxTokens based on target word count to help enforce word limits
    // Approximately 1.5 tokens per word for English text with markdown formatting
    const targetMaxTokens =
      brief.type === 'blog' ? Math.min(2500, Math.ceil(brief.targetLength.max * 1.7)) : 4096;

    const response = await this.client.generate({
      model,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: targetMaxTokens,
      temperature: 0.7,
    });

    const content = response.content.find((b) => b.type === 'text')?.text || '';
    const cost = this.client.calculateCost(
      model,
      response.usage.input_tokens,
      response.usage.output_tokens
    );

    return {
      id: Math.random().toString(36).substr(2, 9),
      briefId: Math.random().toString(36).substr(2, 9),
      type: brief.type,
      siteId: brief.siteId,
      title: this.extractTitle(content),
      content,
      targetKeyword: brief.targetKeyword,
      secondaryKeywords: brief.secondaryKeywords,
      slug: this.generateSlug(brief.targetKeyword),
      version: 1,
      status: 'draft',
      generatedAt: new Date(),
      generatedBy: this.config.draftModel,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      estimatedCost: cost,
      generationTimeMs: Date.now() - startTime,
      rewriteCount: 0,
      maxRewrites: this.config.maxRewrites,
    };
  }

  private async assessQuality(
    content: GeneratedContent,
    brief: ContentBrief
  ): Promise<QualityAssessment> {
    const prompt = `Assess this content quality for SEO and user engagement. Return JSON only.

Content: ${content.content}

Context: ${JSON.stringify({ type: brief.type, keyword: brief.targetKeyword, secondaryKeywords: brief.secondaryKeywords })}

Evaluate (0-100 each):
- factualAccuracy: No made-up facts, accurate information, proper disclaimers
- seoCompliance: Keyword in title/H1, keyword in first 100 words, proper heading structure (H1>H2>H3), keyword density (1-2%), meta-description-worthy first paragraph, related entities mentioned
- readability: Clear sentence structure, good flow, appropriate paragraph length, scannable with bullet points
- uniqueness: Fresh perspective, not generic filler content, specific insights
- engagement: Compelling title, strong hook, clear value proposition, effective CTAs, answers user intent

List issues with type, severity (low/medium/high/critical), description.
Provide specific suggestions for improvement.

JSON format:
{"overallScore": 85, "breakdown": {"factualAccuracy": 90, "seoCompliance": 85, "readability": 80, "uniqueness": 85, "engagement": 85}, "issues": [{"type": "seo", "severity": "medium", "description": "Keyword not in first 100 words"}], "suggestions": ["Add primary keyword to the introduction"]}`;

    const model = this.client.getModelId(this.config.qualityModel);
    const response = await this.client.generate({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 2000,
    });

    const text = response.content.find((b) => b.type === 'text')?.text || '{}';
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');

    return {
      overallScore: json.overallScore || 50,
      breakdown: json.breakdown || {
        factualAccuracy: 50,
        seoCompliance: 50,
        readability: 50,
        uniqueness: 50,
        engagement: 50,
      },
      passed: (json.overallScore || 50) >= this.config.qualityThreshold,
      issues: json.issues || [],
      suggestions: json.suggestions || [],
      assessedAt: new Date(),
      assessedBy: this.config.qualityModel,
    };
  }

  private async rewriteContent(
    content: GeneratedContent,
    assessment: QualityAssessment,
    brief: ContentBrief
  ): Promise<GeneratedContent> {
    // Build brand voice reminder for rewrite
    let brandReminder = '';
    const brandName = brief.brandContext?.siteName;
    if (brief.brandContext?.toneOfVoice) {
      const { personality, writingStyle } = brief.brandContext.toneOfVoice;
      brandReminder = `

IMPORTANT - Maintain brand voice${brandName ? ` for ${brandName}` : ''}:
- Personality: ${personality?.join(', ') || 'professional'}
- Writing Style: ${writingStyle || 'clear and authoritative'}
`;
    }

    const prompt = `Rewrite this content to address quality issues while maintaining the brand voice.

## ORIGINAL CONTENT
${content.content}

## QUALITY ISSUES TO FIX
${assessment.issues.map((i) => `- [${i.severity}] ${i.description}`).join('\n')}

## IMPROVEMENT SUGGESTIONS
${assessment.suggestions.map((s) => '- ' + s).join('\n')}
${brandReminder}
## REQUIREMENTS
- Maintain primary keyword: ${brief.targetKeyword}
- Keep the same structure and approximate length
- Return markdown content only
- Fix all identified issues
- Preserve what's working well`;

    const model = this.client.getModelId(this.config.rewriteModel);
    const startTime = Date.now();

    const response = await this.client.generate({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 4096,
    });

    const newContent = response.content.find((b) => b.type === 'text')?.text || '';
    const cost = this.client.calculateCost(
      model,
      response.usage.input_tokens,
      response.usage.output_tokens
    );

    return {
      ...content,
      content: newContent,
      version: content.version + 1,
      rewriteCount: content.rewriteCount + 1,
      tokensUsed: content.tokensUsed + response.usage.input_tokens + response.usage.output_tokens,
      estimatedCost: content.estimatedCost + cost,
      generationTimeMs: content.generationTimeMs + (Date.now() - startTime),
    };
  }

  private buildPrompt(brief: ContentBrief): string {
    // Build brand voice section if available
    let brandSection = '';
    const brandName = brief.brandContext?.siteName;

    if (brief.brandContext) {
      const { toneOfVoice, trustSignals, brandStory, contentGuidelines } = brief.brandContext;

      // Add brand name header if available
      if (brandName) {
        brandSection += `
## BRAND: ${brandName}
`;
      }

      if (toneOfVoice) {
        brandSection += `
## BRAND VOICE GUIDELINES (CRITICAL - Follow these exactly)

Personality: ${toneOfVoice.personality?.join(', ') || 'professional, trustworthy'}
Writing Style: ${toneOfVoice.writingStyle || 'Clear and authoritative'}

${
  toneOfVoice.doList?.length
    ? `DO:
${toneOfVoice.doList.map((d) => '- ' + d).join('\n')}`
    : ''
}

${
  toneOfVoice.dontList?.length
    ? `DON'T:
${toneOfVoice.dontList.map((d) => '- ' + d).join('\n')}`
    : ''
}
`;
      }

      if (brandStory) {
        brandSection += `
## BRAND CONTEXT
Mission: ${brandStory.mission || 'N/A'}
Target Audience: ${brandStory.targetAudience || 'N/A'}
${brandStory.values?.length ? `Core Values: ${brandStory.values.join(', ')}` : ''}
${brandStory.uniqueSellingPoints?.length ? `Unique Selling Points to weave in naturally:\n${brandStory.uniqueSellingPoints.map((u) => '- ' + u).join('\n')}` : ''}
`;
      }

      if (trustSignals) {
        brandSection += `
## TRUST ELEMENTS TO INCLUDE
${trustSignals.expertise?.length ? `Areas of expertise: ${trustSignals.expertise.join(', ')}` : ''}
${trustSignals.valuePropositions?.length ? `Value propositions to emphasize:\n${trustSignals.valuePropositions.map((v) => '- ' + v).join('\n')}` : ''}
${trustSignals.guarantees?.length ? `Guarantees to mention naturally: ${trustSignals.guarantees.join(', ')}` : ''}
${trustSignals.certifications?.length ? `Certifications: ${trustSignals.certifications.join(', ')}` : ''}
`;
      }

      if (contentGuidelines) {
        brandSection += `
## CONTENT THEMES
${contentGuidelines.keyThemes?.length ? `Key themes to incorporate: ${contentGuidelines.keyThemes.join(', ')}` : ''}
${contentGuidelines.contentPillars?.length ? `Content pillars: ${contentGuidelines.contentPillars.join(', ')}` : ''}
`;
      }
    }

    const brandLabel = brandName ? `for ${brandName}` : '';

    // About Us specific instructions - strict factual guardrails
    const aboutInstructions =
      brief.type === 'about'
        ? `
## CRITICAL: ABOUT US PAGE RULES
This is an About Us page. You MUST follow these rules absolutely:

### NEVER FABRICATE:
- Founding dates, years, or timelines
- Founder names, team member names, or staff counts
- Statistics (e.g., "helped 50,000 travelers", "over 200 tours")
- Partnerships with specific organizations (e.g., museums, tourism boards)
- Certifications or compliance claims (e.g., "PCI-DSS compliant")
- Awards or recognitions
- Office addresses or locations
- Specific claims about customer support availability (e.g., "24/7 support")

### NEVER CREATE LINKS:
- Do NOT include any markdown links [text](url) in the content
- Do NOT reference page URLs like /tours, /guides, /faq
- Internal links will be added separately by the platform
- Only mention page sections generically: "browse our experiences" or "explore our destinations"

### STRUCTURE (follow this exactly):
1. **H1: About ${brandName || 'Us'}**
2. **Welcome paragraph** - What the site is (a curated marketplace for travel experiences powered by Holibob) and what type of experiences it focuses on
3. **Our Mission** - Use ONLY the brand mission from the brand context above. If no mission is provided, write a general mission about connecting travelers with quality experiences
4. **What We Offer** - Describe the TYPE of experiences available (use the category/destination info). Do NOT claim specific numbers
5. **Our Approach** - How experiences are curated: browsing quality options, verified reviews from real travelers, transparent pricing. Do NOT claim to "personally vet" or have a "team of experts" unless this is true
6. **Why Choose ${brandName || 'Us'}** - Focus on the actual platform features: easy booking, curated selection, real customer reviews, secure payments
7. **Closing** - Invite users to browse experiences. No fake contact details

### WORD COUNT
Target: ${brief.targetLength.min}-${brief.targetLength.max} words.

`
        : '';

    // Blog-specific instructions for focused, concise content
    const blogInstructions =
      brief.type === 'blog'
        ? `
## CRITICAL: WORD LIMIT
MAXIMUM ${brief.targetLength.max} WORDS. Do NOT exceed this limit.
Write focused, valuable content. Quality over quantity.
Target: ${brief.targetLength.min}-${brief.targetLength.max} words total.

## BLOG POST STRUCTURE
1. Engaging H1 title (include primary keyword)
2. Brief intro paragraph (2-3 sentences)
3. 3-5 main sections with H2 headings
4. Practical tips or actionable advice
5. MANDATORY FAQ SECTION: Include a "## Frequently Asked Questions" section with 3-5 questions formatted as "### Question?" headings followed by paragraph answers. Questions should target real search queries related to "${brief.targetKeyword}".
6. Clear conclusion with call-to-action${brandName ? ` for ${brandName}` : ''}

`
        : '';

    // FAQ page specific instructions
    const faqInstructions =
      brief.type === 'faq'
        ? `
## FAQ PAGE STRUCTURE
This is a dedicated FAQ hub page. Structure it for maximum SEO value with FAQPage schema.

### SOURCE QUESTIONS
${brief.sourceData?.['questions'] ? `Use these real user questions from search data:\n${(brief.sourceData['questions'] as string[]).map((q) => `- ${q}`).join('\n')}` : 'Generate relevant questions based on the topic.'}

### REQUIRED STRUCTURE
1. **H1: Frequently Asked Questions about ${brief.targetKeyword}** (or similar engaging title)
2. **Brief intro** (2-3 sentences explaining what users will find)
3. **Organized Q&A sections** - Group related questions under H2 topic headings
4. **Each question as H3** - Format: "### Question text here?"
5. **Concise answers** - 2-4 sentences per answer, practical and helpful
6. **Include 10-15 total Q&A pairs** organized into 3-5 topic groups

### FAQ FORMATTING RULES
- Every question MUST end with a question mark (?)
- Use H3 (###) for all questions - this enables FAQPage schema extraction
- Keep answers concise but complete - 50-150 words each
- Include relevant keywords naturally in both questions and answers
- Link to relevant pages where appropriate (destinations, experiences)

### TOPIC ORGANIZATION EXAMPLE
## Booking & Pricing
### How much do food tours in London cost?
### Can I cancel my booking?

## Experience Details
### How long do tours typically last?
### What should I wear?

`
        : '';

    return `Create ${brief.type} content ${brandLabel}: ${brief.targetKeyword}

## CONTENT REQUIREMENTS
Primary Keyword: ${brief.targetKeyword}
Secondary Keywords: ${brief.secondaryKeywords.join(', ') || 'none'}
Word Count: ${brief.targetLength.min}-${brief.targetLength.max} words (STRICT LIMIT - do not exceed)
Base Tone: ${brief.tone}

${brief.destination ? 'Destination: ' + brief.destination : ''}
${brief.category ? 'Category: ' + brief.category : ''}
${
  brief.sourceData?.['experiences']
    ? `
## SITE EXPERIENCES (actual bookable experiences on this site)
The following experiences are available on this site. Your content MUST be relevant to these:
${(brief.sourceData['experiences'] as Array<{ title: string; description?: string; city?: string; duration?: string; priceFrom?: number }>).map((e) => `- **${e.title}**${e.city ? ` (${e.city})` : ''}${e.duration ? ` — ${e.duration}` : ''}${e.priceFrom ? ` from $${e.priceFrom}` : ''}${e.description ? `\n  ${e.description.substring(0, 120)}` : ''}`).join('\n')}
${brief.sourceData?.['supplierDescription'] ? `\nABOUT THE OPERATOR: ${(brief.sourceData['supplierDescription'] as string).substring(0, 300)}` : ''}

IMPORTANT: Reference these actual experiences naturally in the content. Mention specific tours, activities, and destinations that readers can actually book on this site. Do NOT recommend experiences or destinations this operator does not offer.
`
    : ''
}
${brandSection}
${aboutInstructions}${blogInstructions}
## SEO OPTIMIZATION GUIDELINES
- H1 TITLE: Create an engaging, click-worthy title (50-60 chars) with keyword near the start
- META DESCRIPTION: The first paragraph should work as a meta description (150-160 chars) - compelling, includes keyword, has a clear value proposition
- HEADINGS: Use H2/H3 with related keywords naturally incorporated - these help search engines understand content structure
- KEYWORD PLACEMENT: Include primary keyword in H1, first 100 words, at least one H2, and conclusion
- E-E-A-T SIGNALS: Demonstrate Experience (practical insights), Expertise (specific knowledge), Authoritativeness (confident recommendations), Trustworthiness (accurate information)
- ENTITY OPTIMIZATION: Mention related entities (places, activities, concepts) that search engines associate with the topic
${brief.type !== 'about' ? `- INTERNAL LINKING CONTEXT: When mentioning related topics, use specific anchor text that could link to other pages (destinations, categories, experiences)` : '- DO NOT include any markdown links - internal links are added automatically by the platform'}
- USER INTENT: Address the search intent - what would someone searching "${brief.targetKeyword}" want to know?
- EXPERIENCE CROSS-LINKING: Naturally mention bookable experiences, tours, and activities related to the topic. Use phrases like "things to do in [destination]", "[activity type] experiences", or "[category] in [destination]" — these become anchor text for internal links to experience listing pages

## AI CITATION OPTIMIZATION (LLM/GEO)
These guidelines help AI assistants (ChatGPT, Perplexity, Claude) accurately cite and recommend this content:
- CITABLE STATEMENTS: Include specific, factual statements that AI can directly quote — e.g. "Walking tours in Rome typically last 2-3 hours and cover major landmarks including the Colosseum and Roman Forum"
- DIRECT ANSWERS: Start key sections with a clear, concise answer to the question implied by the heading, then expand with detail. This matches how LLMs extract information
- ENTITY RELATIONSHIPS: Explicitly connect entities — e.g. "Barcelona's Gothic Quarter is home to food tours, tapas experiences, and walking tours" rather than generic descriptions
- COMPARISON DATA: Where relevant, include comparison points (price ranges, duration ranges, group sizes) that help AI systems give specific recommendations
- STRUCTURED LISTS: Use bullet points for key facts (best time to visit, price ranges, what's included) — LLMs parse structured content more reliably than dense paragraphs
- UNIQUE INSIGHTS: Include practical tips or local knowledge that differentiates this content from generic information — AI systems prefer authoritative, specific sources over generic ones

## OUTPUT INSTRUCTIONS
- Return markdown content only
- Include an engaging H1 title that makes users want to click
- Use H2 and H3 subheadings for structure - these help both readers and search engines
- Naturally incorporate keywords without stuffing (aim for 1-2% keyword density)
- CRITICAL: Write in the brand voice specified above - this is essential for brand consistency
${brief.type === 'about' ? '- DO NOT include any markdown links [text](url) - links are managed by the platform' : `- Include compelling calls-to-action${brandName ? ` for ${brandName}` : ''}`}
- Make content scannable with bullet points where appropriate
${brief.type !== 'about' ? '- REQUIRED: Include a "## Frequently Asked Questions" section with 3-5 Q&As using "### Question?" format - this generates FAQPage schema for rich results in Google. Questions should be phrased as real conversational queries people would ask an AI assistant (e.g. "What are the best food tours in Barcelona?" not "What is a food tour?")' : '- Keep all claims factual and verifiable - do not fabricate statistics, dates, names, or partnerships'}
- QUICK FACTS BOX: Near the top of the content, include a "## At a Glance" or "## Quick Facts" section with bullet points summarizing key details (location, typical price range, duration, best time to visit, etc.) — this helps AI systems extract and cite key information quickly
- Keep content focused and valuable - avoid filler content`;
  }

  private extractTitle(content: string): string {
    const match = content.match(/^#\s+(.+)$/m);
    return match?.[1] || 'Untitled';
  }

  private generateSlug(text: string): string {
    // Defensive handling for undefined/null text
    if (!text) {
      return `content-${Date.now()}`;
    }
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  getCostSummary() {
    return { total: 0, byModel: {}, byOperation: {} };
  }
}

export function createPipeline(config?: Partial<PipelineConfig>): ContentPipeline {
  const apiKey = process.env['ANTHROPIC_API_KEY'] || process.env['CLAUDE_API_KEY'] || '';
  const client = new ClaudeClient({ apiKey });
  return new ContentPipeline(client, config);
}
