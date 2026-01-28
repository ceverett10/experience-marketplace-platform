import type { ContentBrief, PipelineConfig } from '../types';
import { createPipeline, type ContentPipeline, type PipelineResult, type PipelineEventHandler } from '../pipeline';

/**
 * Base content generator options
 */
interface GeneratorOptions {
  siteId: string;
  tone?: ContentBrief['tone'];
  pipelineConfig?: Partial<PipelineConfig>;
}

/**
 * Destination page generator options
 */
interface DestinationOptions extends GeneratorOptions {
  destination: string;
  targetKeyword: string;
  secondaryKeywords?: string[];
  sourceData?: Record<string, unknown>;
}

/**
 * Category page generator options
 */
interface CategoryOptions extends GeneratorOptions {
  category: string;
  destination?: string;
  targetKeyword: string;
  secondaryKeywords?: string[];
  sourceData?: Record<string, unknown>;
}

/**
 * Experience description generator options
 */
interface ExperienceOptions extends GeneratorOptions {
  experienceId: string;
  title: string;
  targetKeyword: string;
  secondaryKeywords?: string[];
  duration?: string;
  price?: string;
  location?: string;
  highlights?: string[];
  inclusions?: string[];
  exclusions?: string[];
}

/**
 * Blog post generator options
 */
interface BlogOptions extends GeneratorOptions {
  targetKeyword: string;
  blogType: 'listicle' | 'guide' | 'comparison';
  destination?: string;
  category?: string;
  secondaryKeywords?: string[];
  sourceData?: Record<string, unknown>;
}

/**
 * Meta content generator options
 */
interface MetaOptions extends GeneratorOptions {
  targetKeyword: string;
  destination?: string;
  category?: string;
  sourceData?: Record<string, unknown>;
}

/**
 * Generate destination page content
 */
export async function generateDestinationPage(
  options: DestinationOptions
): Promise<PipelineResult> {
  const brief: ContentBrief = {
    type: 'destination',
    siteId: options.siteId,
    targetKeyword: options.targetKeyword,
    secondaryKeywords: options.secondaryKeywords || [],
    destination: options.destination,
    tone: options.tone || 'enthusiastic',
    targetLength: { min: 600, max: 900 },
    sourceData: options.sourceData,
  };

  const pipeline = createPipeline(options.pipelineConfig);
  return pipeline.generate(brief);
}

/**
 * Generate category page content
 */
export async function generateCategoryPage(
  options: CategoryOptions
): Promise<PipelineResult> {
  const brief: ContentBrief = {
    type: 'category',
    siteId: options.siteId,
    targetKeyword: options.targetKeyword,
    secondaryKeywords: options.secondaryKeywords || [],
    category: options.category,
    destination: options.destination,
    tone: options.tone || 'informative',
    targetLength: { min: 400, max: 600 },
    sourceData: options.sourceData,
  };

  const pipeline = createPipeline(options.pipelineConfig);
  return pipeline.generate(brief);
}

/**
 * Generate experience description
 */
export async function generateExperienceDescription(
  options: ExperienceOptions
): Promise<PipelineResult> {
  const sourceData = {
    title: options.title,
    duration: options.duration,
    price: options.price,
    location: options.location,
    highlights: options.highlights,
    inclusions: options.inclusions,
    exclusions: options.exclusions,
  };

  const brief: ContentBrief = {
    type: 'experience',
    siteId: options.siteId,
    targetKeyword: options.targetKeyword,
    secondaryKeywords: options.secondaryKeywords || [],
    experienceId: options.experienceId,
    tone: options.tone || 'enthusiastic',
    targetLength: { min: 300, max: 500 },
    sourceData,
  };

  const pipeline = createPipeline(options.pipelineConfig);
  return pipeline.generate(brief);
}

/**
 * Generate blog post
 */
