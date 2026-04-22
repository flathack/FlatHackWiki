import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('[SEED] Starting database seed...');

  // Clean existing data
  await prisma.auditLog.deleteMany();
  await prisma.attachmentVersion.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.pageRestriction.deleteMany();
  await prisma.pageVersion.deleteMany();
  await prisma.page.deleteMany();
  await prisma.spaceInvite.deleteMany();
  await prisma.spaceMember.deleteMany();
  await prisma.space.deleteMany();
  await prisma.userSession.deleteMany();
  await prisma.roleAssignment.deleteMany();
  await prisma.userProfile.deleteMany();
  await prisma.user.deleteMany();

  console.log('[SEED] Cleaned existing data');

  // Create users
  const passwordHash = await bcrypt.hash('Password123', 12);

  const superAdmin = await prisma.user.create({
    data: {
      email: 'admin@openclaw.wiki',
      passwordHash,
      name: 'System Administrator',
      status: 'ACTIVE',
      emailVerified: true,
      profile: {
        create: {
          displayName: 'Admin',
          timezone: 'UTC',
          locale: 'en',
        },
      },
    },
  });

  const spaceAdmin = await prisma.user.create({
    data: {
      email: 'sarah.chen@openclaw.wiki',
      passwordHash,
      name: 'Sarah Chen',
      status: 'ACTIVE',
      emailVerified: true,
      profile: {
        create: {
          displayName: 'Sarah Chen',
          timezone: 'America/New_York',
          locale: 'en',
        },
      },
    },
  });

  const editor = await prisma.user.create({
    data: {
      email: 'marcus.johnson@openclaw.wiki',
      passwordHash,
      name: 'Marcus Johnson',
      status: 'ACTIVE',
      emailVerified: true,
      profile: {
        create: {
          displayName: 'Marcus J.',
          timezone: 'Europe/London',
          locale: 'en',
        },
      },
    },
  });

  const author = await prisma.user.create({
    data: {
      email: 'elena.rodriguez@openclaw.wiki',
      passwordHash,
      name: 'Elena Rodriguez',
      status: 'ACTIVE',
      emailVerified: true,
      profile: {
        create: {
          displayName: 'Elena R.',
          timezone: 'Europe/Madrid',
          locale: 'es',
        },
      },
    },
  });

  const viewer = await prisma.user.create({
    data: {
      email: 'alex.thompson@openclaw.wiki',
      passwordHash,
      name: 'Alex Thompson',
      status: 'ACTIVE',
      emailVerified: true,
      profile: {
        create: {
          displayName: 'Alex T.',
          timezone: 'Australia/Sydney',
          locale: 'en',
        },
      },
    },
  });

  console.log('[SEED] Created 5 users');

  // Assign global roles
  await prisma.roleAssignment.create({
    data: {
      roleName: 'SUPER_ADMIN',
      scopeType: 'GLOBAL',
      principalType: 'user',
      principalId: superAdmin.id,
    },
  });

  await prisma.roleAssignment.create({
    data: {
      roleName: 'SYSTEM_ADMIN',
      scopeType: 'GLOBAL',
      principalType: 'user',
      principalId: spaceAdmin.id,
    },
  });

  console.log('[SEED] Assigned global roles');

  // Create Spaces
  const engineeringSpace = await prisma.space.create({
    data: {
      name: 'Engineering Wiki',
      key: 'eng',
      description: 'Technical documentation, architecture decisions, and development guides for the engineering team.',
      visibility: 'PRIVATE',
      ownerId: superAdmin.id,
    },
  });

  const productSpace = await prisma.space.create({
    data: {
      name: 'Product Documentation',
      key: 'product',
      description: 'Product requirements, roadmaps, user research, and feature specifications.',
      visibility: 'PRIVATE',
      ownerId: spaceAdmin.id,
    },
  });

  const companySpace = await prisma.space.create({
    data: {
      name: 'Company Handbook',
      key: 'company',
      description: 'Company policies, onboarding guides, and HR information for all employees.',
      visibility: 'PUBLIC',
      ownerId: superAdmin.id,
    },
  });

  console.log('[SEED] Created 3 spaces');

  // Add space members
  await prisma.spaceMember.createMany({
    data: [
      { spaceId: engineeringSpace.id, userId: spaceAdmin.id, role: 'SPACE_ADMIN', addedById: superAdmin.id },
      { spaceId: engineeringSpace.id, userId: editor.id, role: 'EDITOR', addedById: superAdmin.id },
      { spaceId: engineeringSpace.id, userId: author.id, role: 'AUTHOR', addedById: superAdmin.id },
      { spaceId: engineeringSpace.id, userId: viewer.id, role: 'VIEWER', addedById: superAdmin.id },
      { spaceId: productSpace.id, userId: spaceAdmin.id, role: 'SPACE_ADMIN', addedById: spaceAdmin.id },
      { spaceId: productSpace.id, userId: editor.id, role: 'EDITOR', addedById: spaceAdmin.id },
    ],
  });

  console.log('[SEED] Added space members');

  // Create Pages for Engineering Wiki
  const gettingStarted = await prisma.page.create({
    data: {
      spaceId: engineeringSpace.id,
      title: 'Getting Started',
      slug: 'getting-started',
      content: `# Getting Started with Development

Welcome to the Engineering Wiki! This guide will help you set up your development environment.

## Prerequisites

- Node.js 20+
- Docker Desktop
- Git
- VS Code (recommended)

## Quick Start

\`\`\`bash
# Clone the repository
git clone https://github.com/openclaw/wiki.git

# Install dependencies
npm install

# Start development server
npm run dev
\`\`\`

## Next Steps

1. Read the [Architecture Overview](/eng/architecture)
2. Set up your [Local Environment](/eng/local-setup)
3. Review the [Coding Standards](/eng/coding-standards)
`,
      status: 'PUBLISHED',
      createdById: superAdmin.id,
    },
  });

  const architecture = await prisma.page.create({
    data: {
      spaceId: engineeringSpace.id,
      title: 'Architecture Overview',
      slug: 'architecture',
      content: `# Architecture Overview

## System Design

The OpenClaw Wiki is built with a modern, scalable architecture.

### Frontend
- React 18 with TypeScript
- Vite for build tooling
- TailwindCSS for styling

### Backend
- Node.js with Express
- PostgreSQL for data
- Prisma ORM

### Infrastructure
- Docker containers
- PostgreSQL database
- S3-compatible storage

## Key Components

1. **API Gateway** - Routes requests to appropriate services
2. **Auth Service** - Handles JWT authentication
3. **Content Service** - Manages wiki pages and versions
4. **Search Service** - Full-text search capabilities
`,
      status: 'PUBLISHED',
      createdById: superAdmin.id,
    },
  });

  const codingStandards = await prisma.page.create({
    data: {
      spaceId: engineeringSpace.id,
      title: 'Coding Standards',
      slug: 'coding-standards',
      content: `# Coding Standards

## TypeScript Guidelines

### Naming Conventions
- Use PascalCase for types and classes
- Use camelCase for variables and functions
- Use UPPER_SNAKE_CASE for constants

### Type Safety
- Always use explicit types for function parameters and return values
- Avoid \`any\` type - use \`unknown\` when type is truly unknown
- Use strict TypeScript configuration

## Code Style
- 2 spaces for indentation
- Single quotes for strings
- No trailing commas
- Semicolons required

## Git Workflow
1. Create feature branch from \`main\`
2. Make commits with clear messages
3. Submit pull request for review
4. Squash and merge after approval
`,
      status: 'PUBLISHED',
      createdById: editor.id,
    },
  });

  // Create subpage
  await prisma.page.create({
    data: {
      spaceId: engineeringSpace.id,
      parentId: gettingStarted.id,
      title: 'Local Environment Setup',
      slug: 'local-setup',
      content: `# Local Environment Setup

## Detailed Setup Instructions

### 1. Database Setup

\`\`\`bash
# Start PostgreSQL with Docker
docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=secret postgres:15
\`\`\`

### 2. Environment Variables

Create a \`.env\` file:

\`\`\`
DATABASE_URL="postgresql://postgres:secret@localhost:5432/wiki"
JWT_SECRET="your-secret-key"
\`\`\`

### 3. Run Migrations

\`\`\`bash
npm run db:migrate
npm run db:seed
\`\`\`
`,
      status: 'PUBLISHED',
      createdById: author.id,
    },
  });

  console.log('[SEED] Created pages');

  // Create page versions
  await prisma.pageVersion.createMany({
    data: [
      {
        pageId: gettingStarted.id,
        versionNumber: 1,
        content: gettingStarted.content || '',
        changeNote: 'Initial version',
        createdById: superAdmin.id,
      },
      {
        pageId: architecture.id,
        versionNumber: 1,
        content: architecture.content || '',
        changeNote: 'Initial architecture draft',
        createdById: superAdmin.id,
      },
      {
        pageId: architecture.id,
        versionNumber: 2,
        content: architecture.content?.replace('## Key Components', '## Key Components\n\n> Note: The search service is currently in development') || '',
        changeNote: 'Added note about search service',
        createdById: editor.id,
      },
    ],
  });

  console.log('[SEED] Created page versions');

  // Create comments
  await prisma.comment.createMany({
    data: [
      {
        pageId: gettingStarted.id,
        userId: editor.id,
        content: 'Great guide! Maybe we should add a section about IDE extensions?',
        status: 'VISIBLE',
      },
      {
        pageId: architecture.id,
        userId: author.id,
        content: 'Should we consider adding GraphQL in the future?',
        status: 'VISIBLE',
      },
      {
        pageId: architecture.id,
        userId: superAdmin.id,
        content: 'GraphQL is on our roadmap. We are evaluating it for the next phase.',
        status: 'VISIBLE',
      },
    ],
  });

  console.log('[SEED] Created comments');

  // Create audit log entries
  await prisma.auditLog.createMany({
    data: [
      {
        userId: superAdmin.id,
        action: 'USER_REGISTERED',
        resourceType: 'user',
        resourceId: superAdmin.id,
        metadata: { email: superAdmin.email },
      },
      {
        userId: superAdmin.id,
        action: 'SPACE_CREATED',
        resourceType: 'space',
        resourceId: engineeringSpace.id,
        metadata: { key: 'eng' },
      },
      {
        userId: superAdmin.id,
        action: 'PAGE_CREATED',
        resourceType: 'page',
        resourceId: gettingStarted.id,
        metadata: { title: 'Getting Started', space: 'eng' },
      },
    ],
  });

  console.log('[SEED] Created audit log entries');

  console.log('\n✅ Database seeded successfully!\n');
  console.log('Demo accounts (all use password: Password123):');
  console.log('  admin@openclaw.wiki        - SUPER_ADMIN');
  console.log('  sarah.chen@openclaw.wiki   - SYSTEM_ADMIN');
  console.log('  marcus.johnson@openclaw.wiki - EDITOR');
  console.log('  elena.rodriguez@openclaw.wiki - AUTHOR');
  console.log('  alex.thompson@openclaw.wiki - VIEWER\n');
}

main()
  .catch((e) => {
    console.error('[SEED] Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
