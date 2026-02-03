import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addJob } from '@experience-marketplace/jobs';

/**
 * SEO Health API for Sites
 *
 * GET /api/sites/[id]/seo-health
 * Returns SEO health scores, issues, and recommendations for a site
 *
 * POST /api/sites/[id]/seo-health
 * Triggers a new SEO health audit for the site
 */

interface PageSEOScore {
  pageId: string;
  url: string;
  title: string;
  pageType: string;
  scores: {
    technical: number;
    content: number;
    performance: number;
    overall: number;
  };
  issues: SEOIssue[];
  lastUpdated: Date;
}

interface SEOIssue {
  type: 'critical' | 'warning' | 'info';
  category: 'technical' | 'content' | 'performance' | 'coverage';
  title: string;
  description: string;
  affectedPages?: string[];
  impact: number;
  effort: number;
}

interface SEORecommendation {
  priority: number;
  category: 'technical' | 'content' | 'performance' | 'coverage';
  action: string;
  expectedImpact: string;
  affectedPages: string[];
  automatable: boolean;
  estimatedLift: number;
}

interface StoredHealthReport {
  siteId: string;
  siteName: string;
  domain: string;
  auditDate: string;
  overallScore: number;
  scores: {
    technical: number;
    content: number;
    performance: number;
    coverage: number;
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
 * GET /api/sites/[id]/seo-health
 * Retrieve the latest SEO health report for a site
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Get site with pages for SEO analysis
    const site = await prisma.site.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryDomain: true,
        status: true,
        gscVerified: true,
        gscLastSyncedAt: true,
        seoConfig: true,
        pages: {
          select: {
            id: true,
            title: true,
            slug: true,
            type: true,
            metaTitle: true,
            metaDescription: true,
            priority: true,
            updatedAt: true,
            content: {
              select: {
                id: true,
                body: true,
                qualityScore: true,
                structuredData: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check for stored health report in seoConfig
    const seoConfig = site.seoConfig as Record<string, unknown> | null;
    const storedReport = seoConfig?.['healthReport'] as StoredHealthReport | null;

    // Generate a fresh analysis of current state
    const pageScores: PageSEOScore[] = [];
    const allIssues: SEOIssue[] = [];
    let technicalTotal = 0;
    let contentTotal = 0;
    let performanceTotal = 0;

    // Pre-fetch all recent performance metrics for this site (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const siteMetrics = await prisma.performanceMetric.findMany({
      where: {
        siteId: id,
        date: { gte: sevenDaysAgo },
      },
      orderBy: { date: 'desc' },
    });

    for (const page of site.pages) {
      const pageIssues: SEOIssue[] = [];
      let technicalScore = 100;
      let contentScore = 100;
      let performanceScore = 50; // Default if no GSC data

      // === TECHNICAL SEO CHECKS ===

      // Check meta title
      if (!page.metaTitle) {
        technicalScore -= 20;
        pageIssues.push({
          type: 'critical',
          category: 'technical',
          title: 'Missing meta title',
          description: `Page "${page.title}" has no meta title`,
          impact: 9,
          effort: 2,
        });
      } else if (page.metaTitle.length < 30 || page.metaTitle.length > 60) {
        technicalScore -= 10;
        pageIssues.push({
          type: 'warning',
          category: 'technical',
          title: 'Meta title length issue',
          description: `"${page.title}": Meta title is ${page.metaTitle.length} chars (optimal: 50-60)`,
          impact: 5,
          effort: 2,
        });
      }

      // Check meta description
      if (!page.metaDescription) {
        technicalScore -= 15;
        pageIssues.push({
          type: 'critical',
          category: 'technical',
          title: 'Missing meta description',
          description: `Page "${page.title}" has no meta description`,
          impact: 8,
          effort: 2,
        });
      } else if (page.metaDescription.length < 120 || page.metaDescription.length > 160) {
        technicalScore -= 5;
        pageIssues.push({
          type: 'warning',
          category: 'technical',
          title: 'Meta description length issue',
          description: `"${page.title}": Meta description is ${page.metaDescription.length} chars (optimal: 150-160)`,
          impact: 4,
          effort: 2,
        });
      }

      // Check structured data
      const hasStructuredData =
        page.content?.structuredData &&
        Object.keys(page.content.structuredData as object).length > 0;
      if (!hasStructuredData) {
        technicalScore -= 10;
        pageIssues.push({
          type: 'warning',
          category: 'technical',
          title: 'Missing structured data',
          description: `Page "${page.title}" has no Schema.org structured data`,
          impact: 6,
          effort: 4,
        });
      }

      // === CONTENT QUALITY CHECKS ===
      const contentBody = page.content?.body || '';
      const wordCount = contentBody.split(/\s+/).filter(Boolean).length;

      const minWords = page.type === 'BLOG' ? 800 : 300;
      if (wordCount < minWords) {
        contentScore -= 20;
        pageIssues.push({
          type: 'warning',
          category: 'content',
          title: 'Thin content',
          description: `"${page.title}": Only ${wordCount} words (recommended: ${minWords}+)`,
          impact: 7,
          effort: 6,
        });
      }

      // Check quality score
      const qualityScore = page.content?.qualityScore || 0;
      if (qualityScore < 0.6) {
        contentScore -= 15;
        pageIssues.push({
          type: 'warning',
          category: 'content',
          title: 'Low content quality score',
          description: `"${page.title}": Quality score is ${(qualityScore * 100).toFixed(0)}%`,
          impact: 6,
          effort: 5,
        });
      }

      // Check content freshness
      const daysSinceUpdate = page.content
        ? Math.floor(
            (Date.now() - new Date(page.content.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 999;
      if (daysSinceUpdate > 90) {
        contentScore -= 10;
        pageIssues.push({
          type: 'info',
          category: 'content',
          title: 'Stale content',
          description: `"${page.title}": Content hasn't been updated in ${daysSinceUpdate} days`,
          impact: 4,
          effort: 5,
        });
      }

      // === PERFORMANCE CHECKS (GSC DATA) ===
      const pageMetric = siteMetrics.find(
        (m) => m.pageUrl && page.slug && m.pageUrl.includes(page.slug)
      );

      if (pageMetric) {
        const ctr = pageMetric.ctr || 0;
        const position = pageMetric.position || 100;

        if (position <= 10 && ctr < 0.02) {
          performanceScore = 30;
          pageIssues.push({
            type: 'critical',
            category: 'performance',
            title: 'Low CTR in top 10',
            description: `"${page.title}": Ranks #${Math.round(position)} but has only ${(ctr * 100).toFixed(1)}% CTR`,
            impact: 9,
            effort: 4,
          });
        } else if (position <= 20 && ctr < 0.01) {
          performanceScore = 50;
          pageIssues.push({
            type: 'warning',
            category: 'performance',
            title: 'Below average CTR',
            description: `"${page.title}": CTR of ${(ctr * 100).toFixed(1)}% is below average for position ${Math.round(position)}`,
            impact: 6,
            effort: 4,
          });
        } else if (ctr >= 0.05) {
          performanceScore = 90;
        } else {
          performanceScore = Math.round(60 + ctr * 600);
        }

        if (position > 50) {
          performanceScore = Math.min(performanceScore, 40);
          pageIssues.push({
            type: 'warning',
            category: 'performance',
            title: 'Poor ranking position',
            description: `"${page.title}": Average position is ${Math.round(position)} - needs improvement`,
            impact: 8,
            effort: 7,
          });
        }
      } else if (site.gscVerified) {
        pageIssues.push({
          type: 'info',
          category: 'performance',
          title: 'No performance data yet',
          description: `"${page.title}": GSC is connected but no data available yet — data typically appears 2-3 days after verification`,
          impact: 2,
          effort: 1,
        });
      }

      // Calculate overall score
      const overallScore = Math.round(
        technicalScore * 0.3 + contentScore * 0.4 + performanceScore * 0.3
      );

      technicalTotal += technicalScore;
      contentTotal += contentScore;
      performanceTotal += performanceScore;

      pageScores.push({
        pageId: page.id,
        url: `/${page.slug}`,
        title: page.title,
        pageType: page.type,
        scores: {
          technical: technicalScore,
          content: contentScore,
          performance: performanceScore,
          overall: overallScore,
        },
        issues: pageIssues,
        lastUpdated: page.updatedAt,
      });

      allIssues.push(...pageIssues);
    }

    const pageCount = site.pages.length || 1;
    const avgTechnical = Math.round(technicalTotal / pageCount);
    const avgContent = Math.round(contentTotal / pageCount);
    const avgPerformance = Math.round(performanceTotal / pageCount);
    const coverage = (pageScores.filter((p) => p.scores.overall >= 70).length / pageCount) * 100;
    const overallScore = Math.round(avgTechnical * 0.3 + avgContent * 0.4 + avgPerformance * 0.3);

    // Group issues by type
    const criticalIssues = allIssues.filter((i) => i.type === 'critical');
    const warningIssues = allIssues.filter((i) => i.type === 'warning');
    const infoIssues = allIssues.filter((i) => i.type === 'info');

    // Generate recommendations
    const recommendations: SEORecommendation[] = [];

    // Missing meta titles
    const missingMetaTitles = pageScores.filter((p) =>
      p.issues.some((i) => i.title === 'Missing meta title')
    );
    if (missingMetaTitles.length > 0) {
      recommendations.push({
        priority: 95,
        category: 'technical',
        action: `Add meta titles to ${missingMetaTitles.length} page(s)`,
        expectedImpact: 'Significant improvement in click-through rates from search results',
        affectedPages: missingMetaTitles.map((p) => p.url),
        automatable: true,
        estimatedLift: 15,
      });
    }

    // Missing meta descriptions
    const missingMetaDesc = pageScores.filter((p) =>
      p.issues.some((i) => i.title === 'Missing meta description')
    );
    if (missingMetaDesc.length > 0) {
      recommendations.push({
        priority: 90,
        category: 'technical',
        action: `Add meta descriptions to ${missingMetaDesc.length} page(s)`,
        expectedImpact: 'Improved click-through rates and search snippet quality',
        affectedPages: missingMetaDesc.map((p) => p.url),
        automatable: true,
        estimatedLift: 10,
      });
    }

    // Missing structured data
    const missingStructuredData = pageScores.filter((p) =>
      p.issues.some((i) => i.title === 'Missing structured data')
    );
    if (missingStructuredData.length > 0) {
      recommendations.push({
        priority: 75,
        category: 'technical',
        action: `Add Schema.org structured data to ${missingStructuredData.length} page(s)`,
        expectedImpact: 'Enable rich snippets in search results',
        affectedPages: missingStructuredData.map((p) => p.url),
        automatable: true,
        estimatedLift: 8,
      });
    }

    // Thin content
    const thinContent = pageScores.filter((p) => p.issues.some((i) => i.title === 'Thin content'));
    if (thinContent.length > 0) {
      recommendations.push({
        priority: 80,
        category: 'content',
        action: `Expand content on ${thinContent.length} page(s)`,
        expectedImpact: 'Better rankings for target keywords',
        affectedPages: thinContent.map((p) => p.url),
        automatable: true,
        estimatedLift: 12,
      });
    }

    // Stale content
    const staleContent = pageScores.filter((p) =>
      p.issues.some((i) => i.title === 'Stale content')
    );
    if (staleContent.length > 0) {
      recommendations.push({
        priority: 60,
        category: 'content',
        action: `Update stale content on ${staleContent.length} page(s)`,
        expectedImpact: 'Improved freshness signals for search engines',
        affectedPages: staleContent.map((p) => p.url),
        automatable: true,
        estimatedLift: 5,
      });
    }

    // Sort recommendations by priority
    recommendations.sort((a, b) => b.priority - a.priority);

    // Calculate real trends from PerformanceMetric data
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const [current7d, previous7d] = await Promise.all([
      prisma.performanceMetric.aggregate({
        where: { siteId: id, date: { gte: sevenDaysAgo } },
        _sum: { clicks: true, impressions: true },
      }),
      prisma.performanceMetric.aggregate({
        where: { siteId: id, date: { gte: fourteenDaysAgo, lt: sevenDaysAgo } },
        _sum: { clicks: true, impressions: true },
      }),
    ]);

    const clicksCurrent = current7d._sum.clicks || 0;
    const clicksPrevious = previous7d._sum.clicks || 0;
    const impressionsCurrent = current7d._sum.impressions || 0;
    const impressionsPrevious = previous7d._sum.impressions || 0;

    const trends =
      storedReport?.trends && clicksCurrent === 0 && impressionsCurrent === 0
        ? storedReport.trends
        : {
            scoreChange7d: 0,
            scoreChange30d: 0,
            clicksChange7d:
              clicksPrevious > 0
                ? Math.round(((clicksCurrent - clicksPrevious) / clicksPrevious) * 100)
                : 0,
            impressionsChange7d:
              impressionsPrevious > 0
                ? Math.round(
                    ((impressionsCurrent - impressionsPrevious) / impressionsPrevious) * 100
                  )
                : 0,
          };

    // Get last audit info from jobs
    const lastAuditJob = await prisma.job.findFirst({
      where: {
        siteId: id,
        type: 'SEO_ANALYZE',
        status: 'COMPLETED',
      },
      orderBy: { completedAt: 'desc' },
      select: {
        id: true,
        completedAt: true,
        result: true,
      },
    });

    // Get pending/running SEO jobs
    const pendingSeoJobs = await prisma.job.findMany({
      where: {
        siteId: id,
        type: { in: ['SEO_ANALYZE', 'SEO_OPPORTUNITY_SCAN', 'SEO_OPPORTUNITY_OPTIMIZE'] },
        status: { in: ['PENDING', 'RUNNING', 'SCHEDULED'] },
      },
      select: {
        id: true,
        type: true,
        status: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      siteId: site.id,
      siteName: site.name,
      domain: site.primaryDomain || `${site.slug}.example.com`,
      auditDate: new Date().toISOString(),
      gscVerified: site.gscVerified,
      gscLastSyncedAt: site.gscLastSyncedAt,
      hasPerformanceData: siteMetrics.length > 0,
      overallScore,
      scores: {
        technical: avgTechnical,
        content: avgContent,
        performance: avgPerformance,
        coverage: Math.round(coverage),
      },
      pageCount: site.pages.length,
      pageScores: pageScores.slice(0, 10), // Limit to top 10 pages for API response
      issuesSummary: {
        critical: criticalIssues.length,
        warning: warningIssues.length,
        info: infoIssues.length,
        total: allIssues.length,
      },
      topIssues: allIssues.slice(0, 10), // Top 10 issues
      recommendations: recommendations.slice(0, 5), // Top 5 recommendations
      trends,
      lastAudit: lastAuditJob
        ? {
            jobId: lastAuditJob.id,
            completedAt: lastAuditJob.completedAt,
          }
        : null,
      pendingJobs: pendingSeoJobs,
      storedReport: storedReport
        ? {
            auditDate: storedReport.auditDate,
            overallScore: storedReport.overallScore,
          }
        : null,
    });
  } catch (error) {
    console.error('[API] Error fetching SEO health:', error);
    return NextResponse.json({ error: 'Failed to fetch SEO health data' }, { status: 500 });
  }
}

/**
 * POST /api/sites/[id]/seo-health
 * Trigger a new SEO health audit for the site
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Verify site exists
    const site = await prisma.site.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!site) {
      return NextResponse.json({ error: 'Site not found' }, { status: 404 });
    }

    // Check if there's already a pending SEO audit
    const existingJob = await prisma.job.findFirst({
      where: {
        siteId: id,
        type: 'SEO_ANALYZE',
        status: { in: ['PENDING', 'RUNNING', 'SCHEDULED'] },
      },
    });

    if (existingJob) {
      // If the job has been stuck in PENDING for over 5 minutes, it's likely stale
      // (e.g. created before the BullMQ enqueue fix). Mark it as failed and allow a new one.
      const ageMinutes = (Date.now() - new Date(existingJob.createdAt).getTime()) / (1000 * 60);
      if (existingJob.status === 'PENDING' && ageMinutes > 5) {
        await prisma.job.update({
          where: { id: existingJob.id },
          data: {
            status: 'FAILED',
            error: 'Stale job - never picked up by worker',
            completedAt: new Date(),
          },
        });
        // Fall through to create a new job
      } else {
        return NextResponse.json({
          message: 'SEO audit already in progress',
          jobId: existingJob.id,
          status: existingJob.status,
        });
      }
    }

    // Create and enqueue the SEO audit job via BullMQ
    let jobId: string;
    try {
      jobId = await addJob('SEO_ANALYZE', {
        siteId: id,
        triggerOptimizations: true,
        fullSiteAudit: true,
      });
    } catch (addJobError) {
      const msg = addJobError instanceof Error ? addJobError.message : String(addJobError);
      console.error('[API] addJob failed:', msg, addJobError);
      return NextResponse.json(
        { error: `Failed to enqueue SEO audit job: ${msg}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'SEO audit job queued successfully',
      jobId,
      siteId: site.id,
      siteName: site.name,
    });
  } catch (error) {
    console.error('[API] Error triggering SEO audit:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to trigger SEO audit: ${errorMessage}` },
      { status: 500 }
    );
  }
}
