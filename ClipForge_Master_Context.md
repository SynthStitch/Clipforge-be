# ClipForge — Complete System Context

*Master reference document. Paste into any new Claude session for full project context.*
*Last updated: March 31, 2026*

---

## What Is ClipForge

ClipForge is a SaaS platform for TikTok Shop affiliates, sellers, and creators. It discovers high-converting niches with low competition, analyzes what content is working in those niches, and helps users create content that drives sales. It's a creator intelligence + content generation platform.

**The pipeline:** Discover niches → Score desire-pull → Measure saturation → Analyze winning content → Generate content briefs → Track performance

**Target users:** TikTok Shop affiliate marketers, TikTok creators, small e-commerce brands, content agencies.

**Competitors:** Kalodata (~$46-100/mo, trending products), FastMoss (~$59-199/mo, deep analytics), Daily Virals (viral products feed), SimpTok (free, basic). None of them do desire-pull scoring, saturation gap analysis, or content generation from intelligence data.

---

## Infrastructure

**Daniel's homelab (Proxmox-based Supermicro server):**
- Ubiquiti network, OPNsense router on Protectli
- Docker LXC containers for all services
- Tailscale for remote access
- Cloudflare Tunnels for public exposure

**Services running / planned:**

| Service | Host | Port | Status |
|---|---|---|---|
| n8n (self-hosted) | 192.168.86.201 | 5678 | Running |
| PostgreSQL (ClipForge DB) | TBD | 5432 | Planned |
| ClipForge Backend (Node.js/Express) | TBD | 4000 | Planned |
| ClipForge Frontend (React/Next.js) | TBD | 3000 | Planned |
| TikTok Data Service (Python/FastAPI) | TBD | 8100 | Planned |
| n8n MCP Connector | n8n-mcp.com | — | Connected to Claude |

---

## n8n Workflows (10 ClipForge workflows)

### Core Intelligence Workflows

| # | Workflow | ID | Nodes | Schedule | Data Source | Nimble Calls |
|---|---|---|---|---|---|---|
| 1 | Niche Discovery & Desire Scoring v1 | `3A6EGhLMlwpT7Lqc` | 26 | Weekly Mon 5am | Nimble (Amazon M&S + Google Trends + TikTok Shop) + DeepSeek | ~37 + N per new niche |
| 2 | Niche Intelligence v1 | `wOOLIdyeofjoES2o` | 13 | Daily 6am | Nimble (TikTok hashtags + Shop) | 2 × tracked niches |
| 3 | Video Transcriber v1 | `ogYYOtjfdTZoQ7XI` | 8 | On-demand webhook | Nimble + Gemini + DeepSeek | 1 per video |
| 4 | Weekly Niche Digest | `CmacHcPnZUFwD48x` | 10 | Sunday 8pm | ClipForge API (Postgres) + DeepSeek | 0 |
| 5 | Creator Intelligence Tracker | `Io0WiCPaGcnglpMZ` | 14 | Daily 7am | TikTok Data Service (free) | 0 |
| 6 | Comment Sentiment Miner | `KbIpYQLBesfXaqeN` | 9 | On-demand webhook | TikTok Data Service + DeepSeek | 0 |
| 7 | Trending Sounds Tracker | `AwlpZm6tnc0GDIsN` | 7 | Daily 9am | TikTok Data Service (free) | 0 |
| 8 | Competitor Shop Monitor | `E9mAi1E4et67UGAY` | 12 | Daily 10am | Nimble (TikTok Shop pages) | 1 per followed shop |
| 9 | Performance Feedback Loop | `CKp5vAzRetE8MpY8` | 11 | On-demand + 24h wait | TikTok Data Service | 0 |

### Atlas Workshop (separate project, same n8n instance)

| # | Workflow | ID | Nodes | Schedule |
|---|---|---|---|---|
| 10 | Atlas Price Sync v2 — Hardened | `f9GatQ1Uu3H4y4Nc` | 16 | 2x/day 8am+8pm |

### Legacy / Test (can be archived)

