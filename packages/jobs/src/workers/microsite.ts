import { type Job } from 'bullmq';
import {
  prisma,
  type Prisma,
  type MicrositeStatus,
  type MicrositeLayoutType,
  PageType,
  PageStatus,
} from '@experience-marketplace/database';
import type {
  MicrositeCreatePayload,
  MicrositeBrandGeneratePayload,
  MicrositeContentGeneratePayload,
  MicrositePublishPayload,
  MicrositeArchivePayload,
  MicrositeHealthCheckPayload,
  JobResult,
} from '../types/index.js';
import { canExecuteAutonomousOperation } from '../services/pause-control.js';
import {
  generateComprehensiveBrandIdentity,
  generateLightweightBrandIdentity,
  generateSeoTitleConfig,
  generateHomepageConfig,
  type HomepageConfig,
} from '../services/brand-identity.js';
import { generateAndStoreFavicon } from '../services/favicon-generator.js';
import { getGSCClient, isGSCConfigured } from '../services/gsc-client.js';
import { enrichHomepageConfigWithImages } from '../services/unsplash-images.js';

/**
 * Microsite Worker
 * Handles autonomous microsite creation, brand generation, and lifecycle management
 */

// Parent domain for GSC submissions (domain property covers all subdomains)
const GSC_PARENT_DOMAIN = 'experiencess.com';

/**
 * Submit microsite sitemap to Google Search Console
 * Uses the domain property which covers all subdomains
 */
async function submitMicrositeSitemapToGSC(fullDomain: string): Promise<void> {
  if (!isGSCConfigured()) {
    console.log('[Microsite GSC] GSC not configured, skipping sitemap submission');
    return;
  }

  try {
    const gscClient = getGSCClient();
    const sitemapUrl = `https://${fullDomain}/sitemap.xml`;
    const domainProperty = `sc-domain:${GSC_PARENT_DOMAIN}`;

    console.log(`[Microsite GSC] Submitting sitemap: ${sitemapUrl}`);

    await gscClient.submitSitemap(domainProperty, sitemapUrl);

    console.log(`[Microsite GSC] Successfully submitted sitemap for ${fullDomain}`);
  } catch (error) {
    // Non-critical - log but don't fail the operation
    console.warn('[Microsite GSC] Sitemap submission failed (non-critical):', error);
  }
}

/**
 * Determine the appropriate layout type based on product count
 * - MARKETPLACE: 51+ products (large catalogs)
 * - CATALOG: 2-50 products (small to medium catalogs)
 * - PRODUCT_SPOTLIGHT: 1 product (single product focus)
 */
function determineLayoutType(productCount: number): MicrositeLayoutType {
  if (productCount >= 51) return 'MARKETPLACE';
  if (productCount >= 2) return 'CATALOG';
  return 'PRODUCT_SPOTLIGHT';
}

/**
 * Generate a URL-safe slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Generate unique slug with collision handling
 */
async function generateUniqueSlug(
  baseName: string,
  table: 'supplier' | 'product' | 'micrositeConfig'
): Promise<string> {
  const baseSlug = generateSlug(baseName);
  let slug = baseSlug;
  let counter = 1;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let existing;
    if (table === 'supplier') {
      existing = await prisma.supplier.findUnique({ where: { slug } });
    } else if (table === 'product') {
      existing = await prisma.product.findUnique({ where: { slug } });
    } else {
      existing = await prisma.micrositeConfig.findFirst({
        where: { subdomain: slug },
      });
    }

    if (!existing) break;

    slug = `${baseSlug}-${counter}`;
    counter++;

    // Safety valve
    if (counter > 100) {
      slug = `${baseSlug}-${Date.now()}`;
      break;
    }
  }

  return slug;
}

/**
 * Microsite Creation Handler
 * Creates a new microsite for a supplier or product
 */
