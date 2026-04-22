# FlatHacksWiki

Enterprise Wiki System - FlatHacksWiki

## Features

- **Multi-Space Architecture** - Organize content in separate workspaces
- **RBAC** - Granular role-based access control with 8 default roles
- **Hierarchical Pages** - Nested pages with version history
- **Markdown Editor** - Edit with live preview
- **Media Management** - File uploads
- **Full-Text Search** - Search across all content
- **Audit Logging** - Complete audit trail
- **Enterprise Ready** - SSO-ready architecture

## Quick Start

### Using Docker (Recommended)

```bash
cd openclaw-wiki

# Start all services
docker-compose up -d

# Initialize database and seed demo data
docker-compose exec api npm run db:push
docker-compose exec api npm run db:seed

# Access the application
open http://localhost
```

### Publish Docker Images To GitHub Container Registry

After creating a GitHub repository, push this project to the `main` branch. The workflow in `.github/workflows/docker-publish.yml` will then publish:

- `ghcr.io/<your-github-user-or-org>/flathackswiki-backend:latest`
- `ghcr.io/<your-github-user-or-org>/flathackswiki-frontend:latest`

You can also trigger the workflow manually via GitHub Actions.

### Local Development

```bash
# Backend
cd backend
cp .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Environment Files

- `backend/.env.example` contains the backend variables for local development.
- `frontend/.env.example` contains the frontend variables for local development.
- `.env.ghcr.example` contains a ready-to-edit example for running the published GHCR images.
- `docker-compose.ghcr.yml` is prepared for running the published images from GHCR.

For a GHCR deployment, set at minimum `JWT_SECRET` and optionally override `BACKEND_IMAGE` / `FRONTEND_IMAGE`.

## Demo Accounts

All accounts use password: `Password123`

| Email | Role |
|-------|------|
| admin@flathacks.wiki | SUPER_ADMIN |
| sarah.chen@flathacks.wiki | SYSTEM_ADMIN |
| marcus.johnson@flathacks.wiki | EDITOR |
| elena.rodriguez@flathacks.wiki | AUTHOR |
| alex.thompson@flathacks.wiki | VIEWER |

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Node.js + TypeScript + Express |
| Database | PostgreSQL 15 + Prisma ORM |
| Auth | JWT (Access + Refresh Tokens) |
| Frontend | React 18 + TypeScript + Vite + TailwindCSS |
| Storage | Local filesystem |

## Project Structure

```
openclaw-wiki/
├── backend/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── modules/         # Feature modules
│   │   │   ├── auth/        # Authentication
│   │   │   ├── spaces/      # Space management
│   │   │   ├── pages/       # Page CRUD
│   │   │   ├── comments/    # Comments
│   │   │   ├── attachments/ # File uploads
│   │   │   ├── search/      # Search
│   │   │   └── admin/       # Admin functions
│   │   └── core/           # Middleware & errors
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   └── seed.ts         # Demo data
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/          # React pages
│   │   ├── components/     # UI components
│   │   ├── api/            # API client
│   │   └── context/        # State management
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml
└── README.md
```

## API Endpoints

### Authentication
```
POST /api/v1/auth/register    - Register new user
POST /api/v1/auth/login      - Login
POST /api/v1/auth/logout     - Logout
GET  /api/v1/auth/me        - Get current user
```

### Spaces
```
GET    /api/v1/spaces         - List spaces
POST   /api/v1/spaces         - Create space
GET    /api/v1/spaces/:key    - Get space
PUT    /api/v1/spaces/:key    - Update space
DELETE /api/v1/spaces/:key    - Delete space
GET    /api/v1/spaces/:key/members - List members
POST   /api/v1/spaces/:key/members - Add member
```

### Pages
```
GET    /api/v1/spaces/:key/pages         - List pages
POST   /api/v1/spaces/:key/pages         - Create page
GET    /api/v1/spaces/:key/pages/:slug    - Get page
PUT    /api/v1/spaces/:key/pages/:slug    - Update page
DELETE /api/v1/spaces/:key/pages/:slug    - Delete page
GET    /api/v1/spaces/:key/pages/:slug/versions - Get versions
```

### Comments
```
GET    /api/v1/pages/:pageId/comments    - List comments
POST   /api/v1/pages/:pageId/comments    - Add comment
PUT    /api/v1/pages/:pageId/comments/:id - Update comment
DELETE /api/v1/pages/:pageId/comments/:id - Delete comment
```

### Search
```
GET /api/v1/search?q=query&space=key - Search
```

### Admin
```
GET /api/v1/admin/users      - List users
GET /api/v1/admin/audit-log - Audit logs
GET /api/v1/admin/stats     - System stats
```

## Roles & Permissions

| Role | Permissions |
|------|-------------|
| SUPER_ADMIN | All permissions, system-wide |
| SYSTEM_ADMIN | All admin functions |
| SPACE_ADMIN | Full control of assigned space |
| EDITOR | Create/edit pages, upload files |
| AUTHOR | Create pages, edit own pages |
| COMMENTER | Add comments |
| VIEWER | Read-only access |
| GUEST | Limited access |

## License

MIT
