# ClipForge Backend API — Full Project Context

*Paste this entire document into a new Claude session to build the backend.*

---

## What We're Building

The ClipForge Node.js/Express backend API. It serves two purposes:

1. **Receives data from n8n workflows** — n8n automation workflows push niche intelligence, video transcripts, and niche discovery data into PostgreSQL via this API.
2. **Serves the React frontend** — the ClipForge web app (dashboard) reads from this API to display niche opportunities, desire scores, video intelligence, and content tools.

---

## What ClipForge Is

ClipForge is a SaaS platform for TikTok Shop affiliates, sellers, and creators. It finds high-converting niches with low competition, analyzes what content is working in those niches, and helps users create content that drives sales.

**Core features:**
- **Niche Discovery** — auto-discovers trending product niches from Amazon Movers & Shakers, Google Trends, and TikTok Shop. Scores them on human desire-pull (health, wealth, sex, status, fear, identity) and TikTok Shop readiness.
- **Niche Intelligence** — daily TikTok saturation scanning (hashtag volume, creator count, viewer demand, supply/demand ratio).
- **Video Intelligence** — transcribes top-performing TikTok videos, extracts hooks, CTAs, script structures, and content patterns.
- **Content Generation** — (future) turns patterns from winning videos into content briefs and scripts.

---

## Infrastructure Context

**Daniel's homelab (Proxmox):**
- n8n: `192.168.86.201:5678` (Docker container, self-hosted)
- PostgreSQL: on Proxmox host (ClipForge DB: `clipforge_db`)
- TikTok Data Service: `192.168.86.XXX:8100` (Python/FastAPI microservice, to be built separately)

**This backend will run at:** TBD — likely same Proxmox Docker LXC, port 4000.

**Frontend:** React app (to be built), port 3000. Backend serves it API data.

**n8n MCP connector:** Daniel has Claude connected to his n8n instance via the n8n-mcp.com hosted connector. Workflows are managed through Claude.

---

## Tech Stack

- **Runtime:** Node.js 20+
- **Framework:** Express.js with TypeScript
- **ORM:** Prisma 6.x
- **Database:** PostgreSQL (`clipforge_db`)
- **Auth:** JWT (for frontend users) + internal API key (for n8n webhook calls)
- **Email:** Resend API
- **Testing:** Vitest + Supertest
- **Deployment:** Docker container on Proxmox

---

## Database Schema

Three tables already designed (SQL files exist). The backend needs Prisma models matching these:

### Table: niche_intelligence
Daily saturation scans from n8n Niche Intelligence workflow.

```prisma
model NicheIntelligence {
  id                    String    @id @default(uuid())
  nicheName             String    @map("niche_name")
  hashtag               String?
  tiktokShopCategory    String?   @map("tiktok_shop_category")
  
  // Demand signals
  hashtagVideoCount     BigInt    @default(0) @map("hashtag_video_count")
  hashtagViews7d        BigInt    @default(0) @map("hashtag_views_7d")
  shopProductCount      Int       @default(0) @map("shop_product_count")
  avgProductPrice       Decimal?  @db.Decimal(12,2) @map("avg_product_price")
  estimatedGmv          Decimal?  @db.Decimal(14,2) @map("estimated_gmv")
  
  // Supply signals
  activeCreatorCount    Int       @default(0) @map("active_creator_count")
  activeSellerCount     Int       @default(0) @map("active_seller_count")
  topCreatorFollowers   BigInt    @default(0) @map("top_creator_followers")
  
  // Scores (0-100)
  saturationScore       Decimal   @default(0) @db.Decimal(5,2) @map("saturation_score")
  opportunityScore      Decimal   @default(0) @db.Decimal(5,2) @map("opportunity_score")
  revenuePerCreator     Decimal   @default(0) @db.Decimal(12,2) @map("revenue_per_creator")
  demandSupplyRatio     Decimal   @default(0) @db.Decimal(10,2) @map("demand_supply_ratio")
  
  // Week-over-week velocity
  creatorCountWow       Decimal?  @db.Decimal(7,2) @map("creator_count_wow")
  productCountWow       Decimal?  @db.Decimal(7,2) @map("product_count_wow")
  gmvWow                Decimal?  @db.Decimal(7,2) @map("gmv_wow")
  
  // Classification
  isOpportunity         Boolean   @default(false) @map("is_opportunity")
  opportunityTier       String?   @map("opportunity_tier") // gold, silver, bronze, none
  
  // Raw data
  rawHashtagResponse    Json?     @map("raw_hashtag_response")
  rawShopResponse       Json?     @map("raw_shop_response")
  
  // Timestamps
  scanDate              DateTime  @map("scan_date") @db.Date
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  
  // Unique constraint: one scan per niche per day
  @@unique([nicheName, scanDate])
  @@index([nicheName])
  @@index([scanDate(sort: Desc)])
  @@index([opportunityScore(sort: Desc)])
  @@map("niche_intelligence")
}
```

