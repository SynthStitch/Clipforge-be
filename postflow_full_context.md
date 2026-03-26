# PostFlow — Full Project Context (March 2026)

You are helping me build **PostFlow**, a SaaS for TikTok creators and TikTok Shop sellers. Paste this entire document into Claude to pick up where we left off.

---

## What PostFlow Does

PostFlow connects to a creator's TikTok account, analyzes their performance data, and tells them exactly what to post next. It is part analytics engine, part content strategist, part creative production system.

The core promise: **We analyze your TikTok performance and tell you exactly what to post next.**

For TikTok Shop sellers specifically, it helps them find which content formats, hooks, and product angles actually convert — stop chasing random trends, increase consistency and GMV.

## Product Philosophy

- User should understand what to do next in under 10 seconds
- Clean, minimal, dark-mode friendly — inspired by Linear, Vercel, Stripe
- Not a cluttered analytics dashboard
- Analytics first, AI second, RAG third
- Creator-friendly, modern, fast, actionable, premium but not corporate

## Target Users

Creators who are posting frequently, trying to grow, trying to monetize, overwhelmed by data but lacking direction.

---

## Architecture: Two Workflows + Shared Context

The system is built as **two separate n8n workflows** with PostgreSQL as the shared context layer. They are separate because they run on different cadences and combining them wastes money on redundant API calls.

### Workflow 1: Creator Intelligence (n8n ID: `ho0lFmZyvnF7eJHp`)
- **Purpose:** Ingest TikTok data, compute analytics, infer niche/content guidance, produce a structured Creative Brief
- **Cadence:** On account connect, daily at 6am UTC, on webhook trigger (manual refresh)
- **Status:** 25 nodes, fully wired and validated, 0 errors

**Node pipeline:**
1. Three triggers (manual, daily cron, webhook POST to `/postflow-refresh`)
2. Load User Record — Postgres query on `users` table
3. Load TikTok Tokens — Postgres query on `connected_accounts` with `decrypt_token()`
4. Validate / Refresh Token — Code node checking expiry, refreshes via TikTok OAuth endpoint if needed
5. Fetch TikTok Profile — HTTP GET to `https://open.tiktokapis.com/v2/user/info/`
6. Save Account Snapshot — Postgres INSERT into `account_snapshots`
7. Fetch Recent Videos — HTTP POST to `https://open.tiktokapis.com/v2/video/list/`
8. Loop Through Videos — SplitInBatches (10 per batch)
9. Fetch Per-Video Metrics — HTTP POST to `https://open.tiktokapis.com/v2/video/query/`
10. Upsert Videos — Postgres upsert into `videos` table
11. Insert Metrics Snapshot — Postgres INSERT into `video_metrics_snapshots` (triggers `sync_latest_metrics()` automatically)
12. Fetch / Scrape Comments — HTTP POST to `https://open.tiktokapis.com/v2/comment/list/`
13. Save Comments — Postgres INSERT with ON CONFLICT DO NOTHING
14. Extract Entities (NLP) — Basic LLM Chain + Anthropic Claude Sonnet, extracts product_mentions, objections, desires, questions, brands, price_points from comments/captions
15. Save Extracted Entities — Postgres INSERT into `extracted_entities`
16. Compute Deterministic Analytics — Postgres: refreshes `mv_format_performance` and `mv_posting_windows` materialized views, queries `v_video_momentum`, builds structured JSON
17. LLM Reasoning Step — Basic LLM Chain + Anthropic Claude Sonnet, interprets analytics, recommends niches, suggests content tests
18. Build Creative Brief — Code node merging deterministic analytics + LLM output, validates required keys
19. Save Creative Brief — Postgres INSERT into `creative_briefs` (trigger auto-marks previous versions as not current)
20. Save Recommendations — Postgres INSERT into `recommendations`
21. Log Ingestion Run — Postgres INSERT into `ingestion_log`

All DB and HTTP nodes have retry logic (2-3 retries, 1-3s delays). Non-critical nodes (comments, entities, recommendations, log) use `onError: continueRegularOutput`.

### Workflow 2: Asset Generation (n8n ID: `THy8rnMTfAXQ47Bl`)
- **Purpose:** Take a Creative Brief, generate publishable content assets
- **Cadence:** On demand (webhook), content calendar schedule (Mon/Wed/Fri 8am UTC), manual trigger
- **Status:** 20 nodes, fully wired and validated, 0 errors

