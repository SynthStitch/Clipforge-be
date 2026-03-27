# ClipForge / PostFlow — Project Context

TikTok analytics and AI content generation platform. Two repos in this monorepo:
- `ClipForge/` — React frontend (Vite, Tailwind, Radix UI)
- `Clipforge-be/` — Express backend (TypeScript, Prisma, PostgreSQL)

Orchestration handled by n8n workflows hosted at `y-3.online`.

---

## Infrastructure (Proxmox PVE)

| CT | Name | Role |
|----|------|------|
| 100 | caddy | Reverse proxy |
| 101 | cloudflared | Cloudflare tunnel |
| 103 | postgresql | PostgreSQL 17 |
| 106 | docker | Docker host |
| 888 | n8n | n8n workflow engine |

**PostgreSQL (CT 103)**
- Host: `192.168.86.246:5432`
- Database: `clipforge`
- User: `clipforge`
- Schema applied via `prisma db push` + `scripts/apply-optimizations.mjs`

**n8n (CT 888)**
- URL: `https://y-3.online`
- Two workflows (see below)

---

## n8n Workflows

### PostFlow — Creator Intelligence (`ho0lFmZyvnF7eJHp`)
- Webhook path: `POST /webhook/postflow-refresh`
- Triggered by: `POST /api/sync/refresh` from the backend
- Payload: `{ user_id, account_id, trigger: "manual_refresh" }`
- Flow: Load User → Load TikTok Tokens → Validate/Refresh Token → Fetch TikTok Profile + Videos → Loop Videos → Fetch Metrics → Upsert Videos + Snapshots → Fetch Comments → NLP Entity Extraction (Claude) → Compute Analytics → LLM Reasoning (Claude) → Build Creative Brief → Save Brief + Recommendations → Log Ingestion

### PostFlow — Asset Generation (`THy8rnMTfAXQ47Bl`)
- Webhook path: `POST /webhook/postflow-generate`
- Triggered by: `POST /api/sync/generate` from the backend
- Payload: `{ user_id, brief_id, recommendation_id, trigger: "manual" }`
- Flow: Load Creative Brief → Load User Prefs → Content Planning (Claude) → Parse Plan → Route by Content Type:
  - `faceless_affiliate` → Grok Imagine + ElevenLabs → Package
  - `avatar_explainer` → HeyGen → Poll Status → Package
  - `product_demo_hybrid` → Higgsfield + ElevenLabs → Package
  → Save Generated Assets → Log Generation Run

---

## What's Been Done (2026-03-26)

- [x] Backend `.env` created with DB + n8n webhook URLs
- [x] `prisma db push` — all 13 tables created in `clipforge` DB
- [x] `scripts/apply-optimizations.mjs` — applied all optimizations:
  - Check constraints on enum-like columns
  - Generated columns: `length_bucket` (videos), `engagement_rate` (video_metrics_snapshots)
  - Trigger: `sync_latest_metrics` — auto-denormalizes metrics onto videos table
  - Materialized views: `mv_format_performance`, `mv_posting_windows`
  - View: `v_video_momentum`
  - BRIN indexes on time-series tables
  - Partial indexes on recommendations and generated_assets
  - Retention functions: `prune_metric_snapshots()`, `prune_ingestion_logs()`
- [x] n8n bug fixes (via MCP):
  - Creator Intelligence: `$json.userId` → `$json.user_id` in Load User Record
  - Asset Generation: `$json.userId` → `$json.user_id` in Load Creative Brief
  - Creator Intelligence: Removed `decrypt_token()` from Load TikTok Tokens (tokens stored as plain TEXT via Prisma, not BYTEA)

**Note on token encryption:** `postflow_optimizations.sql` section 1 (BYTEA pgcrypto conversion) was intentionally skipped. The Prisma schema stores `access_token` and `refresh_token` as `String` (TEXT). The backend's `ENCRYPTION_KEY` env var is present but encryption is not yet implemented in `tiktok.service.ts`. If you want at-rest token encryption, it needs to be added at the application layer (encrypt before Prisma write, decrypt after Prisma read) rather than at the DB layer.

---

## Next Steps

### Immediate (required to go live)

1. **Add n8n credentials** — in the n8n UI at `y-3.online`:
   - Create a **Postgres** credential pointing to `192.168.86.246:5432`, database `clipforge`, user `clipforge`
   - Create an **Anthropic** credential with your API key
   - Open each workflow, assign credentials to all postgres/anthropic nodes, then **Activate**

2. **TikTok OAuth app** — fill in `.env`:
   ```
   TIKTOK_CLIENT_KEY=
   TIKTOK_CLIENT_SECRET=
   TIKTOK_REDIRECT_URI=http://localhost:4000/api/oauth/tiktok/callback
   ```
   TikTok requires app review for `video.insights` and `comment.list` scopes.

3. **Connect frontend to backend** — the frontend (`ClipForge/`) currently uses mock data from `src/app/lib/data.ts`. All pages need to be wired to the live API at `http://localhost:4000/api`.

### Asset Generation APIs (fill in `.env` when ready)

| Key | Service | Used for |
|-----|---------|----------|
| `ELEVENLABS_API_KEY` | ElevenLabs | Voiceover TTS |
| `HEYGEN_API_KEY` | HeyGen | Avatar video generation |
| `HIGGSFIELD_API_KEY` | Higgsfield | Product visual generation |
| `XAI_API_KEY` | xAI (Grok) | Visual scene image generation |

### Frontend → Backend Integration

Every page currently uses mock data. Priority order to wire up:

1. **Auth** — replace localStorage with real JWT login/register (`POST /api/auth/login`, `/register`)
2. **Dashboard** — `GET /api/dashboard` (metrics, videos, recommendations, charts)
3. **Videos** — `GET /api/videos` (filtering, search, pagination already supported)
4. **Insights** — `GET /api/insights` (brief, demographics)
5. **Recommendations** — `GET /api/recommendations`, `POST /api/recommendations/:id/dismiss`
6. **Planner** — currently fully client-side (no backend route exists yet)
7. **Settings** — `GET/PATCH /api/account/profile`, `POST /api/oauth/tiktok`
8. **Sync buttons** — `POST /api/sync/refresh` → triggers Creator Intelligence workflow
9. **Generate button** — `POST /api/sync/generate` → triggers Asset Generation workflow

### Optional / Future

- Enable `N8N_WEBHOOK_SECRET` and validate `X-Webhook-Secret` header in n8n webhook nodes
- Add token encryption in `tiktok.service.ts` (app-layer AES using `ENCRYPTION_KEY`)
- Set up Caddy reverse proxy on CT 100 to expose the backend publicly
- Schedule `prune_metric_snapshots()` and `prune_ingestion_logs()` via n8n or pg_cron
- Frontend deployment (Vercel, Cloudflare Pages, or self-hosted via CT 100)
