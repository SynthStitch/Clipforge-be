# PostFlow Backend

Node/Express API for PostFlow, a TikTok analytics and recommendation product for creators and TikTok Shop sellers.

This backend is responsible for:

- auth and JWT issuance
- TikTok OAuth connection flow
- reading analytics, creative briefs, recommendations, and generated assets from Postgres
- triggering the two n8n workflows

## Stack

- Node.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- n8n

## Repo Layout

- `src/` application source
- `prisma/schema.prisma` Prisma schema mapped to the PostFlow Postgres design
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
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`
- `N8N_CREATOR_INTELLIGENCE_WEBHOOK`
- `N8N_ASSET_GENERATION_WEBHOOK`
- `FRONTEND_URL`

## API Surface

Current route groups:

- `/api/auth`
- `/api/dashboard`
- `/api/videos`
- `/api/insights`
- `/api/recommendations`
- `/api/assets`
- `/api/account`
- `/api/oauth`
- `/api/sync`
- `/api/health`

## Important Notes

- The Prisma setup is pinned to Prisma 6 because this scaffold targets the classic Prisma client workflow.
- The database client injects `app.encryption_key` through the datasource URL so encrypted token access can stay aligned with the Postgres design.
- The backend expects the n8n workflows to already exist and be reachable through the configured webhook URLs.
- TikTok OAuth routes are present, but they depend on valid TikTok app credentials and a reachable callback URL.

## Frontend Pairing

This backend is intended to serve the React frontend in the separate PostFlow frontend repo. The frontend currently expects dashboard, videos, insights, recommendations, planner/settings-adjacent account data, and sync/generation triggers.

## Status

Current baseline:

- installs successfully
- Prisma client generates successfully
- TypeScript build passes

What still needs real environment integration:

- live Postgres connection
- real TikTok OAuth credentials
- live n8n webhook endpoints
- end-to-end verification with frontend
