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
- Host: `10.8.8.147:5432`
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

**n8n env vars required on CT 888** (file: `/opt/n8n.env`):
```
NIMBLE_API_KEY=
DEEPSEEK_API_KEY=
CLIPFORGE_SHEET_ID=https://docs.google.com/spreadsheets/d/YOUR_ID/edit
CLIPFORGE_BACKEND_URL=http://10.8.8.167:4000
INTERNAL_API_KEY=<must match backend .env>
RESEND_API_KEY=
ALERT_EMAIL=
TIKTOK_SERVICE_URL=http://10.8.8.167:8100
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

### 2026-04-04
- [x] n8n infrastructure: LXC on CT 888 at `10.8.8.189` (NOT Docker) — env vars in `/opt/n8n.env`
- [x] Added `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` to `/opt/n8n.env` to allow `{{$env.*}}` in nodes
- [x] Added all required env vars to `/opt/n8n.env`: NIMBLE_API_KEY, DEEPSEEK_API_KEY, CLIPFORGE_BACKEND_URL, INTERNAL_API_KEY, CLIPFORGE_SHEET_ID, RESEND_API_KEY, ALERT_EMAIL
- [x] PostgreSQL password reset via `sudo -u postgres psql -c "ALTER USER clipforge PASSWORD '...'"` on CT 103
- [x] Backend `.env` updated with real JWT_SECRET, ENCRYPTION_KEY, DB password — container restarted with `docker compose down && docker compose up -d`
- [x] Google Sheets OAuth fixed: added `dtrevino2237@gmail.com` as test user in Google Cloud Console OAuth consent screen
- [x] Google Sheet "ClipForge Data" created with tabs: Niche Watchlist, Niche Intelligence, Workflow Errors
- [x] n8n Postgres credential updated to `10.8.8.147`, `clipforge` db/user, SSL disabled (internal LAN)

**Niche Discovery workflow fixes (ID: `3A6EGhLMlwpT7Lqc`):**
- [x] Google Trends RSS deprecated — stubbed out with Code node returning null gracefully
- [x] `splitInBatches` v3 output order: **output 0 = Done Branch, output 1 = Loop Branch** (counterintuitive — always verify)
- [x] Removed `Loop Over Categories` node — replaced with direct `Generate Amazon Category URLs → Scrape Amazon`
- [x] Added `Prep DeepSeek Input` Code node — builds DeepSeek body as JS object (JSON escaping fix)
- [x] Added `Prep Desire Score Input` Code node — same pattern, between Wait (TikTok Rate Limit) and Score Desire-Pull
- [x] `Score Desire-Pull (DeepSeek)` — body set to `={{$json.body}}`, `onError: continueRegularOutput`
- [x] `Calculate Convertibility` — switched from `runOnceForEachItem` to `runOnceForAllItems` (fixed "json property isn't an object" error)
- [x] `Add to Niche Watchlist` — switched from `defineBelow` to `autoMapInputData` (fixed "Could not get parameter columns.schema" error)
- [x] `Sync Discovery to DB` — body changed from `={{JSON.stringify($json)}}` to `={{$json}}`
- [x] All Google Sheets nodes: sheet mode → `"name"` (not `"list"` — `"list"` can't resolve env var URLs)
- [x] `Read Existing Watchlist`: `alwaysOutputData: true`
- [x] Fixed `Loop Over New Niches` output 1 → Scrape Amazon Reviews (was output 0/Done)
- [x] Multi-source: Generate node now outputs 20 URLs (6 Amazon Movers, 6 Amazon Bestsellers, 5 TikTok Shop, 3 Reddit)
- [x] `Prep DeepSeek Input` auto-detects source from Nimble response URL + loops ALL items (was `$input.first()` — only processed first item)
- [x] `Parse Niche Classifications` matches categories by index from Prep output + loops ALL items
- [x] Backend `nicheDiscoverySchema` — added missing fields: source_product_url, asin, impulse_trigger, social_proof_score, velocity_score, is_gold, discovered_at
- [x] End-to-end confirmed: niches in Google Sheet + PostgreSQL `niche_discoveries` table
- [ ] **PENDING**: TikTok Shop and Reddit sources return no niches — Nimble may return empty parsed entities. Need to inspect Nimble response for those URLs.
- [ ] **PENDING**: Empty row with no niche_name slipping through to sheet — add guard in Aggregate/Filter

**Niche Intelligence workflow fixes (ID: `wOOLIdyeofjoES2o`):**
- [x] `Read Niche Watchlist`: sheet mode → `"name"`, `alwaysOutputData: true`
- [x] `Log to Niche Intelligence Sheet`: sheet mode → `"name"`, `autoMapInputData`
- [x] `Log Error to Sheet`: same fixes
- [x] `Loop Over Niches`: output 1 → Scrape Hashtag (was output 0/Done)
- [x] `Sync to PostFlow DB`: body → `={{$json}}`
- [x] Workflow runs end-to-end, logs to Niche Intelligence sheet tab
- [ ] **PENDING**: All saturation metrics are 0 — `Calculate Saturation Score` field paths are placeholders (`hp.video_count`, `sp.product_count`) that don't match actual Nimble TikTok response structure

### 2026-04-26
- [x] Backend `.env` n8n webhook URLs fixed: `localhost:5678` → `https://y-3.online` for both CLIPFORGE_* and N8N_* vars
- [x] `INTERNAL_API_KEY` rotated to real secret, synced between backend `.env` and `/opt/n8n.env` on CT 888
- [x] TikTok Data Service deployed to CT 106 (`~/Clipforge-be/tiktok-service/`), port 8100
- [x] `TIKTOK_SERVICE_URL=http://10.8.8.167:8100` added to `/opt/n8n.env` on CT 888
- [x] DNS fix: added `dns: [8.8.8.8, 8.8.4.4]` to tiktok-service docker-compose (CT 106 host has Tailscale-only DNS)
- [x] CT 106 DNS fixed: `echo "nameserver 8.8.8.8" >> /etc/resolv.conf` (reverts on reboot — permanent fix: `pct set 106 --nameserver 8.8.8.8` from PVE host)

