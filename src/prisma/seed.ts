import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting seed...');

  // Hash passwords
  const hashedPassword = await bcrypt.hash('123', 10);

  // Create admin user
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      role: 'ADMIN',
      status: 'NORMAL',
    },
  });

  console.log('✅ Created/Updated admin user:', admin.username);

  // Create staff user
  const staff = await prisma.user.upsert({
    where: { username: 'staff_nguyena' },
    update: {},
    create: {
      username: 'staff_nguyena',
      password: hashedPassword,
      role: 'USER',
      status: 'NORMAL',
    },
  });

  console.log('✅ Created/Updated staff user:', staff.username);

  console.log('Seed completed successfully! 🌱');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
