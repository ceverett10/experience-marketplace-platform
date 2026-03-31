/**
 * One-off: Generate FAQ pages for 500 supplier microsites.
 * DELETE THIS SCRIPT after use.
 */
const { generateFAQsForMicrosites } = await import(
  '../packages/jobs/src/services/microsite-faq-generator.ts'
);

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is required');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ERROR: ANTHROPIC_API_KEY is required');
    process.exit(1);
  }

  console.info('Starting FAQ generation for 500 supplier microsites...\n');

  const { results, summary } = await generateFAQsForMicrosites(500);

  console.info('\n=== SUMMARY ===');
  console.info(`  Total: ${summary.total}`);
  console.info(`  Generated: ${summary.generated}`);
  console.info(`  Skipped: ${summary.skipped}`);
  console.info(`  Errors: ${summary.errors}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