---

## Next Steps

### Immediate — Fix multi-source + saturation scoring

1. **Debug TikTok/Reddit Nimble responses** — inspect what Nimble actually returns for TikTok Shop search and Reddit URLs. Check if `parsing.entities` has data or if we need different extraction.
2. **Fix Niche Intelligence saturation field paths** — map `Calculate Saturation Score` to actual Nimble TikTok response fields
3. **Filter empty niches** — add guard in Aggregate All Niches / Filter to exclude rows without niche_name
4. **Save first golden sample** after confirmed multi-source run
5. **Assign Gemini credential** in n8n UI to Video Transcriber workflow

### Phase 3 — TikTok Data Service ✅ DEPLOYED

Python/FastAPI + Playwright/Chromium service on CT 106, port 8100. Running at `http://10.8.8.167:8100`.
- Files: `~/Clipforge-be/tiktok-service/` on CT 106
- Env: `~/Clipforge-be/tiktok-service/.env` (gitignored — contains `TIKTOK_MS_TOKENS`)
- Restart: `cd ~/Clipforge-be/tiktok-service && docker compose restart`
- Rebuild: `docker compose down && docker compose up -d --build`
- **Note:** Uses a burner TikTok account msToken. If banned, create new burner, grab fresh msToken from DevTools (Application → Cookies → `.tiktok.com` → `msToken`), update `.env`, restart.
- DNS fix required: `dns: [8.8.8.8, 8.8.4.4]` set in docker-compose.yml (CT 106 host only has Tailscale DNS)

### Asset Generation APIs

| Key | Service | Used for |
|-----|---------|----------|
| `ELEVENLABS_API_KEY` | ElevenLabs | Voiceover TTS |
| `HEYGEN_API_KEY` | HeyGen | Avatar video generation |
| `HIGGSFIELD_API_KEY` | Higgsfield | Product visual generation |
| `XAI_API_KEY` | xAI (Grok) | Visual scene image generation |

### Frontend → Backend Integration

1. ~~**Auth**~~ ✅ Done — mock bypass removed, real JWT login/`/auth/me` validation on mount
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
