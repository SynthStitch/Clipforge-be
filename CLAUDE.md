# ClipForge — Project Context

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

### ClipForge — Creator Intelligence (`ho0lFmZyvnF7eJHp`)
- Webhook path: `POST /webhook/clipforge-refresh`
- Triggered by: `POST /api/sync/refresh` from the backend
- Payload: `{ user_id, account_id, trigger: "manual_refresh" }`
- Flow: Load User → Load TikTok Tokens → Validate/Refresh Token → Fetch TikTok Profile + Videos → Loop Videos → Fetch Metrics → Upsert Videos + Snapshots → Fetch Comments → NLP Entity Extraction (Claude) → Compute Analytics → LLM Reasoning (Claude) → Build Creative Brief → Save Brief + Recommendations → Log Ingestion

### ClipForge — Asset Generation (`THy8rnMTfAXQ47Bl`)
- Webhook path: `POST /webhook/clipforge-generate`
- Triggered by: `POST /api/sync/generate` from the backend
- Payload: `{ user_id, brief_id, recommendation_id, trigger: "manual" }`
- Flow: Load Creative Brief → Load User Prefs → Content Planning (Claude) → Parse Plan → Route by Content Type:
  - `faceless_affiliate` → Grok Imagine + ElevenLabs → Package
  - `avatar_explainer` → HeyGen → Poll Status → Package
  - `product_demo_hybrid` → Higgsfield + ElevenLabs → Package
  → Save Generated Assets → Log Generation Run

---

## Nimble Workflows (Phase 1 — Data Intelligence)

Three n8n workflows powered by Nimble API scraping. All use `$env` variables (OS-level, not n8n Variables UI — no upgrade needed).

| Workflow | ID | Trigger | Internal endpoint |
|---|---|---|---|
| ClipForge Niche Intelligence v1 | `wOOLIdyeofjoES2o` | Daily cron 6am CST | `POST /internal/niche-intelligence` |
| ClipForge Video Transcriber v1 | `ogYYOtjfdTZoQ7XI` | Webhook | `POST /internal/video-transcripts` |
| ClipForge Niche Discovery & Desire Scoring v1 | `3A6EGhLMlwpT7Lqc` | Weekly cron Mon 5am CST | `POST /internal/niche-discoveries` |

**n8n env vars required on CT 888** (set in docker-compose.yml or n8n process env):
```
NIMBLE_API_KEY=
DEEPSEEK_API_KEY=
CLIPFORGE_SHEET_ID=https://docs.google.com/spreadsheets/d/YOUR_ID/edit
CLIPFORGE_BACKEND_URL=http://192.168.86.X:4000
INTERNAL_API_KEY=<must match backend .env>
RESEND_API_KEY=
ALERT_EMAIL=
```

**Google Sheet structure required:**
- Tab: `Niche Watchlist` — columns: `niche_name`, `hashtag`, `tiktok_shop_category`
- Tab: `Niche Intelligence` — results logged here by workflow
- Tab: `Workflow Errors` — error logging

**Video Transcriber** has a Gemini node (`Transcribe Video (Gemini)`) — credentials must be assigned manually in n8n UI.

**Backend webhook env vars** (backend calls n8n, not the other way around for these):
```
N8N_CREATOR_INTELLIGENCE_WEBHOOK=https://y-3.online/webhook/clipforge-refresh
N8N_ASSET_GENERATION_WEBHOOK=https://y-3.online/webhook/clipforge-generate
```

---

## Phase 2 — Workflows 5-9 Backend (TikTok Data Service dependent)

Five new Prisma models + internal routes added. Workflows 5-7 and 9 require TikTok Data Service (Phase 3, not yet built). Workflow 8 (Competitor Shop Monitor) uses Nimble and is ready.

| Workflow | Model | Route |
|---|---|---|
| 5 — Creator Intelligence Tracker | `CreatorProfile` | `POST /internal/creator-profiles` |
| 6 — Comment Sentiment Miner | `CommentSentiment` | `POST /internal/comment-sentiment` |
| 7 — Trending Sounds Tracker | `TrendingSound` | `POST /internal/trending-sounds` |
| 8 — Competitor Shop Monitor | `ShopSnapshot` | `POST /internal/shop-snapshots` |
| 9 — Performance Feedback Loop | `ContentPerformance` | `POST /internal/content-performance` |

---

## Golden Dataset Eval Framework

**Why this exists:** LLMs and scraping workflows are non-deterministic. "Eyeball testing" doesn't scale. Before changing any scoring logic (saturation score algorithm, DeepSeek prompts, field mappings), regression tests need to pass against a curated set of known-good outputs. This is the same pattern used by Latitude.so, DeepEval, and Confident AI — production traces promoted to golden benchmarks.

**Architecture:**
- `GoldenSample` — a curated niche input + expected output ranges, promoted from a real n8n run
- `EvalResult` — scored result of running actual output against a golden; grouped by `runId`
- `tolerances` — numeric range checks (e.g. `saturation_score: { min: 30, max: 70 }`); other fields use exact match

**Internal endpoints:**
```
POST /internal/golden-samples          — save a new golden (call from n8n after a confirmed-good run)
GET  /internal/golden-samples?workflowType=niche_intelligence  — list goldens
POST /internal/eval-runs               — score actual outputs vs goldens; returns 207 on any failure
GET  /internal/eval-runs/:runId        — fetch full results of a past eval run
```

