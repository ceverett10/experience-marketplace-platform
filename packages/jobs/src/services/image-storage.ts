/**
 * Image Storage Service
 *
 * Handles uploading and managing images in Cloudflare R2 (S3-compatible).
 * Used for logos, generated images, and other brand assets.
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string; // Optional custom domain for public access
}

function getR2Config(): R2Config {
  const accountId = process.env['R2_ACCOUNT_ID'];
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const bucketName = process.env['R2_BUCKET_NAME'];
  const publicUrl = process.env['R2_PUBLIC_URL'];

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    throw new Error(
      'R2 configuration incomplete. Required: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME'
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

/**
 * Generate AWS Signature V4 for S3-compatible APIs
 */
function createSignatureV4(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: Buffer | null,
  config: R2Config
): Record<string, string> {
  const crypto = require('crypto') as typeof import('crypto');

  const region = 'auto';
  const service = 's3';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Canonical request components
  const canonicalUri = url.pathname;
  const canonicalQueryString = url.search.substring(1);

  // Hash the payload
  const payloadHash = crypto
    .createHash('sha256')
    .update(body || '')
    .digest('hex');

  // Build headers to sign
  const signedHeaders: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...headers,
  };

  const sortedHeaderKeys = Object.keys(signedHeaders).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k.toLowerCase()}:${signedHeaders[k]}`).join('\n') + '\n';
  const signedHeadersList = sortedHeaderKeys.map((k) => k.toLowerCase()).join(';');

  // Create canonical request
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeadersList,
    payloadHash,
  ].join('\n');

  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  // Create string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  // Calculate signature
  const getSignatureKey = (key: string, date: string, regionName: string, serviceName: string) => {
    const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(date).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  };

  const signingKey = getSignatureKey(config.secretAccessKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  // Build authorization header
  const authorization = `${algorithm} Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersList}, Signature=${signature}`;

  return {
    Authorization: authorization,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
}

/**
 * Upload a file to Cloudflare R2
 * @returns Public URL of the uploaded file
 */
export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  const config = getR2Config();

  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const url = new URL(`/${config.bucketName}/${key}`, endpoint);

  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': buffer.length.toString(),
  };

  const authHeaders = createSignatureV4('PUT', url, headers, buffer, config);

  const response = await fetch(url.toString(), {
    method: 'PUT',
    headers: { ...headers, ...authHeaders },
    body: buffer,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[R2] Upload failed: ${response.status} ${errorBody}`);
    throw new Error(`R2 upload failed: ${response.status}`);
  }

  console.log(`[R2] Uploaded ${key} (${buffer.length} bytes)`);

  // Return public URL
  if (config.publicUrl) {
    return `${config.publicUrl}/${key}`;
  }

  // Default R2 public URL format (requires bucket to be public)
  return `https://pub-${config.accountId}.r2.dev/${key}`;
}

/**
 * Delete a file from Cloudflare R2
 */
export async function deleteFromR2(fileUrl: string): Promise<void> {
  const config = getR2Config();

  // Extract key from URL
  let key: string;
  if (fileUrl.includes('.r2.dev/')) {
    key = fileUrl.split('.r2.dev/')[1] || '';
  } else if (fileUrl.includes('.r2.cloudflarestorage.com/')) {
    const parts = fileUrl.split('.r2.cloudflarestorage.com/')[1] || '';
    // Remove bucket name prefix if present
    key = parts.replace(`${config.bucketName}/`, '');
  } else if (config.publicUrl && fileUrl.startsWith(config.publicUrl)) {
    key = fileUrl.replace(`${config.publicUrl}/`, '');
  } else {
    console.warn(`[R2] Cannot parse key from URL: ${fileUrl}`);
    return;
  }

  if (!key) {
    console.warn(`[R2] Empty key, skipping delete`);
    return;
  }

  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const url = new URL(`/${config.bucketName}/${key}`, endpoint);

  const authHeaders = createSignatureV4('DELETE', url, {}, null, config);

  const response = await fetch(url.toString(), {
    method: 'DELETE',
    headers: authHeaders,
  });

  if (!response.ok && response.status !== 404) {
    const errorBody = await response.text();
    console.error(`[R2] Delete failed: ${response.status} ${errorBody}`);
    throw new Error(`R2 delete failed: ${response.status}`);
  }

  console.log(`[R2] Deleted ${key}`);
}

/**
 * Check if a file exists in R2
 */
export async function existsInR2(key: string): Promise<boolean> {
  const config = getR2Config();

  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const url = new URL(`/${config.bucketName}/${key}`, endpoint);

  const authHeaders = createSignatureV4('HEAD', url, {}, null, config);

  const response = await fetch(url.toString(), {
    method: 'HEAD',
    headers: authHeaders,
  });

  return response.ok;
}

/**
 * Check if R2 storage is configured
 */
export function isR2Configured(): boolean {
  return !!(
    process.env['R2_ACCOUNT_ID'] &&
    process.env['R2_ACCESS_KEY_ID'] &&
    process.env['R2_SECRET_ACCESS_KEY'] &&
    process.env['R2_BUCKET_NAME']
  );
}
