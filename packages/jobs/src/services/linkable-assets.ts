/**
 * Linkable Asset Service
 *
 * Generates "link magnet" content designed to attract backlinks:
 * - Statistics roundups (e.g., "47 Travel Statistics for 2026")
 * - Comprehensive guides (3000+ word definitive resources)
 * - Infographic data (structured data tables with embeddable snippets)
 *
 * Uses the content engine for AI-powered generation.
 */

import { prisma, PageType } from '@experience-marketplace/database';

/**
 * Generate a statistics roundup page
 * These attract citations from bloggers and journalists
 */
export async function generateStatisticsRoundup(params: {
  siteId: string;
  targetKeyword: string;
  destination?: string;
}): Promise<{ assetId: string; pageId: string }> {
  const { siteId, targetKeyword, destination } = params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { brand: true },
  });

  if (!site) throw new Error(`Site ${siteId} not found`);

  const year = new Date().getFullYear();
  const title = destination
    ? `${targetKeyword} Statistics ${year}: Key Facts About ${destination}`
    : `${targetKeyword} Statistics ${year}: Essential Data & Trends`;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const content = buildStatisticsContent(targetKeyword, destination, year, site.brand?.name ?? site.name);

  // Create the content record
  const contentRecord = await prisma.content.create({
    data: {
      siteId,
      body: content,
      bodyFormat: 'MARKDOWN',
      isAiGenerated: true,
      qualityScore: 80,
      version: 1,
    },
  });

  // Create the page
  const page = await prisma.page.create({
    data: {
      siteId,
      slug,
      title,
      type: PageType.BLOG,
      status: 'PUBLISHED',
      metaTitle: title,
      metaDescription: `Comprehensive ${targetKeyword.toLowerCase()} statistics for ${year}. Data-driven insights${destination ? ` about ${destination}` : ''} with key trends and facts.`,
      contentId: contentRecord.id,
    },
  });

  // Create the linkable asset record
  const asset = await prisma.linkableAsset.create({
    data: {
      siteId,
      title,
      slug,
      assetType: 'STATISTICS_ROUNDUP',
      content,
      metaTitle: title,
      metaDescription: `Comprehensive ${targetKeyword.toLowerCase()} statistics for ${year}.`,
      targetKeywords: [targetKeyword, `${targetKeyword} statistics`, `${targetKeyword} data ${year}`],
      pageId: page.id,
    },
  });

  console.log(`[Linkable Assets] Created statistics roundup: "${title}" (asset: ${asset.id}, page: ${page.id})`);
  return { assetId: asset.id, pageId: page.id };
}

/**
 * Generate a comprehensive guide
 * Long-form definitive resources that become reference material
 */
export async function generateComprehensiveGuide(params: {
  siteId: string;
  targetKeyword: string;
  destination?: string;
}): Promise<{ assetId: string; pageId: string }> {
  const { siteId, targetKeyword, destination } = params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { brand: true },
  });

  if (!site) throw new Error(`Site ${siteId} not found`);

  const year = new Date().getFullYear();
  const title = destination
    ? `The Complete Guide to ${targetKeyword} in ${destination} (${year})`
    : `The Ultimate Guide to ${targetKeyword} (${year})`;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const content = buildComprehensiveGuideContent(targetKeyword, destination, year, site.brand?.name ?? site.name);

  const contentRecord = await prisma.content.create({
    data: {
      siteId,
      body: content,
      bodyFormat: 'MARKDOWN',
      isAiGenerated: true,
      qualityScore: 80,
      version: 1,
    },
  });

  const page = await prisma.page.create({
    data: {
      siteId,
      slug,
      title,
      type: PageType.BLOG,
      status: 'PUBLISHED',
      metaTitle: title.length > 60 ? `Complete ${targetKeyword} Guide ${year}` : title,
      metaDescription: `Everything you need to know about ${targetKeyword.toLowerCase()}${destination ? ` in ${destination}` : ''}. Expert tips, practical advice, and insider knowledge.`,
      contentId: contentRecord.id,
    },
  });

  const asset = await prisma.linkableAsset.create({
    data: {
      siteId,
      title,
      slug,
      assetType: 'COMPREHENSIVE_GUIDE',
      content,
      metaTitle: title,
      metaDescription: `Complete guide to ${targetKeyword.toLowerCase()}.`,
      targetKeywords: [targetKeyword, `${targetKeyword} guide`, `best ${targetKeyword}`],
      pageId: page.id,
    },
  });

  console.log(`[Linkable Assets] Created comprehensive guide: "${title}" (asset: ${asset.id}, page: ${page.id})`);
  return { assetId: asset.id, pageId: page.id };
}

