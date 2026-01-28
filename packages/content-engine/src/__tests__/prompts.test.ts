import { describe, it, expect } from 'vitest';
import {
  SYSTEM_PROMPTS,
  buildDestinationPrompt,
  buildCategoryPrompt,
  buildExperiencePrompt,
  buildBlogPrompt,
  buildMetaDescriptionPrompt,
  buildSeoTitlePrompt,
  buildQualityAssessmentPrompt,
  buildRewritePrompt,
  getPromptBuilder,
} from '../prompts';
import type { ContentBrief, QualityIssue } from '../types';

describe('System Prompts', () => {
  it('should have content writer prompt', () => {
    expect(SYSTEM_PROMPTS.contentWriter).toBeDefined();
    expect(SYSTEM_PROMPTS.contentWriter).toContain('travel content writer');
  });

  it('should have quality assessor prompt', () => {
    expect(SYSTEM_PROMPTS.qualityAssessor).toBeDefined();
    expect(SYSTEM_PROMPTS.qualityAssessor).toContain('quality assessor');
  });

  it('should have rewriter prompt', () => {
    expect(SYSTEM_PROMPTS.rewriter).toBeDefined();
    expect(SYSTEM_PROMPTS.rewriter).toContain('content editor');
  });
});

describe('buildDestinationPrompt', () => {
  const baseBrief: ContentBrief = {
    type: 'destination',
    siteId: 'test-site',
    targetKeyword: 'things to do in Barcelona',
    secondaryKeywords: ['Barcelona activities', 'Barcelona tours'],
    destination: 'Barcelona',
    tone: 'enthusiastic',
    targetLength: { min: 600, max: 900 },
  };

  it('should include destination name', () => {
    const prompt = buildDestinationPrompt(baseBrief);
    expect(prompt).toContain('Barcelona');
  });

  it('should include target keyword', () => {
    const prompt = buildDestinationPrompt(baseBrief);
    expect(prompt).toContain('things to do in Barcelona');
  });

  it('should include secondary keywords', () => {
    const prompt = buildDestinationPrompt(baseBrief);
    expect(prompt).toContain('Barcelona activities');
    expect(prompt).toContain('Barcelona tours');
  });

  it('should include target length', () => {
    const prompt = buildDestinationPrompt(baseBrief);
    expect(prompt).toContain('600');
    expect(prompt).toContain('900');
  });

  it('should include tone', () => {
    const prompt = buildDestinationPrompt(baseBrief);
    expect(prompt).toContain('enthusiastic');
  });

  it('should include required sections', () => {
    const prompt = buildDestinationPrompt(baseBrief);
    expect(prompt).toContain('Hero Introduction');
    expect(prompt).toContain('Top Experiences');
    expect(prompt).toContain('When to Visit');
    expect(prompt).toContain('Practical Information');
    expect(prompt).toContain('Why Book with Us');
  });

  it('should include source data when provided', () => {
    const briefWithData: ContentBrief = {
      ...baseBrief,
      sourceData: { population: 1600000, country: 'Spain' },
    };
    const prompt = buildDestinationPrompt(briefWithData);
    expect(prompt).toContain('Source Data');
    expect(prompt).toContain('1600000');
  });
});

describe('buildCategoryPrompt', () => {
  const baseBrief: ContentBrief = {
    type: 'category',
    siteId: 'test-site',
    targetKeyword: 'Barcelona food tours',
    secondaryKeywords: ['tapas tours'],
    category: 'Food Tours',
    destination: 'Barcelona',
    tone: 'informative',
    targetLength: { min: 400, max: 600 },
  };

  it('should include category name', () => {
    const prompt = buildCategoryPrompt(baseBrief);
    expect(prompt).toContain('Food Tours');
  });

  it('should include destination when provided', () => {
    const prompt = buildCategoryPrompt(baseBrief);
    expect(prompt).toContain('Barcelona');
  });

  it('should include required sections', () => {
    const prompt = buildCategoryPrompt(baseBrief);
    expect(prompt).toContain('Category Introduction');
    expect(prompt).toContain('Types of');
    expect(prompt).toContain('What to Look For');
    expect(prompt).toContain('Booking Tips');
  });
});

