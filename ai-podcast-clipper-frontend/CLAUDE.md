# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Podcast Clipper is a Next.js 15 application built with the T3 Stack that processes podcast videos into AI-generated clips. The frontend handles user authentication, file uploads to S3, and displays processed clips. Video processing happens asynchronously via Inngest workers that call an external Modal.run endpoint.

## Development Commands

### Core Workflows
```bash
# Development
npm run dev                    # Start Next.js dev server with Turbo
npm run inngest-dev           # Start Inngest dev server for testing workers

# Database
npm run db:push               # Push schema changes to database (development)
npm run db:generate           # Generate migrations
npm run db:migrate            # Run migrations (production)
npm run db:studio             # Open Prisma Studio

# Code Quality
npm run check                 # Run linter and type checker together
npm run typecheck             # TypeScript type checking only
npm run lint                  # Run ESLint
npm run lint:fix              # Auto-fix linting issues
npm run format:check          # Check code formatting
npm run format:write          # Auto-format code

# Build & Deploy
npm run build                 # Production build
npm run preview               # Build and start production server
npm run start                 # Start production server
```

## Architecture

### Feature-Sliced Design (FSD)

The codebase follows Feature-Sliced Design methodology in `src/fsd/`:

**Layers (top to bottom)**:
- `pages/` - Route-level orchestration (home, dashboard, uploadDetail)
- `widgets/` - Composite UI blocks (clip-display, uploaded-file-list, loginForm, signupForm, dashboard-header)
- `features/` - User interactions with business logic (upload)
- `entity/` - Business entities and their models (auth/model/schemas)
- `shared/` - Reusable utilities and UI primitives
  - `lib/` - Utilities (utils.ts, auth.ts)
  - `ui/atoms/` - Base components (button, input, card, etc.)

**Key Rules**:
- Higher layers can import from lower layers only (no upward imports)
- Peer imports within same layer are forbidden
- Each slice is self-contained with ui/, model/, constants/ subfolders

### Server-Side Architecture

**NextAuth.js Authentication** (`src/server/auth/`):
- Uses Prisma adapter with SQLite database
- Credentials provider with bcrypt password hashing
- JWT session strategy (not database sessions)
- Session includes user.id via JWT callbacks

**Inngest Background Jobs** (`src/inngest/`):
- `processVideo` function handles async video processing
- Concurrency limited to 1 per user (via userId key)
- Workflow: check credits → call Modal endpoint → parse response → create clips in DB → deduct credits
- Fallback to S3 listing if backend doesn't return clip metadata
- Retries: 1 attempt

**Database (Prisma + SQLite)**:
- Schema located in `prisma/schema.prisma`
- Generated client in `generated/prisma/` (not `node_modules`)
- Key models: User, UploadedFile, Clip
- User credits system: default 3 credits, decremented per clip processed

### Server Actions (`src/actions/`)

All server actions use `"use server"` directive:
- `auth.ts` - User signup/login with bcrypt
- `s3.ts` - Presigned URL generation for file uploads
- `generation.ts` - Video processing trigger, clip URL generation, clip deletion
- `uploaded-files.ts` - CRUD operations for uploaded files

### Environment Variables

Managed via `@t3-oss/env-nextjs` in `src/env.js`:
- Type-safe validation with Zod
- Separate server/client schemas
- Required vars: AUTH_SECRET, DATABASE_URL, AWS credentials, S3_BUCKET_NAME, PROCESS_VIDEO_ENDPOINT

## Key Implementation Details

### Video Processing Flow

1. User uploads file → presigned S3 URL generated (`s3.ts`)
2. File uploaded to S3 with structure: `{userId}/{uuid}/original.mp4`
3. `processVideo()` action triggered → sends Inngest event
4. Inngest worker calls Modal endpoint with s3Key and language
5. Backend returns clips array with metadata (startSeconds, endSeconds, scriptText, s3Key)
6. Worker creates Clip records in DB with metadata
7. If backend doesn't return clips, fallback to S3 listing for `clip_*.mp4` files
8. Credits deducted, status updated to "processed"

### Status Flow for UploadedFile

- `queued` (default) → `processing` → `processed` | `failed` | `no credits`
- Status checked in UI to show processing timeline

### S3 Key Patterns

- Original upload: `{userId}/{uuid}/original.mp4`
- Generated clips: `{userId}/{uuid}/clip_{n}.mp4`
- Presigned URLs expire in 3600 seconds

### Authentication Patterns

- Server actions use `await auth()` from `~/server/auth`
- Session contains: `{ user: { id, name, email, image } }`
- Protected routes should check `session?.user?.id`

## Path Aliases

TypeScript `baseUrl` is set to `.` with path mapping:
- `~/*` → `./src/*`

Always use `~/*` imports, never relative paths across feature boundaries.

## Database Operations

**When modifying schema**:
1. Edit `prisma/schema.prisma`
2. Run `npm run db:push` (dev) or `npm run db:generate` + `npm run db:migrate` (prod)
3. Prisma Client regenerates automatically via postinstall hook

**Database client import**:
```typescript
import { db } from "~/server/db";
```

## Styling

- Tailwind CSS 4.0 with custom configuration
- shadcn/ui components in `src/fsd/shared/ui/atoms/`
- `cn()` utility from `~/fsd/shared/lib/utils` for conditional classes
- Radix UI primitives as component base

## Testing Inngest Locally

1. Run `npm run inngest-dev` in separate terminal
2. Inngest dev server runs on http://localhost:8288
3. Events sent via `inngest.send()` will be visible in dev UI
4. Test video processing without hitting production Modal endpoint

## Common Gotchas

- Prisma client is generated to `generated/prisma/`, not `node_modules/@prisma/client`
- NextAuth uses JWT sessions, not database sessions (despite Prisma adapter)
- Inngest concurrency key prevents parallel processing for same user
- S3 operations require checking both DB records and actual S3 objects (eventual consistency)
- Environment variables are validated at build time - add new vars to `src/env.js` schema
