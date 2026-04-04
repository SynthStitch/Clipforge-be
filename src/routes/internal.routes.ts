import { Request, Response, Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { internalAuth } from "../middleware/internalAuth";
import { validate } from "../middleware/validate";
import * as discoveryService from "../services/discovery.service";
import * as nicheService from "../services/niche.service";
import * as transcriptService from "../services/transcript.service";
import * as creatorProfileService from "../services/creatorProfile.service";
import * as commentSentimentService from "../services/commentSentiment.service";
import * as trendingSoundService from "../services/trendingSound.service";
import * as shopSnapshotService from "../services/shopSnapshot.service";
import * as contentPerformanceService from "../services/contentPerformance.service";
import * as goldenDatasetService from "../services/goldenDataset.service";

const router = Router();

const nicheIntelligenceSchema = z.object({
  niche_name: z.string().min(1).max(255),
  scan_date: z.string().optional(),
  hashtag: z.string().max(255).optional(),
  tiktok_shop_category: z.string().max(255).optional(),
  hashtag_video_count: z.number().int().nonnegative().optional(),
  hashtag_views_7d: z.number().int().nonnegative().optional(),
  shop_product_count: z.number().int().nonnegative().optional(),
  avg_product_price: z.number().nonnegative().optional(),
  estimated_gmv: z.number().nonnegative().optional(),
  active_creator_count: z.number().int().nonnegative().optional(),
  active_seller_count: z.number().int().nonnegative().optional(),
  top_creator_followers: z.number().int().nonnegative().optional(),
  saturation_score: z.number().min(0).max(100).optional(),
  opportunity_score: z.number().min(0).max(100).optional(),
  revenue_per_creator: z.number().nonnegative().optional(),
  demand_supply_ratio: z.number().nonnegative().optional(),
  creator_count_wow: z.number().optional(),
  product_count_wow: z.number().optional(),
  gmv_wow: z.number().optional(),
  is_opportunity: z.boolean().optional(),
  opportunity_tier: z.enum(["gold", "silver", "bronze", "none"]).optional(),
  raw_hashtag_response: z.unknown().optional(),
  raw_shop_response: z.unknown().optional(),
}).strict();

const nicheDiscoverySchema = z.object({
  niche_name: z.string().min(1).max(255),
  source: z.string().max(255).optional(),
  hashtag: z.string().max(255).optional(),
  source_category: z.string().max(255).optional(),
  source_product: z.string().max(500).optional(),
  source_product_url: z.string().max(2048).optional(),
  asin: z.string().max(20).optional(),
  desire_health: z.number().min(0).max(100).optional(),
  desire_wealth: z.number().min(0).max(100).optional(),
  desire_sex: z.number().min(0).max(100).optional(),
  desire_status: z.number().min(0).max(100).optional(),
  desire_fear: z.number().min(0).max(100).optional(),
  desire_identity: z.number().min(0).max(100).optional(),
  desire_pull_score: z.number().min(0).max(100).optional(),
  dominant_desire: z.string().max(50).optional(),
  impulse_trigger: z.string().max(500).optional(),
  review_count_analyzed: z.number().int().nonnegative().optional(),
  review_passion_score: z.number().min(0).max(100).optional(),
  social_proof_score: z.number().min(0).max(100).optional(),
  avg_price_point: z.number().nonnegative().optional(),
  impulse_buy_score: z.number().min(0).max(100).optional(),
  velocity_score: z.number().min(0).max(100).optional(),
  convertibility_score: z.number().min(0).max(100).optional(),
  opportunity_tier: z.enum(["gold", "silver", "bronze", "none"]).optional(),
  is_gold: z.boolean().optional(),
  tiktok_infrastructure: z.number().min(0).max(100).optional(),
  tiktok_product_count: z.number().int().nonnegative().optional(),
  tiktok_seller_count: z.number().int().nonnegative().optional(),
  discovered_at: z.string().optional(),
}).strict();

const videoTranscriptSchema = z.object({
  video_url: z.string().url().max(2048),
  niche: z.string().max(255).optional(),
  creator_handle: z.string().max(255).optional(),
  transcript: z.string().optional(),
  word_count: z.number().int().nonnegative().optional(),
  estimated_duration_seconds: z.number().int().nonnegative().optional(),
  hook: z.string().optional(),
  hook_type: z.enum(["question", "bold_claim", "curiosity_gap", "demonstration", "pain_point", "story", "shock_value"]).optional(),
  cta: z.string().optional(),
  cta_type: z.enum(["follow", "link_in_bio", "comment", "share", "shop_now", "none"]).optional(),
  script_structure: z.enum(["problem_solution", "tutorial", "story", "listicle", "before_after", "review", "unboxing", "comparison"]).optional(),
  tone: z.enum(["casual", "professional", "urgent", "funny", "emotional", "educational"]).optional(),
  product_mentions: z.string().optional(),
  key_phrases: z.string().optional(),
  content_summary: z.string().optional(),
  raw_deepseek_response: z.unknown().optional(),
  source_niche_scan_id: z.string().uuid().optional(),
}).strict();

router.post(
  "/niche-intelligence",
  internalAuth,
  validate(nicheIntelligenceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await nicheService.upsertNicheIntelligence(req.body);
    res.json({ success: true, id: result.id });
  }),
);

