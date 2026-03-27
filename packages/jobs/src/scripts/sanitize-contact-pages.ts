#!/usr/bin/env npx tsx
/**
 * Sanitize all existing Contact page content to remove fabricated contact details.
 *
 * AI-generated contact pages often contain realistic-looking but completely fake
 * email addresses, phone numbers, physical addresses, and operating hours that
 * slipped past the placeholder sanitizer (which only catches bracket-style tokens
 * like [Your email address]).
 *
 * This script:
 * 1. Finds all CONTACT pages (sites + microsites) with content
 * 2. Runs sanitizeContactContent() to strip fabricated details
 * 3. Also runs sanitizePlaceholders() to catch any remaining bracket tokens
 * 4. Updates the content in the database
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/sanitize-contact-pages.ts [options]
 *
 * Options:
 *   --dry-run       Show what would be changed without applying updates
 *   --site-id=X     Only process a single site
 *   --verbose       Print the before/after diff for each page
 */

import { prisma, PageType } from '@experience-marketplace/database';

// ── Sanitization functions (mirrored from workers/content.ts) ──

function sanitizePlaceholders(content: string): { sanitized: string; removedCount: number } {
  let removedCount = 0;
  let sanitized = content;

  sanitized = sanitized.replace(
    /^[^\n]*\[Your (?:actual )?(?:phone|email|address|website|URL|operating hours|service coverage|name|company)[^\]]*\][^\n]*$/gim,
    () => {
      removedCount++;
      return '';
    }
  );

  sanitized = sanitized.replace(
    /\[INSERT[^\]]*\]|\[PLACEHOLDER[^\]]*\]|\{\{[^}]+\}\}|YOUR_[A-Z_]{3,}/gi,
    () => {
      removedCount++;
      return '';
    }
  );

  sanitized = sanitized.replace(/\[Your ([A-Z][^\]]{2,40})\]/g, (_match, inner) => {
    removedCount++;
    return inner;
  });

  sanitized = sanitized.replace(/\n{3,}/g, '\n\n').trim();
  return { sanitized, removedCount };
}