describe('buildExperiencePrompt', () => {
  const baseBrief: ContentBrief = {
    type: 'experience',
    siteId: 'test-site',
    targetKeyword: 'Sagrada Familia tour',
    secondaryKeywords: ['Gaudi tour'],
    experienceId: 'exp-123',
    tone: 'enthusiastic',
    targetLength: { min: 300, max: 500 },
    sourceData: {
      title: 'Skip-the-Line Sagrada Familia Tour',
      duration: '2 hours',
      price: '€45',
      location: 'Barcelona',
      highlights: ['Expert guide', 'Skip the line'],
      inclusions: ['Entry ticket', 'Guide'],
      exclusions: ['Hotel pickup'],
    },
  };

  it('should include experience title', () => {
    const prompt = buildExperiencePrompt(baseBrief);
    expect(prompt).toContain('Sagrada Familia');
  });

  it('should include experience details', () => {
    const prompt = buildExperiencePrompt(baseBrief);
    expect(prompt).toContain('2 hours');
    expect(prompt).toContain('€45');
    expect(prompt).toContain('Expert guide');
  });

  it('should include required elements', () => {
    const prompt = buildExperiencePrompt(baseBrief);
    expect(prompt).toContain('Opening Hook');
    expect(prompt).toContain('Experience Overview');
    expect(prompt).toContain("What You'll Discover");
    expect(prompt).toContain('Practical Details');
    expect(prompt).toContain('Call to Action');
  });
});

describe('buildBlogPrompt', () => {
  const baseBrief: ContentBrief = {
    type: 'blog',
    siteId: 'test-site',
    targetKeyword: '10 best things to do in Barcelona',
    secondaryKeywords: ['Barcelona travel guide'],
    destination: 'Barcelona',
    tone: 'casual',
    targetLength: { min: 1000, max: 1500 },
    includeElements: ['listicle'],
  };

  it('should detect listicle type', () => {
    const prompt = buildBlogPrompt(baseBrief);
    expect(prompt).toContain('listicle');
    expect(prompt).toContain('List Items');
  });

  it('should detect guide type', () => {
    const guideBrief = { ...baseBrief, includeElements: ['guide'] };
    const prompt = buildBlogPrompt(guideBrief);
    expect(prompt).toContain('guide');
    expect(prompt).toContain('Main Sections');
  });

  it('should detect comparison type', () => {
    const comparisonBrief = { ...baseBrief, includeElements: ['comparison'] };
    const prompt = buildBlogPrompt(comparisonBrief);
    expect(prompt).toContain('comparison');
    expect(prompt).toContain('Comparison Criteria');
  });

  it('should include destination and category when provided', () => {
    const fullBrief = { ...baseBrief, category: 'Activities' };
    const prompt = buildBlogPrompt(fullBrief);
    expect(prompt).toContain('Barcelona');
    expect(prompt).toContain('Activities');
  });
});

describe('buildMetaDescriptionPrompt', () => {
  const baseBrief: ContentBrief = {
    type: 'meta_description',
    siteId: 'test-site',
    targetKeyword: 'Barcelona tours',
    secondaryKeywords: [],
    destination: 'Barcelona',
    tone: 'professional',
    targetLength: { min: 150, max: 160 },
  };

  it('should mention character limits', () => {
    const prompt = buildMetaDescriptionPrompt(baseBrief);
    expect(prompt).toContain('150-160 characters');
  });

  it('should include target keyword', () => {
    const prompt = buildMetaDescriptionPrompt(baseBrief);
    expect(prompt).toContain('Barcelona tours');
  });

  it('should provide examples', () => {
    const prompt = buildMetaDescriptionPrompt(baseBrief);
    expect(prompt).toContain('Examples');
  });
});

