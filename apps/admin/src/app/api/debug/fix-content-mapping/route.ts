import { NextResponse } from 'next/server';
import { prisma } from '@experience-marketplace/database';

/**
 * Auto-fix endpoint to resolve domain → site → page → content mapping issues
 * Usage: POST /admin/api/debug/fix-content-mapping
 * Body: { "domain": "london-food-tours.com", "dryRun": false }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { domain: domainParam, dryRun = true } = body;

    if (!domainParam) {
      return NextResponse.json(
        { error: 'Domain parameter required. Send: { "domain": "london-food-tours.com" }' },
        { status: 400 }
      );
    }

    const fixes: string[] = [];
    const errors: string[] = [];

    // Clean domain (remove www prefix and port)
    const cleanDomain = domainParam.replace(/^www\./, '').split(':')[0];
    fixes.push(`🔍 Checking domain: ${cleanDomain}`);

    // Step 1: Find or identify the site
    let site = null;
    let domainRecord = await prisma.domain.findUnique({
      where: { domain: cleanDomain },
      include: { site: true },
    });

    if (domainRecord?.site) {
      site = domainRecord.site;
      fixes.push(`✓ Domain record found, mapped to site: ${site.name} (${site.id})`);
    } else {
      // Try finding site by slug (extract from domain)
      const potentialSlug = cleanDomain.split('.')[0];
      site = await prisma.site.findUnique({
        where: { slug: potentialSlug },
      });

      if (site) {
        fixes.push(`✓ Found site by slug: ${site.name} (${site.id})`);

        // Create domain record if missing
        if (!dryRun) {
          domainRecord = await prisma.domain.create({
            data: {
              domain: cleanDomain,
              status: 'ACTIVE',
              siteId: site.id,
            },
            include: { site: true },
          });
          fixes.push(`✅ FIXED: Created Domain record linking ${cleanDomain} → ${site.name}`);
        } else {
          fixes.push(
            `⚠️  DRY RUN: Would create Domain record linking ${cleanDomain} → ${site.name}`
          );
        }
      } else {
        // Try finding by name (fuzzy match)
        const allSites = await prisma.site.findMany();
        const nameParts = cleanDomain.split('.')[0].split('-');
        site = allSites.find((s) => {
          const siteName = s.name.toLowerCase();
          return nameParts.every((part: string) => siteName.includes(part));
        });

        if (site) {
          fixes.push(`✓ Found site by fuzzy name match: ${site.name} (${site.id})`);
          if (!dryRun) {
            domainRecord = await prisma.domain.create({
              data: {
                domain: cleanDomain,
                status: 'ACTIVE',
                siteId: site.id,
              },
              include: { site: true },
            });
            fixes.push(`✅ FIXED: Created Domain record linking ${cleanDomain} → ${site.name}`);
          } else {
            fixes.push(
              `⚠️  DRY RUN: Would create Domain record linking ${cleanDomain} → ${site.name}`
            );
          }
        } else {
          errors.push(`❌ ERROR: Could not find site for domain ${cleanDomain}`);
          return NextResponse.json({ fixes, errors, success: false });
        }
      }
    }

    // Step 2: Check if privacy page exists
    fixes.push(`\n🔍 Checking for privacy page...`);
    let privacyPage = await prisma.page.findFirst({
      where: {
        siteId: site.id,
        slug: 'privacy',
        type: 'LEGAL',
      },
      include: {
        content: true,
      },
    });

    if (!privacyPage) {
      // Create privacy page
      if (!dryRun) {
        privacyPage = await prisma.page.create({
          data: {
            siteId: site.id,
            slug: 'privacy',
            type: 'LEGAL',
            title: 'Privacy Policy',
            status: 'PUBLISHED',
          },
          include: { content: true },
        });
        fixes.push(`✅ FIXED: Created privacy Page record for ${site.name}`);
      } else {
        fixes.push(`⚠️  DRY RUN: Would create privacy Page record for ${site.name}`);
        // For dry run, simulate what would be created
        privacyPage = {
          id: 'DRY_RUN_PAGE_ID',
          siteId: site.id,
          slug: 'privacy',
          type: 'LEGAL',
          title: 'Privacy Policy',
          contentId: null,
          content: null,
        } as any;
      }
    } else {
      fixes.push(`✓ Privacy page exists: ${privacyPage.title} (${privacyPage.id})`);
    }

    // Step 3: Check if page has content
    fixes.push(`\n🔍 Checking for privacy content...`);
    if (privacyPage && privacyPage.contentId && privacyPage.content) {
      fixes.push(`✓ Page has content linked (contentId: ${privacyPage.contentId})`);
      fixes.push(`✓ Content preview: ${privacyPage.content.body.substring(0, 100)}...`);
    } else if (privacyPage) {
      // Look for orphaned privacy content for this site
      fixes.push(`⚠️  Page has no content linked (contentId is null)`);

      const orphanedContent = await prisma.content.findMany({
        where: {
          siteId: site.id,
          page: null, // Not linked to any page
          OR: [
            { body: { contains: 'privacy', mode: 'insensitive' } },
            { body: { contains: 'personal information', mode: 'insensitive' } },
            { body: { contains: 'data protection', mode: 'insensitive' } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (orphanedContent.length > 0) {
        fixes.push(
          `✓ Found ${orphanedContent.length} orphaned content records that might be privacy policies`
        );

        // Use the most recent one
        const contentToLink = orphanedContent[0]!;
        fixes.push(
          `✓ Selected most recent: ${contentToLink.id} (created ${contentToLink.createdAt})`
        );

        if (!dryRun && privacyPage.id !== 'DRY_RUN_PAGE_ID') {
          await prisma.page.update({
            where: { id: privacyPage.id },
            data: { contentId: contentToLink.id },
          });
          fixes.push(`✅ FIXED: Linked Content ${contentToLink.id} to Page ${privacyPage.id}`);
        } else {
          fixes.push(
            `⚠️  DRY RUN: Would link Content ${contentToLink.id} to Page ${privacyPage.id || 'NEW_PAGE'}`
          );
        }
      } else {
        // No orphaned content found, need to generate it
        fixes.push(`⚠️  No orphaned privacy content found for this site`);
        fixes.push(
          `💡 RECOMMENDATION: Queue a CONTENT_GENERATE job for this page, or create content manually in admin`
        );

        if (!dryRun && privacyPage.id !== 'DRY_RUN_PAGE_ID') {
          // Create a basic privacy policy content
          const defaultPrivacyContent = await prisma.content.create({
            data: {
              siteId: site.id,
              body: generateDefaultPrivacyPolicy(site.name),
              bodyFormat: 'MARKDOWN',
              isAiGenerated: false,
              qualityScore: 70,
            },
          });

          await prisma.page.update({
            where: { id: privacyPage.id },
            data: { contentId: defaultPrivacyContent.id },
          });

          fixes.push(`✅ FIXED: Created default privacy policy content and linked to page`);
          fixes.push(
            `💡 NOTE: This is a basic template. Consider generating custom content via AI.`
          );
        } else {
          fixes.push(`⚠️  DRY RUN: Would create default privacy policy content and link to page`);
        }
      }
    }

    // Step 4: Verify the fix
    fixes.push(`\n🔍 Verifying fix...`);
    if (!dryRun) {
      const verification = await prisma.page.findFirst({
        where: {
          siteId: site.id,
          slug: 'privacy',
          type: 'LEGAL',
        },
        include: {
          content: true,
        },
      });

      if (verification?.contentId && verification.content) {
        fixes.push(`✅ VERIFICATION PASSED: Privacy page is now properly configured`);
        fixes.push(`✓ Page ID: ${verification.id}`);
        fixes.push(`✓ Content ID: ${verification.contentId}`);
        fixes.push(`✓ Content length: ${verification.content.body.length} characters`);
      } else {
        errors.push(`❌ VERIFICATION FAILED: Privacy page still not properly configured`);
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      dryRun,
      domain: cleanDomain,
      site: site
        ? {
            id: site.id,
            name: site.name,
            slug: site.slug,
          }
        : null,
      fixes,
      errors,
      nextSteps: dryRun
        ? ['Run again with { "dryRun": false } to apply fixes']
        : [
            'Visit the website privacy page to verify',
            `URL: https://${cleanDomain}/privacy`,
            'If content needs improvement, generate new content via admin dashboard',
          ],
    });
  } catch (error) {
    console.error('[Fix Content Mapping] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fix content mapping',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * Generate a basic default privacy policy
 */