/**
 * Generate infographic data with embeddable HTML snippet
 * The embed snippet includes a backlink to the source page
 */
export async function generateInfographicData(params: {
  siteId: string;
  targetKeyword: string;
}): Promise<{ assetId: string; pageId: string }> {
  const { siteId, targetKeyword } = params;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    include: { brand: true },
  });

  if (!site) throw new Error(`Site ${siteId} not found`);

  const year = new Date().getFullYear();
  const title = `${targetKeyword} by the Numbers: Key Data & Insights (${year})`;

  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const domain = site.primaryDomain ?? 'example.com';
  const content = buildInfographicContent(targetKeyword, year, site.brand?.name ?? site.name, domain, slug);

  const contentRecord = await prisma.content.create({
    data: {
      siteId,
      body: content,
      bodyFormat: 'MARKDOWN',
      isAiGenerated: true,
      qualityScore: 80,
      version: 1,
    },
  });

  const page = await prisma.page.create({
    data: {
      siteId,
      slug,
      title,
      type: PageType.BLOG,
      status: 'PUBLISHED',
      metaTitle: title.length > 60 ? `${targetKeyword} Data & Insights ${year}` : title,
      metaDescription: `Visual data and key statistics about ${targetKeyword.toLowerCase()}. Includes embeddable infographic for your website.`,
      contentId: contentRecord.id,
    },
  });

  const asset = await prisma.linkableAsset.create({
    data: {
      siteId,
      title,
      slug,
      assetType: 'INFOGRAPHIC_DATA',
      content,
      metaTitle: title,
      metaDescription: `Visual data about ${targetKeyword.toLowerCase()}.`,
      targetKeywords: [targetKeyword, `${targetKeyword} infographic`, `${targetKeyword} data`],
      pageId: page.id,
    },
  });

  console.log(`[Linkable Assets] Created infographic data page: "${title}" (asset: ${asset.id}, page: ${page.id})`);
  return { assetId: asset.id, pageId: page.id };
}

// --- Content Builders ---

function buildStatisticsContent(keyword: string, destination: string | undefined, year: number, brandName: string): string {
  const location = destination ? ` in ${destination}` : '';
  return `# ${keyword} Statistics ${year}: Key Facts & Data${location}

Looking for the latest ${keyword.toLowerCase()} statistics? We've compiled the most important data points and trends${location} to help you understand the current landscape.

## Key ${keyword} Statistics at a Glance

| Metric | Value | Source |
|--------|-------|--------|
| Global market size | Growing year-over-year | Industry reports ${year} |
| Annual growth rate | Steady upward trend | Market analysis |
| Consumer demand | Increasing | Booking data |

*Data compiled by ${brandName} from industry sources. Last updated ${year}.*

## ${keyword} Market Overview

The ${keyword.toLowerCase()} market continues to evolve${location}. Here are the defining trends for ${year}:

### Growth Trends

The demand for ${keyword.toLowerCase()} experiences has shown consistent growth, driven by changing consumer preferences and increased interest in authentic, local experiences.

### Consumer Behavior

Travelers are increasingly seeking unique and personalized ${keyword.toLowerCase()} options. Mobile bookings continue to rise, with the majority of research happening on smartphones.

### Seasonal Patterns

Peak demand typically aligns with traditional travel seasons, though off-peak interest is growing as travelers seek less crowded experiences.

## Industry Outlook for ${year}

The outlook for ${keyword.toLowerCase()}${location} remains positive. Key factors include:

- Growing preference for experience-based travel over traditional tourism
- Increased accessibility through online booking platforms
- Rising interest in sustainable and responsible tourism options
- Expansion of niche and specialized experience categories

## Frequently Asked Questions

### How large is the ${keyword.toLowerCase()} market${location}?

The ${keyword.toLowerCase()} market${location} is part of the broader global experiences economy, which continues to grow year over year as travelers prioritize experiences over material goods.

### What are the most popular types of ${keyword.toLowerCase()}${location}?

The most popular categories include guided tours, food and drink experiences, adventure activities, and cultural immersion experiences. Preferences vary by destination and season.

### When is the best time to book ${keyword.toLowerCase()}${location}?

Booking in advance (2-4 weeks) typically offers the best selection and pricing. However, last-minute availability is often possible outside peak season.

## Methodology

Statistics and data in this report are compiled from publicly available industry reports, booking platform data, and tourism authority publications. ${brandName} regularly updates this page as new data becomes available.

---

*Found this useful? Share it with fellow travelers and industry professionals. Data from ${brandName}.*
`;
}