function sanitizeContactContent(content: string): {
  sanitized: string;
  detailsRemoved: number;
} {
  let detailsRemoved = 0;
  let sanitized = content;

  // 1. Remove lines with email addresses
  sanitized = sanitized.replace(
    /^[^\n]*\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b[^\n]*$/gm,
    () => {
      detailsRemoved++;
      return '';
    }
  );

  // 2. Remove lines with phone numbers
  sanitized = sanitized.replace(
    /^[^\n]*(?:\+\d[\d\s()./-]{7,20}|\(\d{2,5}\)\s*[\d\s/-]{6,15}|\b0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b)[^\n]*$/gm,
    () => {
      detailsRemoved++;
      return '';
    }
  );

  // 3. Remove lines with physical/street addresses
  sanitized = sanitized.replace(
    /^[^\n]*\b\d{1,5}\s+(?:rue|avenue|boulevard|street|road|lane|drive|place|square|quai|corso|via|calle|plaza|platz|strasse|straße)\b[^\n]*$/gim,
    () => {
      detailsRemoved++;
      return '';
    }
  );

  // 4. Remove lines with postal/zip codes + street-type words
  sanitized = sanitized.replace(
    /^[^\n]*\b(?:[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}|\d{5}(?:-\d{4})?)\b[^\n]*\b(?:street|road|lane|avenue|rue|boulevard|floor|suite|unit)\b[^\n]*$/gim,
    () => {
      detailsRemoved++;
      return '';
    }
  );

  // 5. Remove fabricated operating hours lines
  sanitized = sanitized.replace(
    /^[^\n]*\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\s*[-–to]+\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b[^\n]*\b\d{1,2}[:.]\d{2}\b[^\n]*$/gim,
    () => {
      detailsRemoved++;
      return '';
    }
  );

  // 6. Remove lines with "Email:", "Phone:", "Tel:", "Address:", etc. prefixed details
  sanitized = sanitized.replace(
    /^[^\n]*\*{0,2}(?:email|e-mail|phone|telephone|tel|fax|address|mailing address|office|location|hours|opening hours|business hours|operating hours)\s*:?\*{0,2}\s*[:–-].+$/gim,
    () => {
      detailsRemoved++;
      return '';
    }
  );

  // 7. Remove "mailto:" links in markdown
  sanitized = sanitized.replace(/\[([^\]]*)\]\(mailto:[^)]+\)/g, (_match, text) => {
    detailsRemoved++;
    return text as string;
  });

  // 8. Remove "tel:" links in markdown
  sanitized = sanitized.replace(/\[([^\]]*)\]\(tel:[^)]+\)/g, (_match, text) => {
    detailsRemoved++;
    return text as string;
  });

  // 9. Clean up empty sections
  sanitized = sanitized.replace(/^(#{1,6}\s+[^\n]+)\n+(?=#{1,6}\s|\s*$)/gm, '');

  // 10. Clean up excessive blank lines
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n').trim();

  return { sanitized, detailsRemoved };
}

// ── Script logic ──

interface ScriptOptions {
  dryRun: boolean;
  siteId?: string;
  verbose: boolean;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const siteArg = args.find((a) => a.startsWith('--site-id='));
  return {
    dryRun: args.includes('--dry-run'),
    siteId: siteArg ? siteArg.split('=')[1] : undefined,
    verbose: args.includes('--verbose'),
  };
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.info('='.repeat(60));
  console.info('Sanitize Contact Page Fabricated Details');
  console.info(`Mode: ${options.dryRun ? 'DRY RUN (no changes will be saved)' : 'LIVE'}`);
  if (options.siteId) console.info(`Scoped to site: ${options.siteId}`);
  console.info('='.repeat(60));

  // Single bulk query for ALL contact pages with content (sites + microsites)
  const whereClause: Record<string, unknown> = { type: PageType.CONTACT };
  if (options.siteId) {
    whereClause['siteId'] = options.siteId;
  }

  const allContactPages = await prisma.page.findMany({
    where: whereClause,
    select: {
      id: true,
      slug: true,
      title: true,
      siteId: true,
      micrositeId: true,
      site: { select: { name: true, primaryDomain: true } },
      microsite: { select: { siteName: true, fullDomain: true } },
      content: { select: { id: true, body: true } },
    },
  });

  console.info(`\nFound ${allContactPages.length} contact page(s) total.`);

  let totalPages = 0;
  let totalDetails = 0;
  let totalPlaceholders = 0;

  for (const page of allContactPages) {
    if (!page.content?.body) continue;

    const original = page.content.body;

    const { sanitized: phClean, removedCount: phCount } = sanitizePlaceholders(original);
    const { sanitized: final, detailsRemoved: contactCount } = sanitizeContactContent(phClean);

    const totalChanges = phCount + contactCount;
    if (totalChanges === 0) continue;

    totalPages++;
    totalDetails += contactCount;
    totalPlaceholders += phCount;

    const entityLabel = page.site
      ? `Site "${page.site.name}" (${page.site.primaryDomain || page.siteId})`
      : page.microsite
        ? `Microsite "${page.microsite.siteName}" (${page.microsite.fullDomain || page.micrositeId})`
        : `Unknown (${page.siteId || page.micrositeId})`;

    console.info(`  ${entityLabel}: ${contactCount} fabricated details, ${phCount} placeholders`);

    if (options.verbose) {
      console.info('  --- BEFORE ---');
      console.info(original.substring(0, 500));
      console.info('  --- AFTER ---');
      console.info(final.substring(0, 500));
      console.info('  ---');
    }

    if (!options.dryRun) {
      await prisma.content.update({
        where: { id: page.content.id },
        data: { body: final },
      });
    }
  }

  // --- Summary ---
  console.info('\n' + '='.repeat(60));
  console.info('SUMMARY');
  console.info(`  Total contact pages:    ${allContactPages.length}`);
  console.info(`  Pages with fake data:   ${totalPages}`);
  console.info(`  Fabricated details:     ${totalDetails}`);
  console.info(`  Placeholders removed:   ${totalPlaceholders}`);
  if (options.dryRun) {
    console.info('\n  DRY RUN — no changes were saved. Re-run without --dry-run to apply.');
  } else {
    console.info('\n  All changes saved to database.');
  }
  console.info('='.repeat(60));
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
