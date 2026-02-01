import { Job } from 'bullmq';
import { prisma, ABTestStatus } from '@experience-marketplace/database';
import type { ABTestAnalyzePayload, ABTestRebalancePayload, JobResult } from '../types/index.js';
import { canExecuteAutonomousOperation } from '../services/pause-control.js';

/**
 * A/B Test Worker
 * Handles autonomous A/B test analysis and traffic optimization
 */

interface AnalysisResult {
  variantId: string;
  variantName: string;
  impressions: number;
  conversions: number;
  conversionRate: number;
  isWinner: boolean;
  confidence?: number;
  uplift?: number;
}

/**
 * A/B Test Analysis Handler
 * Analyzes test results and determines statistical significance
 */
export async function handleABTestAnalyze(job: Job<ABTestAnalyzePayload>): Promise<JobResult> {
  const { abTestId, minSamples = 100, confidenceLevel = 0.95 } = job.data;

  try {
    console.log(`[ABTest Analyze] Starting analysis for test ${abTestId}`);

    // Get test to check siteId
    const abTest = await prisma.aBTest.findUnique({
      where: { id: abTestId },
      select: { siteId: true },
    });

    // Check if autonomous A/B testing is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId: abTest?.siteId,
      feature: 'enableABTesting',
    });

    if (!canProceed.allowed) {
      console.log(`[ABTest Analyze] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'A/B testing is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // 1. Get test with variants
    const abTest = await prisma.aBTest.findUnique({
      where: { id: abTestId },
      include: {
        variants: true,
      },
    });

    if (!abTest) {
      throw new Error(`A/B Test ${abTestId} not found`);
    }

    if (abTest.status !== ABTestStatus.RUNNING) {
      throw new Error(`A/B Test ${abTestId} is not running`);
    }

    // 2. Check if minimum samples reached
    const totalImpressions = abTest.variants.reduce((sum, v) => sum + v.impressions, 0);

    if (totalImpressions < minSamples) {
      console.log(`[ABTest Analyze] Not enough samples (${totalImpressions}/${minSamples})`);
      return {
        success: true,
        message: `Not enough samples yet (${totalImpressions}/${minSamples})`,
        data: { status: 'insufficient_data', totalImpressions, minSamples },
        timestamp: new Date(),
      };
    }

    // 3. Analyze variants
    const results: AnalysisResult[] = abTest.variants.map((v) => ({
      variantId: v.id,
      variantName: v.name,
      impressions: v.impressions,
      conversions: v.conversions,
      conversionRate: v.conversionRate,
      isWinner: false,
    }));

    // Find control variant
    const controlIdx = results.findIndex((r) => r.variantName === 'control');
    if (controlIdx === -1) {
      throw new Error('Control variant not found');
    }

    const control = results[controlIdx];
    if (!control) {
      throw new Error('Control variant not found');
    }

    // 4. Calculate statistical significance for each variant vs control
    results.forEach((variant, i) => {
      if (i === controlIdx) return;

      const { isSignificant, confidence, uplift } = calculateSignificance(
        control,
        variant,
        confidenceLevel
      );

      variant.confidence = confidence;
      variant.uplift = uplift;

      if (isSignificant && uplift > 0) {
        variant.isWinner = true;
      }
    });

    // 5. Determine overall winner
    const winner = results
      .filter((r) => r.isWinner)
      .sort((a, b) => b.conversionRate - a.conversionRate)[0];

    // 6. Update test if winner found
    if (winner) {
      await prisma.aBTest.update({
        where: { id: abTestId },
        data: {
          status: ABTestStatus.COMPLETED,
          winningVariant: winner.variantName,
          endedAt: new Date(),
        },
      });

      console.log(
        `[ABTest Analyze] Winner found: ${winner.variantName} (+${winner.uplift?.toFixed(1)}%)`
      );
    } else {
      console.log('[ABTest Analyze] No significant winner yet, continuing test');
    }

    return {
      success: true,
      message: winner
        ? `Test completed, winner: ${winner.variantName}`
        : 'No significant winner yet',
      data: {
        testId: abTestId,
        status: winner ? 'completed' : 'running',
        winner: winner?.variantName,
        results,
        totalImpressions,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[ABTest Analyze] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * A/B Test Rebalance Handler
 * Dynamically adjusts traffic allocation using multi-armed bandit algorithms
 */
export async function handleABTestRebalance(job: Job<ABTestRebalancePayload>): Promise<JobResult> {
  const { abTestId, algorithm = 'thompson_sampling' } = job.data;

  try {
    console.log(`[ABTest Rebalance] Starting rebalance for test ${abTestId} using ${algorithm}`);

    // Get test to check siteId
    const abTestPreCheck = await prisma.aBTest.findUnique({
      where: { id: abTestId },
      select: { siteId: true },
    });

    // Check if autonomous A/B testing is allowed
    const canProceed = await canExecuteAutonomousOperation({
      siteId: abTestPreCheck?.siteId,
      feature: 'enableABTesting',
    });

    if (!canProceed.allowed) {
      console.log(`[ABTest Rebalance] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'A/B testing is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // 1. Get test with variants
    const abTest = await prisma.aBTest.findUnique({
      where: { id: abTestId },
      include: {
        variants: true,
      },
    });

    if (!abTest) {
      throw new Error(`A/B Test ${abTestId} not found`);
    }

    if (abTest.status !== ABTestStatus.RUNNING) {
      throw new Error(`A/B Test ${abTestId} is not running`);
    }

    // 2. Calculate new traffic allocation
    let newAllocation: Record<string, number>;

    if (algorithm === 'thompson_sampling') {
      newAllocation = thompsonSampling(abTest.variants);
    } else if (algorithm === 'epsilon_greedy') {
      newAllocation = epsilonGreedy(abTest.variants);
    } else {
      throw new Error(`Unknown algorithm: ${algorithm}`);
    }

    // 3. Update traffic split in test
    await prisma.aBTest.update({
      where: { id: abTestId },
      data: {
        trafficSplit: newAllocation,
      },
    });

    // 4. Update bandit scores for variants
    for (const variant of abTest.variants) {
      const score = newAllocation[variant.name] || 0;
      await prisma.aBTestVariant.update({
        where: { id: variant.id },
        data: { banditScore: score },
      });
    }

    console.log(`[ABTest Rebalance] Traffic rebalanced:`, JSON.stringify(newAllocation));

    return {
      success: true,
      message: `Traffic rebalanced using ${algorithm}`,
      data: {
        testId: abTestId,
        algorithm,
        allocation: newAllocation,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[ABTest Rebalance] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

// Helper Functions

/**
 * Calculate statistical significance using Z-test for proportions
 */
function calculateSignificance(
  control: { impressions: number; conversions: number; conversionRate: number },
  variant: { impressions: number; conversions: number; conversionRate: number },
  confidenceLevel: number
): { isSignificant: boolean; confidence: number; uplift: number } {
  const p1 = control.conversionRate / 100;
  const p2 = variant.conversionRate / 100;
  const n1 = control.impressions;
  const n2 = variant.impressions;

  // Pooled proportion
  const pPooled = (control.conversions + variant.conversions) / (n1 + n2);

  // Standard error
  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));

  // Z-score
  const z = (p2 - p1) / se;

  // P-value (two-tailed test)
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));

  // Confidence (1 - p-value)
  const confidence = 1 - pValue;

  // Uplift percentage
  const uplift = ((p2 - p1) / p1) * 100;

  return {
    isSignificant: confidence >= confidenceLevel,
    confidence,
    uplift,
  };
}