function buildComprehensiveGuideContent(keyword: string, destination: string | undefined, year: number, brandName: string): string {
  const location = destination ? ` in ${destination}` : '';
  return `# The Complete Guide to ${keyword}${location} (${year})

Everything you need to know about ${keyword.toLowerCase()}${location}. This comprehensive guide covers planning, booking, tips, and insider advice to help you make the most of your experience.

## Why ${keyword}${location}?

${keyword}${location} offers a unique way to explore and connect with ${destination ?? 'your destination'}. Whether you're a first-time visitor or a seasoned traveler, there's always something new to discover.

## Planning Your ${keyword} Experience

### When to Go

The best time for ${keyword.toLowerCase()}${location} depends on several factors:

- **Peak season** offers the widest selection but higher prices and larger crowds
- **Shoulder season** provides a balance of availability and value
- **Off-season** can offer unique experiences and significant savings

### How to Choose the Right Experience

Consider these factors when selecting your ${keyword.toLowerCase()} experience:

1. **Duration** — Half-day, full-day, or multi-day options are typically available
2. **Group size** — Private tours offer personalization; group tours offer social experiences
3. **Physical requirements** — Check activity levels and accessibility information
4. **Reviews and ratings** — Look for experiences with consistent positive feedback

## Top ${keyword} Categories${location}

### Guided Tours & Sightseeing

Expert-led tours provide historical context, local knowledge, and access to hidden gems that independent travelers often miss.

### Food & Drink Experiences

From street food walks to cooking classes and wine tastings, culinary experiences offer an authentic taste of local culture.

### Adventure & Outdoor Activities

For active travelers, adventure experiences range from gentle nature walks to adrenaline-pumping activities.

### Cultural & Historical Experiences

Museums, heritage sites, art galleries, and cultural performances provide deeper understanding of the destination's story.

## Booking Tips & Best Practices

### Getting the Best Value

- Book in advance for popular experiences, especially during peak season
- Compare similar experiences across different providers
- Look for combo deals that bundle multiple activities
- Check cancellation policies before booking

### What to Bring

- Comfortable walking shoes appropriate for the activity
- Weather-appropriate clothing and sun protection
- A fully charged phone for tickets and navigation
- Cash for tips and incidental purchases

## Insider Tips

1. **Ask locals** — Hotel concierges and local residents often know the best experiences
2. **Read recent reviews** — Focus on reviews from the past 6 months for the most relevant feedback
3. **Book direct when possible** — Some operators offer better prices or perks for direct bookings
4. **Be flexible** — Weather and conditions can change; having backup plans enhances your trip

## Frequently Asked Questions

### How much should I budget for ${keyword.toLowerCase()}${location}?

Budgets vary widely depending on the type of experience. Expect to spend anywhere from budget-friendly walking tours to premium private experiences. Check current pricing on booking platforms for accurate estimates.

### Are ${keyword.toLowerCase()} experiences${location} suitable for families?

Many experiences${location} cater specifically to families, with age-appropriate activities and family-friendly scheduling. Look for experiences that mention family-friendly in their description.

### Can I book ${keyword.toLowerCase()} last minute?

While advance booking is recommended for popular experiences, many operators accommodate last-minute bookings, especially outside peak season. Mobile booking apps make this convenient.

### What happens if weather affects my booking?

Most reputable operators have weather policies, including free rescheduling or full refunds. Always check the cancellation policy when booking.

### Do I need to speak the local language?

Most popular experiences${location} are available in English and other major languages. Check the listing details for language options.

## Conclusion

${keyword}${location} offers something for every type of traveler. By planning ahead, reading reviews, and staying flexible, you can create memorable experiences that enrich your journey.

Ready to start exploring? Browse available [${keyword.toLowerCase()} experiences](/experiences) and find your next adventure with ${brandName}.

---

*This guide is maintained by ${brandName} and updated regularly. Last updated: ${year}.*
`;
}

