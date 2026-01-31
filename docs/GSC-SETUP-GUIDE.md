# Google Search Console Setup Guide

This guide walks you through setting up Google Search Console API access for the Experience Marketplace Platform's autonomous SEO monitoring and optimization features.

---

## Overview

The platform uses Google Search Console (GSC) API to:

- Fetch search performance data (impressions, clicks, CTR, position)
- Monitor keyword rankings
- Detect performance issues automatically
- Trigger content optimization jobs
- Track SEO progress over time

**Authentication Method:** Service Account (recommended for automated systems)

---

## Prerequisites

1. **Google Cloud Project** - You need a GCP project
2. **Domain Ownership** - Your site must be verified in Google Search Console
3. **API Access** - Service account with appropriate permissions

---

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Create Project"** or select an existing project
3. Note your **Project ID** (you'll need this later)

---

## Step 2: Enable Google Search Console API

1. In your GCP project, go to **APIs & Services** > **Library**
2. Search for **"Google Search Console API"**
3. Click on it and click **"Enable"**

---

## Step 3: Create a Service Account

1. Go to **IAM & Admin** > **Service Accounts**
2. Click **"Create Service Account"**
3. Enter details:
   - **Name:** `experience-marketplace-gsc`
   - **Description:** "Service account for GSC API access"
4. Click **"Create and Continue"**
5. **Grant this service account access:** (Optional for now)
6. Click **"Done"**

---

## Step 4: Create Service Account Key

1. Find your new service account in the list
2. Click on it to open details
3. Go to the **"Keys"** tab
4. Click **"Add Key"** > **"Create new key"**
5. Select **JSON** format
6. Click **"Create"** - a JSON file will download

**⚠️ Important:** Keep this file secure! It contains private credentials.

---

## Step 5: Add Service Account to Google Search Console

This is the crucial step that grants your service account access to your site's data.

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Select your property (site)
3. Click **Settings** (gear icon) in the left sidebar
4. Click **"Users and permissions"**
5. Click **"Add user"**
6. Enter the service account email (found in the JSON file as `client_email`)
   - Format: `experience-marketplace-gsc@project-id.iam.gserviceaccount.com`
7. Select permission level: **"Full"** (required for API access)
8. Click **"Add"**

**Repeat this step for each site/property you want to monitor.**

---

## Step 6: Configure Environment Variables

Open the downloaded JSON key file and extract the values:

```json
{
  "type": "service_account",
  "project_id": "your-project-id",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
  "client_email": "experience-marketplace-gsc@your-project-id.iam.gserviceaccount.com",
  "client_id": "...",
  "auth_uri": "...",
  "token_uri": "...",
  "auth_provider_x509_cert_url": "...",
  "client_x509_cert_url": "..."
}
```

Add these to your `.env` file:

```bash
# Google Search Console (Service Account)
GSC_CLIENT_EMAIL=experience-marketplace-gsc@your-project-id.iam.gserviceaccount.com
GSC_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYour actual private key here\n-----END PRIVATE KEY-----\n"
GSC_PROJECT_ID=your-project-id
```

**Important Notes:**

- The private key must include the `\n` characters (they represent newlines)
- Wrap the entire private key in quotes
- Do NOT commit this to version control

---

## Step 7: Verify Site Ownership in GSC

Make sure your domain is verified in Google Search Console:

1. Go to [Google Search Console](https://search.google.com/search-console)
2. If your site isn't listed, click **"Add property"**
3. Choose verification method:
   - **Domain property** (recommended): `sc-domain:example.com`
   - **URL prefix**: `https://example.com`
4. Follow verification steps (DNS record, HTML file upload, etc.)
5. Wait for verification (can take 24-48 hours for DNS)

---

## Step 8: Test the Integration

After configuration, test the GSC integration:

### Option 1: Using the Worker Service

```bash
# Start the demand-generation worker
npm run dev --workspace=@experience-marketplace/demand-generation
```

The worker will attempt to sync GSC data every 6 hours automatically.

### Option 2: Manual Test (via code)

```typescript
import { getGSCClient, isGSCConfigured } from '@experience-marketplace/jobs';

// Check if GSC is configured
if (isGSCConfigured()) {
  const gscClient = getGSCClient();

  // List sites
  const sites = await gscClient.listSites();
  console.log('Sites:', sites);

  // Query analytics for a site
  const data = await gscClient.querySearchAnalytics({
    siteUrl: 'https://your-site.com',
    startDate: '2026-01-24',
    endDate: '2026-01-31',
    dimensions: ['query', 'page'],
  });

  console.log('Metrics:', data.rows.length);
} else {
  console.log('GSC not configured');
}
```

### Option 3: Trigger Manual Sync Job

```typescript
import { addJob } from '@experience-marketplace/jobs';

// Queue a GSC sync job
await addJob('GSC_SYNC', {
  siteId: 'your-site-id',
  startDate: '2026-01-24',
  endDate: '2026-01-31',
  dimensions: ['query', 'page', 'country', 'device'],
});
```

---

## Troubleshooting

### Error: "The caller does not have permission"

**Cause:** Service account not added to GSC property

**Solution:**

1. Verify you added the service account email to GSC (Step 5)
2. Make sure you selected "Full" permissions
3. Wait 10-15 minutes for permissions to propagate

---

### Error: "Invalid JWT Signature"

**Cause:** Incorrect private key format

**Solution:**

1. Ensure the private key includes `\n` characters: `"-----BEGIN PRIVATE KEY-----\n..."`
2. Wrap the entire key in quotes in your `.env` file
3. Don't manually edit the key - copy it exactly from the JSON file

---

### Error: "Site not found"

**Cause:** Site not verified in GSC or incorrect URL format

**Solution:**

1. Verify the site exists in your GSC account
2. Use the exact format shown in GSC:
   - Domain property: `sc-domain:example.com`
   - URL prefix: `https://example.com` (include https://)

---

### No Data Returned

**Cause:** Site is too new or not indexed yet

**Solution:**

1. Check if your site has data in GSC dashboard
2. GSC data has a 2-3 day delay
3. New sites may not have data for 7-14 days

---

## GSC API Limits

Be aware of Google Search Console API quotas:

- **Queries per day:** 1,200
- **Queries per 100 seconds:** 200
- **Rows per query:** 25,000 (max)

Our scheduled job runs every 6 hours = **4 queries/day per site**

For 10 sites: 40 queries/day (well within limits)

---

## Security Best Practices

1. **Never commit credentials**
   - Add `.env` to `.gitignore`
   - Use environment variables in production

2. **Rotate keys periodically**
   - Create a new key every 90 days
   - Delete old keys after rotation

3. **Use least privilege**
   - Only grant "Full" permission (required for API)
   - Don't grant the service account owner/editor on the GCP project

4. **Secure the JSON key file**
   - Store it securely (e.g., 1Password, AWS Secrets Manager)
   - Delete from local machine after extracting values

---

## What Gets Synced

The GSC integration automatically syncs:

- **Search queries** - Keywords users searched for
- **Page URLs** - Which pages appeared in search results
- **Countries** - Geographic location of searches
- **Devices** - Desktop, mobile, tablet
- **Metrics:**
  - Impressions (how many times site appeared in search)
  - Clicks (how many times users clicked)
  - CTR (Click-through rate in %)
  - Position (Average ranking position 1-100)

**Data is stored in:** `PerformanceMetric` table in the database

**Sync frequency:** Every 6 hours (configurable in schedulers)

---

## Autonomous Actions Triggered

Once GSC data is syncing, the platform automatically:

1. **Detects Low CTR** (< 2% for positions 1-10)
   - Triggers content optimization job
   - Rewrites title and meta description

2. **Detects Position Drops** (> 5 positions in 7 days)
   - Triggers content refresh job
   - Adds 500+ words of content

3. **Identifies New Opportunities**
   - High impression, low click keywords
   - Creates new content targeting those keywords

---

## Monitoring GSC Sync

Check sync status in the logs:

```bash
# View worker logs
npm run dev --workspace=@experience-marketplace/demand-generation

# Look for:
[GSC Sync] Starting sync for site site_123
[GSC] Fetching data for https://example.com from 2026-01-24 to 2026-01-31
[GSC] Fetched 1,245 metrics from GSC API
[GSC Sync] Success! Synced 1,245 metrics for site site_123
```

---

## Next Steps

After GSC is set up:

1. ✅ **Verify data is syncing** - Check database or logs
2. ✅ **Monitor performance issues** - Check if optimization jobs are triggered
3. ✅ **Review opportunities** - Check SEOOpportunity table for new keywords
4. 📊 **Build admin dashboard** - Visualize GSC data (Phase 3)

---

## Support & Resources

- [Google Search Console API Docs](https://developers.google.com/webmaster-tools/search-console-api-original/v3/)
- [Service Account Authentication](https://cloud.google.com/iam/docs/service-accounts)
- [GSC API Quotas](https://developers.google.com/webmaster-tools/limits)

---

**Last Updated:** January 31, 2026
