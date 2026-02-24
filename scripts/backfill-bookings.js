/**
 * Backfill script: Insert the 2 confirmed Holibob bookings that failed to save
 * due to the microsite FK constraint bug and subsequent silent save failures.
 *
 * Run on production:
 *   cat scripts/backfill-bookings.js | heroku run --app holibob-experiences-demand-gen --no-tty -- \
 *     node -e "process.stdin.resume(); let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{require('vm').runInThisContext(d)})"
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const bookings = [
  {
    holibobBookingId: '00a95d53-a912-4c49-8da7-63487dc32fb2',
    holibobBasketId: '88FA57',
    status: 'CONFIRMED',
    totalAmount: 152.03,
    currency: 'GBP',
    commissionAmount: 152.03 - 128.27, // 23.76
    commissionRate: ((152.03 - 128.27) / 152.03) * 100, // ~15.63%
    micrositeId: 'cmlm2ykhm01u1ow7c6zf9yerb', // FH Tourism microsite
    siteId: null,
    createdAt: new Date('2026-02-20T12:19:36.726Z'), // From funnel event
  },
  {
    holibobBookingId: '9e813955-4a4d-406b-a5e4-b3627e004ea3',
    holibobBasketId: 'F4E78D',
    status: 'CONFIRMED',
    totalAmount: 184.0,
    currency: 'GBP',
    commissionAmount: 184.0 - 146.02, // 37.98
    commissionRate: ((184.0 - 146.02) / 184.0) * 100, // ~20.64%
    micrositeId: 'cmli9o5qr00dtv10kllwwq2xl', // JRT Group microsite
    siteId: null,
    createdAt: new Date('2026-02-23T16:31:13.593Z'), // From funnel event
  },
];

async function main() {
  for (const b of bookings) {
    try {
      const result = await p.booking.upsert({
        where: { holibobBookingId: b.holibobBookingId },
        create: b,
        update: {
          status: b.status,
          totalAmount: b.totalAmount,
          commissionAmount: b.commissionAmount,
          commissionRate: b.commissionRate,
        },
      });
      console.log(`OK: ${b.holibobBookingId} -> id=${result.id}, status=${result.status}`);
    } catch (e) {
      console.error(`FAIL: ${b.holibobBookingId} -> ${e.message}`);
    }
  }

  const count = await p.booking.count();
  console.log(`Total bookings in table: ${count}`);

  await p.$disconnect();
}

main().catch((e) => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
