#!/usr/bin/env node
/**
 * Cache Homepage Images to R2
 *
 * Downloads hero and category images from Unsplash and caches them to R2
 * for all active sites that currently have Unsplash URLs.
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// R2 upload function (inline to avoid module issues)
async function uploadToR2(buffer, key, contentType) {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error('R2 configuration incomplete');
  }

  const crypto = require('crypto');
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const url = new URL(`/${bucketName}/${key}`, endpoint);

  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const headers = {
    host: url.host,
    'content-type': contentType,
    'content-length': buffer.length.toString(),
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  const sortedHeaderKeys = Object.keys(headers).sort();
  const canonicalHeaders = sortedHeaderKeys.map(k => `${k.toLowerCase()}:${headers[k]}`).join('\n') + '\n';
  const signedHeadersList = sortedHeaderKeys.map(k => k.toLowerCase()).join(';');

  const canonicalRequest = [
    'PUT',
    url.pathname,
    '',
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join('\n');

  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  const getSignatureKey = (key, date, regionName, serviceName) => {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    return crypto.createHmac('sha256', kService).update('aws4_request').digest();
  };

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const authorization = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;

  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      ...headers,
      Authorization: authorization,
    },
    body: buffer,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`R2 upload failed: ${response.status} - ${errorBody}`);
  }

  console.log(`[R2] Uploaded ${key} (${buffer.length} bytes)`);

  if (publicUrl) {
    return `${publicUrl}/${key}`;
  }
  return `https://pub-${accountId}.r2.dev/${key}`;
}

// Download and cache image to R2
async function cacheImageToR2(imageUrl, cacheKey, width, quality) {
  try {
    const url = new URL(imageUrl);
    url.searchParams.set('w', width.toString());
    url.searchParams.set('q', quality.toString());
    url.searchParams.set('fm', 'jpg');
    url.searchParams.set('auto', 'format');
    url.searchParams.set('fit', 'crop');

    console.log(`  Downloading: ${cacheKey}`);

    const response = await fetch(url.toString());
    if (!response.ok) {
      console.error(`  Failed to download: ${response.status}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') || 'image/jpeg';

    const r2Key = `images/${cacheKey}.jpg`;
    const r2Url = await uploadToR2(buffer, r2Key, contentType);

    console.log(`  Cached: ${r2Url} (${Math.round(buffer.length / 1024)}KB)`);
    return r2Url;
  } catch (error) {
    console.error(`  Error caching image:`, error.message);
    return null;
  }
}

function isUnsplashUrl(url) {
  return url && (url.includes('images.unsplash.com') || url.includes('unsplash.com/photos'));
}

function generateCacheKey(type, identifier) {
  const sanitized = identifier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
  return `${type}-${sanitized}-${Date.now()}`;
}

async function main() {
  console.log('=== Cache Homepage Images to R2 ===\n');

  // Check R2 config
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID) {
    console.error('ERROR: R2 environment variables not configured');
    process.exit(1);
  }

  // Get all active sites
  const sites = await prisma.site.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      homepageConfig: true,
    },
  });

  console.log(`Found ${sites.length} active sites\n`);

  let totalCached = 0;

  for (const site of sites) {
    console.log(`\n[${site.name}]`);

    const config = site.homepageConfig;
    if (!config) {
      console.log('  No homepage config, skipping');
      continue;
    }

    let updated = false;
    const updatedConfig = { ...config };

    // Cache hero image
    if (config.hero?.backgroundImage && isUnsplashUrl(config.hero.backgroundImage)) {
      console.log('  Hero image needs caching...');
      const cacheKey = generateCacheKey('hero', site.name);
      const cachedUrl = await cacheImageToR2(config.hero.backgroundImage, cacheKey, 1920, 80);
      if (cachedUrl) {
        updatedConfig.hero = { ...config.hero, backgroundImage: cachedUrl };
        updated = true;
        totalCached++;
      }
    } else if (config.hero?.backgroundImage) {
      console.log('  Hero image already cached or not Unsplash');
    }

    // Cache category images
    if (config.categories && Array.isArray(config.categories)) {
      const updatedCategories = [];
      for (const cat of config.categories) {
        if (cat.imageUrl && isUnsplashUrl(cat.imageUrl)) {
          console.log(`  Category "${cat.name}" needs caching...`);
          const cacheKey = generateCacheKey('category', cat.name);
          const cachedUrl = await cacheImageToR2(cat.imageUrl, cacheKey, 800, 75);
          if (cachedUrl) {
            updatedCategories.push({ ...cat, imageUrl: cachedUrl });
            updated = true;
            totalCached++;
          } else {
            updatedCategories.push(cat);
          }
        } else {
          updatedCategories.push(cat);
        }
      }
      updatedConfig.categories = updatedCategories;
    }

    // Save updated config
    if (updated) {
      await prisma.site.update({
        where: { id: site.id },
        data: { homepageConfig: updatedConfig },
      });
      console.log('  ✓ Config updated');
    } else {
      console.log('  No updates needed');
    }

    // Small delay between sites
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n=== Done! Cached ${totalCached} images ===`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
