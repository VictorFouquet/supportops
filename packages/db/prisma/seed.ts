import { PrismaClient } from '@prisma/client';
import { seed } from '../src/seed.js';

const prisma = new PrismaClient();

seed(prisma)
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
