# ClipForge Backend

Node/Express API for ClipForge, a TikTok Shop intelligence platform focused on niche discovery, saturation analysis, video intelligence, and content workflow support.

This backend currently serves two layers:

- the ClipForge intelligence API described in `clipforge_backend_context.md`
- legacy account-level creator analytics scaffolding that was originally built under the PostFlow name and is still preserved in this repo under separate routes

## Stack

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- n8n

## Repo Layout

- `src/` application source
- `prisma/schema.prisma` Prisma schema for both the legacy creator analytics models and the new ClipForge intelligence models
- `clipforge_backend_context.md` current backend target context
- `clipforge_tiktok_service_context.md` separate Python microservice context for TikTok data collection
- `postflow_schema.sql` base SQL schema reference
- `postflow_optimizations.sql` triggers, views, and optimizations reference
- `postflow_full_context.md` product and workflow context

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run db:generate
npm run db:push
npm run db:migrate
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy env template:

```bash
copy .env.example .env
```

3. Set the required values in `.env`.

4. Generate Prisma client:

```bash
npm run db:generate
```

5. Start the API:

```bash
npm run dev
```

## Environment Variables

Required values are validated at startup in `src/config/env.ts`.

- `PORT`
- `NODE_ENV`
- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ENCRYPTION_KEY`
- `INTERNAL_API_KEY`
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`
- `CLIPFORGE_CREATOR_INTELLIGENCE_WEBHOOK`
- `CLIPFORGE_ASSET_GENERATION_WEBHOOK`
- `FRONTEND_URL`

Backward compatibility:

- `N8N_CREATOR_INTELLIGENCE_WEBHOOK` and `N8N_ASSET_GENERATION_WEBHOOK` are still accepted as fallbacks if older environment files already use them.

## API Surface

Current route groups:

- `/api/auth`
- `/api/dashboard`
- `/api/videos`
- `/api/niches`
- `/api/discoveries`
- `/api/video-intelligence`
- `/internal`
- `/api/creator-videos`
- `/api/insights`
- `/api/recommendations`
- `/api/assets`
- `/api/account`
- `/api/oauth`
- `/api/sync`
- `/api/health`

## Primary ClipForge Routes

Public JWT-protected routes:

- `GET /api/dashboard/summary`
- `GET /api/niches`
- `GET /api/niches/:nicheName`
- `GET /api/niches/:nicheName/history`
- `GET /api/niches/opportunities`
- `GET /api/discoveries`
- `GET /api/discoveries/recent`
- `GET /api/discoveries/desire-heatmap`
- `GET /api/videos`
- `GET /api/videos/hooks`
- `GET /api/videos/structures`
- `GET /api/videos/:id`

Internal n8n ingestion routes:

- `POST /internal/niche-intelligence`
- `POST /internal/niche-discoveries`
- `POST /internal/video-transcripts`

Legacy scaffolding retained during migration:

- `/api/creator-videos`
- `/api/insights`
- `/api/recommendations`
- `/api/assets`
- `/api/account`
- `/api/oauth`
- `/api/sync`

## Important Notes

- The Prisma setup is pinned to Prisma 6 because this scaffold targets the classic Prisma client workflow.
- The database client injects `app.encryption_key` through the datasource URL so encrypted token access can stay aligned with the Postgres design.
- BigInt JSON serialization is enabled globally so large Postgres counts can be returned safely from the API.
- The backend expects the n8n workflows to already exist and be reachable through the configured webhook URLs.
- TikTok OAuth routes are present, but they depend on valid TikTok app credentials and a reachable callback URL.

## Frontend Pairing

This backend is intended to serve the React frontend in the separate ClipForge frontend repo. The current primary frontend-facing data model is the ClipForge intelligence layer: dashboard summary, niches, discoveries, and video intelligence.

## Status

Current baseline:

- installs successfully
- Prisma client generates successfully
- TypeScript build passes

What still needs real environment integration:

- live Postgres connection
- Prisma migration or `db push` against the target ClipForge database
- live TikTok OAuth credentials if you plan to keep the legacy account-connected flows
- live n8n webhook endpoints
- end-to-end verification with the frontend and n8n workflows