describe('buildSeoTitlePrompt', () => {
  const baseBrief: ContentBrief = {
    type: 'seo_title',
    siteId: 'test-site',
    targetKeyword: 'Barcelona tours',
    secondaryKeywords: [],
    destination: 'Barcelona',
    tone: 'professional',
    targetLength: { min: 50, max: 60 },
  };

  it('should mention character limits', () => {
    const prompt = buildSeoTitlePrompt(baseBrief);
    expect(prompt).toContain('50-60 characters');
  });

  it('should mention brand placeholder', () => {
    const prompt = buildSeoTitlePrompt(baseBrief);
    expect(prompt).toContain('[Brand]');
  });
});

describe('buildQualityAssessmentPrompt', () => {
  const brief: ContentBrief = {
    type: 'destination',
    siteId: 'test-site',
    targetKeyword: 'Barcelona tours',
    secondaryKeywords: ['activities'],
    tone: 'professional',
    targetLength: { min: 500, max: 800 },
  };

  it('should include content to assess', () => {
    const prompt = buildQualityAssessmentPrompt('<h1>Test Content</h1>', brief);
    expect(prompt).toContain('Test Content');
  });

  it('should include assessment criteria', () => {
    const prompt = buildQualityAssessmentPrompt('content', brief);
    expect(prompt).toContain('Factual Accuracy');
    expect(prompt).toContain('SEO Compliance');
    expect(prompt).toContain('Readability');
    expect(prompt).toContain('Uniqueness');
    expect(prompt).toContain('Engagement');
  });

  it('should include JSON output format', () => {
    const prompt = buildQualityAssessmentPrompt('content', brief);
    expect(prompt).toContain('Output Format (JSON only)');
    expect(prompt).toContain('"scores"');
    expect(prompt).toContain('"issues"');
  });

  it('should include source data when provided', () => {
    const prompt = buildQualityAssessmentPrompt('content', brief, { fact: 'test' });
    expect(prompt).toContain('Source Data');
    expect(prompt).toContain('test');
  });
});

describe('buildRewritePrompt', () => {
  const brief: ContentBrief = {
    type: 'destination',
    siteId: 'test-site',
    targetKeyword: 'Barcelona tours',
    secondaryKeywords: [],
    tone: 'professional',
    targetLength: { min: 500, max: 800 },
  };

  const issues: QualityIssue[] = [
    {
      type: 'seo',
      severity: 'high',
      description: 'Keyword not in first paragraph',
      suggestion: 'Add keyword to introduction',
    },
    {
      type: 'engagement',
      severity: 'medium',
      description: 'Weak CTA',
    },
  ];

  it('should include original content', () => {
    const prompt = buildRewritePrompt('<h1>Original</h1>', issues, brief);
    expect(prompt).toContain('Original');
  });

  it('should list issues with severity', () => {
    const prompt = buildRewritePrompt('content', issues, brief);
    expect(prompt).toContain('[HIGH]');
    expect(prompt).toContain('[MEDIUM]');
    expect(prompt).toContain('Keyword not in first paragraph');
  });

  it('should include suggestions', () => {
    const prompt = buildRewritePrompt('content', issues, brief);
    expect(prompt).toContain('Add keyword to introduction');
  });
});

describe('getPromptBuilder', () => {
  it('should return correct builder for each type', () => {
    expect(getPromptBuilder('destination')).toBe(buildDestinationPrompt);
    expect(getPromptBuilder('category')).toBe(buildCategoryPrompt);
    expect(getPromptBuilder('experience')).toBe(buildExperiencePrompt);
    expect(getPromptBuilder('blog')).toBe(buildBlogPrompt);
    expect(getPromptBuilder('meta_description')).toBe(buildMetaDescriptionPrompt);
    expect(getPromptBuilder('seo_title')).toBe(buildSeoTitlePrompt);
  });

  it('should return destination prompt as fallback', () => {
    const builder = getPromptBuilder('unknown' as any);
    expect(builder).toBe(buildDestinationPrompt);
  });
});
