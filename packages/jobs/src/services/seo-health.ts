/**
 * SEO Health Scoring Service
 *
 * Provides comprehensive site-level SEO audits with:
 * - Technical SEO health scoring
 * - Content quality analysis
 * - Performance metrics integration (GSC + GA4)
 * - Actionable improvement recommendations
 * - Priority-ranked optimization opportunities
 */

import { prisma, PageType } from '@experience-marketplace/database';

/**
 * Individual page SEO score breakdown
 */
export interface PageSEOScore {
  pageId: string;
  url: string;
  title: string;
  pageType: string;
  scores: {
    technical: number; // Meta tags, structured data, sitemap
    content: number; // Quality score, word count, freshness
    performance: number; // CTR, position, clicks from GSC
    overall: number;
  };
  issues: SEOIssue[];
  lastUpdated: Date;
}

/**
 * Site-level SEO health report
 */
export interface SiteHealthReport {
  siteId: string;
  siteName: string;
  domain: string;
  auditDate: Date;
  overallScore: number;
  scores: {
    technical: number;
    content: number;
    performance: number;
    coverage: number; // % of pages with good SEO
  };
  pageScores: PageSEOScore[];
  issues: SEOIssue[];
  recommendations: SEORecommendation[];
  trends: {
    scoreChange7d: number;
    scoreChange30d: number;
    clicksChange7d: number;
    impressionsChange7d: number;
  };
  summary: string;
}

/**
 * SEO issue identified during audit
 */
export interface SEOIssue {
  type: 'critical' | 'warning' | 'info';
  category: 'technical' | 'content' | 'performance' | 'coverage';
  title: string;
  description: string;
  affectedPages?: string[];
  impact: number; // 1-10 scale
  effort: number; // 1-10 scale (1 = easy fix)
}

/**
 * Prioritized recommendation for improvement
 */
export interface SEORecommendation {
  priority: number; // 1-100, higher = more important
  category: 'technical' | 'content' | 'performance' | 'coverage';
  action: string;
  expectedImpact: string;
  affectedPages: string[];
  automatable: boolean;
  estimatedLift: number; // Expected % improvement
}

/**
 * Audit a single page's SEO health
 */