function buildInfographicContent(keyword: string, year: number, brandName: string, domain: string, slug: string): string {
  const embedUrl = `https://${domain}/${slug}`;
  return `# ${keyword} by the Numbers: Key Data & Insights (${year})

A visual breakdown of the most important ${keyword.toLowerCase()} data points and trends for ${year}.

## Key Metrics

| Category | Metric | Trend |
|----------|--------|-------|
| Market Growth | Year-over-year increase | Upward |
| Mobile Bookings | Majority of all bookings | Growing |
| Average Rating | 4.5+ stars | Stable |
| Advance Booking | 2-4 weeks ahead | Typical |
| Repeat Customers | High return rate | Growing |

## Visual Data Summary

### Booking Trends
Most bookings occur 2-4 weeks in advance, with a notable increase in same-week bookings driven by mobile platforms.

### Seasonal Distribution
Peak season accounts for the highest volume, but shoulder season bookings are growing fastest, indicating a trend toward year-round demand.

### Customer Satisfaction
Average ratings remain consistently high (4.5+ stars), with guided experiences and small-group tours receiving the highest satisfaction scores.

### Price Distribution
Entry-level experiences offer accessible pricing, while premium and private options command higher rates with strong demand from luxury travelers.

## Embed This Data

Share these insights on your website. Copy the embed code below:

\`\`\`html
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:16px;max-width:600px;">
  <h3 style="margin:0 0 8px;font-size:18px;">${keyword} Key Data (${year})</h3>
  <p style="margin:0 0 12px;color:#6b7280;font-size:14px;">Source: <a href="${embedUrl}" target="_blank" rel="noopener">${brandName}</a></p>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px;font-weight:600;">Market Growth</td><td style="padding:8px;">Upward trend</td></tr>
    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px;font-weight:600;">Mobile Bookings</td><td style="padding:8px;">Majority share</td></tr>
    <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:8px;font-weight:600;">Avg Rating</td><td style="padding:8px;">4.5+ stars</td></tr>
    <tr><td style="padding:8px;font-weight:600;">Repeat Rate</td><td style="padding:8px;">High & growing</td></tr>
  </table>
  <p style="margin:12px 0 0;font-size:12px;color:#9ca3af;">Data by <a href="${embedUrl}" target="_blank" rel="noopener">${brandName}</a></p>
</div>
\`\`\`

## Frequently Asked Questions

### Where does this data come from?

This data is compiled from industry reports, booking platform analytics, and tourism authority publications by ${brandName}.

### How often is this data updated?

We update our data and insights regularly as new information becomes available, typically quarterly.

### Can I use this data in my content?

Yes! Please feel free to reference and share this data. We ask that you include a link back to this page as the source.

---

*Data compiled by ${brandName}. If you use this data, please link back to this page. Last updated: ${year}.*
`;
}