### Table: video_transcripts
Transcribed TikTok videos with AI-extracted content patterns.

```prisma
model VideoTranscript {
  id                        String    @id @default(uuid())
  videoUrl                  String    @unique @map("video_url")
  platform                  String    @default("tiktok")
  niche                     String?
  creatorHandle             String?   @map("creator_handle")
  
  // Transcript
  transcript                String?
  wordCount                 Int       @default(0) @map("word_count")
  estimatedDurationSeconds  Int       @default(0) @map("estimated_duration_seconds")
  
  // Hook analysis
  hook                      String?
  hookType                  String?   @map("hook_type") // question, bold_claim, curiosity_gap, demonstration, pain_point, story, shock_value
  
  // CTA analysis
  cta                       String?
  ctaType                   String?   @map("cta_type") // follow, link_in_bio, comment, share, shop_now, none
  
  // Content structure
  scriptStructure           String?   @map("script_structure") // problem_solution, tutorial, story, listicle, before_after, review, unboxing, comparison
  tone                      String?   // casual, professional, urgent, funny, emotional, educational
  
  // Extracted signals
  productMentions           String?   @map("product_mentions")
  keyPhrases                String?   @map("key_phrases")
  contentSummary            String?   @map("content_summary")
  
  // Raw AI response
  rawDeepseekResponse       Json?     @map("raw_deepseek_response")
  
  // Foreign key to niche scan (optional)
  sourceNicheScanId         String?   @map("source_niche_scan_id")
  sourceNicheScan           NicheIntelligence? @relation(fields: [sourceNicheScanId], references: [id], onDelete: SetNull)
  
  analyzedAt                DateTime  @default(now()) @map("analyzed_at")
  createdAt                 DateTime  @default(now()) @map("created_at")
  updatedAt                 DateTime  @updatedAt @map("updated_at")
  
  @@index([niche])
  @@index([hookType])
  @@index([scriptStructure])
  @@index([analyzedAt(sort: Desc)])
  @@map("video_transcripts")
}
```

### Table: niche_discoveries
Auto-discovered niches with desire-pull and convertibility scoring.

```prisma
model NicheDiscovery {
  id                    String    @id @default(uuid())
  nicheName             String    @map("niche_name")
  hashtag               String?
  source                String    @default("amazon_movers")
  sourceCategory        String?   @map("source_category")
  sourceProduct         String?   @map("source_product")
  
  // Desire-pull scores (0-100)
  desireHealth          Decimal   @default(0) @db.Decimal(5,2) @map("desire_health")
  desireWealth          Decimal   @default(0) @db.Decimal(5,2) @map("desire_wealth")
  desireSex             Decimal   @default(0) @db.Decimal(5,2) @map("desire_sex")
  desireStatus          Decimal   @default(0) @db.Decimal(5,2) @map("desire_status")
  desireFear            Decimal   @default(0) @db.Decimal(5,2) @map("desire_fear")
  desireIdentity        Decimal   @default(0) @db.Decimal(5,2) @map("desire_identity")
  desirePullScore       Decimal   @default(0) @db.Decimal(5,2) @map("desire_pull_score")
  dominantDesire        String?   @map("dominant_desire")
  
  // Review analysis
  reviewCountAnalyzed   Int       @default(0) @map("review_count_analyzed")
  reviewPassionScore    Decimal   @default(0) @db.Decimal(5,2) @map("review_passion_score")
  
  // Convertibility
  avgPricePoint         Decimal?  @db.Decimal(12,2) @map("avg_price_point")
  impulseBuyScore       Decimal   @default(0) @db.Decimal(5,2) @map("impulse_buy_score")
  convertibilityScore   Decimal   @default(0) @db.Decimal(5,2) @map("convertibility_score")
  opportunityTier       String?   @map("opportunity_tier") // gold, silver, bronze, none
  
  // TikTok Shop infrastructure
  tiktokInfrastructure  Decimal   @default(0) @db.Decimal(5,2) @map("tiktok_infrastructure")
  tiktokProductCount    Int       @default(0) @map("tiktok_product_count")
  tiktokSellerCount     Int       @default(0) @map("tiktok_seller_count")
  
  // Lifecycle
  addedToWatchlist      Boolean   @default(false) @map("added_to_watchlist")
  discoveredAt          DateTime  @default(now()) @map("discovered_at")
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")
  
  @@unique([nicheName, source])
  @@index([convertibilityScore(sort: Desc)])
  @@index([opportunityTier])
  @@index([discoveredAt(sort: Desc)])
  @@map("niche_discoveries")
}
```