**Node pipeline:**
1. Three triggers (manual, webhook POST to `/postflow-generate`, scheduled MWF)
2. Load Creative Brief — Postgres query for latest `is_current = true` brief
3. Load User Preferences — Postgres join `users` + `connected_accounts`
4. Content Planning (LLM) — Basic LLM Chain + Anthropic Claude Sonnet (temp 0.7), generates hooks, script, CTA, shot list, visual treatment, voice style
5. Parse Content Plan — Code node parsing LLM JSON output, validates content_type
6. Route by Content Type — Switch node with 3 outputs:
   - **Output 0 (Faceless Affiliate):** ElevenLabs TTS + Grok Imagine visual generation → Package Faceless Assets
   - **Output 1 (Avatar Explainer):** HeyGen async video generation → Poll HeyGen Status (10s intervals, 5min timeout) → Package Avatar Assets
   - **Output 2 (Product Demo Hybrid):** Higgsfield product visuals + ElevenLabs TTS → Package Demo Assets
7. Save Generated Assets — All branches converge, Postgres INSERT into `generated_assets`
8. Log Generation Run — Postgres INSERT into `ingestion_log`

### The Creative Brief (Handoff Contract)

This is the canonical object that bridges Workflow 1 and Workflow 2. Workflow 2 never reads raw analytics — it reads this structured brief.

```json
{
  "account_summary": {
    "best_formats": ["faceless demo", "caption-heavy listicle"],
    "weak_formats": ["long talking head"],
    "best_posting_windows": ["6pm-8pm CST"]
  },
  "audience_signals": {
    "common_objections": ["too expensive", "does this really work"],
    "common_desires": ["easy side income", "time-saving", "beginner friendly"],
    "recurring_questions": []
  },
  "niche_recommendations": [
    {
      "niche": "budget amazon affiliate gadgets",
      "confidence": 0.82,
      "reason": "high save/comment response to practical utility products"
    }
  ],
  "creative_brief": {
    "tone": "direct, practical, fast hook",
    "cta_style": "soft curiosity",
    "recommended_next_tests": [
      "problem-solution gadget clips",
      "top 3 under $25 roundup"
    ]
  },
  "performance_snapshot": {
    "avg_engagement_rate": 0.045,
    "momentum_trend": "rising",
    "top_video_ids": [],
    "raw_format_performance": {},
    "raw_posting_windows": {},
    "baseline": {}
  }
}
```

---

## Database Schema (PostgreSQL)

Both SQL files need to be run against Postgres before the workflows will work. Run `postflow_schema.sql` first, then `postflow_optimizations.sql`.

### Tables

| Table | Purpose | Written by |
|-------|---------|------------|
| `users` | User accounts, plan tier | Backend auth |
| `connected_accounts` | TikTok OAuth tokens (encrypted via pgcrypto) | Backend OAuth flow |
| `account_snapshots` | Point-in-time follower/video/like counts | Workflow 1 |
| `videos` | Video metadata + denormalized latest metrics | Workflow 1 |
| `video_metrics_snapshots` | Time-series metrics per video (for momentum) | Workflow 1 |
| `comments` | Scraped/fetched comments per video | Workflow 1 |
| `extracted_entities` | NLP-extracted product mentions, objections, desires, questions, brands | Workflow 1 |
| `creative_briefs` | Structured JSONB brief — the handoff contract | Workflow 1 |
| `recommendations` | Daily post idea sets | Workflow 1 |
| `generated_assets` | Scripts, voiceovers, videos, visual scenes | Workflow 2 |
| `ingestion_log` | Debug log for sync/generation runs | Both workflows |

### Key Schema Features

- **UUIDs everywhere** via `uuid-ossp`
- **Token encryption** via `pgcrypto` — `pgp_sym_encrypt`/`decrypt_token()` helper function, app sets `app.encryption_key` at connection time
- **Denormalized latest metrics on `videos`** — trigger `sync_latest_metrics()` auto-updates `latest_views`, `latest_likes`, `latest_engagement_rate` etc. when a new `video_metrics_snapshots` row is inserted
- **Generated columns** — `length_bucket` (short/medium/long) and `engagement_rate` are computed by Postgres, not app code
- **Materialized views** — `mv_format_performance` (avg engagement per format) and `mv_posting_windows` (best day/hour combos), refreshed concurrently at end of Workflow 1
- **Momentum view** — `v_video_momentum` uses `LAG()` to compute views-per-hour velocity
- **CHECK constraints** on all enum-like text columns (plan, platform, format_tag, entity_type, status, content_branch, provider, etc.)
- **Comment deduplication** via UNIQUE constraint on `(video_id, platform_comment_id)`
- **BRIN indexes** on time-series tables (metrics snapshots, comments)
- **Partial indexes** for active recommendations (`WHERE is_dismissed = false`) and pending assets (`WHERE status IN ('pending', 'processing')`)
- **Brief validation** — CHECK constraint ensures `brief_json` contains required keys (`account_summary`, `audience_signals`, `creative_brief`)
- **Brief versioning** — trigger `set_brief_current()` auto-marks older versions as `is_current = false`
- **Retention pruning** — `prune_metric_snapshots(30)` keeps last 30 per video, `prune_ingestion_logs(90)` clears logs older than 90 days
- **RLS prep** — row-level security policies stubbed but not yet enabled

