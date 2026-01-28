import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QualityGate, SCORE_WEIGHTS, SEVERITY_THRESHOLDS } from '../quality';
import { ClaudeClient } from '../client';
import type { ContentBrief, QualityAssessment } from '../types';

// Mock the ClaudeClient
vi.mock('../client', () => {
  return {
    ClaudeClient: vi.fn().mockImplementation(() => ({
      assess: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          scores: {
            factualAccuracy: 85,
            seoCompliance: 80,
            readability: 90,
            uniqueness: 75,
            engagement: 82,
          },
          overallScore: 82,
          passed: true,
          issues: [
            {
              type: 'seo',
              severity: 'medium',
              description: 'Could use more secondary keywords',
              location: 'Body paragraphs',
              suggestion: 'Incorporate secondary keywords naturally',
            },
          ],
          suggestions: ['Add more calls-to-action'],
          strengths: ['Good readability', 'Accurate information'],
        }),
        usage: { inputTokens: 500, outputTokens: 300 },
        cost: 0.01,
      }),
    })),
    getClaudeClient: vi.fn(),
  };
});

describe('QualityGate Constants', () => {
  describe('SCORE_WEIGHTS', () => {
    it('should have all required weights', () => {
      expect(SCORE_WEIGHTS).toHaveProperty('factualAccuracy');
      expect(SCORE_WEIGHTS).toHaveProperty('seoCompliance');
      expect(SCORE_WEIGHTS).toHaveProperty('readability');
      expect(SCORE_WEIGHTS).toHaveProperty('uniqueness');
      expect(SCORE_WEIGHTS).toHaveProperty('engagement');
    });

    it('should sum to 1.0', () => {
      const sum = Object.values(SCORE_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 5);
    });
  });

  describe('SEVERITY_THRESHOLDS', () => {
    it('should have correct threshold order', () => {
      expect(SEVERITY_THRESHOLDS.critical).toBeLessThan(SEVERITY_THRESHOLDS.high);
      expect(SEVERITY_THRESHOLDS.high).toBeLessThan(SEVERITY_THRESHOLDS.medium);
    });
  });
});