export async function auditPageSEO(pageId: string): Promise<PageSEOScore> {
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      content: true,
      site: true,
    },
  });

  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }

  const issues: SEOIssue[] = [];
  let technicalScore = 100;
  let contentScore = 100;
  let performanceScore = 50; // Default if no GSC data

  // === TECHNICAL SEO CHECKS ===

  // Check meta title
  if (!page.metaTitle) {
    technicalScore -= 20;
    issues.push({
      type: 'critical',
      category: 'technical',
      title: 'Missing meta title',
      description: 'Page has no meta title, which is critical for SEO',
      impact: 9,
      effort: 2,
    });
  } else if (page.metaTitle.length < 30 || page.metaTitle.length > 60) {
    technicalScore -= 10;
    issues.push({
      type: 'warning',
      category: 'technical',
      title: 'Meta title length issue',
      description: `Meta title is ${page.metaTitle.length} chars (optimal: 50-60)`,
      impact: 5,
      effort: 2,
    });
  }

  // Check meta description
  if (!page.metaDescription) {
    technicalScore -= 15;
    issues.push({
      type: 'critical',
      category: 'technical',
      title: 'Missing meta description',
      description: 'Page has no meta description',
      impact: 8,
      effort: 2,
    });
  } else if (page.metaDescription.length < 120 || page.metaDescription.length > 160) {
    technicalScore -= 5;
    issues.push({
      type: 'warning',
      category: 'technical',
      title: 'Meta description length issue',
      description: `Meta description is ${page.metaDescription.length} chars (optimal: 150-160)`,
      impact: 4,
      effort: 2,
    });
  }

  // Check structured data
  const hasStructuredData = page.content?.structuredData &&
    Object.keys(page.content.structuredData as object).length > 0;
  if (!hasStructuredData) {
    technicalScore -= 10;
    issues.push({
      type: 'warning',
      category: 'technical',
      title: 'Missing structured data',
      description: 'Page has no Schema.org structured data for rich snippets',
      impact: 6,
      effort: 4,
    });
  }

  // Check sitemap priority
  if (!page.priority || page.priority < 0.3) {
    technicalScore -= 5;
    issues.push({
      type: 'info',
      category: 'technical',
      title: 'Low sitemap priority',
      description: 'Page has low or missing sitemap priority',
      impact: 3,
      effort: 1,
    });
  }

  // === CONTENT QUALITY CHECKS ===

  const contentBody = page.content?.body || '';
  const wordCount = contentBody.split(/\s+/).length;

  // Check content length
  const minWords = page.type === PageType.BLOG ? 800 : 300;
  if (wordCount < minWords) {
    contentScore -= 20;
    issues.push({
      type: 'warning',
      category: 'content',
      title: 'Thin content',
      description: `Page has only ${wordCount} words (recommended: ${minWords}+)`,
      impact: 7,
      effort: 6,
    });
  }

  // Check content quality score
  const qualityScore = page.content?.qualityScore || 0;
  if (qualityScore < 70) {
    contentScore -= 25;
    issues.push({
      type: 'critical',
      category: 'content',
      title: 'Low content quality',
      description: `Content quality score is ${qualityScore} (threshold: 70)`,
      impact: 8,
      effort: 7,
    });
  } else if (qualityScore < 85) {
    contentScore -= 10;
    issues.push({
      type: 'warning',
      category: 'content',
      title: 'Content quality can improve',
      description: `Content quality score is ${qualityScore} (optimal: 85+)`,
      impact: 5,
      effort: 5,
    });
  }

  // Check content freshness
  const daysSinceUpdate = page.content?.updatedAt
    ? Math.floor((Date.now() - new Date(page.content.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
    : 365;
  if (daysSinceUpdate > 180) {
    contentScore -= 10;
    issues.push({
      type: 'info',
      category: 'content',
      title: 'Stale content',
      description: `Content hasn't been updated in ${daysSinceUpdate} days`,
      impact: 4,
      effort: 5,
    });
  }

  // Check for headings
  const hasH2 = contentBody.includes('## ') || contentBody.includes('<h2');
  if (!hasH2) {
    contentScore -= 10;
    issues.push({
      type: 'warning',
      category: 'content',
      title: 'Missing subheadings',
      description: 'Content lacks H2 subheadings for structure',
      impact: 5,
      effort: 3,
    });
  }

  // === PERFORMANCE CHECKS (GSC DATA) ===

  // Get recent performance metrics
  const recentMetrics = await prisma.performanceMetric.findFirst({
    where: {
      siteId: page.siteId,
      pageUrl: { contains: page.slug },
      date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
    },
    orderBy: { date: 'desc' },
  });

  if (recentMetrics) {
    // CTR analysis
    const ctr = recentMetrics.ctr || 0;
    const position = recentMetrics.position || 100;

    if (position <= 10 && ctr < 0.02) {
      performanceScore = 30;
      issues.push({
        type: 'critical',
        category: 'performance',
        title: 'Low CTR in top 10',
        description: `Page ranks #${Math.round(position)} but has only ${(ctr * 100).toFixed(1)}% CTR`,
        impact: 9,
        effort: 4,
      });
    } else if (position <= 20 && ctr < 0.01) {
      performanceScore = 50;
      issues.push({
        type: 'warning',
        category: 'performance',
        title: 'Below average CTR',
        description: `CTR of ${(ctr * 100).toFixed(1)}% is below average for position ${Math.round(position)}`,
        impact: 6,
        effort: 4,
      });
    } else if (ctr >= 0.05) {
      performanceScore = 90;
    } else {
      performanceScore = 60 + (ctr * 600); // Scale based on CTR
    }

    // Position analysis
    if (position > 50) {
      performanceScore = Math.min(performanceScore, 40);
      issues.push({
        type: 'warning',
        category: 'performance',
        title: 'Poor ranking position',
        description: `Average position is ${Math.round(position)} - needs significant improvement`,
        impact: 8,
        effort: 7,
      });
    }
  } else {
    issues.push({
      type: 'info',
      category: 'performance',
      title: 'No performance data',
      description: 'No GSC data available for this page',
      impact: 3,
      effort: 1,
    });
  }

  // Calculate overall score
  const overallScore = Math.round(
    (technicalScore * 0.3) + (contentScore * 0.4) + (performanceScore * 0.3)
  );

  return {
    pageId: page.id,
    url: `/${page.slug}`,
    title: page.title,
    pageType: page.type,
    scores: {
      technical: Math.max(0, technicalScore),
      content: Math.max(0, contentScore),
      performance: Math.max(0, performanceScore),
      overall: Math.max(0, overallScore),
    },
    issues,
    lastUpdated: page.updatedAt,
  };
}

/**
 * Generate comprehensive site-level SEO health report
 */
export async function generateSiteHealthReport(siteId: string): Promise<SiteHealthReport> {
  const site = await prisma.site.findUnique({
    where: { id: siteId },
  });

  if (!site) {
    throw new Error(`Site not found: ${siteId}`);
  }

  // Get all published pages for this site
  const pages = await prisma.page.findMany({
    where: {
      siteId,
      status: 'PUBLISHED',
    },
    select: { id: true },
  });

  // Audit each page
  const pageScores: PageSEOScore[] = [];
  const allIssues: SEOIssue[] = [];

  for (const page of pages) {
    try {
      const score = await auditPageSEO(page.id);
      pageScores.push(score);
      allIssues.push(...score.issues);
    } catch (error) {
      console.error(`Failed to audit page ${page.id}:`, error);
    }
  }

  // Calculate aggregate scores
  const avgTechnical = pageScores.length > 0
    ? pageScores.reduce((sum, p) => sum + p.scores.technical, 0) / pageScores.length
    : 0;
  const avgContent = pageScores.length > 0
    ? pageScores.reduce((sum, p) => sum + p.scores.content, 0) / pageScores.length
    : 0;
  const avgPerformance = pageScores.length > 0
    ? pageScores.reduce((sum, p) => sum + p.scores.performance, 0) / pageScores.length
    : 0;

  // Calculate coverage (% of pages with good SEO)
  const goodPages = pageScores.filter(p => p.scores.overall >= 70).length;
  const coverageScore = pages.length > 0 ? (goodPages / pages.length) * 100 : 0;

  // Calculate overall site score
  const overallScore = Math.round(
    (avgTechnical * 0.25) + (avgContent * 0.35) + (avgPerformance * 0.25) + (coverageScore * 0.15)
  );

  // Get trend data
  const trends = await calculateTrends(siteId);

  // Generate prioritized recommendations
  const recommendations = generateRecommendations(pageScores, allIssues);

  // Deduplicate issues and sort by impact
  const uniqueIssues = deduplicateIssues(allIssues);

  // Generate summary
  const summary = generateSummary(overallScore, pageScores.length, uniqueIssues, recommendations);

  return {
    siteId,
    siteName: site.name,
    domain: site.primaryDomain || site.slug || 'unknown',
    auditDate: new Date(),
    overallScore,
    scores: {
      technical: Math.round(avgTechnical),
      content: Math.round(avgContent),
      performance: Math.round(avgPerformance),
      coverage: Math.round(coverageScore),
    },
    pageScores,
    issues: uniqueIssues,
    recommendations,
    trends,
    summary,
  };
}

/**
 * Calculate performance trends from historical data
 */
async function calculateTrends(siteId: string): Promise<SiteHealthReport['trends']> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  // Get aggregated metrics for different periods
  const [current7d, previous7d, current30d, previous30d] = await Promise.all([
    prisma.performanceMetric.aggregate({
      where: { siteId, date: { gte: sevenDaysAgo } },
      _sum: { clicks: true, impressions: true },
    }),
    prisma.performanceMetric.aggregate({
      where: { siteId, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
      _sum: { clicks: true, impressions: true },
    }),
    prisma.performanceMetric.aggregate({
      where: { siteId, date: { gte: thirtyDaysAgo } },
      _sum: { clicks: true, impressions: true },
    }),
    prisma.performanceMetric.aggregate({
      where: { siteId, date: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } },
      _sum: { clicks: true, impressions: true },
    }),
  ]);

  const clicksCurrent = current7d._sum.clicks || 0;
  const clicksPrevious = previous7d._sum.clicks || 1;
  const impressionsCurrent = current7d._sum.impressions || 0;
  const impressionsPrevious = previous7d._sum.impressions || 1;

  return {
    scoreChange7d: 0, // Would require historical score storage
    scoreChange30d: 0,
    clicksChange7d: Math.round(((clicksCurrent - clicksPrevious) / clicksPrevious) * 100),
    impressionsChange7d: Math.round(((impressionsCurrent - impressionsPrevious) / impressionsPrevious) * 100),
  };
}

/**
 * Generate prioritized recommendations based on issues
 */
function generateRecommendations(
  pageScores: PageSEOScore[],
  issues: SEOIssue[]
): SEORecommendation[] {
  const recommendations: SEORecommendation[] = [];

  // Group issues by type
  const missingMetaTitles = pageScores.filter(p =>
    p.issues.some(i => i.title === 'Missing meta title')
  );
  const missingMetaDescs = pageScores.filter(p =>
    p.issues.some(i => i.title === 'Missing meta description')
  );
  const lowQualityContent = pageScores.filter(p =>
    p.issues.some(i => i.title === 'Low content quality')
  );
  const lowCTRPages = pageScores.filter(p =>
    p.issues.some(i => i.title === 'Low CTR in top 10')
  );
  const thinContent = pageScores.filter(p =>
    p.issues.some(i => i.title === 'Thin content')
  );
  const missingStructuredData = pageScores.filter(p =>
    p.issues.some(i => i.title === 'Missing structured data')
  );

  // Add recommendations based on issue prevalence

  if (missingMetaTitles.length > 0) {
    recommendations.push({
      priority: 95,
      category: 'technical',
      action: `Add meta titles to ${missingMetaTitles.length} page(s)`,
      expectedImpact: 'Critical for search appearance and rankings',
      affectedPages: missingMetaTitles.map(p => p.pageId),
      automatable: true,
      estimatedLift: 15,
    });
  }

  if (missingMetaDescs.length > 0) {
    recommendations.push({
      priority: 90,
      category: 'technical',
      action: `Add meta descriptions to ${missingMetaDescs.length} page(s)`,
      expectedImpact: 'Improves CTR in search results',
      affectedPages: missingMetaDescs.map(p => p.pageId),
      automatable: true,
      estimatedLift: 10,
    });
  }

  if (lowCTRPages.length > 0) {
    recommendations.push({
      priority: 88,
      category: 'performance',
      action: `Optimize titles/descriptions for ${lowCTRPages.length} high-ranking but low-CTR page(s)`,
      expectedImpact: 'Direct traffic increase from existing rankings',
      affectedPages: lowCTRPages.map(p => p.pageId),
      automatable: true,
      estimatedLift: 25,
    });
  }

  if (lowQualityContent.length > 0) {
    recommendations.push({
      priority: 85,
      category: 'content',
      action: `Improve content quality on ${lowQualityContent.length} page(s)`,
      expectedImpact: 'Better rankings and user engagement',
      affectedPages: lowQualityContent.map(p => p.pageId),
      automatable: true,
      estimatedLift: 20,
    });
  }

  if (thinContent.length > 0) {
    recommendations.push({
      priority: 80,
      category: 'content',
      action: `Expand thin content on ${thinContent.length} page(s)`,
      expectedImpact: 'Thin content is penalized by search engines',
      affectedPages: thinContent.map(p => p.pageId),
      automatable: true,
      estimatedLift: 15,
    });
  }

  if (missingStructuredData.length > 0) {
    recommendations.push({
      priority: 70,
      category: 'technical',
      action: `Add structured data to ${missingStructuredData.length} page(s)`,
      expectedImpact: 'Enables rich snippets in search results',
      affectedPages: missingStructuredData.map(p => p.pageId),
      automatable: true,
      estimatedLift: 8,
    });
  }

  // Sort by priority
  return recommendations.sort((a, b) => b.priority - a.priority);
}

/**
 * Deduplicate and aggregate issues
 */
function deduplicateIssues(issues: SEOIssue[]): SEOIssue[] {
  const grouped = new Map<string, SEOIssue & { count: number; pages: string[] }>();

  for (const issue of issues) {
    const key = issue.title;
    if (grouped.has(key)) {
      const existing = grouped.get(key)!;
      existing.count++;
      if (issue.affectedPages) {
        existing.pages.push(...issue.affectedPages);
      }
    } else {
      grouped.set(key, {
        ...issue,
        count: 1,
        pages: issue.affectedPages || [],
      });
    }
  }

  return Array.from(grouped.values())
    .map(issue => ({
      ...issue,
      description: issue.count > 1
        ? `${issue.description} (${issue.count} pages affected)`
        : issue.description,
      affectedPages: issue.pages,
    }))
    .sort((a, b) => b.impact - a.impact);
}

/**
 * Generate human-readable summary
 */
function generateSummary(
  score: number,
  pageCount: number,
  issues: SEOIssue[],
  recommendations: SEORecommendation[]
): string {
  const scoreLabel = score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'needs improvement' : 'poor';
  const criticalCount = issues.filter(i => i.type === 'critical').length;
  const warningCount = issues.filter(i => i.type === 'warning').length;
  const topRecommendation = recommendations[0];

  let summary = `Site SEO health is ${scoreLabel} (${score}/100) across ${pageCount} pages. `;

  if (criticalCount > 0) {
    summary += `Found ${criticalCount} critical issue(s) that need immediate attention. `;
  }
  if (warningCount > 0) {
    summary += `${warningCount} warning(s) identified for optimization. `;
  }

  if (topRecommendation) {
    summary += `Top priority: ${topRecommendation.action} (estimated ${topRecommendation.estimatedLift}% improvement).`;
  }

  return summary;
}

/**
 * Get pages that need optimization based on performance data
 */
export async function getPagesNeedingOptimization(siteId: string, limit = 10): Promise<{
  pageId: string;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  metrics: {
    position?: number;
    ctr?: number;
    clicks?: number;
    qualityScore?: number;
  };
}[]> {
  const results: {
    pageId: string;
    reason: string;
    urgency: 'high' | 'medium' | 'low';
    metrics: {
      position?: number;
      ctr?: number;
      clicks?: number;
      qualityScore?: number;
    };
  }[] = [];

  // Get pages with performance metrics
  const pages = await prisma.page.findMany({
    where: {
      siteId,
      status: 'PUBLISHED',
    },
    include: {
      content: true,
    },
  });

  for (const page of pages) {
    // Get recent GSC metrics for this page
    const metrics = await prisma.performanceMetric.findFirst({
      where: {
        siteId,
        pageUrl: { contains: page.slug },
        date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'desc' },
    });

    const position = metrics?.position || 100;
    const ctr = metrics?.ctr || 0;
    const clicks = metrics?.clicks || 0;
    const qualityScore = page.content?.qualityScore || 0;

    // High urgency: Ranking well but low CTR (quick win)
    if (position <= 10 && ctr < 0.02) {
      results.push({
        pageId: page.id,
        reason: 'low_ctr_top_10',
        urgency: 'high',
        metrics: { position, ctr, clicks, qualityScore },
      });
      continue;
    }

    // High urgency: Low quality content
    if (qualityScore > 0 && qualityScore < 70) {
      results.push({
        pageId: page.id,
        reason: 'low_quality',
        urgency: 'high',
        metrics: { position, ctr, clicks, qualityScore },
      });
      continue;
    }

    // Medium urgency: Position 11-20 (close to page 1)
    if (position > 10 && position <= 20) {
      results.push({
        pageId: page.id,
        reason: 'close_to_page_1',
        urgency: 'medium',
        metrics: { position, ctr, clicks, qualityScore },
      });
      continue;
    }

    // Medium urgency: Quality can improve
    if (qualityScore >= 70 && qualityScore < 85) {
      results.push({
        pageId: page.id,
        reason: 'quality_improvement',
        urgency: 'medium',
        metrics: { position, ctr, clicks, qualityScore },
      });
      continue;
    }

    // Low urgency: Stale content
    const daysSinceUpdate = page.content?.updatedAt
      ? Math.floor((Date.now() - new Date(page.content.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 365;
    if (daysSinceUpdate > 90) {
      results.push({
        pageId: page.id,
        reason: 'stale_content',
        urgency: 'low',
        metrics: { position, ctr, clicks, qualityScore },
      });
    }
  }

  // Sort by urgency and limit
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  return results
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
    .slice(0, limit);
}

/**
 * Store health report for trend tracking
 */
export async function storeHealthReport(report: SiteHealthReport): Promise<void> {
  // Store in a simple format for trend tracking
  // In production, you might want a dedicated HealthReport table
  await prisma.site.update({
    where: { id: report.siteId },
    data: {
      seoConfig: {
        ...(await prisma.site.findUnique({ where: { id: report.siteId } }))?.seoConfig as object || {},
        lastHealthAudit: {
          date: report.auditDate.toISOString(),
          score: report.overallScore,
          scores: report.scores,
          issueCount: report.issues.length,
          summary: report.summary,
        },
      },
    },
  });
}