---

## API Routes

### Internal Routes (called by n8n — authenticated via x-internal-key header)

```
POST /internal/niche-intelligence     ← n8n Niche Intelligence workflow pushes daily scan data
POST /internal/niche-discoveries      ← n8n Niche Discovery workflow pushes new discoveries
POST /internal/video-transcripts      ← n8n Video Transcriber workflow pushes transcript + analysis
```

**Auth middleware for internal routes:**
```typescript
const internalAuth = (req, res, next) => {
  const key = req.headers['x-internal-key'];
  if (key !== process.env.INTERNAL_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

### Public API Routes (called by React frontend — authenticated via JWT)

**Niche Intelligence:**
```
GET  /api/niches                        ← List all tracked niches (latest scan per niche)
GET  /api/niches/:nicheName             ← Get latest data for a specific niche
GET  /api/niches/:nicheName/history     ← Historical scans for trending charts
GET  /api/niches/opportunities          ← All niches with isOpportunity=true, sorted by score
GET  /api/niches/opportunities/gold     ← Gold-tier only
```

**Niche Discovery:**
```
GET  /api/discoveries                   ← All discovered niches, sorted by convertibility
GET  /api/discoveries/recent            ← Last 7 days of discoveries
GET  /api/discoveries/:id               ← Single discovery with full desire breakdown
GET  /api/discoveries/desire-heatmap    ← Aggregated desire scores across all niches
```

**Video Intelligence:**
```
GET  /api/videos                        ← All transcribed videos, paginated
GET  /api/videos?niche=scalp+massage    ← Filter by niche
GET  /api/videos/:id                    ← Single video with full transcript + analysis
GET  /api/videos/hooks                  ← Hook patterns aggregated by niche
GET  /api/videos/hooks?type=curiosity_gap  ← Filter by hook type
GET  /api/videos/structures             ← Content structure breakdown by niche
```

**Dashboard:**
```
GET  /api/dashboard/summary             ← Key metrics for the main dashboard
  Returns: {
    totalNichesTracked, goldOpportunities, videosAnalyzed,
    topNiches: [...top 5 by opportunity score],
    recentDiscoveries: [...last 5 discovered],
    hookPatterns: {curiosity_gap: 34%, pain_point: 28%, ...}
  }
