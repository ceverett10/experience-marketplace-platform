import type {
  QualityAssessment,
  QualityScoreBreakdown,
  QualityIssue,
  ContentBrief,
} from '../types';
import { type ClaudeClient, type ModelAlias } from '../client';
import { buildQualityAssessmentPrompt } from '../prompts';

/**
 * Quality score weights for calculating overall score
 */
const SCORE_WEIGHTS: Record<keyof QualityScoreBreakdown, number> = {
  factualAccuracy: 0.25,    // Critical - must match source data
  seoCompliance: 0.20,      // Important for search visibility
  readability: 0.15,        // User experience
  uniqueness: 0.20,         // Differentiation from competitors
  engagement: 0.20,         // Conversion potential
};

/**
 * Severity thresholds for automatic issue classification
 */
const SEVERITY_THRESHOLDS = {
  critical: 40,   // Score below this is critical
  high: 60,       // Score below this is high severity
  medium: 75,     // Score below this is medium severity
  // Above 75 is low severity
};

interface QualityGateConfig {
  client: ClaudeClient;
  model?: ModelAlias;
  threshold?: number;
  autoPublishThreshold?: number;
}

interface AssessmentResult {
  assessment: QualityAssessment;
  rawResponse: string;
  tokensUsed: number;
  cost: number;
}

/**
 * AI Quality Gate for assessing generated content
 * Uses Claude to evaluate content against multiple criteria
 */
export class QualityGate {
  private client: ClaudeClient;
  private model: ModelAlias;
  private threshold: number;
  private autoPublishThreshold: number;

  constructor(config: QualityGateConfig) {
    this.client = config.client;
    this.model = config.model || 'sonnet';
    this.threshold = config.threshold || 75;
    this.autoPublishThreshold = config.autoPublishThreshold || 90;
  }

  /**
   * Assess the quality of generated content
   */
  async assess(
    content: string,
    brief: ContentBrief,
    contentId?: string
  ): Promise<AssessmentResult> {
    const prompt = buildQualityAssessmentPrompt(content, brief, brief.sourceData);

    const response = await this.client.assess({
      content,
      prompt,
      model: this.model,
      contentId,
    });

    const assessment = this.parseAssessmentResponse(response.content);

    return {
      assessment,
      rawResponse: response.content,
      tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
      cost: response.cost,
    };
  }

  /**
   * Parse the JSON response from Claude into a structured assessment
   */
  private parseAssessmentResponse(responseText: string): QualityAssessment {
    // Interface for the expected parsed response structure
    interface ParsedAssessmentResponse {
      scores?: {
        factualAccuracy?: number;
        seoCompliance?: number;
        readability?: number;
        uniqueness?: number;
        engagement?: number;
      };
      issues?: Array<{
        type?: string;
        severity?: string;
        description?: string;
        location?: string;
        suggestion?: string;
      }>;
      suggestions?: string[];
    }

    try {
      // Try to extract JSON from the response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]) as ParsedAssessmentResponse;

      // Map the parsed response to our types
      const breakdown: QualityScoreBreakdown = {
        factualAccuracy: this.normalizeScore(parsed.scores?.factualAccuracy),
        seoCompliance: this.normalizeScore(parsed.scores?.seoCompliance),
        readability: this.normalizeScore(parsed.scores?.readability),
        uniqueness: this.normalizeScore(parsed.scores?.uniqueness),
        engagement: this.normalizeScore(parsed.scores?.engagement),
      };

      // Calculate weighted overall score
      const overallScore = this.calculateOverallScore(breakdown);

      // Parse issues with proper typing
      const issues: QualityIssue[] = (parsed.issues ?? []).map((issue) => ({
        type: this.normalizeIssueType(issue.type),
        severity: this.normalizeSeverity(issue.severity),
        description: issue.description ?? 'Unspecified issue',
        location: issue.location,
        suggestion: issue.suggestion,
      }));

      // Add issues for any category scoring below threshold
      const additionalIssues = this.generateScoreBasedIssues(breakdown);
      issues.push(...additionalIssues.filter(
        ai => !issues.some(i => i.type === ai.type && i.severity === ai.severity)
      ));

      return {
        overallScore,
        breakdown,
        passed: overallScore >= this.threshold,
        issues,
        suggestions: parsed.suggestions ?? [],
        assessedAt: new Date(),
        assessedBy: this.model,
      };
    } catch (error) {
      // If parsing fails, return a conservative assessment
      console.error('Failed to parse quality assessment:', error);

      return {
        overallScore: 0,
        breakdown: {
          factualAccuracy: 0,
          seoCompliance: 0,
          readability: 0,
          uniqueness: 0,
          engagement: 0,
        },
        passed: false,
        issues: [{
          type: 'factual',
          severity: 'critical',
          description: 'Quality assessment failed to parse - content requires manual review',
          suggestion: 'Please review the content manually or regenerate',
        }],
        suggestions: ['Manual review required due to assessment error'],
        assessedAt: new Date(),
        assessedBy: this.model,
      };
    }
  }

  /**
   * Normalize a score to 0-100 range
   */
  private normalizeScore(score: unknown): number {
    if (typeof score !== 'number') return 0;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate weighted overall score from breakdown
   */
  private calculateOverallScore(breakdown: QualityScoreBreakdown): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const [key, weight] of Object.entries(SCORE_WEIGHTS)) {
      const score = breakdown[key as keyof QualityScoreBreakdown];
      weightedSum += score * weight;
      totalWeight += weight;
    }