router.post(
  "/niche-discoveries",
  internalAuth,
  validate(nicheDiscoverySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await discoveryService.upsertNicheDiscovery(req.body);
    res.json({ success: true, id: result.id });
  }),
);

router.post(
  "/video-transcripts",
  internalAuth,
  validate(videoTranscriptSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await transcriptService.upsertVideoTranscript(req.body);
    res.json({ success: true, id: result.id });
  }),
);

// --- Workflow 5: Creator Intelligence Tracker ---
const creatorProfileSchema = z.object({
  username: z.string().min(1).max(255),
  niche_name: z.string().min(1).max(255),
  display_name: z.string().max(255).optional(),
  hashtag: z.string().max(255).optional(),
  followers: z.number().int().nonnegative().optional(),
  verified: z.boolean().optional(),
  avg_views: z.number().nonnegative().optional(),
  engagement_rate_pct: z.number().min(0).max(100).optional(),
  posting_freq_per_week: z.number().nonnegative().optional(),
  best_video_views: z.number().nonnegative().optional(),
  total_views_recent: z.number().nonnegative().optional(),
  total_likes_recent: z.number().nonnegative().optional(),
  scanned_at: z.string().optional(),
}).strict();

router.post(
  "/creator-profiles",
  internalAuth,
  validate(creatorProfileSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await creatorProfileService.upsertCreatorProfile(req.body);
    res.json({ success: true, id: result.id });
  }),
);

// --- Workflow 6: Comment Sentiment Miner ---
const commentSentimentSchema = z.object({
  video_url: z.string().url().max(2048),
  video_id: z.string().max(255).optional(),
  niche: z.string().max(255).optional(),
  total_comments: z.number().int().nonnegative().optional(),
  purchase_intent_count: z.number().int().nonnegative().optional(),
  purchase_intent_pct: z.number().min(0).max(100).optional(),
  objection_count: z.number().int().nonnegative().optional(),
  objection_themes: z.string().optional(),
  social_proof_count: z.number().int().nonnegative().optional(),
  question_themes: z.string().optional(),
  emotional_intensity: z.number().min(0).max(100).optional(),
  dominant_sentiment: z.string().max(100).optional(),
  top_purchase_comments: z.string().optional(),
  top_objections: z.string().optional(),
}).strict();

router.post(
  "/comment-sentiment",
  internalAuth,
  validate(commentSentimentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await commentSentimentService.upsertCommentSentiment(req.body);
    res.json({ success: true, id: result.id });
  }),
);

// --- Workflow 7: Trending Sounds Tracker ---
const trendingSoundSchema = z.object({
  sound_id: z.string().min(1).max(255),
  sound_title: z.string().min(1).max(500),
  sound_author: z.string().max(255).optional(),
  is_original: z.boolean().optional(),
  original: z.boolean().optional(),
  video_count: z.number().int().nonnegative().optional(),
  total_views: z.number().nonnegative().optional(),
  avg_views_per_video: z.number().nonnegative().optional(),
  total_likes: z.number().nonnegative().optional(),
  niches: z.string().optional(),
  commerce_relevance: z.number().min(0).max(100).optional(),
  scanned_at: z.string().optional(),
}).strict();