export async function generateBlogPost(
  options: BlogOptions
): Promise<PipelineResult> {
  const brief: ContentBrief = {
    type: 'blog',
    siteId: options.siteId,
    targetKeyword: options.targetKeyword,
    secondaryKeywords: options.secondaryKeywords || [],
    destination: options.destination,
    category: options.category,
    tone: options.tone || 'casual',
    targetLength: { min: 1000, max: 1500 },
    includeElements: [options.blogType],
    sourceData: options.sourceData,
  };

  const pipeline = createPipeline(options.pipelineConfig);
  return pipeline.generate(brief);
}

/**
 * Generate meta description
 */
export async function generateMetaDescription(
  options: MetaOptions
): Promise<PipelineResult> {
  const brief: ContentBrief = {
    type: 'meta_description',
    siteId: options.siteId,
    targetKeyword: options.targetKeyword,
    secondaryKeywords: [],
    destination: options.destination,
    category: options.category,
    tone: options.tone || 'professional',
    targetLength: { min: 150, max: 160 },
    sourceData: options.sourceData,
  };

  const pipeline = createPipeline(options.pipelineConfig);
  return pipeline.generate(brief);
}

/**
 * Generate SEO title
 */
export async function generateSeoTitle(
  options: MetaOptions
): Promise<PipelineResult> {
  const brief: ContentBrief = {
    type: 'seo_title',
    siteId: options.siteId,
    targetKeyword: options.targetKeyword,
    secondaryKeywords: [],
    destination: options.destination,
    category: options.category,
    tone: options.tone || 'professional',
    targetLength: { min: 50, max: 60 },
    sourceData: options.sourceData,
  };

  const pipeline = createPipeline(options.pipelineConfig);
  return pipeline.generate(brief);
}

/**
 * Batch generator for multiple content types
 */
export class ContentGenerator {
  private pipeline: ContentPipeline;
  private siteId: string;
  private defaultTone: ContentBrief['tone'];

  constructor(options: GeneratorOptions) {
    this.siteId = options.siteId;
    this.defaultTone = options.tone || 'professional';
    this.pipeline = createPipeline(options.pipelineConfig);
  }

  /**
   * Generate destination page
   */
  async destination(
    destination: string,
    targetKeyword: string,
    options: {
      secondaryKeywords?: string[];
      sourceData?: Record<string, unknown>;
      tone?: ContentBrief['tone'];
    } = {}
  ): Promise<PipelineResult> {
    const brief: ContentBrief = {
      type: 'destination',
      siteId: this.siteId,
      targetKeyword,
      secondaryKeywords: options.secondaryKeywords || [],
      destination,
      tone: options.tone || this.defaultTone,
      targetLength: { min: 600, max: 900 },
      sourceData: options.sourceData,
    };

    return this.pipeline.generate(brief);
  }

  /**
   * Generate category page
   */
  async category(
    category: string,
    targetKeyword: string,
    options: {
      destination?: string;
      secondaryKeywords?: string[];
      sourceData?: Record<string, unknown>;
      tone?: ContentBrief['tone'];
    } = {}
  ): Promise<PipelineResult> {
    const brief: ContentBrief = {
      type: 'category',
      siteId: this.siteId,
      targetKeyword,
      secondaryKeywords: options.secondaryKeywords || [],
      category,
      destination: options.destination,
      tone: options.tone || this.defaultTone,
      targetLength: { min: 400, max: 600 },
      sourceData: options.sourceData,
    };

    return this.pipeline.generate(brief);
  }