export async function handleMicrositeCreate(job: Job<MicrositeCreatePayload>): Promise<JobResult> {
  const {
    supplierId,
    productId,
    opportunityId,
    parentDomain,
    subdomain: preGeneratedSubdomain,
    entityType: payloadEntityType,
    discoveryConfig,
  } = job.data;

  try {
    console.log(
      `[Microsite Create] Starting microsite creation for ${supplierId ? `supplier ${supplierId}` : productId ? `product ${productId}` : `opportunity ${opportunityId}`}`
    );

    // Check if autonomous microsite creation is allowed
    const canProceed = await canExecuteAutonomousOperation({
      feature: 'enableSiteCreation',
    });

    if (!canProceed.allowed) {
      console.log(`[Microsite Create] Skipping - ${canProceed.reason}`);
      return {
        success: false,
        error: canProceed.reason || 'Microsite creation is paused',
        errorCategory: 'paused',
        timestamp: new Date(),
      };
    }

    // Validate: must have supplierId, productId, or opportunityId
    if (!supplierId && !productId && !opportunityId) {
      throw new Error('Either supplierId, productId, or opportunityId is required');
    }

    // Get entity data
    let entityName: string;
    let entitySlug: string;
    let entityType: 'SUPPLIER' | 'PRODUCT' | 'OPPORTUNITY';
    let categories: string[] = [];
    let cities: string[] = [];
    let description: string | null = null;
    let productCount = 0; // For determining layout type
    let opportunityData: {
      id: string;
      keyword: string;
      niche: string;
      location: string | null;
      searchVolume: number;
    } | null = null;

    if (supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) throw new Error(`Supplier ${supplierId} not found`);

      // Check if microsite already exists for this supplier
      const existingMicrosite = await prisma.micrositeConfig.findFirst({
        where: { supplierId },
      });
      if (existingMicrosite) {
        console.log(`[Microsite Create] Microsite already exists for supplier ${supplierId}`);
        return {
          success: true,
          message: 'Microsite already exists (idempotent)',
          data: { micrositeId: existingMicrosite.id, recovered: true },
          timestamp: new Date(),
        };
      }

      entityName = supplier.name;
      entitySlug = supplier.slug;
      entityType = 'SUPPLIER';
      categories = supplier.categories || [];
      cities = supplier.cities || [];
      description = supplier.description;
      productCount = supplier.productCount;
    } else if (productId) {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { supplier: true },
      });
      if (!product) throw new Error(`Product ${productId} not found`);

      // Check if microsite already exists for this product
      const existingMicrosite = await prisma.micrositeConfig.findFirst({
        where: { productId },
      });
      if (existingMicrosite) {
        console.log(`[Microsite Create] Microsite already exists for product ${productId}`);
        return {
          success: true,
          message: 'Microsite already exists (idempotent)',
          data: { micrositeId: existingMicrosite.id, recovered: true },
          timestamp: new Date(),
        };
      }

      entityName = product.title;
      entitySlug = product.slug;
      entityType = 'PRODUCT';
      categories = product.categories || [];
      cities = product.city ? [product.city] : [];
      description = product.shortDescription || product.description;
      productCount = 1; // Single product microsite = PRODUCT_SPOTLIGHT
    } else if (opportunityId) {
      // OPPORTUNITY entity type — discovery-based microsite
      const opportunity = await prisma.sEOOpportunity.findUnique({ where: { id: opportunityId } });
      if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found`);

      // Check if microsite already exists for this opportunity
      const existingMicrosite = await prisma.micrositeConfig.findFirst({
        where: { opportunityId },
      });
      if (existingMicrosite) {
        console.log(`[Microsite Create] Microsite already exists for opportunity ${opportunityId}`);
        return {
          success: true,
          message: 'Microsite already exists (idempotent)',
          data: { micrositeId: existingMicrosite.id, recovered: true },
          timestamp: new Date(),
        };
      }

      opportunityData = {
        id: opportunity.id,
        keyword: opportunity.keyword,
        niche: opportunity.niche,
        location: opportunity.location,
        searchVolume: opportunity.searchVolume,
      };
      entityName = opportunity.keyword;
      entitySlug =
        preGeneratedSubdomain ||
        opportunity.keyword
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .substring(0, 50);
      entityType = 'OPPORTUNITY';
      categories = [opportunity.niche];
      cities = opportunity.location ? [opportunity.location.split(',')[0]!.trim()] : [];
      description = `Discover the best ${opportunity.niche} experiences${opportunity.location ? ` in ${opportunity.location}` : ''}`;
      productCount = 100; // Discovery-based = always MARKETPLACE layout
    } else {
      throw new Error('Either supplierId, productId, or opportunityId is required');
    }

    // Determine layout type based on product count
    const layoutType = determineLayoutType(productCount);
    console.log(`[Microsite Create] Layout type: ${layoutType} (${productCount} products)`);

    // Generate subdomain (use pre-generated or entity slug, ensure uniqueness)
    const subdomain =
      preGeneratedSubdomain || (await generateUniqueSlug(entitySlug, 'micrositeConfig'));
    const fullDomain = `${subdomain}.${parentDomain}`;

    console.log(`[Microsite Create] Creating microsite at ${fullDomain}`);

    // Generate brand identity — use lightweight for supplier/product microsites
    const useFullBrand = entityType === 'OPPORTUNITY';
    console.log(
      `[Microsite Create] Generating ${useFullBrand ? 'comprehensive' : 'lightweight'} brand identity...`
    );
    const brandContext = {
      keyword: entityName,
      location: cities[0] || undefined,
      niche: categories[0] || 'travel experiences',
      searchVolume: 100,
      intent: 'TRANSACTIONAL',
      entityName,
      entityDescription: description || undefined,
    };
    const brandIdentity = useFullBrand
      ? await generateComprehensiveBrandIdentity(brandContext)
      : await generateLightweightBrandIdentity(brandContext);

    console.log(
      `[Microsite Create] Generated brand: "${brandIdentity.name}" - ${brandIdentity.tagline}`
    );

    // Create brand record
    const brand = await prisma.brand.create({
      data: {
        name: brandIdentity.name,
        tagline: brandIdentity.tagline,
        primaryColor: brandIdentity.primaryColor,
        secondaryColor: brandIdentity.secondaryColor,
        accentColor: brandIdentity.accentColor,
        headingFont: brandIdentity.headingFont,
        bodyFont: brandIdentity.bodyFont,
        logoUrl: brandIdentity.logoUrl,
        isAutoGenerated: true,
        generationPrompt: `Microsite brand for ${entityType.toLowerCase()} "${entityName}"`,
      },
    });

    // Generate SEO config
    const seoTitleConfig = generateSeoTitleConfig({
      brandName: brandIdentity.name,
      niche: categories[0] || 'experiences',
      location: cities[0] || undefined,
      keyword: entityName,
      tagline: brandIdentity.tagline,
      cities,
      categories,
    });

    // Generate homepage config
    // OPPORTUNITY microsites get rich config (destinations, categories, testimonials, images)
    // SUPPLIER/PRODUCT microsites get minimal config (hero + popular experiences)
    let homepageConfig: HomepageConfig;
    if (entityType === 'OPPORTUNITY') {
      console.log(
        '[Microsite Create] Generating rich homepage config for OPPORTUNITY microsite...'
      );
      homepageConfig = await generateHomepageConfig(
        {
          keyword: entityName,
          location: cities[0] || undefined,
          niche: categories[0] || 'travel experiences',
          searchVolume: opportunityData?.searchVolume || 100,
          intent: 'TRANSACTIONAL',
        },
        brandIdentity
      );
      console.log(
        `[Microsite Create] Rich homepage config generated with ${homepageConfig.destinations?.length || 0} destinations, ${homepageConfig.categories?.length || 0} categories`
      );
    } else {
      homepageConfig = {
        hero: {
          title: brandIdentity.name,
          subtitle: brandIdentity.tagline,
        },
      };
    }

    // Create microsite config
    const microsite = await prisma.micrositeConfig.create({
      data: {
        subdomain,
        parentDomain,
        fullDomain,
        entityType,
        supplierId: supplierId || null,
        productId: productId || null,
        opportunityId: opportunityId || null,
        ...(discoveryConfig ? { discoveryConfig } : {}),
        brandId: brand.id,
        siteName: brandIdentity.name,
        tagline: brandIdentity.tagline,
        // Layout type determines homepage structure
        layoutType,
        cachedProductCount: productCount,
        productCountUpdatedAt: new Date(),
        seoConfig: {
          titleTemplate: seoTitleConfig.titleTemplate,
          defaultTitle: seoTitleConfig.defaultTitle,
          defaultDescription: description || brandIdentity.tagline,
          keywords: categories,
          // Use shared GA4 property for all microsites
          gaMeasurementId: process.env['MICROSITE_GA4_MEASUREMENT_ID'] || null,
          // Use shared ad platform IDs (same pattern as GA4)
          metaPixelId: process.env['META_PIXEL_ID'] || null,
          googleAdsId: process.env['GOOGLE_ADS_ID'] || null,
          googleAdsConversionAction: process.env['GOOGLE_ADS_CONVERSION_ACTION'] || null,
        },
        homepageConfig: homepageConfig as unknown as Prisma.InputJsonValue,
        status: 'GENERATING',
      },
    });

    console.log(`[Microsite Create] Created microsite ${microsite.id} at ${fullDomain}`);

    // For non-OPPORTUNITY microsites, enrich hero with Unsplash image (non-critical)
    // OPPORTUNITY microsites already have images from generateHomepageConfig()
    if (entityType !== 'OPPORTUNITY') {
      try {
        const enrichedConfig = await enrichHomepageConfigWithImages(
          { hero: { title: brandIdentity.name, subtitle: brandIdentity.tagline } },
          { niche: categories[0] || 'travel experiences', location: cities[0] || undefined }
        );
        if (enrichedConfig.hero?.backgroundImage) {
          await prisma.micrositeConfig.update({
            where: { id: microsite.id },
            data: {
              homepageConfig: {
                ...homepageConfig,
                hero: enrichedConfig.hero,
              } as unknown as Prisma.InputJsonValue,
            },
          });
          console.log(`[Microsite Create] Hero image set from Unsplash`);
        }
      } catch (unsplashError) {
        console.warn(
          '[Microsite Create] Unsplash hero image failed (non-critical):',
          unsplashError
        );
      }
    }

    // Generate favicon (non-critical)
    try {
      await generateAndStoreFavicon(brand.id, brandIdentity.name, brandIdentity.primaryColor);
    } catch (faviconError) {
      console.warn('[Microsite Create] Favicon generation failed (non-critical):', faviconError);
    }

    // Logo generation disabled - using text-only branding for now
    // TODO: Re-enable with higher quality logo generation when available

    // Queue content generation
    // OPPORTUNITY microsites get full site-like content (blog, legal pages, FAQ)
    const { addJob } = await import('../queues/index.js');
    const contentJobId = await addJob('MICROSITE_CONTENT_GENERATE', {
      micrositeId: microsite.id,
      contentTypes:
        entityType === 'OPPORTUNITY'
          ? ['homepage', 'about', 'experiences', 'blog', 'contact', 'privacy', 'terms', 'faq']
          : ['homepage', 'about', 'experiences'],
    });

    // Detect if the content job was dropped due to budget limits
    if (contentJobId.startsWith('budget-exceeded:')) {
      console.error(
        `[Microsite Create] CONTENT BUDGET EXCEEDED for microsite ${microsite.id} — ` +
          `content generation was NOT queued. Microsite will remain in GENERATING status. ` +
          `Run backfill-stuck-microsites.ts to recover.`
      );
    }

    // For OPPORTUNITY microsites, queue destination landing pages based on homepageConfig
    if (entityType === 'OPPORTUNITY' && homepageConfig.destinations?.length) {
      for (const dest of homepageConfig.destinations.slice(0, 8)) {
        await addJob('MICROSITE_CONTENT_GENERATE', {
          micrositeId: microsite.id,
          contentTypes: ['destination_landing'],
          destinationName: dest.name,
          destinationSlug: dest.slug,
        });
      }
      console.log(
        `[Microsite Create] Queued ${Math.min(homepageConfig.destinations.length, 8)} destination landing pages`
      );
    }

    console.log('[Microsite Create] Queued content generation');

    // Queue supplier enrichment if supplier has no city data (needed for SEO titles)
    if (entityType === 'SUPPLIER' && cities.length === 0 && microsite.supplierId) {
      try {
        await addJob('SUPPLIER_ENRICH' as any, { supplierIds: [microsite.supplierId] });
        console.info(
          `[Microsite Create] Queued supplier enrichment for ${microsite.supplierId} (empty cities)`
        );
      } catch (enrichErr) {
        console.warn('[Microsite Create] Failed to queue supplier enrichment:', enrichErr);
      }
    }

    return {
      success: true,
      message: `Microsite created successfully: ${fullDomain}`,
      data: {
        micrositeId: microsite.id,
        subdomain,
        fullDomain,
        brandId: brand.id,
        entityType,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Create] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Microsite Brand Generate Handler
 * Regenerates brand identity for an existing microsite
 */
export async function handleMicrositeBrandGenerate(
  job: Job<MicrositeBrandGeneratePayload>
): Promise<JobResult> {
  const { micrositeId } = job.data;

  try {
    console.log(`[Microsite Brand] Regenerating brand for microsite ${micrositeId}`);

    const microsite = await prisma.micrositeConfig.findUnique({
      where: { id: micrositeId },
      include: { supplier: true, product: true, brand: true },
    });

    if (!microsite) throw new Error(`Microsite ${micrositeId} not found`);

    const entity = microsite.supplier || microsite.product;
    if (!entity) throw new Error(`Microsite ${micrositeId} has no linked entity`);

    const categories = microsite.supplier?.categories || microsite.product?.categories || [];
    const cities =
      microsite.supplier?.cities || (microsite.product?.city ? [microsite.product.city] : []);

    // Generate new brand identity
    const entityName = 'name' in entity ? entity.name : (entity as any).title;
    const entityDescription =
      microsite.supplier?.description ||
      microsite.product?.shortDescription ||
      microsite.product?.description ||
      undefined;
    const brandIdentity = await generateComprehensiveBrandIdentity({
      keyword: entityName,
      location: cities[0] || undefined,
      niche: categories[0] || 'travel experiences',
      searchVolume: 100,
      intent: 'TRANSACTIONAL',
      entityName,
      entityDescription,
    });

    // Update brand
    await prisma.brand.update({
      where: { id: microsite.brandId },
      data: {
        name: brandIdentity.name,
        tagline: brandIdentity.tagline,
        primaryColor: brandIdentity.primaryColor,
        secondaryColor: brandIdentity.secondaryColor,
        accentColor: brandIdentity.accentColor,
        headingFont: brandIdentity.headingFont,
        bodyFont: brandIdentity.bodyFont,
      },
    });

    // Update microsite
    await prisma.micrositeConfig.update({
      where: { id: micrositeId },
      data: {
        siteName: brandIdentity.name,
        tagline: brandIdentity.tagline,
      },
    });

    return {
      success: true,
      message: `Brand regenerated for microsite ${micrositeId}`,
      data: { brandName: brandIdentity.name },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Brand] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Microsite Homepage Enrich Handler
 * Backfills existing OPPORTUNITY microsites with rich homepageConfig
 * (destinations, categories, testimonials, Unsplash images)
 */
export async function handleMicrositeHomepageEnrich(
  job: Job<{ micrositeId: string }>
): Promise<JobResult> {
  const { micrositeId } = job.data;

  try {
    console.log(`[Microsite Enrich] Enriching homepage config for microsite ${micrositeId}`);

    const microsite = await prisma.micrositeConfig.findUnique({
      where: { id: micrositeId },
      include: { brand: true, opportunity: true },
    });

    if (!microsite) throw new Error(`Microsite ${micrositeId} not found`);
    if (microsite.entityType !== 'OPPORTUNITY') {
      return {
        success: false,
        error: 'Only OPPORTUNITY microsites can be enriched',
        timestamp: new Date(),
      };
    }

    if (!microsite.brand) throw new Error(`Microsite ${micrositeId} has no brand`);

    // Generate rich homepage config using existing brand identity
    const brandIdentity = {
      name: microsite.brand.name,
      tagline: microsite.brand.tagline || '',
      primaryColor: microsite.brand.primaryColor,
      secondaryColor: microsite.brand.secondaryColor,
      accentColor: microsite.brand.accentColor,
      headingFont: microsite.brand.headingFont,
      bodyFont: microsite.brand.bodyFont,
      logoUrl: microsite.brand.logoUrl,
    };

    const niche = microsite.opportunity?.niche || 'travel experiences';
    const location = microsite.opportunity?.location || undefined;
    const keyword = microsite.opportunity?.keyword || microsite.siteName;

    const homepageConfig = await generateHomepageConfig(
      {
        keyword,
        location: location || undefined,
        niche,
        searchVolume: microsite.opportunity?.searchVolume || 100,
        intent: 'TRANSACTIONAL',
      },
      brandIdentity as any
    );

    // Update microsite with rich config
    await prisma.micrositeConfig.update({
      where: { id: micrositeId },
      data: {
        homepageConfig: homepageConfig as unknown as Prisma.InputJsonValue,
        lastContentUpdate: new Date(),
      },
    });

    console.log(
      `[Microsite Enrich] Updated ${microsite.fullDomain} with ${homepageConfig.destinations?.length || 0} destinations, ${homepageConfig.categories?.length || 0} categories`
    );

    // Queue destination landing pages
    if (homepageConfig.destinations?.length) {
      const { addJob } = await import('../queues/index.js');
      for (const dest of homepageConfig.destinations.slice(0, 8)) {
        await addJob('MICROSITE_CONTENT_GENERATE', {
          micrositeId,
          contentTypes: ['destination_landing'],
          destinationName: dest.name,
          destinationSlug: dest.slug,
        });
      }
      console.log(
        `[Microsite Enrich] Queued ${Math.min(homepageConfig.destinations.length, 8)} destination landing pages`
      );
    }

    return {
      success: true,
      message: `Homepage enriched for ${microsite.fullDomain}`,
      data: {
        destinations: homepageConfig.destinations?.length || 0,
        categories: homepageConfig.categories?.length || 0,
        testimonials: homepageConfig.testimonials?.length || 0,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Enrich] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Microsite Content Generate Handler
 * Generates content pages for a microsite
 */
export async function handleMicrositeContentGenerate(
  job: Job<MicrositeContentGeneratePayload>
): Promise<JobResult> {
  const { micrositeId, contentTypes, isRefresh } = job.data;

  try {
    console.log(
      `[Microsite Content] Generating content for microsite ${micrositeId}: ${contentTypes.join(', ')}`
    );

    const microsite = await prisma.micrositeConfig.findUnique({
      where: { id: micrositeId },
      include: { brand: true, supplier: true, product: true },
    });

    if (!microsite) throw new Error(`Microsite ${micrositeId} not found`);

    const createdPages: string[] = [];

    for (const contentType of contentTypes) {
      let pageType: PageType;
      let slug: string;
      let title: string;

      switch (contentType) {
        case 'homepage':
          pageType = PageType.HOMEPAGE;
          slug = '';
          title = 'Home';
          break;
        case 'about':
          pageType = PageType.ABOUT;
          slug = 'about';
          title = 'About Us';
          break;
        case 'experiences':
          pageType = PageType.CATEGORY;
          slug = 'experiences';
          title = 'Our Experiences';
          break;
        case 'blog':
          pageType = PageType.BLOG;
          slug = 'blog';
          title = 'Blog';
          break;
        case 'contact':
          pageType = PageType.CONTACT;
          slug = 'contact';
          title = 'Contact Us';
          break;
        case 'privacy':
          pageType = PageType.LEGAL;
          slug = 'privacy';
          title = 'Privacy Policy';
          break;
        case 'terms':
          pageType = PageType.LEGAL;
          slug = 'terms';
          title = 'Terms of Service';
          break;
        case 'faq':
          pageType = PageType.FAQ;
          slug = 'faq';
          title = 'Frequently Asked Questions';
          break;
        case 'destination_landing':
          pageType = PageType.LANDING;
          slug = `destinations/${job.data.destinationSlug || 'unknown'}`;
          title = `Things to Do in ${job.data.destinationName || 'Unknown'}`;
          break;
        default:
          continue;
      }

      // Check if page already exists (idempotent)
      const existingPage = await prisma.page.findFirst({
        where: { micrositeId, slug },
      });

      if (existingPage && !isRefresh) {
        console.log(`[Microsite Content] Page ${slug} already exists, skipping`);
        createdPages.push(existingPage.id);
        continue;
      }

      // Create or update page
      const page = existingPage
        ? await prisma.page.update({
            where: { id: existingPage.id },
            data: { title, status: PageStatus.DRAFT },
          })
        : await prisma.page.create({
            data: {
              micrositeId,
              title,
              slug,
              type: pageType,
              status: PageStatus.DRAFT,
              metaDescription: `${title} - ${microsite.siteName}`,
            },
          });

      createdPages.push(page.id);

      // Queue actual content generation (uses content engine)
      // Note: We pass micrositeId (not siteId) since this is a MicrositeConfig, not a Site.
      // The content handler will look up context from the Page record.
      const contentTypeMap: Record<string, string> = {
        experiences: 'category',
        homepage: 'destination',
        destination_landing: 'destination',
        privacy: 'blog', // Legal pages use blog-style content generation
        terms: 'blog',
        contact: 'blog',
        faq: 'blog',
      };
      type ContentType = 'destination' | 'experience' | 'category' | 'blog' | 'about' | 'faq';
      const mappedContentType = (contentTypeMap[contentType] || contentType) as ContentType;
      const { addJob } = await import('../queues/index.js');
      await addJob('CONTENT_GENERATE', {
        micrositeId,
        pageId: page.id,
        contentType: mappedContentType,
        targetKeyword:
          contentType === 'destination_landing'
            ? `${job.data.destinationName} ${microsite.siteName}`
            : `${microsite.siteName} ${title}`,
        secondaryKeywords: microsite.supplier?.categories || microsite.product?.categories || [],
      });
    }

    // Update microsite status and auto-publish
    // Microsite homepages render from homepageConfig + Holibob API products,
    // not from Page content, so we can go straight to ACTIVE.
    await prisma.micrositeConfig.update({
      where: { id: micrositeId },
      data: {
        status: 'ACTIVE',
        lastContentUpdate: new Date(),
      },
    });

    // Publish all pages immediately (they have metadata from content generation)
    await prisma.page.updateMany({
      where: {
        micrositeId,
        status: PageStatus.DRAFT,
      },
      data: {
        status: PageStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    console.log(`[Microsite Content] Auto-published microsite ${micrositeId} to ACTIVE`);

    // Trigger keyword enrichment for the supplier if not yet enriched
    if (microsite.supplierId && !microsite.supplier?.keywordsEnrichedAt) {
      try {
        const { addJob } = await import('../queues/index.js');
        await addJob('KEYWORD_ENRICHMENT' as any, {
          supplierIds: [microsite.supplierId],
          maxProductsPerSupplier: 100,
        });
        console.log(
          `[Microsite Content] Queued keyword enrichment for supplier ${microsite.supplierId}`
        );
      } catch (err) {
        console.error(`[Microsite Content] Failed to queue keyword enrichment: ${err}`);
      }
    }

    return {
      success: true,
      message: `Generated ${createdPages.length} pages and activated microsite ${micrositeId}`,
      data: { pageIds: createdPages },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Content] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Microsite Publish Handler
 * Activates a microsite, making it publicly accessible
 */
export async function handleMicrositePublish(
  job: Job<MicrositePublishPayload>
): Promise<JobResult> {
  const { micrositeId } = job.data;

  try {
    console.log(`[Microsite Publish] Publishing microsite ${micrositeId}`);

    const microsite = await prisma.micrositeConfig.findUnique({
      where: { id: micrositeId },
      include: { pages: true, supplier: { select: { keywordsEnrichedAt: true } } },
    });

    if (!microsite) throw new Error(`Microsite ${micrositeId} not found`);

    // Check readiness
    if (microsite.pages.length === 0) {
      throw new Error(`Microsite ${micrositeId} has no pages`);
    }

    // Publish all draft pages
    await prisma.page.updateMany({
      where: {
        micrositeId,
        status: PageStatus.DRAFT,
      },
      data: {
        status: PageStatus.PUBLISHED,
        publishedAt: new Date(),
      },
    });

    // Activate microsite
    await prisma.micrositeConfig.update({
      where: { id: micrositeId },
      data: { status: 'ACTIVE' },
    });

    // Submit sitemap to Google Search Console (via domain property)
    await submitMicrositeSitemapToGSC(microsite.fullDomain);

    // Trigger keyword enrichment for the supplier if not yet enriched
    if (microsite.supplierId && !microsite.supplier?.keywordsEnrichedAt) {
      try {
        const { addJob } = await import('../queues/index.js');
        await addJob('KEYWORD_ENRICHMENT' as any, {
          supplierIds: [microsite.supplierId],
          maxProductsPerSupplier: 100,
        });
        console.log(
          `[Microsite Publish] Queued keyword enrichment for supplier ${microsite.supplierId}`
        );
      } catch (err) {
        console.error(`[Microsite Publish] Failed to queue keyword enrichment: ${err}`);
      }
    }

    return {
      success: true,
      message: `Microsite ${micrositeId} published at ${microsite.fullDomain}`,
      data: { fullDomain: microsite.fullDomain },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Publish] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Microsite Archive Handler
 * Archives a microsite, making it inaccessible
 */
export async function handleMicrositeArchive(
  job: Job<MicrositeArchivePayload>
): Promise<JobResult> {
  const { micrositeId, reason } = job.data;

  try {
    console.log(
      `[Microsite Archive] Archiving microsite ${micrositeId}: ${reason || 'No reason provided'}`
    );

    const microsite = await prisma.micrositeConfig.update({
      where: { id: micrositeId },
      data: {
        status: 'ARCHIVED',
        pauseReason: reason,
      },
    });

    return {
      success: true,
      message: `Microsite ${micrositeId} archived`,
      data: { fullDomain: microsite.fullDomain },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Archive] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}

/**
 * Microsite Health Check Handler
 * Checks microsites for issues (no content, supplier deleted, etc.)
 */
export async function handleMicrositeHealthCheck(
  job: Job<MicrositeHealthCheckPayload>
): Promise<JobResult> {
  const { micrositeId } = job.data;

  try {
    console.log(
      `[Microsite Health] Running health check${micrositeId ? ` for ${micrositeId}` : ' for all microsites'}`
    );

    const whereClause = micrositeId
      ? { id: micrositeId }
      : { status: { in: ['ACTIVE', 'REVIEW', 'GENERATING'] as MicrositeStatus[] } };

    const microsites = await prisma.micrositeConfig.findMany({
      where: whereClause,
      include: {
        pages: true,
        supplier: true,
        product: true,
      },
    });

    const issues: Array<{ micrositeId: string; issue: string }> = [];

    for (const ms of microsites) {
      // Check: No pages
      if (ms.pages.length === 0 && ms.status !== 'GENERATING') {
        issues.push({ micrositeId: ms.id, issue: 'No content pages' });
      }

      // Check: Supplier deleted
      if (ms.supplierId && !ms.supplier) {
        issues.push({ micrositeId: ms.id, issue: 'Linked supplier not found' });
      }

      // Check: Product deleted
      if (ms.productId && !ms.product) {
        issues.push({ micrositeId: ms.id, issue: 'Linked product not found' });
      }

      // Check: Stale content (no update in 90 days)
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      if (ms.lastContentUpdate && ms.lastContentUpdate < ninetyDaysAgo) {
        issues.push({ micrositeId: ms.id, issue: 'Content not updated in 90+ days' });
      }
    }

    console.log(
      `[Microsite Health] Found ${issues.length} issues across ${microsites.length} microsites`
    );

    return {
      success: true,
      message: `Health check complete: ${issues.length} issues found`,
      data: {
        checked: microsites.length,
        issues,
      },
      timestamp: new Date(),
    };
  } catch (error) {
    console.error('[Microsite Health] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date(),
    };
  }
}