### Valid Enum Values (enforced by CHECK constraints)

- `users.plan`: free, pro, enterprise
- `connected_accounts.platform`: tiktok, instagram
- `videos.format_tag`: tutorial, story, product_demo, reaction, faceless_demo, listicle, talking_head, opinion, unboxing, review, other
- `extracted_entities.entity_type`: product_mention, objection, desire, question, keyword, brand, price_point, competitor
- `extracted_entities.source_type`: comment, caption, bio, product_link
- `generated_assets.status`: pending, processing, completed, failed, cancelled
- `generated_assets.content_branch`: faceless_affiliate, avatar_explainer, product_demo_hybrid
- `generated_assets.provider`: elevenlabs, heygen, higgsfield, grok_imagine, runway, luma, llm
- `ingestion_log.run_type`: full_sync, incremental, manual_refresh
- `ingestion_log.status`: started, completed, failed

---

## Environment Variables Required

Set these in n8n's environment configuration:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `TIKTOK_CLIENT_KEY` | Workflow 1 | TikTok OAuth app client key |
| `TIKTOK_CLIENT_SECRET` | Workflow 1 | TikTok OAuth app client secret |
| `ELEVENLABS_API_KEY` | Workflow 2 | ElevenLabs TTS API |
| `HEYGEN_API_KEY` | Workflow 2 | HeyGen video generation |
| `HEYGEN_DEFAULT_AVATAR` | Workflow 2 | Default HeyGen avatar ID |
| `HEYGEN_DEFAULT_VOICE` | Workflow 2 | Default HeyGen voice ID |
| `HIGGSFIELD_API_KEY` | Workflow 2 | Higgsfield visual generation |
| `XAI_API_KEY` | Workflow 2 | xAI Grok Imagine image generation |

Additionally, configure in n8n UI:
- Postgres credentials on all DB nodes (both workflows)
- Anthropic API key on all 3 Anthropic Chat Model sub-nodes

---

## TikTok API Endpoints Used

| Endpoint | Method | Used in |
|----------|--------|---------|
| `/v2/oauth/token/` | POST | Token refresh (Code node) |
| `/v2/user/info/` | GET | Fetch profile (HTTP Request) |
| `/v2/video/list/` | POST | Fetch recent videos (HTTP Request) |
| `/v2/video/query/` | POST | Fetch per-video metrics (HTTP Request) |
| `/v2/comment/list/` | POST | Fetch comments (HTTP Request) |

All require Bearer token auth via the user's stored `access_token`.

---

## External API Endpoints Used (Workflow 2)

| Provider | Endpoint | Purpose |
|----------|----------|---------|
| ElevenLabs | `POST /v1/text-to-speech/{voice_id}` | TTS voiceover generation |
| HeyGen | `POST /v2/video/generate` | Avatar video generation (async) |
| HeyGen | `GET /v1/video_status.get?video_id=...` | Poll generation status |
| Grok Imagine (xAI) | `POST /v1/images/generations` | Visual scene generation |
| Higgsfield | `POST /v1/generations` | Product visual generation |

---

## Current Technical Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React (Vite or Next.js) — partially done |
| Backend | Not yet built — needs Node.js/Express API |
| Database | PostgreSQL (schema + optimizations designed, not yet deployed) |
| Orchestration | n8n (2 workflows fully built and validated) |
| LLM | Claude Sonnet via Anthropic API (used in n8n for NLP + reasoning) |
| n8n ↔ Claude | MCP connection active |

---

## What's Built

