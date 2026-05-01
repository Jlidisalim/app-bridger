/**
 * One-off script — adds (or updates) a fake verified user.
 *
 *   cd backend && npx tsx prisma/add-fake-user.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const prisma = new PrismaClient();

const FAKE_USER = {
  phone: '+335393520011',
  name: 'Amal Waili',
};

async function main() {
  const user = await prisma.user.upsert({
    where: { phone: FAKE_USER.phone },
    update: {
      name: FAKE_USER.name,
      verified: true,
      faceVerificationStatus: 'VERIFIED',
      faceVerifiedAt: new Date(),
      kycStatus: 'APPROVED',
    },
    create: {
      phone: FAKE_USER.phone,
      name: FAKE_USER.name,
      verified: true,
      faceVerificationStatus: 'VERIFIED',
      faceVerifiedAt: new Date(),
      kycStatus: 'APPROVED',
    },
  });

  console.log(`✓ User ready — id: ${user.id}`);
  console.log(`  phone:    ${user.phone}`);
  console.log(`  name:     ${user.name}`);
  console.log(`  verified: ${user.verified}`);
  console.log(`  kyc:      ${user.kycStatus}`);
  console.log(`  face:     ${user.faceVerificationStatus}`);
}

main()
  .catch((err) => { console.error('Failed:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