```

**Auth:**
```
POST /api/auth/register                 ← Create account
POST /api/auth/login                    ← Login, returns JWT
GET  /api/auth/me                       ← Current user info
POST /api/auth/refresh                  ← Refresh JWT
```

---

## Internal Route Implementation Examples

### POST /internal/niche-intelligence
Called by n8n Niche Intelligence workflow (ID: wOOLIdyeofjoES2o) after each daily scan.

```typescript
router.post('/niche-intelligence', internalAuth, async (req, res) => {
  const data = req.body;
  
  if (!data.niche_name) {
    return res.status(400).json({ error: 'niche_name is required' });
  }
  
  const scanDate = data.scan_date || new Date().toISOString().split('T')[0];
  
  const result = await prisma.nicheIntelligence.upsert({
    where: {
      nicheName_scanDate: {
        nicheName: data.niche_name,
        scanDate: new Date(scanDate),
      }
    },
    update: {
      hashtagVideoCount: BigInt(data.hashtag_video_count || 0),
      hashtagViews7d: BigInt(data.hashtag_views_7d || 0),
      shopProductCount: data.shop_product_count || 0,
      avgProductPrice: data.avg_product_price || null,
      estimatedGmv: data.estimated_gmv || null,
      activeCreatorCount: data.active_creator_count || 0,
      activeSellerCount: data.active_seller_count || 0,
      saturationScore: data.saturation_score || 0,
      opportunityScore: data.opportunity_score || 0,
      revenuePerCreator: data.revenue_per_creator || 0,
      demandSupplyRatio: data.demand_supply_ratio || 0,
      isOpportunity: data.is_opportunity || false,
      opportunityTier: data.opportunity_tier || 'none',
    },
    create: {
      nicheName: data.niche_name,
      hashtag: data.hashtag || null,
      tiktokShopCategory: data.tiktok_shop_category || null,
      hashtagVideoCount: BigInt(data.hashtag_video_count || 0),
      hashtagViews7d: BigInt(data.hashtag_views_7d || 0),
      shopProductCount: data.shop_product_count || 0,
      avgProductPrice: data.avg_product_price || null,
      estimatedGmv: data.estimated_gmv || null,
      activeCreatorCount: data.active_creator_count || 0,
      activeSellerCount: data.active_seller_count || 0,
      saturationScore: data.saturation_score || 0,
      opportunityScore: data.opportunity_score || 0,
      revenuePerCreator: data.revenue_per_creator || 0,
      demandSupplyRatio: data.demand_supply_ratio || 0,
      isOpportunity: data.is_opportunity || false,
      opportunityTier: data.opportunity_tier || 'none',
      scanDate: new Date(scanDate),
    }
  });
  
  return res.json({ success: true, id: result.id });
});
```

### POST /internal/video-transcripts
Called by n8n Video Transcriber workflow (ID: ogYYOtjfdTZoQ7XI).

```typescript
router.post('/video-transcripts', internalAuth, async (req, res) => {
  const data = req.body;
  
  if (!data.video_url) {
    return res.status(400).json({ error: 'video_url is required' });
  }
  
  const result = await prisma.videoTranscript.upsert({
    where: { videoUrl: data.video_url },
    update: {
      transcript: data.transcript,
      wordCount: data.word_count || 0,
      hook: data.hook,
      hookType: data.hook_type,
      cta: data.cta,
      ctaType: data.cta_type,
      scriptStructure: data.script_structure,
      tone: data.tone,
      productMentions: data.product_mentions,
      keyPhrases: data.key_phrases,
      contentSummary: data.content_summary,
      estimatedDurationSeconds: data.estimated_duration_seconds || 0,
    },
    create: {
      videoUrl: data.video_url,
      niche: data.niche || null,
      creatorHandle: data.creator_handle || null,
      transcript: data.transcript,
      wordCount: data.word_count || 0,
      hook: data.hook,
      hookType: data.hook_type,
      cta: data.cta,
      ctaType: data.cta_type,
      scriptStructure: data.script_structure,
      tone: data.tone,
      productMentions: data.product_mentions,
      keyPhrases: data.key_phrases,
      contentSummary: data.content_summary,
      estimatedDurationSeconds: data.estimated_duration_seconds || 0,
    }
  });
  
  return res.json({ success: true, id: result.id });
});
```

---

## n8n Workflow Reference

These are the workflows that push data to this backend. Their HTTP Request nodes need to point to this API:

| Workflow | ID | Endpoint it calls | Cadence |
|---|---|---|---|
| ClipForge Niche Intelligence v1 | wOOLIdyeofjoES2o | POST /internal/niche-intelligence | Daily 6am CST |
| ClipForge Video Transcriber v1 | ogYYOtjfdTZoQ7XI | POST /internal/video-transcripts | On-demand (webhook) |
| ClipForge Niche Discovery v1 | 3A6EGhLMlwpT7Lqc | POST /internal/niche-discoveries | Weekly Mon 5am CST |

The n8n workflows currently use the env var `POSTFLOW_BACKEND_URL` for the base URL. This should be updated to `CLIPFORGE_BACKEND_URL` and set to `http://192.168.86.XXX:4000` (internal network).

---

## Project Structure

