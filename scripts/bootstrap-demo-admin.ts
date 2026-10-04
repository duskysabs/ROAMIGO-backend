import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import {
  AccountStatus,
  EmploymentStatus,
  UserRole,
} from '../src/generated/prisma/enums.js';

const requiredEnvironment = [
  'DEMO_ADMIN_USER_ID',
  'DEMO_ADMIN_FIRST_NAME',
  'DEMO_ADMIN_LAST_NAME',
] as const;

function readRequiredEnvironment(name: (typeof requiredEnvironment)[number]) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

async function bootstrapDemoAdmin() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo admin bootstrap cannot run in production');
  }

  if (process.env.ALLOW_DEMO_ADMIN_BOOTSTRAP !== 'true') {
    throw new Error('ALLOW_DEMO_ADMIN_BOOTSTRAP must be set to true');
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const [userId, firstName, lastName] = requiredEnvironment.map(
    readRequiredEnvironment,
  );
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });

  try {
    const existingAdmin = await prisma.userProfile.findFirst({
      where: { role: UserRole.ADMIN },
      select: { userId: true },
    });

    if (existingAdmin && existingAdmin.userId !== userId) {
      throw new Error(
        'A different Administrator profile already exists in this environment',
      );
    }

    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        firstName,
        lastName,
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        staff: {
          create: {
            employmentStatus: EmploymentStatus.ACTIVE,
          },
        },
      },
      update: {
        firstName,
        lastName,
        role: UserRole.ADMIN,
        accountStatus: AccountStatus.ACTIVE,
        staff: {
          upsert: {
            create: {
              employmentStatus: EmploymentStatus.ACTIVE,
            },
            update: {
              employmentStatus: EmploymentStatus.ACTIVE,
            },
          },
        },
      },
    });

    console.log(`Demo Administrator profile is ready for user ${userId}`);
  } finally {
    await prisma.$disconnect();
  }
}

bootstrapDemoAdmin().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  console.error(`Demo Administrator bootstrap failed: ${message}`);
  process.exitCode = 1;
});
