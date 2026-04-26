/**
 * Prisma seed — creates (or promotes) admin accounts.
 * Safe to re-run — uses upsert so it never duplicates records.
 *
 *   cd backend && npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

// All authorised admin phone numbers (E.164 format)
const ADMIN_PHONES: { phone: string; name: string }[] = [
  { phone: '+21626901747', name: 'Admin 1' },
  { phone: '+21653935200', name: 'Admin 2' },
];

async function main() {
  console.log(`Seeding ${ADMIN_PHONES.length} admin account(s)…\n`);

  for (const { phone, name } of ADMIN_PHONES) {
    const admin = await prisma.user.upsert({
      where:  { phone },
      update: { isAdmin: true, verified: true },
      create: { phone, name, isAdmin: true, verified: true },
    });
    console.log(`✓  ${admin.phone}  (id: ${admin.id})`);
  }

  console.log('\nAll admin accounts ready. Log in at the Espace Admin dashboard.');
}

main()
  .catch((err) => { console.error('Seed failed:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