**Hybrid eval strategy (per Latitude research):**
- **Golden Dataset** = regression gate before scoring logic changes (stable benchmark)
- **Random production sampling** = nightly runs catch drift and real-world edge cases
- Scoring accuracy: numeric fields use tolerance ranges; booleans/strings use exact match
- `failReasons` array explains every failing field — surfaceable in n8n error alerts

**First golden workflow:**
1. Run Niche Intelligence workflow manually in n8n
2. Inspect `Calculate Saturation Score` node output — note actual score values
3. Call `POST /internal/golden-samples` with those values + tolerance ranges (±15 is a reasonable start)
4. Before any future change to scoring logic, call `POST /internal/eval-runs` — gate on HTTP 200

---

## What's Been Done

### 2026-03-26
- [x] Backend `.env` created with DB + n8n webhook URLs
- [x] `prisma db push` — all 13 original tables created in `clipforge` DB
- [x] `scripts/apply-optimizations.mjs` — check constraints, generated columns, triggers, materialized views, BRIN indexes, retention functions
- [x] n8n bug fixes: `$json.userId` → `$json.user_id` in Creator Intelligence + Asset Generation; removed `decrypt_token()` from TikTok token load

### 2026-04-01
- [x] Security hardening: timing-safe `INTERNAL_API_KEY` comparison, removed raw SQL from auth service, CORS wildcard guard, 1mb body limit, Zod `.strict()` on all internal schemas, UUID param validation, rate limiter on `/auth/refresh`, production error handler never leaks stack traces
- [x] Phase 1 Nimble workflows updated via n8n MCP: renamed, env var references set, wait node connection fixed (Hashtag → Wait → Shop, not parallel)
- [x] Phase 2 models + routes + services for workflows 5-9
- [x] Golden dataset eval framework: `GoldenSample` + `EvalResult` models, service, 4 internal routes
- [x] All pushed to `https://github.com/SynthStitch/Clipforge-be.git`
- [x] Git remote updated from `SynthStitch/PostFlow-be` → `SynthStitch/Clipforge-be`

### 2026-04-02
- [x] Backend deployed to CT 106 (Docker host, `10.8.8.167`) via `docker compose up -d --build`
- [x] Fixed TypeScript build errors blocking Docker build:
  - `z.record()` requires 2 args in this Zod version → `z.record(z.string(), z.unknown())`
  - Prisma `Json` fields need explicit `as Prisma.InputJsonValue` cast for `Record<string,unknown>`
  - `req.params[key]` typed as `string | string[]` in this `@types/express` → cast to `string`
- [x] Backend now running in Docker on isolated home server network

**Note on token encryption:** Prisma stores `access_token` and `refresh_token` as `String` (TEXT). `ENCRYPTION_KEY` env var exists but encryption not yet implemented in `tiktok.service.ts`. Add at the application layer (encrypt before write, decrypt after read) if needed — not at the DB layer.

---

## Next Steps

### Immediate — Nimble test run

1. **Set env vars on CT 888** — add to n8n's docker-compose.yml and restart (see env vars table above)
2. **Assign Gemini credential** in n8n UI to the Video Transcriber workflow
3. **Populate Niche Watchlist sheet** with at least 1 test row
4. **Confirm backend reachable from CT 888** — backend is on CT 106 (`10.8.8.167`), n8n is on CT 888; `CLIPFORGE_BACKEND_URL=http://10.8.8.167:4000`
5. **Manually trigger** ClipForge Niche Intelligence v1 → inspect `Calculate Saturation Score` output to confirm Nimble field paths
6. **After first good run** → call `POST /internal/golden-samples` to save that output as the first golden record

### Phase 3 — TikTok Data Service

Python/FastAPI service on CT 106 (Docker host), port 8100. Required by workflows 5, 6, 7, 9. Not yet built.

### Asset Generation APIs

| Key | Service | Used for |
|-----|---------|----------|
| `ELEVENLABS_API_KEY` | ElevenLabs | Voiceover TTS |
| `HEYGEN_API_KEY` | HeyGen | Avatar video generation |
| `HIGGSFIELD_API_KEY` | Higgsfield | Product visual generation |
| `XAI_API_KEY` | xAI (Grok) | Visual scene image generation |

### Frontend → Backend Integration

Every page currently uses mock data from `src/app/lib/data.ts`. Priority order:

1. **Auth** — real JWT login/register (`POST /api/auth/login`, `/register`)
2. **Dashboard** — `GET /api/dashboard`
3. **Videos** — `GET /api/videos`
4. **Insights** — `GET /api/insights`
5. **Recommendations** — `GET /api/recommendations`, `POST /api/recommendations/:id/dismiss`
6. **Settings** — `GET/PATCH /api/account/profile`, `POST /api/oauth/tiktok`
7. **Sync buttons** — `POST /api/sync/refresh` → Creator Intelligence workflow
8. **Generate button** — `POST /api/sync/generate` → Asset Generation workflow

### Optional / Future

- Enable `N8N_WEBHOOK_SECRET` and validate `X-Webhook-Secret` in n8n webhook nodes
- Add token encryption in `tiktok.service.ts` (app-layer AES using `ENCRYPTION_KEY`)
- Set up Caddy reverse proxy on CT 100 to expose backend publicly
- Schedule `prune_metric_snapshots()` and `prune_ingestion_logs()` via n8n or pg_cron
- Frontend deployment (Vercel, Cloudflare Pages, or CT 100)
- Evaluate Latitude.so for production trace monitoring + automated eval once Nimble data is flowing
