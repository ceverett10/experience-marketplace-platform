#!/usr/bin/env npx tsx
/**
 * Manually trigger the microsite blog fanout outside of the 4 AM scheduler.
 * Useful for testing and for catching up after the scheduler was paused.
 *
 * Usage:
 *   npx tsx packages/jobs/src/scripts/run-blog-fanout.ts
 */

import { generateDailyBlogPostsForMicrosites } from '../services/microsite-blog-generator.js';

console.info('='.repeat(60));
console.info('Manual Blog Fanout — Supplier Microsites');
console.info(new Date().toISOString());
console.info('='.repeat(60));

const summary = await generateDailyBlogPostsForMicrosites();

console.info('='.repeat(60));
console.info(`Eligible microsites : ${summary.totalMicrosites}`);
console.info(`Processed           : ${summary.processedCount}`);
console.info(`Jobs queued         : ${summary.postsQueued}`);
console.info(`Skipped             : ${summary.skipped}`);
console.info(`Errors              : ${summary.errors}`);
console.info(`Duration            : ${(summary.durationMs / 1000).toFixed(1)}s`);
console.info('='.repeat(60));

process.exit(0);
