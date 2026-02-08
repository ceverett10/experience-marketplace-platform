/**
 * Content Optimizer Service
 * Analyzes and optimizes content for featured snippets and search intent
 *
 * Featured snippets appear above organic results ("position 0")
 * Common formats:
 * - Paragraph snippets: Direct answers to "what is" questions
 * - List snippets: Ordered/unordered lists for "how to" or "best of"
 * - Table snippets: Structured data comparisons
 */

import { prisma, PageType } from '@experience-marketplace/database';

/**
 * Types of featured snippet opportunities
 */
export type SnippetType = 'definition' | 'list' | 'steps' | 'table' | 'comparison';

/**
 * Featured snippet opportunity
 */
export interface SnippetOpportunity {
  pageId: string;
  pageTitle: string;
  type: SnippetType;
  targetQuery: string;
  currentFormat: string;
  suggestedFormat: string;
  recommendation: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * Find featured snippet opportunities in site content
 * Analyzes content structure and suggests formatting improvements
 */
export async function findSnippetOpportunities(siteId: string): Promise<SnippetOpportunity[]> {
  const opportunities: SnippetOpportunity[] = [];

  const pages = await prisma.page.findMany({
    where: { siteId, status: 'PUBLISHED', type: PageType.BLOG },
    include: { content: true },
  });

  for (const page of pages) {
    const content = page.content?.body || '';

    // Check for "What is" definitions that could be snippets
    const whatIsOpportunity = checkDefinitionOpportunity(page.id, page.title, content);
    if (whatIsOpportunity) {
      opportunities.push(whatIsOpportunity);
    }

    // Check for "How to" content that could be step snippets
    const howToOpportunity = checkStepsOpportunity(page.id, page.title, content);
    if (howToOpportunity) {
      opportunities.push(howToOpportunity);
    }

    // Check for list content not properly formatted
    const listOpportunity = checkListOpportunity(page.id, page.title, content);
    if (listOpportunity) {
      opportunities.push(listOpportunity);
    }

    // Check for comparison content that could be table snippets
    const comparisonOpportunity = checkComparisonOpportunity(page.id, page.title, content);
    if (comparisonOpportunity) {
      opportunities.push(comparisonOpportunity);
    }
  }

  // Sort by priority
  const priorityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  return opportunities.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

/**
 * Check for definition snippet opportunities
 * "What is X" questions should have a concise 40-60 word answer immediately after
 */
function checkDefinitionOpportunity(
  pageId: string,
  pageTitle: string,
  content: string
): SnippetOpportunity | null {
  // Look for "What is" or "What are" headings
  const whatIsPattern = /##\s*What\s+(is|are)\s+(.+?)\??\s*\n/gi;
  const match = whatIsPattern.exec(content);

  if (!match) return null;

  const question = match[0].trim();
  const questionEnd = (match.index || 0) + match[0].length;

  // Get the content after the heading (up to next heading or 500 chars)
  const afterHeading = content.substring(questionEnd);
  const nextHeadingIndex = afterHeading.search(/\n##/);
  const answerSection =
    nextHeadingIndex > 0
      ? afterHeading.substring(0, nextHeadingIndex)
      : afterHeading.substring(0, 500);

  // Get first paragraph
  const firstParagraph = answerSection.split('\n\n')[0] || '';
  const wordCount = firstParagraph.split(/\s+/).length;

  // Check if answer is too long (ideal is 40-60 words for definition snippets)
  if (wordCount > 80) {
    return {
      pageId,
      pageTitle,
      type: 'definition',
      targetQuery: question.replace(/##\s*/, '').trim(),
      currentFormat: `${wordCount} word paragraph`,
      suggestedFormat: 'Concise 40-60 word definition paragraph',
      recommendation: `Shorten the answer to "${question}" to 40-60 words. Put the most important definition in the first sentence. Google prefers concise, direct answers for definition snippets.`,
      priority: 'HIGH',
    };
  }

  // Check if first paragraph is a proper definition (should start with the topic)
  const topic = match[2]?.toLowerCase().trim() || '';
  const startsWithTopic =
    firstParagraph.toLowerCase().startsWith(topic) ||
    firstParagraph.toLowerCase().includes(`${topic} is`) ||
    firstParagraph.toLowerCase().includes(`${topic} are`);

  if (!startsWithTopic && firstParagraph.length > 50) {
    return {
      pageId,
      pageTitle,
      type: 'definition',
      targetQuery: question.replace(/##\s*/, '').trim(),
      currentFormat: 'Indirect answer',
      suggestedFormat: 'Direct definition starting with the topic',
      recommendation: `Start the answer with the topic being defined. Example: "${topic} is/are [definition]..." This helps Google identify it as a direct answer.`,
      priority: 'MEDIUM',
    };
  }

  return null;
}

/**
 * Check for step-by-step snippet opportunities
 * "How to" content should be formatted as numbered steps
 */
function checkStepsOpportunity(
  pageId: string,
  pageTitle: string,
  content: string
): SnippetOpportunity | null {
  // Look for "How to" headings
  const howToPattern = /##\s*How\s+to\s+(.+?)\??\s*\n/gi;
  const match = howToPattern.exec(content);

  if (!match) return null;

  const question = match[0].trim();
  const questionEnd = (match.index || 0) + match[0].length;

  // Get the content after the heading
  const afterHeading = content.substring(questionEnd);
  const nextHeadingIndex = afterHeading.search(/\n##/);
  const answerSection =
    nextHeadingIndex > 0
      ? afterHeading.substring(0, nextHeadingIndex)
      : afterHeading.substring(0, 1000);

  // Check if content is already formatted as steps
  const hasNumberedList = /^\d+\.\s+/m.test(answerSection);
  const hasStepHeaders = /step\s+\d+/i.test(answerSection);
  const hasBulletList = /^[-*]\s+/m.test(answerSection);

  if (!hasNumberedList && !hasStepHeaders) {
    // Check if content has sequential instructions but not formatted
    const sequenceWords = ['first', 'then', 'next', 'finally', 'after', 'before'];
    const hasSequenceWords = sequenceWords.some((word) =>
      answerSection.toLowerCase().includes(word)
    );

    if (hasSequenceWords || hasBulletList) {
      return {
        pageId,
        pageTitle,
        type: 'steps',
        targetQuery: question.replace(/##\s*/, '').trim(),
        currentFormat: hasBulletList
          ? 'Bullet point list'
          : 'Prose paragraph with sequential instructions',
        suggestedFormat: 'Numbered step-by-step list (1. First step, 2. Second step...)',
        recommendation: `Convert the "How to" section into numbered steps. Format as "1. [Action]\\n2. [Action]...". Google strongly favors numbered lists for procedural queries.`,
        priority: 'HIGH',
      };
    }
  }

  return null;
}

/**
 * Check for list snippet opportunities
 * "Best X" or "Top X" content should have clear numbered/bulleted lists
 */
function checkListOpportunity(
  pageId: string,
  pageTitle: string,
  content: string
): SnippetOpportunity | null {
  // Check if title suggests a list post
  const listTitlePattern = /^(best|top|(\d+))\s+/i;
  const isTitleListPost = listTitlePattern.test(pageTitle);

  if (!isTitleListPost) return null;

  // Look for numbered or bulleted lists in content
  const hasNumberedList = /^\d+\.\s+/m.test(content);
  const hasBulletList = /^[-*]\s+/m.test(content);
  const hasHeadingList = content.match(/^###\s+.+$/gm);

  // Check if there are inline numbers that should be a list
  const inlineNumbersPattern = /\b(1\)|1\.).*\b(2\)|2\.).*\b(3\)|3\.)/s;
  const hasInlineNumbers = inlineNumbersPattern.test(content);

  if (hasInlineNumbers && !hasNumberedList) {
    return {
      pageId,
      pageTitle,
      type: 'list',
      targetQuery: pageTitle,
      currentFormat: 'Inline numbered items in paragraph',
      suggestedFormat: 'Proper markdown numbered list',
      recommendation: `Convert inline numbered items to proper markdown list format. Each item on its own line starting with "1. ", "2. ", etc. This enables Google to display as a list snippet.`,
      priority: 'MEDIUM',
    };
  }

  // Check if using heading-based list (###) instead of proper list
  if (hasHeadingList && hasHeadingList.length >= 3 && !hasNumberedList && !hasBulletList) {
    const isItemHeadings = hasHeadingList.every((h) => h.length < 60);
    if (isItemHeadings) {
      return {
        pageId,
        pageTitle,
        type: 'list',
        targetQuery: pageTitle,
        currentFormat: `${hasHeadingList.length} H3 headings as list items`,
        suggestedFormat: 'Numbered list with brief descriptions',
        recommendation: `Consider adding a summary numbered list at the top of the article that links to each section. Google prefers scannable lists for "best of" queries.`,
        priority: 'LOW',
      };
    }
  }

  return null;
}

/**
 * Check for comparison/table snippet opportunities
 * Comparison content could be formatted as tables
 */
function checkComparisonOpportunity(
  pageId: string,
  pageTitle: string,
  content: string
): SnippetOpportunity | null {
  // Look for comparison patterns
  const comparisonIndicators = [
    /vs\.?\s/i,
    /versus/i,
    /compared to/i,
    /difference between/i,
    /comparison/i,
  ];

  const hasComparison = comparisonIndicators.some(
    (pattern) => pattern.test(pageTitle) || pattern.test(content.substring(0, 500))
  );

  if (!hasComparison) return null;

  // Check if there's already a markdown table
  const hasTable = /\|.+\|/.test(content);

  if (!hasTable) {
    // Look for content that could be tabularized
    const hasPairedInfo = content.includes(':') && (content.match(/:\s*\$?\d/g) || []).length >= 3;

    if (hasPairedInfo) {
      return {
        pageId,
        pageTitle,
        type: 'comparison',
        targetQuery: pageTitle,
        currentFormat: 'Prose comparison or key-value pairs',
        suggestedFormat: 'Markdown comparison table',
        recommendation: `Add a comparison table summarizing key differences. Format: "| Feature | Option A | Option B |". Tables are highly favored for comparison queries and can appear directly in search results.`,
        priority: 'MEDIUM',
      };
    }
  }

  return null;
}

/**
 * Get snippet optimization summary for a site
 */
export async function getSnippetOptimizationSummary(siteId: string): Promise<{
  totalOpportunities: number;
  byType: Record<SnippetType, number>;
  byPriority: Record<string, number>;
  topOpportunities: SnippetOpportunity[];
}> {
  const opportunities = await findSnippetOpportunities(siteId);

  const byType: Record<SnippetType, number> = {
    definition: 0,
    list: 0,
    steps: 0,
    table: 0,
    comparison: 0,
  };

  const byPriority: Record<string, number> = {
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
  };

  for (const opp of opportunities) {
    byType[opp.type]++;
    const currentCount = byPriority[opp.priority];
    if (currentCount !== undefined) {
      byPriority[opp.priority] = currentCount + 1;
    }
  }

  return {
    totalOpportunities: opportunities.length,
    byType,
    byPriority,
    topOpportunities: opportunities.slice(0, 10),
  };
}