- `saqehBRBvH74r9Zd` — Atlas Price Sync v1 (replaced by v2)
- `SFBjAAPjVJX1BqWS` — Atlas Price Sync copy
- `ho0lFmZyvnF7eJHp` — PostFlow Creator Intelligence (old)
- `THy8rnMTfAXQ47Bl` — PostFlow Asset Generation (old)
- `UdqtqmiH4tlYVwYw` — MCP Test
- `Mvjy5kKk6hm8lyy4` — My workflow 2
- `puN2v846H0xLv2Nw` — My workflow

### Daily Schedule

```
5am  Mon   — Niche Discovery & Desire Scoring (weekly)
6am  Daily — Niche Intelligence (TikTok saturation)
7am  Daily — Creator Intelligence (who's winning per niche)
8am  2x/day — Atlas Price Sync (Atlas Workshop project)
9am  Daily — Trending Sounds (what audio is hot)
10am Daily — Competitor Shop Monitor (TikTok Shop changes)
8pm  Sun   — Weekly Niche Digest (email summary)

On-demand (webhook):
  /transcribe-video  — Video Transcriber
  /mine-comments     — Comment Sentiment Miner
  /track-performance — Performance Feedback Loop
```

---

## Workflow Details

### 1. Niche Discovery & Desire Scoring

**Flow:**
```
Cron ─┬→ 6 Amazon M&S categories → Loop → Nimble scrape → Wait 3s → DeepSeek classify niches → Parse → loop back
      │                                                                                          ↓ done
      └→ Google Trends (Nimble) → Extract Trends ──────────────────────────────────→ Aggregate + Dedup
                                                                                        ↓
                                                                        Read Watchlist → Filter new
                                                                                        ↓
                  Loop → Nimble /product-reviews/{ASIN} → Wait 3s → Nimble TikTok Shop → Wait 3s
                                                                                        ↓
                                                          DeepSeek score (Amazon + TikTok data) → Calc convertibility
                                                                                        ↓
                                                                    Sheet → DB → Gold? → Alert email
```

**Convertibility formula:**
```
convertibility = desire_pull × 0.25 + passion × 0.15 + impulse × 0.15 + velocity × 0.15 + social_proof × 0.10 + tiktok_infra × 0.20
```

**Six desire dimensions scored by DeepSeek:** Health, Wealth, Sex/Beauty, Status, Fear, Identity

**Amazon categories scanned:** Health & Household, Beauty, Electronics, Computers, Home & Kitchen, Tools

### 2. Niche Intelligence

**Flow:**
```
Cron → Read Niche Watchlist → Loop → Nimble TikTok hashtag → Nimble TikTok Shop search
  → Calculate saturation score → Sheet → DB → If opportunity → Alert email → Loop back
```

### 3. Video Transcriber

**Flow:**
```
POST /transcribe-video {video_url, niche}
  → Nimble download page → Gemini transcribe audio → DeepSeek analyze transcript
  → Extract: hook, hook_type, cta, cta_type, script_structure, tone, product_mentions, key_phrases
  → Sheet → DB → Respond with summary
```

### 4. Weekly Niche Digest

**Flow:**
```
Cron Sunday 8pm → GET gold discoveries + top movers + hook patterns from ClipForge API
  → Merge → DeepSeek writes HTML email briefing → Resend email
```

### 5. Creator Intelligence Tracker

**Flow:**
```
Cron 7am → GET gold+silver niches from API → Loop → TikTok Data Service /hashtag/{tag}
  → Extract top 5 creators by views → Loop → TikTok Data Service /user/{username}/videos
  → Calculate: avg views, engagement rate, posting frequency → Sheet → DB → Loop back
```

### 6. Comment Sentiment Miner

**Flow:**
```
POST /mine-comments {video_id, video_url, niche}
  → TikTok Data Service /video/{id}/comments → DeepSeek classify comments
  → Extract: purchase_intent_pct, objection_themes, social_proof_count, question_themes
  → Sheet → DB → Respond with analysis
```

### 7. Trending Sounds Tracker

**Flow:**
```
Cron 9am → TikTok Data Service /trending?count=50 → Extract sound/music metadata
  → Aggregate by frequency → Identify commerce-relevant sounds → Sheet → DB
```

### 8. Competitor Shop Monitor

**Flow:**
```
Cron 10am → Read "Followed Shops" sheet → Loop → Nimble scrape TikTok Shop page → Wait 3s
  → Compare to yesterday's snapshot (product count, prices) → Log snapshot → DB
  → If changes detected → Alert email → Loop back
```

