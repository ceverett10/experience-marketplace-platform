/**
 * Outreach Template Service
 *
 * Generates personalized outreach emails for link building campaigns.
 * Templates are stored in LinkOpportunity records for admin review
 * before sending.
 */

import { prisma } from '@experience-marketplace/database';

interface OutreachTemplate {
  subject: string;
  body: string;
  templateType: 'guest_post' | 'resource_page' | 'broken_link';
}

/**
 * Generate a guest post pitch email
 */
export function generateGuestPostPitch(params: {
  brandName: string;
  brandDescription: string;
  targetDomain: string;
  suggestedTopics: string[];
  siteUrl: string;
}): OutreachTemplate {
  const { brandName, brandDescription, targetDomain, suggestedTopics, siteUrl } = params;

  const topicsList = suggestedTopics
    .map((t, i) => `${i + 1}. ${t}`)
    .join('\n');

  return {
    subject: `Guest post idea for ${targetDomain}`,
    body: `Hi there,

I'm reaching out from ${brandName} (${siteUrl}). ${brandDescription}

I've been following your content on ${targetDomain} and think your readers would find value in a guest post from our team. We have deep expertise in travel experiences and could contribute original, well-researched content.

Here are a few topic ideas:

${topicsList}

Each article would be original, thoroughly researched, and tailored to your audience. We're happy to follow your editorial guidelines and formatting preferences.

Would any of these topics be a good fit for your site? I'm also open to other topic suggestions.

Looking forward to hearing from you.

Best regards,
The ${brandName} Team
${siteUrl}`,
    templateType: 'guest_post',
  };
}

/**
 * Generate a resource page inclusion request
 */
export function generateResourcePageRequest(params: {
  brandName: string;
  targetUrl: string;
  targetDomain: string;
  ourPageUrl: string;
  ourPageTitle: string;
  ourPageDescription: string;
}): OutreachTemplate {
  const { brandName, targetUrl, targetDomain, ourPageUrl, ourPageTitle, ourPageDescription } = params;

  return {
    subject: `Resource suggestion for your ${targetDomain} page`,
    body: `Hi there,

I came across your resource page at ${targetUrl} and wanted to suggest an addition that I think your readers would find valuable.

We recently published "${ourPageTitle}" at ${ourPageUrl}.

${ourPageDescription}

This resource is regularly updated and has been well-received by our audience. I believe it would be a useful addition to your collection.

Would you consider adding it to your resource page?

Thank you for curating such a helpful list.

Best regards,
The ${brandName} Team`,
    templateType: 'resource_page',
  };
}

/**
 * Generate a broken link replacement email
 */
export function generateBrokenLinkEmail(params: {
  brandName: string;
  targetUrl: string;
  targetDomain: string;
  brokenUrl: string;
  replacementUrl: string;
  replacementTitle: string;
}): OutreachTemplate {
  const { brandName, targetUrl, targetDomain, brokenUrl, replacementUrl, replacementTitle } = params;

  return {
    subject: `Broken link found on ${targetDomain}`,
    body: `Hi there,

I was browsing your page at ${targetUrl} and noticed that one of the links appears to be broken:

Broken link: ${brokenUrl}

I understand how frustrating broken links can be — they hurt both user experience and SEO.

We happen to have a comprehensive resource on a similar topic: "${replacementTitle}" at ${replacementUrl}

It might serve as a suitable replacement for the broken link. Either way, I thought you'd want to know about the broken link.

Best regards,
The ${brandName} Team`,
    templateType: 'broken_link',
  };
}

/**
 * Generate and store an outreach template for a specific opportunity
 */
export async function generateOutreachForOpportunity(params: {
  siteId: string;
  opportunityId: string;
  templateType: 'guest_post' | 'resource_page' | 'broken_link';
}): Promise<OutreachTemplate> {
  const { siteId, opportunityId, templateType } = params;

  // Get site and brand info
  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { brand: true },
  });

  if (!site) throw new Error(`Site ${siteId} not found`);

  // Get the opportunity
  const opportunity = await prisma.linkOpportunity.findUnique({
    where: { id: opportunityId },
  });

  if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found`);

  const brandName = site.brand?.name ?? site.name;
  const brandDescription = site.description ?? 'We help travelers discover unique experiences.';
  const siteUrl = site.primaryDomain ? `https://${site.primaryDomain}` : '';

  let template: OutreachTemplate;

  switch (templateType) {
    case 'guest_post':
      template = generateGuestPostPitch({
        brandName,
        brandDescription,
        targetDomain: opportunity.targetDomain,
        suggestedTopics: [
          `Top Experiences to Try in ${opportunity.targetDomain.split('.')[0]}`,
          'The Rise of Experience-Based Travel: Trends and Data',
          'How to Choose the Perfect Tour or Activity',
        ],
        siteUrl,
      });
      break;

    case 'resource_page': {
      // Find a relevant linkable asset or popular page to suggest
      const asset = await prisma.linkableAsset.findFirst({
        where: { siteId },
        orderBy: { backlinkCount: 'desc' },
      });

      template = generateResourcePageRequest({
        brandName,
        targetUrl: opportunity.targetUrl,
        targetDomain: opportunity.targetDomain,
        ourPageUrl: asset ? `${siteUrl}/${asset.slug}` : siteUrl,
        ourPageTitle: asset?.title ?? `${brandName} Travel Guide`,
        ourPageDescription: asset?.metaDescription ?? `A comprehensive travel resource by ${brandName}.`,
      });
      break;
    }

    case 'broken_link':
      template = generateBrokenLinkEmail({
        brandName,
        targetUrl: opportunity.targetUrl,
        targetDomain: opportunity.targetDomain,
        brokenUrl: opportunity.competitorUrl ?? 'unknown',
        replacementUrl: siteUrl,
        replacementTitle: `${brandName} Travel Guide`,
      });
      break;

    default:
      throw new Error(`Unknown template type: ${templateType}`);
  }

  // Store the template in the opportunity record
  await prisma.linkOpportunity.update({
    where: { id: opportunityId },
    data: {
      outreachTemplate: `Subject: ${template.subject}\n\n${template.body}`,
      status: 'OUTREACH_DRAFTED',
    },
  });

  console.log(`[Outreach] Generated ${templateType} template for opportunity ${opportunityId}`);
  return template;
}
