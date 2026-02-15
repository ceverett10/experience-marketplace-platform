/**
 * Seed script for initial admin user
 * Usage: npx ts-node packages/database/prisma/seed-admin.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const email = 'craig@holibob.tech';

  // Check if user already exists
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists (id: ${existing.id})`);
    return;
  }

  // Generate a random temporary password
  const tempPassword = randomBytes(12).toString('base64url').slice(0, 16);
  const passwordHash = await bcrypt.hash(tempPassword, 12);

  const user = await prisma.adminUser.create({
    data: {
      email,
      passwordHash,
      name: 'Craig',
      role: 'SUPER_ADMIN',
    },
  });

  console.log('');
  console.log('='.repeat(50));
  console.log('  Admin user created successfully');
  console.log('='.repeat(50));
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${tempPassword}`);
  console.log(`  Role:     SUPER_ADMIN`);
  console.log(`  ID:       ${user.id}`);
  console.log('='.repeat(50));
  console.log('  Please change this password after first login.');
  console.log('='.repeat(50));
  console.log('');
}

main()
  .catch((e) => {
    console.error('Failed to seed admin user:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