    return Math.round(weightedSum / totalWeight);
  }

  /**
   * Normalize issue type to valid enum value
   */
  private normalizeIssueType(type?: string): QualityIssue['type'] {
    const validTypes: QualityIssue['type'][] = ['factual', 'seo', 'readability', 'uniqueness', 'engagement'];
    if (type && validTypes.includes(type as QualityIssue['type'])) {
      return type as QualityIssue['type'];
    }
    return 'factual'; // Default to factual for unknown types
  }

  /**
   * Normalize severity to valid enum value
   */
  private normalizeSeverity(severity?: string): QualityIssue['severity'] {
    const validSeverities: QualityIssue['severity'][] = ['low', 'medium', 'high', 'critical'];
    if (severity && validSeverities.includes(severity as QualityIssue['severity'])) {
      return severity as QualityIssue['severity'];
    }
    return 'medium'; // Default to medium for unknown severities
  }

  /**
   * Generate issues based on low scores in specific categories
   */
  private generateScoreBasedIssues(breakdown: QualityScoreBreakdown): QualityIssue[] {
    const issues: QualityIssue[] = [];

    const scoreToIssue: Array<{
      key: keyof QualityScoreBreakdown;
      type: QualityIssue['type'];
      label: string;
    }> = [
      { key: 'factualAccuracy', type: 'factual', label: 'Factual accuracy' },
      { key: 'seoCompliance', type: 'seo', label: 'SEO compliance' },
      { key: 'readability', type: 'readability', label: 'Readability' },
      { key: 'uniqueness', type: 'uniqueness', label: 'Content uniqueness' },
      { key: 'engagement', type: 'engagement', label: 'Engagement level' },
    ];

    for (const { key, type, label } of scoreToIssue) {
      const score = breakdown[key];

      if (score < SEVERITY_THRESHOLDS.critical) {
        issues.push({
          type,
          severity: 'critical',
          description: `${label} score is critically low (${score}/100)`,
          suggestion: `Significant improvements needed in ${label.toLowerCase()}`,
        });
      } else if (score < SEVERITY_THRESHOLDS.high) {
        issues.push({
          type,
          severity: 'high',
          description: `${label} score needs improvement (${score}/100)`,
          suggestion: `Address ${label.toLowerCase()} issues for better quality`,
        });
      } else if (score < SEVERITY_THRESHOLDS.medium) {
        issues.push({
          type,
          severity: 'medium',
          description: `${label} score is below target (${score}/100)`,
          suggestion: `Minor improvements to ${label.toLowerCase()} recommended`,
        });
      }
    }

    return issues;
  }

  /**
   * Check if content should be auto-published
   */
  shouldAutoPublish(assessment: QualityAssessment): boolean {
    // Must pass basic threshold
    if (!assessment.passed) return false;

    // Must meet auto-publish threshold
    if (assessment.overallScore < this.autoPublishThreshold) return false;

    // Must not have any critical or high severity issues
    const hasBlockingIssues = assessment.issues.some(
      issue => issue.severity === 'critical' || issue.severity === 'high'
    );

    return !hasBlockingIssues;
  }

  /**
   * Determine if content should be rewritten
   */
  shouldRewrite(assessment: QualityAssessment): boolean {
    // If passed and no critical issues, don't need rewrite
    if (assessment.passed && !assessment.issues.some(i => i.severity === 'critical')) {
      return false;
    }

    // If score is extremely low, might not be worth rewriting
    if (assessment.overallScore < 20) {
      return false; // Better to regenerate from scratch
    }

    return true;
  }

  /**
   * Get issues that should be addressed in a rewrite
   */
  getRewriteIssues(assessment: QualityAssessment): QualityIssue[] {
    // Prioritize critical and high severity issues
    return assessment.issues
      .filter(issue => issue.severity === 'critical' || issue.severity === 'high')
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }

  /**
   * Calculate the improvement from a previous assessment
   */
  calculateImprovement(
    previous: QualityAssessment,
    current: QualityAssessment
  ): number {
    return current.overallScore - previous.overallScore;
  }

  /**
   * Update thresholds dynamically
   */
  setThresholds(threshold: number, autoPublishThreshold: number): void {
    this.threshold = Math.max(0, Math.min(100, threshold));
    this.autoPublishThreshold = Math.max(this.threshold, Math.min(100, autoPublishThreshold));
  }

  /**
   * Get current configuration
   */
  getConfig(): { model: ModelAlias; threshold: number; autoPublishThreshold: number } {
    return {
      model: this.model,
      threshold: this.threshold,
      autoPublishThreshold: this.autoPublishThreshold,
    };
  }
}

/**
 * Quick assessment for cost-conscious scenarios
 * Uses Haiku for faster, cheaper assessments
 */
export async function quickAssess(
  client: ClaudeClient,
  content: string,
  brief: ContentBrief,
  contentId?: string
): Promise<AssessmentResult> {
  const gate = new QualityGate({ client, model: 'haiku' });
  return gate.assess(content, brief, contentId);
}

/**
 * Thorough assessment for high-value content
 * Uses Sonnet for more detailed analysis
 */
export async function thoroughAssess(
  client: ClaudeClient,
  content: string,
  brief: ContentBrief,
  contentId?: string
): Promise<AssessmentResult> {
  const gate = new QualityGate({ client, model: 'sonnet' });
  return gate.assess(content, brief, contentId);
}

export { SCORE_WEIGHTS, SEVERITY_THRESHOLDS };