### 9. Performance Feedback Loop

**Flow:**
```
POST /track-performance {video_id, video_url, niche, hook_type, structure, posted_at}
  → Wait 24 hours → TikTok Data Service /video/{id} → Get views/likes/comments/shares
  → Compare to niche averages → Sheet → DB
  → If above average → "This is working" email
  → If below average → "Try these improvements" email
```

---

## Database Schema (PostgreSQL: clipforge_db)

### Existing Tables (SQL files created)

**niche_intelligence** — Daily saturation scans per niche
- Key fields: niche_name, hashtag, scan_date, hashtag_video_count, hashtag_views_7d, shop_product_count, active_creator_count, saturation_score, opportunity_score, is_opportunity, opportunity_tier
- Unique: (niche_name, scan_date)
- Views: v_niche_latest, v_niche_opportunities, v_niche_trending

**niche_discoveries** — Auto-discovered niches with desire-pull scores
- Key fields: niche_name, source, desire_health/wealth/sex/status/fear/identity, desire_pull_score, dominant_desire, convertibility_score, opportunity_tier, tiktok_infrastructure, impulse_trigger
- Unique: (niche_name, source)
- Views: v_gold_opportunities, v_desire_heatmap

**video_transcripts** — Transcribed videos with content pattern analysis
- Key fields: video_url, niche, transcript, hook, hook_type, cta, cta_type, script_structure, tone, product_mentions, key_phrases, content_summary
- Unique: video_url
- Views: v_hook_patterns, v_content_structures

### New Tables Needed (for new workflows)

**creator_profiles** — Creator intelligence per niche
- Fields: username, display_name, niche_name, hashtag, followers, verified, avg_views, engagement_rate_pct, posting_freq_per_week, best_video_views, total_views_recent, total_likes_recent, scanned_at
- Unique: (username, niche_name, DATE(scanned_at))

**comment_sentiment** — Comment analysis per video
- Fields: video_id, video_url, niche, total_comments, purchase_intent_count, purchase_intent_pct, objection_count, objection_themes, social_proof_count, question_themes, emotional_intensity, dominant_sentiment, top_purchase_comments, top_objections, analyzed_at
- Unique: video_url

**trending_sounds** — Daily trending sound tracking
- Fields: sound_id, sound_title, sound_author, original, video_count, total_views, avg_views_per_video, total_likes, niches, commerce_relevance, scanned_at
- Index: (sound_id, DATE(scanned_at))

**shop_snapshots** — Daily competitor shop monitoring
- Fields: shop_name, shop_url, niche, product_count, avg_price, new_products, price_change_pct, has_changes, top_products (JSONB), scanned_at
- Index: (shop_name, DATE(scanned_at))

**content_performance** — Posted video performance tracking
- Fields: video_id, video_url, niche, content_brief_id, hook_type_used, structure_used, views_24h, likes_24h, comments_24h, shares_24h, engagement_rate_24h, views_vs_avg_pct, engagement_vs_avg_pct, above_average, posted_at, measured_at
- Unique: video_id

**content_briefs** — AI-generated content briefs (Phase 1 content gen)
- Fields: user_id, niche_name, hooks (JSONB), script_outline (JSONB), full_script, emotional_angle, suggested_tone, suggested_structure, suggested_cta_type, suggested_duration, product_positioning, warnings, impulse_trigger, status, user_edited, rating
- Index: (user_id, niche_name)

---

## ClipForge Backend API (Node.js/Express)

### Internal Routes (n8n → Backend, auth: x-internal-key header)

```
POST /internal/niche-intelligence      ← Workflow 2 (daily scans)
POST /internal/niche-discoveries       ← Workflow 1 (weekly discoveries)
POST /internal/video-transcripts       ← Workflow 3 (on-demand)
POST /internal/creator-profiles        ← Workflow 5 (daily)
POST /internal/comment-sentiment       ← Workflow 6 (on-demand)
POST /internal/trending-sounds         ← Workflow 7 (daily)
POST /internal/shop-snapshots          ← Workflow 8 (daily)
POST /internal/content-performance     ← Workflow 9 (on-demand + 24h delay)
```

### Public API Routes (Frontend → Backend, auth: JWT)