function generateDefaultPrivacyPolicy(siteName: string): string {
  return `# Privacy Policy

**Last Updated:** ${new Date().toLocaleDateString()}

Welcome to ${siteName}. This Privacy Policy explains how we collect, use, and protect your personal information when you use our website and services.

## Information We Collect

We collect information you provide directly to us, including:
- Name and contact information when you make a booking
- Payment information processed securely through our payment partners
- Communication preferences and feedback

We also automatically collect:
- Device and browser information
- Usage data and analytics
- Cookies and similar technologies

## How We Use Your Information

We use the information we collect to:
- Process and fulfill your experience bookings
- Communicate with you about your reservations
- Improve our services and user experience
- Send marketing communications (with your consent)
- Comply with legal obligations

## Information Sharing

We share your information with:
- **Experience Providers:** To fulfill your bookings
- **Payment Processors:** To process transactions securely
- **Service Providers:** Who help us operate our platform
- **Legal Requirements:** When required by law

We never sell your personal information to third parties.

## Data Security

We implement industry-standard security measures to protect your information, including:
- Encryption of sensitive data
- Secure payment processing
- Regular security audits
- Access controls and authentication

## Your Rights

You have the right to:
- Access your personal information
- Correct inaccurate data
- Request deletion of your data
- Opt-out of marketing communications
- Data portability

## Cookies

We use cookies to enhance your experience. You can control cookie preferences through your browser settings.

## Children's Privacy

Our services are not intended for children under 13. We do not knowingly collect information from children.

## International Transfers

Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place.

## Changes to This Policy

We may update this Privacy Policy periodically. We will notify you of significant changes via email or website notice.

## Contact Us

If you have questions about this Privacy Policy or your personal information, please contact us:

**Email:** privacy@${siteName.toLowerCase().replace(/\s+/g, '')}.com

---

*This is a default privacy policy template. Please review and customize based on your specific practices and legal requirements.*
`;
}
