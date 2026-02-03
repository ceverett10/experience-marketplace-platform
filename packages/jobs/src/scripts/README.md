# Bulk SEO Optimization Script

## Overview

This script performs a one-time bulk SEO optimization across all active sites in your platform. It will automatically:

- Fix missing or poorly optimized meta titles (target: 50-60 characters)
- Fix missing or poorly optimized meta descriptions (target: 150-160 characters)
- Set appropriate sitemap priorities based on page type
- Add missing structured data (Schema.org JSON-LD)
- Flag thin content for expansion (< 300 words for normal pages, < 800 for blog)

## How to Run

### Option 1: Run on Heroku (Recommended for Production)

If your platform is deployed on Heroku:

```bash
# Navigate to the jobs package
cd packages/jobs

# Run the script on Heroku
heroku run "cd packages/jobs && npx tsx src/scripts/bulk-seo-optimize.ts" --app your-app-name
```

### Option 2: Run Locally with Production Database

If you have access to the production database:

```bash
# Set the production database URL
export DATABASE_URL="your-production-database-url"

# Navigate to the jobs package
cd packages/jobs

# Run the script
npx tsx src/scripts/bulk-seo-optimize.ts
```

### Option 3: Use the Admin Dashboard

Alternatively, you can queue the optimization manually from the admin dashboard:

1. Go to Admin > Jobs
2. Click "Add Job"
3. Select job type: `SEO_AUTO_OPTIMIZE`
4. Set payload: `{ "siteId": "all", "scope": "all" }`
5. Click "Queue Job"

This will queue optimization jobs for all active sites.

## What Happens

The script will:

1. Fetch all active sites from the database
2. Queue a `SEO_AUTO_OPTIMIZE` job for each site
3. Stagger the jobs by 3 minutes each to avoid overwhelming the system
4. Display progress and summary

Jobs are processed by the `demand-generation` worker service.

## Monitoring Progress

Monitor the optimization progress:

1. **Admin Dashboard**: Navigate to Jobs > SEO Queue to see queued/running jobs
2. **Logs**: Check the demand-generation worker logs
3. **SEO Health Dashboard**: View the SEO Health dashboard to see improvements

## Expected Results

For each site, the optimization will:

- Update metadata on pages with missing/poor titles and descriptions
- Add structured data to pages missing Schema.org markup
- Set/update sitemap priorities for better search engine crawling
- Flag pages with thin content and queue up to 5 content optimization jobs

## Ongoing Optimization

After running this one-time bulk operation, all sites will continue to receive automatic SEO optimization:

- **Weekly**: Every Sunday at 6 AM (after the weekly SEO audit at 5 AM)
- **New Sites**: Automatically during site creation workflow

No further manual intervention needed!

## Troubleshooting

### Database Connection Issues

If you see "Can't reach database server" errors:

- Ensure DATABASE_URL environment variable is set correctly
- Verify the database is accessible from your current environment
- Use Option 1 (Heroku run) if running from a local machine

### Jobs Not Processing

If jobs are queued but not processing:

- Verify the demand-generation worker is running
- Check Redis is accessible and running
- Review worker logs for any errors

### Redis Connection Issues

If you see Redis connection errors:

- Ensure REDIS_URL or REDIS_TLS_URL is set correctly
- Verify Redis is running and accessible