```
# Dashboard
GET  /api/dashboard/summary

# Niches
GET  /api/niches
GET  /api/niches/:nicheName
GET  /api/niches/:nicheName/history
GET  /api/niches/opportunities
GET  /api/niches/opportunities/gold

# Discoveries
GET  /api/discoveries
GET  /api/discoveries/recent
GET  /api/discoveries/:id
GET  /api/discoveries/desire-heatmap

# Videos
GET  /api/videos
GET  /api/videos/:id
GET  /api/videos/hooks
GET  /api/videos/structures

# Creators
GET  /api/creators
GET  /api/creators/:username
GET  /api/creators/niche/:nicheName

# Sounds
GET  /api/sounds/trending
GET  /api/sounds/trending/niche/:nicheName

# Shops
GET  /api/shops
GET  /api/shops/:shopName/snapshots

# Content Generation
POST /api/content/generate
GET  /api/content/briefs
GET  /api/content/briefs/:id
PUT  /api/content/briefs/:id
POST /api/content/briefs/:id/regenerate
DELETE /api/content/briefs/:id

# Performance
GET  /api/performance
GET  /api/performance/niche/:nicheName

# Auth
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/refresh
```

---

## TikTok Data Service (Python/FastAPI)

Wraps `davidteather/TikTok-Api` v7.3.x. Runs on Proxmox at port 8100. Internal only.

### Endpoints

```
GET  /health
GET  /trending?count=20&region=US
GET  /hashtag/{tag}?count=30
GET  /user/{username}
GET  /user/{username}/videos?count=30
GET  /video/{video_id}
GET  /video/{video_id}/comments?count=50
POST /search  {query, count}
```

### Requirements
- Residential proxies (Webshare ~$6/mo or Nimble proxy access)
- Playwright (headless Chromium)
- 3 browser sessions with auto-recovery
- In-memory caching (1h for hashtags, 6h for profiles)

### n8n Workflows That Use It
- Workflow 5: Creator Intelligence → /hashtag/{tag}, /user/{username}/videos
- Workflow 6: Comment Sentiment → /video/{id}/comments
- Workflow 7: Trending Sounds → /trending
- Workflow 9: Performance Loop → /video/{id}
- Future: Workflow 2 (Niche Intelligence) will swap Nimble for this service for TikTok hashtag scraping

---

## Google Sheet Tabs Required

| Tab Name | Purpose | Input/Output |
|---|---|---|
| Niche Watchlist | Niches to track + auto-discovered niches | Input + auto-populated |
| Niche Intelligence | Daily saturation scan results | Output |
| Video Transcripts | Transcribed videos + hook analysis | Output |
| Creator Intelligence | Creator profiles per niche | Output |
| Comment Sentiment | Comment analysis per video | Output |
| Trending Sounds | Daily trending sound data | Output |
| Followed Shops | Competitor shops to monitor | Input (manual) |
| Shop Snapshots | Daily competitor shop data | Output |
| Content Performance | Posted video performance tracking | Output |
| Workflow Errors | Error logs from all workflows | Output |

---

## External Service Dependencies

| Service | Used For | Cost | Notes |
|---|---|---|---|
| **Nimble** | Amazon scraping, TikTok Shop scraping, Google Trends | ~$3/CPM | Meeting scheduled — ask about TikTok reliability, Amazon E-commerce endpoint, volume discounts |
| **DeepSeek** | Niche classification, desire scoring, content analysis, comment classification, digest writing, content brief generation | ~$0.0007/call | Essentially free at any scale |
| **Gemini** | Video transcription | Free tier / cheap | Used in Video Transcriber workflow |
| **Resend** | Alert emails, digest emails | Free tier for low volume | Used by all workflows for error + opportunity alerts |
| **Google Sheets** | Operational visibility + data storage | Free | OAuth2 credential ID: jkrvrDy1woY9LfCt |

---

## Environment Variables (n8n)