1. ✅ Full PostgreSQL schema (11 tables, triggers, functions)
2. ✅ Schema optimizations (encryption, generated columns, materialized views, BRIN indexes, retention pruning, CHECK constraints, brief validation)
3. ✅ Workflow 1: Creator Intelligence — 25 nodes, validated, error handling configured
4. ✅ Workflow 2: Asset Generation — 20 nodes, validated, 3-branch routing, async polling
5. ✅ Creative Brief contract defined and enforced
6. ✅ n8n MCP connection working
7. 🔲 Frontend — partially done (Figma mockups exist)
8. 🔲 Backend API — not yet built

## What Needs to Be Built Next

### Backend API (Node.js / Express)

The backend needs to handle:

1. **Auth layer** — user signup/login, session management, JWT or similar
2. **TikTok OAuth flow** — redirect user to TikTok auth, handle callback, store tokens in `connected_accounts` (encrypted)
3. **API routes the frontend will call:**
   - `GET /api/dashboard` — latest account snapshot, recent videos with denormalized metrics, current creative brief
   - `GET /api/videos` — paginated video list with latest metrics, filterable by format_tag
   - `GET /api/insights` — current creative brief + recommendations
   - `GET /api/recommendations` — active (non-dismissed) recommendations
   - `POST /api/recommendations/:id/dismiss` — mark recommendation as dismissed
   - `POST /api/refresh` — trigger Workflow 1 via webhook (`POST /postflow-refresh` with userId)
   - `POST /api/generate` — trigger Workflow 2 via webhook (`POST /postflow-generate` with userId + optional content_type)
   - `GET /api/assets` — generated assets for the user, filterable by status/branch
   - `GET /api/account` — user profile, connected accounts, plan info
   - `POST /api/connect/tiktok` — initiate TikTok OAuth
   - `GET /api/connect/tiktok/callback` — handle OAuth callback
4. **Postgres connection** — using `pg` or an ORM like Drizzle/Prisma, must set `app.encryption_key` on each connection for token decryption

### Frontend (React)

The dashboard design is in Figma. Main sections:
- **Dashboard** — overview metrics (from latest `account_snapshots`), recent videos (from `videos` with denormalized metrics), content format insights (from `mv_format_performance`), daily recommendations (from `recommendations`)
- **Videos** — full video list with engagement data, format tags, momentum indicators
- **Insights** — creative brief visualization, niche recommendations, audience signals
- **Recommendations** — 3 recommended post ideas with hooks, formats, posting windows
- **Generate** — trigger content generation, view generated assets, download/preview
- **Settings** — account connection, plan management

Design tokens: premium modern SaaS, dark mode, subtle gradients, creator-friendly, not corporate. Inspired by Linear, Vercel, Stripe.

---

## Key Design Decisions to Preserve

1. **Analytics first, AI second, RAG third** — deterministic logic handles all calculations, LLMs only interpret and generate
2. **Two workflows, not one** — different cadences, cheaper, easier to debug
3. **Creative Brief is the contract** — Workflow 2 never reads raw analytics
4. **No agents in v1** — deterministic workflow logic + one LLM reasoning step + one LLM generation step
5. **Denormalized latest metrics** — dashboard reads from `videos` table directly, no joins needed
6. **Materialized views for analytics** — pre-computed format and posting window performance
7. **Token encryption at rest** — pgcrypto symmetric encryption with app-level key
8. **Generated columns** — length_bucket and engagement_rate computed by Postgres

---

## Phase Plan

### Phase 1 (Current)
- ✅ Schema + workflows
- 🔲 Deploy Postgres, run schema
- 🔲 Build backend API
- 🔲 Build frontend dashboard
- 🔲 TikTok OAuth flow
- 🔲 First end-to-end test with real account

### Phase 2
- Workflow 2 light: scripts, hooks, shot lists, voiceover only
- Content calendar feature

### Phase 3
- Full generation: HeyGen, Higgsfield, Grok Imagine, asset storage (S3/R2)
- Render orchestration

### Phase 4
- Optional agent layer: planner, critic, retry/fixer
- RAG for account-level chat ("What should I post today?")
- Vector DB integration

---

## Quick Start for Next Session

Paste this document, then ask:

**"Help me build the backend API for PostFlow. I need Node.js/Express routes that connect to the Postgres schema, handle TikTok OAuth, and serve data to the React frontend. The n8n workflows are already built — the backend just needs to trigger them via webhook and read from the shared database."**

Or if starting with frontend:

**"Help me build the PostFlow React dashboard. I have the Postgres schema and n8n workflows already built. I need the frontend to display the dashboard (account metrics, recent videos, format insights, recommendations), an insights page showing the Creative Brief, and a generate page that triggers Workflow 2."**