/**
 * Cumulative distribution function for standard normal distribution
 * Approximation using error function
 */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const probability =
    d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

  return x > 0 ? 1 - probability : probability;
}

/**
 * Thompson Sampling Algorithm
 * Uses Beta distribution to model conversion probabilities
 */
function thompsonSampling(
  variants: Array<{
    name: string;
    impressions: number;
    conversions: number;
  }>
): Record<string, number> {
  const samples = 10000; // Number of Monte Carlo samples
  const wins: Record<string, number> = {};

  // Initialize wins counter
  variants.forEach((v) => {
    wins[v.name] = 0;
  });

  // Monte Carlo sampling
  for (let i = 0; i < samples; i++) {
    let maxSample = -Infinity;
    let winner = '';

    for (const variant of variants) {
      // Beta distribution parameters
      const alpha = variant.conversions + 1; // Prior: Beta(1,1)
      const beta = variant.impressions - variant.conversions + 1;

      // Sample from Beta distribution
      const sample = betaSample(alpha, beta);

      if (sample > maxSample) {
        maxSample = sample;
        winner = variant.name;
      }
    }

    if (winner) {
      const currentWins = wins[winner];
      if (currentWins !== undefined) {
        wins[winner] = currentWins + 1;
      }
    }
  }

  // Convert wins to probabilities
  const allocation: Record<string, number> = {};
  for (const variant of variants) {
    allocation[variant.name] = (wins[variant.name] || 0) / samples;
  }

  return allocation;
}

/**
 * Sample from Beta distribution using Gamma distribution
 */
function betaSample(alpha: number, beta: number): number {
  const x = gammaSample(alpha, 1);
  const y = gammaSample(beta, 1);
  return x / (x + y);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang method
 */
function gammaSample(alpha: number, beta: number): number {
  if (alpha < 1) {
    // Use Johnk's generator for alpha < 1
    return gammaSample(alpha + 1, beta) * Math.pow(Math.random(), 1 / alpha);
  }

  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let x, v;

    do {
      x = normalSample();
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = Math.random();
    const xSquared = x * x;

    if (
      u < 1 - 0.0331 * xSquared * xSquared ||
      Math.log(u) < 0.5 * xSquared + d * (1 - v + Math.log(v))
    ) {
      return d * v * beta;
    }
  }
}

/**
 * Sample from standard normal distribution using Box-Muller transform
 */
function normalSample(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Epsilon-Greedy Algorithm
 * Balances exploration (10%) and exploitation (90%)
 */
function epsilonGreedy(
  variants: Array<{
    name: string;
    conversionRate: number;
  }>
): Record<string, number> {
  const epsilon = 0.1; // 10% exploration
  const allocation: Record<string, number> = {};

  // Find best performing variant
  const bestVariant = variants.reduce((best, current) =>
    current.conversionRate > best.conversionRate ? current : best
  );

  // Allocate traffic
  const explorationPerVariant = epsilon / variants.length;
  const exploitation = 1 - epsilon;

  for (const variant of variants) {
    if (variant.name === bestVariant.name) {
      allocation[variant.name] = exploitation + explorationPerVariant;
    } else {
      allocation[variant.name] = explorationPerVariant;
    }
  }

  return allocation;
}