  /**
   * Generate experience description
   */
  async experience(
    experienceData: {
      id: string;
      title: string;
      duration?: string;
      price?: string;
      location?: string;
      highlights?: string[];
      inclusions?: string[];
      exclusions?: string[];
    },
    targetKeyword: string,
    options: {
      secondaryKeywords?: string[];
      tone?: ContentBrief['tone'];
    } = {}
  ): Promise<PipelineResult> {
    const brief: ContentBrief = {
      type: 'experience',
      siteId: this.siteId,
      targetKeyword,
      secondaryKeywords: options.secondaryKeywords || [],
      experienceId: experienceData.id,
      tone: options.tone || this.defaultTone,
      targetLength: { min: 300, max: 500 },
      sourceData: {
        title: experienceData.title,
        duration: experienceData.duration,
        price: experienceData.price,
        location: experienceData.location,
        highlights: experienceData.highlights,
        inclusions: experienceData.inclusions,
        exclusions: experienceData.exclusions,
      },
    };

    return this.pipeline.generate(brief);
  }

  /**
   * Generate blog post
   */
  async blog(
    targetKeyword: string,
    blogType: 'listicle' | 'guide' | 'comparison',
    options: {
      destination?: string;
      category?: string;
      secondaryKeywords?: string[];
      sourceData?: Record<string, unknown>;
      tone?: ContentBrief['tone'];
    } = {}
  ): Promise<PipelineResult> {
    const brief: ContentBrief = {
      type: 'blog',
      siteId: this.siteId,
      targetKeyword,
      secondaryKeywords: options.secondaryKeywords || [],
      destination: options.destination,
      category: options.category,
      tone: options.tone || this.defaultTone,
      targetLength: { min: 1000, max: 1500 },
      includeElements: [blogType],
      sourceData: options.sourceData,
    };

    return this.pipeline.generate(brief);
  }

  /**
   * Generate meta description
   */
  async metaDescription(
    targetKeyword: string,
    options: {
      destination?: string;
      category?: string;
      sourceData?: Record<string, unknown>;
    } = {}
  ): Promise<PipelineResult> {
    const brief: ContentBrief = {
      type: 'meta_description',
      siteId: this.siteId,
      targetKeyword,
      secondaryKeywords: [],
      destination: options.destination,
      category: options.category,
      tone: this.defaultTone,
      targetLength: { min: 150, max: 160 },
      sourceData: options.sourceData,
    };

    return this.pipeline.generate(brief);
  }

  /**
   * Generate SEO title
   */
  async seoTitle(
    targetKeyword: string,
    options: {
      destination?: string;
      category?: string;
      sourceData?: Record<string, unknown>;
    } = {}
  ): Promise<PipelineResult> {
    const brief: ContentBrief = {
      type: 'seo_title',
      siteId: this.siteId,
      targetKeyword,
      secondaryKeywords: [],
      destination: options.destination,
      category: options.category,
      tone: this.defaultTone,
      targetLength: { min: 50, max: 60 },
      sourceData: options.sourceData,
    };

    return this.pipeline.generate(brief);
  }

  /**
   * Generate complete page content (meta + main content)
   */
  async completePage(
    type: 'destination' | 'category',
    options: {
      destination?: string;
      category?: string;
      targetKeyword: string;
      secondaryKeywords?: string[];
      sourceData?: Record<string, unknown>;
      tone?: ContentBrief['tone'];
    }
  ): Promise<{
    content: PipelineResult;
    metaDescription: PipelineResult;
    seoTitle: PipelineResult;
  }> {
    // Generate all content in parallel
    const [content, metaDescription, seoTitle] = await Promise.all([
      type === 'destination'
        ? this.destination(options.destination!, options.targetKeyword, options)
        : this.category(options.category!, options.targetKeyword, options),
      this.metaDescription(options.targetKeyword, options),
      this.seoTitle(options.targetKeyword, options),
    ]);

    return { content, metaDescription, seoTitle };
  }

  /**
   * Get cost summary
   */
  getCostSummary() {
    return this.pipeline.getCostSummary();
  }

  /**
   * Subscribe to pipeline events
   */
  onEvent(handler: PipelineEventHandler) {
    return this.pipeline.onEvent(handler);
  }
}

/**
 * Create a content generator instance
 */
export function createGenerator(options: GeneratorOptions): ContentGenerator {
  return new ContentGenerator(options);
}
