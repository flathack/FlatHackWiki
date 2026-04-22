import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BCRYPT_ROUNDS = 12;

function env(name: string) {
  return process.env[name]?.trim() || '';
}

async function ensureAdmin() {
  const email = env('ADMIN_EMAIL').toLowerCase();
  const password = env('ADMIN_PASSWORD');
  const name = env('ADMIN_NAME') || 'FlatHacksWiki Admin';
  const resetPassword = env('ADMIN_RESET_PASSWORD') === 'true';

  if (!email || !password) {
    console.log('[BOOTSTRAP] ADMIN_EMAIL / ADMIN_PASSWORD nicht gesetzt. Admin-Bootstrap wird übersprungen.');
    return;
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD muss mindestens 8 Zeichen haben.');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const existingUser = await prisma.user.findUnique({
    where: { email },
    include: {
      profile: true,
      roleAssignments: true,
    },
  });

  if (!existingUser) {
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        status: 'ACTIVE',
        emailVerified: true,
        profile: {
          create: {
            displayName: name,
            timezone: 'Europe/Berlin',
            locale: 'de',
            dashboardSubtitle:
              'Baue dir eine persönliche Startseite für das Wiki mit Widgets, Lesezeichen, favorisierten Bereichen und Notizen.',
            showDashboardSubtitle: true,
          },
        },
        roleAssignments: {
          create: {
            roleName: 'SUPER_ADMIN',
            scopeType: 'GLOBAL',
            principalType: 'user',
          },
        },
      },
    });

    console.log(`[BOOTSTRAP] Super-Admin wurde angelegt: ${user.email}`);
    return;
  }

  const hasSuperAdminRole = existingUser.roleAssignments.some(
    (assignment) => assignment.roleName === 'SUPER_ADMIN' && assignment.scopeType === 'GLOBAL'
  );

  await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      name,
      status: 'ACTIVE',
      emailVerified: true,
      ...(resetPassword ? { passwordHash } : {}),
      profile: {
        upsert: {
          create: {
            displayName: name,
            timezone: 'Europe/Berlin',
            locale: 'de',
            dashboardSubtitle:
              'Baue dir eine persönliche Startseite für das Wiki mit Widgets, Lesezeichen, favorisierten Bereichen und Notizen.',
            showDashboardSubtitle: true,
          },
          update: {
            displayName: name,
          },
        },
      },
      ...(!hasSuperAdminRole
        ? {
            roleAssignments: {
              create: {
                roleName: 'SUPER_ADMIN',
                scopeType: 'GLOBAL',
                principalType: 'user',
              },
            },
          }
        : {}),
    },
  });

  console.log(
    `[BOOTSTRAP] Bestehender Benutzer als Super-Admin sichergestellt: ${existingUser.email}${
      resetPassword ? ' (Passwort aktualisiert)' : ''
    }`
  );
}

ensureAdmin()
  .catch((error) => {
    console.error('[BOOTSTRAP] Fehler beim Admin-Bootstrap:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