```
# Nimble
NIMBLE_API_KEY=

# DeepSeek
DEEPSEEK_API_KEY=

# ClipForge Backend
CLIPFORGE_BACKEND_URL=http://192.168.86.XXX:4000
CLIPFORGE_API_KEY=
INTERNAL_API_KEY=

# TikTok Data Service
TIKTOK_SERVICE_HOST=192.168.86.XXX

# Google Sheets
POSTFLOW_SHEET_ID=                    # rename to CLIPFORGE_SHEET_ID

# Email
RESEND_API_KEY=
ALERT_EMAIL=

# Atlas (separate project)
ATLAS_SHEET_ID=
ATLAS_BACKEND_WEBHOOK_URL=
ATLAS_WEBHOOK_SECRET=
SCRAPEDO_API_TOKEN=
```

---

## Tech Stack Summary

| Layer | Technology |
|---|---|
| Frontend | React / Next.js 16, Tailwind CSS, Redux Toolkit |
| Backend | Node.js 20, Express, TypeScript, Prisma 6.x |
| Database | PostgreSQL 16 |
| Automation | n8n (self-hosted, Docker) |
| TikTok Scraping | Python FastAPI + davidteather/TikTok-Api + Playwright |
| Web Scraping | Nimble Web API (Amazon, TikTok Shop, Google Trends) |
| AI - Analysis | DeepSeek Chat API |
| AI - Transcription | Google Gemini 2.0 Flash |
| AI - Content Gen | DeepSeek Chat API (in backend, not n8n) |
| Email | Resend API |
| Hosting | Proxmox homelab, Docker containers |
| Network | Ubiquiti switch, OPNsense, Tailscale, Cloudflare Tunnels |

---

## Content Generation Architecture

### Phase 1 (Build Now): Content Brief Generator
- Lives in the Node.js backend, not n8n
- User selects niche → backend pulls niche data + video patterns from Postgres → sends to DeepSeek → returns content brief with hooks, script, emotional angle, warnings
- Cost: ~$0.0007 per brief (unlimited on all plans)

### Phase 2 (Next): Script Editor
- Frontend feature, basic CRUD
- Edit generated scripts, save drafts, organize by niche

### Phase 3 (When Users Exist): Avatar Library
- Integrate with HeyGen, D-ID, or similar
- User picks avatar + feeds ClipForge script → rendered video
- Cost: $0.10-0.50 per video (needs pricing model)

### Phase 4 (Growth): Custom Avatar Upload
- User uploads selfie video → creates personal AI avatar
- Generate unlimited videos in their own likeness

---

## Build Priority (What to Work on Next)

1. ✅ n8n workflows (all 10 built)
2. ✅ Landing page prototype + Antigravity design brief
3. ✅ Architecture docs for backend + TikTok service
4. **→ Get Nimble API key + set environment variables**
5. **→ Run Discovery workflow once with real data**
6. **→ Build TikTok Data Service on Proxmox**
7. **→ Build ClipForge Node.js backend (internal routes first)**
8. **→ Build ClipForge React frontend**
9. Apply for TikTok Developer API access
10. Content generation in backend
11. Avatar library integration

---

## Companion Documents

| Document | Purpose |
|---|---|
| `clipforge_backend_context.md` | Full backend build context (paste for backend session) |
| `clipforge_tiktok_service_context.md` | TikTok microservice build context (paste for service session) |
| `clipforge_content_gen_avatar_plan.md` | Content generation + avatar architecture |
| `ClipForge_Homepage_Brief.md` | Homepage design brief for Antigravity |
| `clipforge-landing.html` | Visual homepage prototype |
| `postflow_niche_intelligence.sql` | Postgres schema for niche intelligence |
| `postflow_video_transcripts.sql` | Postgres schema for video transcripts |
| `postflow_niche_discovery.sql` | Postgres schema for niche discoveries |

---

## Key Decisions Made

- **PostFlow → ClipForge** rebrand (PostFlow is a competitor's name)
- **DeepSeek over OpenAI** for analysis (cheaper, good enough for structured extraction)
- **Gemini for transcription** (can accept video directly, no FFmpeg needed)
- **Nimble for Amazon + TikTok Shop** scraping, **davidteather library for TikTok content** scraping (free)
- **Shared niche model** over per-user scanning (scales better, lower Nimble cost)
- **PostgreSQL on homelab** not cloud DB (data is small, ~100-130MB/year, 2TB server has plenty of room)
- **Content generation in backend** (not n8n) because it's user-interactive
- **Avatar library is Phase 3** (after paying users exist, costs $0.10-0.50/video)