describe('QualityGate', () => {
  let mockClient: ClaudeClient;
  let qualityGate: QualityGate;

  const testBrief: ContentBrief = {
    type: 'destination',
    siteId: 'test-site',
    targetKeyword: 'Barcelona tours',
    secondaryKeywords: ['activities'],
    tone: 'professional',
    targetLength: { min: 500, max: 800 },
  };

  beforeEach(() => {
    mockClient = new ClaudeClient();
    qualityGate = new QualityGate({
      client: mockClient,
      model: 'sonnet',
      threshold: 75,
      autoPublishThreshold: 90,
    });
  });

  describe('assess', () => {
    it('should return assessment result', async () => {
      const result = await qualityGate.assess('<h1>Test Content</h1>', testBrief);

      expect(result).toHaveProperty('assessment');
      expect(result).toHaveProperty('rawResponse');
      expect(result).toHaveProperty('tokensUsed');
      expect(result).toHaveProperty('cost');
    });

    it('should parse assessment correctly', async () => {
      const result = await qualityGate.assess('<h1>Test Content</h1>', testBrief);
      const assessment = result.assessment;

      expect(assessment.breakdown).toHaveProperty('factualAccuracy');
      expect(assessment.breakdown).toHaveProperty('seoCompliance');
      expect(assessment.breakdown).toHaveProperty('readability');
      expect(assessment.breakdown).toHaveProperty('uniqueness');
      expect(assessment.breakdown).toHaveProperty('engagement');
    });

    it('should include issues in assessment', async () => {
      const result = await qualityGate.assess('<h1>Test Content</h1>', testBrief);

      expect(result.assessment.issues.length).toBeGreaterThan(0);
      expect(result.assessment.issues[0]).toHaveProperty('type');
      expect(result.assessment.issues[0]).toHaveProperty('severity');
      expect(result.assessment.issues[0]).toHaveProperty('description');
    });
  });

  describe('shouldAutoPublish', () => {
    it('should return false if not passed', () => {
      const assessment: QualityAssessment = {
        overallScore: 70,
        breakdown: {
          factualAccuracy: 70,
          seoCompliance: 70,
          readability: 70,
          uniqueness: 70,
          engagement: 70,
        },
        passed: false,
        issues: [],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      expect(qualityGate.shouldAutoPublish(assessment)).toBe(false);
    });

    it('should return false if below auto-publish threshold', () => {
      const assessment: QualityAssessment = {
        overallScore: 85,
        breakdown: {
          factualAccuracy: 85,
          seoCompliance: 85,
          readability: 85,
          uniqueness: 85,
          engagement: 85,
        },
        passed: true,
        issues: [],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      expect(qualityGate.shouldAutoPublish(assessment)).toBe(false);
    });

    it('should return false if has critical issues', () => {
      const assessment: QualityAssessment = {
        overallScore: 92,
        breakdown: {
          factualAccuracy: 92,
          seoCompliance: 92,
          readability: 92,
          uniqueness: 92,
          engagement: 92,
        },
        passed: true,
        issues: [
          {
            type: 'factual',
            severity: 'critical',
            description: 'Factual error detected',
          },
        ],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      expect(qualityGate.shouldAutoPublish(assessment)).toBe(false);
    });

    it('should return true for high-quality content without blocking issues', () => {
      const assessment: QualityAssessment = {
        overallScore: 95,
        breakdown: {
          factualAccuracy: 95,
          seoCompliance: 95,
          readability: 95,
          uniqueness: 95,
          engagement: 95,
        },
        passed: true,
        issues: [
          {
            type: 'seo',
            severity: 'low',
            description: 'Minor improvement possible',
          },
        ],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      expect(qualityGate.shouldAutoPublish(assessment)).toBe(true);
    });
  });

  describe('shouldRewrite', () => {
    it('should return false if passed with no critical issues', () => {
      const assessment: QualityAssessment = {
        overallScore: 80,
        breakdown: {
          factualAccuracy: 80,
          seoCompliance: 80,
          readability: 80,
          uniqueness: 80,
          engagement: 80,
        },
        passed: true,
        issues: [],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      expect(qualityGate.shouldRewrite(assessment)).toBe(false);
    });

    it('should return true if not passed', () => {
      const assessment: QualityAssessment = {
        overallScore: 60,
        breakdown: {
          factualAccuracy: 60,
          seoCompliance: 60,
          readability: 60,
          uniqueness: 60,
          engagement: 60,
        },
        passed: false,
        issues: [],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      expect(qualityGate.shouldRewrite(assessment)).toBe(true);
    });

    it('should return false if score is extremely low', () => {
      const assessment: QualityAssessment = {
        overallScore: 15,
        breakdown: {
          factualAccuracy: 15,
          seoCompliance: 15,
          readability: 15,
          uniqueness: 15,
          engagement: 15,
        },
        passed: false,
        issues: [],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      expect(qualityGate.shouldRewrite(assessment)).toBe(false);
    });
  });

  describe('getRewriteIssues', () => {
    it('should return only critical and high severity issues', () => {
      const assessment: QualityAssessment = {
        overallScore: 65,
        breakdown: {
          factualAccuracy: 65,
          seoCompliance: 65,
          readability: 65,
          uniqueness: 65,
          engagement: 65,
        },
        passed: false,
        issues: [
          { type: 'factual', severity: 'critical', description: 'Critical issue' },
          { type: 'seo', severity: 'high', description: 'High issue' },
          { type: 'readability', severity: 'medium', description: 'Medium issue' },
          { type: 'engagement', severity: 'low', description: 'Low issue' },
        ],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      const rewriteIssues = qualityGate.getRewriteIssues(assessment);

      expect(rewriteIssues).toHaveLength(2);
      expect(rewriteIssues[0].severity).toBe('critical');
      expect(rewriteIssues[1].severity).toBe('high');
    });

    it('should sort issues by severity', () => {
      const assessment: QualityAssessment = {
        overallScore: 65,
        breakdown: {
          factualAccuracy: 65,
          seoCompliance: 65,
          readability: 65,
          uniqueness: 65,
          engagement: 65,
        },
        passed: false,
        issues: [
          { type: 'seo', severity: 'high', description: 'High issue' },
          { type: 'factual', severity: 'critical', description: 'Critical issue' },
        ],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      const rewriteIssues = qualityGate.getRewriteIssues(assessment);

      expect(rewriteIssues[0].severity).toBe('critical');
      expect(rewriteIssues[1].severity).toBe('high');
    });
  });

  describe('calculateImprovement', () => {
    it('should calculate positive improvement', () => {
      const previous: QualityAssessment = {
        overallScore: 60,
        breakdown: {
          factualAccuracy: 60,
          seoCompliance: 60,
          readability: 60,
          uniqueness: 60,
          engagement: 60,
        },
        passed: false,
        issues: [],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      const current: QualityAssessment = {
        ...previous,
        overallScore: 80,
        passed: true,
      };

      expect(qualityGate.calculateImprovement(previous, current)).toBe(20);
    });

    it('should calculate negative improvement', () => {
      const previous: QualityAssessment = {
        overallScore: 80,
        breakdown: {
          factualAccuracy: 80,
          seoCompliance: 80,
          readability: 80,
          uniqueness: 80,
          engagement: 80,
        },
        passed: true,
        issues: [],
        suggestions: [],
        assessedAt: new Date(),
        assessedBy: 'sonnet',
      };

      const current: QualityAssessment = {
        ...previous,
        overallScore: 70,
        passed: false,
      };

      expect(qualityGate.calculateImprovement(previous, current)).toBe(-10);
    });
  });

  describe('setThresholds', () => {
    it('should update thresholds', () => {
      qualityGate.setThresholds(80, 95);
      const config = qualityGate.getConfig();

      expect(config.threshold).toBe(80);
      expect(config.autoPublishThreshold).toBe(95);
    });

    it('should clamp thresholds to valid range', () => {
      qualityGate.setThresholds(-10, 150);
      const config = qualityGate.getConfig();

      expect(config.threshold).toBe(0);
      expect(config.autoPublishThreshold).toBe(100);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = qualityGate.getConfig();

      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('threshold');
      expect(config).toHaveProperty('autoPublishThreshold');
      expect(config.model).toBe('sonnet');
      expect(config.threshold).toBe(75);
      expect(config.autoPublishThreshold).toBe(90);
    });
  });
});
