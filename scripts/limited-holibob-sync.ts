#!/usr/bin/env npx tsx
/**
 * Limited Holibob Sync Script
 * Syncs products from Holibob and creates suppliers based on product data
 *
 * Note: Holibob's discovery API doesn't return supplierId/supplierName,
 * so we create suppliers based on product groupings (by city)
 *
 * Usage:
 *   npx tsx scripts/limited-holibob-sync.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

import { prisma, Prisma } from '@experience-marketplace/database';
import { createHolibobClient, type Product } from '@experience-marketplace/holibob-api';

// Configuration
const MAX_CITIES_TO_SCAN = 3;
const MAX_PRODUCTS_PER_CITY = 20; // API max is 20
const RATE_LIMIT_DELAY_MS = 500;

interface CitySupplier {
  city: string;
  products: Product[];
  categories: Set<string>;
  totalRating: number;
  ratedProductCount: number;
  totalReviews: number;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Limited Holibob Sync');
  console.log('='.repeat(60));
  console.log(`Config: ${MAX_CITIES_TO_SCAN} cities, ${MAX_PRODUCTS_PER_CITY} products/city`);
  console.log('');

  const apiUrl = process.env['HOLIBOB_API_URL'];
  const partnerId = process.env['HOLIBOB_PARTNER_ID'];
  const apiKey = process.env['HOLIBOB_API_KEY'];
  const apiSecret = process.env['HOLIBOB_API_SECRET'];

  if (!apiUrl || !partnerId || !apiKey) {
    console.error('Missing Holibob API configuration');
    console.error('Required: HOLIBOB_API_URL, HOLIBOB_PARTNER_ID, HOLIBOB_API_KEY');
    process.exit(1);
  }

  const client = createHolibobClient({ apiUrl, partnerId, apiKey, apiSecret });

  // Group products by city to create city-based "suppliers"
  const citySuppliers = new Map<string, CitySupplier>();

  // Cities to scan
  const CITIES = ['London', 'Paris', 'Barcelona', 'Rome', 'Amsterdam', 'New York', 'Tokyo', 'Sydney'];
  const citiesToScan = CITIES.slice(0, MAX_CITIES_TO_SCAN);

  try {
    console.log('[1/3] Fetching products from Holibob...');
    console.log(`Scanning cities: ${citiesToScan.join(', ')}`);

    for (const cityName of citiesToScan) {
      console.log(`\n  Scanning "${cityName}"...`);
      await sleep(RATE_LIMIT_DELAY_MS);

      try {
        const response = await client.discoverProducts(
          { freeText: cityName, currency: 'GBP' },
          { pageSize: MAX_PRODUCTS_PER_CITY }
        );

        console.log(`    Found ${response.products.length} products`);

        if (response.products.length > 0) {
          const cityData: CitySupplier = {
            city: cityName,
            products: response.products,
            categories: new Set<string>(),
            totalRating: 0,
            ratedProductCount: 0,
            totalReviews: 0,
            currency: 'GBP',
          };

          for (const product of response.products) {
            // Extract categories
            const categories = product.categoryList?.nodes || product.categories || [];
            for (const cat of categories) {
              if (cat.name) cityData.categories.add(cat.name);
            }

            // Aggregate ratings
            const rating = product.reviewRating ?? product.rating ?? 0;
            if (rating > 0) {
              cityData.totalRating += rating;
              cityData.ratedProductCount++;
            }
            if (product.reviewCount) cityData.totalReviews += product.reviewCount;

            // Price range
            const price = product.guidePrice ?? product.priceFrom;
            if (price != null) {
              if (cityData.minPrice == null || price < cityData.minPrice) cityData.minPrice = price;
              if (cityData.maxPrice == null || price > cityData.maxPrice) cityData.maxPrice = price;
            }
          }

          citySuppliers.set(cityName, cityData);
        }
      } catch (error) {
        console.error(`    Error scanning "${cityName}":`, error);
      }

      await sleep(RATE_LIMIT_DELAY_MS);
    }

    console.log(`\n\nDiscovered products in ${citySuppliers.size} cities`);

    // Step 2: Save suppliers (city-based)
    console.log('\n[2/3] Saving suppliers to database...');

    const existingSuppliers = await prisma.supplier.findMany({ select: { slug: true } });
    const existingSlugs = new Set(existingSuppliers.map((s) => s.slug));

    let suppliersCreated = 0;
    let suppliersUpdated = 0;
    const supplierIdMap = new Map<string, string>(); // city -> supplier id

    for (const [cityName, cityData] of citySuppliers) {
      const supplierName = `${cityName} Experiences`;
      const holibobSupplierId = `city-${generateSlug(cityName)}`;

      let slug = generateSlug(supplierName);
      let finalSlug = slug;
      let suffix = 1;
      while (existingSlugs.has(finalSlug)) {
        finalSlug = `${slug}-${suffix}`;
        suffix++;
      }
      existingSlugs.add(finalSlug);

      const averageRating = cityData.ratedProductCount > 0
        ? cityData.totalRating / cityData.ratedProductCount
        : null;

      const existingRecord = await prisma.supplier.findUnique({
        where: { holibobSupplierId },
        select: { id: true },
      });

      const result = await prisma.supplier.upsert({
        where: { holibobSupplierId },
        create: {
          holibobSupplierId,
          name: supplierName,
          slug: finalSlug,
          description: `Discover the best tours and activities in ${cityName}. Browse our curated collection of experiences.`,
          productCount: cityData.products.length,
          cities: [cityName],
          categories: Array.from(cityData.categories),
          rating: averageRating,
          reviewCount: cityData.totalReviews,
          priceRangeMin: cityData.minPrice ?? null,
          priceRangeMax: cityData.maxPrice ?? null,
          priceCurrency: cityData.currency ?? 'GBP',
          lastSyncedAt: new Date(),
        },
        update: {
          name: supplierName,
          description: `Discover the best tours and activities in ${cityName}. Browse our curated collection of experiences.`,
          productCount: cityData.products.length,
          cities: [cityName],
          categories: Array.from(cityData.categories),
          rating: averageRating,
          reviewCount: cityData.totalReviews,
          priceRangeMin: cityData.minPrice ?? null,
          priceRangeMax: cityData.maxPrice ?? null,
          priceCurrency: cityData.currency ?? 'GBP',
          lastSyncedAt: new Date(),
        },
      });

      supplierIdMap.set(cityName, result.id);

      if (existingRecord) {
        suppliersUpdated++;
        console.log(`  Updated: "${supplierName}" (${finalSlug})`);
      } else {
        suppliersCreated++;
        console.log(`  Created: "${supplierName}" (${finalSlug})`);
      }
    }

    console.log(`\nSuppliers: ${suppliersCreated} created, ${suppliersUpdated} updated`);

    // Step 3: Save products
    console.log('\n[3/3] Saving products to database...');

    const existingProducts = await prisma.product.findMany({ select: { slug: true } });
    const existingProductSlugs = new Set(existingProducts.map((p) => p.slug));

    let productsCreated = 0;
    let productsUpdated = 0;
    let totalProducts = 0;

    for (const [cityName, cityData] of citySuppliers) {
      const supplierId = supplierIdMap.get(cityName);
      if (!supplierId) {
        console.error(`  No supplier ID for city: ${cityName}`);
        continue;
      }

      console.log(`  Processing ${cityData.products.length} products for "${cityName}"...`);

      for (const product of cityData.products) {
        totalProducts++;

        let slug = generateSlug(product.name);
        if (!slug) slug = `product-${product.id.substring(0, 8)}`;

        let finalSlug = slug;
        let suffix = 1;
        while (existingProductSlugs.has(finalSlug)) {
          finalSlug = `${slug}-${suffix}`;
          suffix++;
        }
        existingProductSlugs.add(finalSlug);

        const categories: string[] = [];
        if (product.categoryList?.nodes) {
          for (const cat of product.categoryList.nodes) {
            if (cat.name) categories.push(cat.name);
          }
        }
        if (product.categories) {
          for (const cat of product.categories) {
            if (cat.name && !categories.includes(cat.name)) categories.push(cat.name);
          }
        }

        const images: string[] = [];
        if (product.imageList) {
          for (const img of product.imageList) {
            if (img.url) images.push(img.url);
          }
        }

        const primaryImageUrl = product.primaryImageUrl ?? product.imageUrl ?? product.imageList?.[0]?.url ?? null;

        let duration: string | null = null;
        if (product.maxDuration) {
          const hours = Math.floor(product.maxDuration / 60);
          const mins = product.maxDuration % 60;
          if (hours > 0 && mins > 0) duration = `${hours}h ${mins}m`;
          else if (hours > 0) duration = `${hours} hour${hours > 1 ? 's' : ''}`;
          else duration = `${mins} minutes`;
        } else if (product.durationText) {
          duration = product.durationText;
        }

        const existingProduct = await prisma.product.findUnique({
          where: { holibobProductId: product.id },
          select: { id: true },
        });

        const productData = {
          slug: finalSlug,
          title: product.name,
          description: product.description ?? null,
          shortDescription: product.shortDescription ?? null,
          priceFrom: product.guidePrice ?? product.priceFrom ?? null,
          currency: product.guidePriceCurrency ?? product.priceCurrency ?? 'GBP',
          duration,
          city: cityName,
          country: null,
          coordinates: Prisma.JsonNull,
          rating: product.reviewRating ?? product.rating ?? null,
          reviewCount: product.reviewCount ?? 0,
          primaryImageUrl,
          images: images.length > 0 ? images : Prisma.JsonNull,
          categories,
          tags: product.tags ?? [],
          supplierId,
          lastSyncedAt: new Date(),
        };

        await prisma.product.upsert({
          where: { holibobProductId: product.id },
          create: {
            holibobProductId: product.id,
            ...productData,
          },
          update: productData,
        });

        if (existingProduct) {
          productsUpdated++;
        } else {
          productsCreated++;
        }
      }
    }

    console.log(`\nProducts: ${productsCreated} created, ${productsUpdated} updated (${totalProducts} total)`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Sync Complete!');
    console.log('='.repeat(60));
    console.log(`Suppliers: ${citySuppliers.size} total (${suppliersCreated} new, ${suppliersUpdated} updated)`);
    console.log(`Products: ${totalProducts} total (${productsCreated} new, ${productsUpdated} updated)`);

    // List suppliers for microsite testing
    console.log('\nSuppliers available for microsite testing:');
    const allSuppliers = await prisma.supplier.findMany({
      orderBy: { productCount: 'desc' },
      take: 10,
      select: { id: true, slug: true, name: true, productCount: true },
    });

    for (const s of allSuppliers) {
      console.log(`  - ${s.slug} (${s.productCount} products): ${s.name}`);
    }

    console.log('\nTo create a test microsite, run:');
    console.log('  npx tsx scripts/create-test-microsite.ts <supplier-slug>');

  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