router.post(
  "/trending-sounds",
  internalAuth,
  validate(trendingSoundSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await trendingSoundService.upsertTrendingSound(req.body);
    res.json({ success: true, id: result.id });
  }),
);

// --- Workflow 8: Competitor Shop Monitor ---
const shopSnapshotSchema = z.object({
  shop_name: z.string().min(1).max(255),
  shop_url: z.string().max(2048).optional(),
  niche: z.string().max(255).optional(),
  product_count: z.number().int().nonnegative().optional(),
  avg_price: z.number().nonnegative().optional(),
  new_products: z.number().int().nonnegative().optional(),
  price_change_pct: z.number().optional(),
  has_changes: z.boolean().optional(),
  top_products: z.unknown().optional(),
  scanned_at: z.string().optional(),
}).strict();

router.post(
  "/shop-snapshots",
  internalAuth,
  validate(shopSnapshotSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await shopSnapshotService.upsertShopSnapshot(req.body);
    res.json({ success: true, id: result.id });
  }),
);

// --- Workflow 9: Performance Feedback Loop ---
const contentPerformanceSchema = z.object({
  video_id: z.string().min(1).max(255),
  video_url: z.string().max(2048).optional(),
  niche: z.string().max(255).optional(),
  content_brief_id: z.string().uuid().optional(),
  hook_type_used: z.string().max(100).optional(),
  structure_used: z.string().max(100).optional(),
  views_24h: z.number().nonnegative().optional(),
  likes_24h: z.number().nonnegative().optional(),
  comments_24h: z.number().nonnegative().optional(),
  shares_24h: z.number().nonnegative().optional(),
  engagement_rate_24h: z.number().min(0).max(1).optional(),
  views_vs_avg_pct: z.number().optional(),
  engagement_vs_avg_pct: z.number().optional(),
  above_average: z.boolean().optional(),
  posted_at: z.string().optional(),
  measured_at: z.string().optional(),
}).strict();

router.post(
  "/content-performance",
  internalAuth,
  validate(contentPerformanceSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await contentPerformanceService.upsertContentPerformance(req.body);
    res.json({ success: true, id: result.id });
  }),
);

// ============================================================
// GOLDEN DATASET — regression testing
// ============================================================

const goldenSampleSchema = z.object({
  workflowType: z.enum(["niche_intelligence", "niche_discovery", "video_transcriber"]),
  label: z.string().min(1).max(255),
  difficulty: z.enum(["easy", "medium", "hard", "adversarial"]).optional(),
  tags: z.array(z.string().max(64)).max(20).optional(),
  inputData: z.record(z.string(), z.unknown()),
  expectedOutput: z.record(z.string(), z.unknown()),
  tolerances: z.record(z.string(), z.object({
    min: z.number().optional(),
    max: z.number().optional(),
  })).optional(),
  sourceRunId: z.string().max(255).optional(),
  addedBy: z.string().max(255).optional(),
}).strict();

const evalRunSchema = z.object({
  samples: z.array(z.object({
    goldenSampleId: z.string().uuid(),
    actualOutput: z.record(z.string(), z.unknown()),
  })).min(1).max(100),
}).strict();

router.post(
  "/golden-samples",
  internalAuth,
  validate(goldenSampleSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await goldenDatasetService.createGoldenSample(req.body);
    res.status(201).json({ success: true, id: result.id });
  }),
);

router.get(
  "/golden-samples",
  internalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const workflowType = typeof req.query.workflowType === "string" ? req.query.workflowType : undefined;
    const difficulty = typeof req.query.difficulty === "string" ? req.query.difficulty : undefined;
    const activeOnly = req.query.activeOnly !== "false";
    const results = await goldenDatasetService.listGoldenSamples({ workflowType, difficulty, activeOnly });
    res.json({ success: true, data: results });
  }),
);

router.post(
  "/eval-runs",
  internalAuth,
  validate(evalRunSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const result = await goldenDatasetService.runEval(req.body.samples);
    const status = result.failCount > 0 ? 207 : 200;
    res.status(status).json({ success: true, ...result });
  }),
);

router.get(
  "/eval-runs/:runId",
  internalAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const runId = req.params.runId as string;
    const results = await goldenDatasetService.getEvalRun(runId);
    res.json({ success: true, data: results });
  }),
);

export default router;