```
clipforge-backend/
├── src/
│   ├── index.ts                    # Express app entry point
│   ├── config/
│   │   └── env.ts                  # Environment variable validation
│   ├── middleware/
│   │   ├── internalAuth.ts         # x-internal-key auth for n8n routes
│   │   ├── jwtAuth.ts              # JWT auth for frontend routes
│   │   └── errorHandler.ts         # Global error handler
│   ├── routes/
│   │   ├── internal/
│   │   │   ├── nicheIntelligence.ts
│   │   │   ├── nicheDiscoveries.ts
│   │   │   └── videoTranscripts.ts
│   │   ├── api/
│   │   │   ├── niches.ts
│   │   │   ├── discoveries.ts
│   │   │   ├── videos.ts
│   │   │   ├── dashboard.ts
│   │   │   └── auth.ts
│   │   └── index.ts                # Route aggregator
│   ├── services/
│   │   ├── nicheService.ts         # Business logic for niche queries
│   │   ├── discoveryService.ts
│   │   ├── videoService.ts
│   │   └── dashboardService.ts
│   └── utils/
│       ├── pagination.ts
│       └── bigintSerializer.ts     # Handle BigInt JSON serialization
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── tests/
│   ├── internal/
│   └── api/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://clipforge:password@192.168.86.XXX:5432/clipforge_db?connection_limit=5

# Auth
JWT_SECRET=your-jwt-secret-here
INTERNAL_API_KEY=your-internal-key-for-n8n

# Email
RESEND_API_KEY=your-resend-key

# Server
PORT=4000
NODE_ENV=development
```

---

## Docker Setup

### Dockerfile
```dockerfile
FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma
RUN npx prisma generate

COPY dist ./dist

EXPOSE 4000
CMD ["node", "dist/index.js"]
```

### docker-compose.yml
```yaml
services:
  clipforge-api:
    build: .
    container_name: clipforge-api
    restart: unless-stopped
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - JWT_SECRET=${JWT_SECRET}
      - INTERNAL_API_KEY=${INTERNAL_API_KEY}
      - RESEND_API_KEY=${RESEND_API_KEY}
      - PORT=4000
      - NODE_ENV=production
    networks:
      - homelab-net
    depends_on:
      - postgres

  postgres:
    image: postgres:16
    container_name: clipforge-postgres
    restart: unless-stopped
    environment:
      - POSTGRES_DB=clipforge_db
      - POSTGRES_USER=clipforge
      - POSTGRES_PASSWORD=${DB_PASSWORD}
    volumes:
      - clipforge-pg-data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    networks:
      - homelab-net

volumes:
  clipforge-pg-data:

networks:
  homelab-net:
    external: true
```

---

## Key Implementation Notes

### BigInt Serialization
PostgreSQL BigInt fields (hashtag_video_count, hashtag_views_7d) don't serialize to JSON natively in Node.js. Add a global serializer:

```typescript
// src/utils/bigintSerializer.ts
BigInt.prototype.toJSON = function() {
  return Number(this);
};
```

### Pagination
Standard cursor-based pagination for list endpoints:

```typescript
// src/utils/pagination.ts
export function paginate(query: any, page = 1, limit = 20) {
  return {
    ...query,
    skip: (page - 1) * limit,
    take: limit,
  };
}
```

### CORS
Allow frontend (port 3000) and n8n (port 5678):

```typescript
import cors from 'cors';
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://192.168.86.XXX:3000',  // React frontend
  ],
  credentials: true,
}));
```

---

## What This Backend Does NOT Do

- **Scraping** — n8n workflows handle all scraping via Nimble / TikTok Data Service
- **AI analysis** — DeepSeek and Gemini calls happen in n8n workflows, not here
- **Content generation** — future feature, not in v1
- **File storage** — no video/image storage, just metadata and transcripts
- **Payment processing** — future (Stripe), not in v1

---

## Build Priority Order

1. **Database + Prisma setup** — create DB, run migrations, verify schema
2. **Internal routes** — POST endpoints for n8n to push data (this unblocks the workflows)
3. **Dashboard API** — GET /api/dashboard/summary (first thing the frontend needs)
4. **Niche routes** — GET endpoints for niche intelligence data
5. **Discovery routes** — GET endpoints for niche discovery + desire scores
6. **Video routes** — GET endpoints for video intelligence
7. **Auth** — JWT registration/login (can use basic auth initially)
8. **Docker** — containerize and deploy to Proxmox
