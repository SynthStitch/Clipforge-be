import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const statements = [
  // Section 2: Check constraints
  `ALTER TABLE users ADD CONSTRAINT chk_users_plan CHECK (plan IN ('free', 'pro', 'enterprise'))`,
  `ALTER TABLE connected_accounts ADD CONSTRAINT chk_platform CHECK (platform IN ('tiktok', 'instagram'))`,
  `ALTER TABLE videos ADD CONSTRAINT chk_format_tag CHECK (format_tag IS NULL OR format_tag IN ('tutorial', 'story', 'product_demo', 'reaction', 'faceless_demo', 'listicle', 'talking_head', 'opinion', 'unboxing', 'review', 'other'))`,
  `ALTER TABLE extracted_entities ADD CONSTRAINT chk_entity_type CHECK (entity_type IN ('product_mention', 'objection', 'desire', 'question', 'keyword', 'brand', 'price_point', 'competitor'))`,
  `ALTER TABLE extracted_entities ADD CONSTRAINT chk_source_type CHECK (source_type IN ('comment', 'caption', 'bio', 'product_link'))`,
  `ALTER TABLE generated_assets ADD CONSTRAINT chk_asset_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))`,
  `ALTER TABLE generated_assets ADD CONSTRAINT chk_content_branch CHECK (content_branch IS NULL OR content_branch IN ('faceless_affiliate', 'avatar_explainer', 'product_demo_hybrid'))`,
  `ALTER TABLE generated_assets ADD CONSTRAINT chk_provider CHECK (provider IS NULL OR provider IN ('elevenlabs', 'heygen', 'higgsfield', 'grok_imagine', 'runway', 'luma', 'llm'))`,
  `ALTER TABLE ingestion_log ADD CONSTRAINT chk_run_type CHECK (run_type IN ('full_sync', 'incremental', 'manual_refresh'))`,
  `ALTER TABLE ingestion_log ADD CONSTRAINT chk_ingestion_status CHECK (status IN ('started', 'completed', 'failed'))`,

  // Section 3: Generated columns
  `ALTER TABLE videos DROP COLUMN IF EXISTS length_bucket`,
  `ALTER TABLE videos ADD COLUMN length_bucket TEXT GENERATED ALWAYS AS (CASE WHEN duration_seconds IS NULL THEN NULL WHEN duration_seconds < 15 THEN 'short' WHEN duration_seconds <= 60 THEN 'medium' ELSE 'long' END) STORED`,
  `ALTER TABLE video_metrics_snapshots DROP COLUMN IF EXISTS engagement_rate`,
  `ALTER TABLE video_metrics_snapshots ADD COLUMN engagement_rate NUMERIC(10,8) GENERATED ALWAYS AS (CASE WHEN views > 0 THEN (likes + comments + shares + saves)::NUMERIC / views ELSE 0 END) STORED`,

  // Section 4: Denormalized metrics trigger
  `CREATE OR REPLACE FUNCTION sync_latest_metrics() RETURNS TRIGGER AS $$ BEGIN UPDATE videos SET latest_views = NEW.views, latest_likes = NEW.likes, latest_comments = NEW.comments, latest_shares = NEW.shares, latest_saves = NEW.saves, latest_engagement_rate = CASE WHEN NEW.views > 0 THEN (NEW.likes + NEW.comments + NEW.shares + NEW.saves)::NUMERIC / NEW.views ELSE 0 END, metrics_updated_at = NEW.captured_at WHERE id = NEW.video_id; RETURN NEW; END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS trg_sync_latest_metrics ON video_metrics_snapshots`,
  `CREATE TRIGGER trg_sync_latest_metrics AFTER INSERT ON video_metrics_snapshots FOR EACH ROW EXECUTE FUNCTION sync_latest_metrics()`,
  `CREATE INDEX IF NOT EXISTS idx_videos_engagement ON videos (user_id, latest_engagement_rate DESC NULLS LAST)`,
  `CREATE INDEX IF NOT EXISTS idx_videos_views ON videos (user_id, latest_views DESC NULLS LAST)`,

  // Section 5: Comments deduplication
  `ALTER TABLE comments ADD CONSTRAINT uq_comments_platform UNIQUE (video_id, platform_comment_id)`,

  // Section 6: BRIN indexes
  `DROP INDEX IF EXISTS idx_video_metrics_video`,
  `DROP INDEX IF EXISTS idx_comments_posted`,
  `CREATE INDEX IF NOT EXISTS idx_metrics_captured_brin ON video_metrics_snapshots USING BRIN (captured_at) WITH (pages_per_range = 32)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_posted_brin ON comments USING BRIN (posted_at) WITH (pages_per_range = 32)`,
  `CREATE INDEX IF NOT EXISTS idx_video_metrics_lookup ON video_metrics_snapshots (video_id, captured_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_comments_video_posted ON comments (video_id, posted_at DESC)`,

  // Section 7: Format performance materialized view
  `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_format_performance AS SELECT v.user_id, v.account_id, v.format_tag, COUNT(*) AS video_count, ROUND(AVG(v.latest_engagement_rate), 8) AS avg_engagement, ROUND(AVG(v.latest_views), 0) AS avg_views, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.latest_engagement_rate) AS median_engagement, MAX(v.latest_engagement_rate) AS peak_engagement, MIN(v.posted_at) AS earliest_post, MAX(v.posted_at) AS latest_post FROM videos v WHERE v.format_tag IS NOT NULL GROUP BY v.user_id, v.account_id, v.format_tag`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_format_perf ON mv_format_performance (user_id, account_id, format_tag)`,

  // Section 8: Posting windows materialized view
  `CREATE MATERIALIZED VIEW IF NOT EXISTS mv_posting_windows AS SELECT v.user_id, v.account_id, EXTRACT(DOW FROM v.posted_at) AS day_of_week, EXTRACT(HOUR FROM v.posted_at) AS hour_utc, COUNT(*) AS video_count, ROUND(AVG(v.latest_engagement_rate), 8) AS avg_engagement, ROUND(AVG(v.latest_views), 0) AS avg_views FROM videos v WHERE v.posted_at IS NOT NULL GROUP BY v.user_id, v.account_id, EXTRACT(DOW FROM v.posted_at), EXTRACT(HOUR FROM v.posted_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_posting_windows ON mv_posting_windows (user_id, account_id, day_of_week, hour_utc)`,

  // Section 9: Momentum view
  `CREATE OR REPLACE VIEW v_video_momentum AS WITH recent AS (SELECT vms.video_id, vms.views, vms.likes, vms.engagement_rate, vms.captured_at, LAG(vms.views) OVER (PARTITION BY vms.video_id ORDER BY vms.captured_at) AS prev_views, LAG(vms.captured_at) OVER (PARTITION BY vms.video_id ORDER BY vms.captured_at) AS prev_captured_at FROM video_metrics_snapshots vms), velocity AS (SELECT video_id, views, engagement_rate, captured_at, CASE WHEN prev_views IS NOT NULL AND EXTRACT(EPOCH FROM (captured_at - prev_captured_at)) > 0 THEN (views - prev_views)::NUMERIC / (EXTRACT(EPOCH FROM (captured_at - prev_captured_at)) / 3600) ELSE 0 END AS views_per_hour FROM recent) SELECT v.id AS video_id, v.user_id, v.account_id, v.format_tag, v.posted_at, vel.views, vel.engagement_rate, vel.views_per_hour, vel.captured_at AS measured_at FROM velocity vel JOIN videos v ON v.id = vel.video_id WHERE vel.captured_at = (SELECT MAX(v2.captured_at) FROM video_metrics_snapshots v2 WHERE v2.video_id = vel.video_id)`,

  // Section 10: Retention functions
  `CREATE OR REPLACE FUNCTION prune_metric_snapshots(keep_count INT DEFAULT 30) RETURNS INTEGER AS $$ DECLARE deleted INTEGER; BEGIN WITH ranked AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY video_id ORDER BY captured_at DESC) AS rn FROM video_metrics_snapshots) DELETE FROM video_metrics_snapshots WHERE id IN (SELECT id FROM ranked WHERE rn > keep_count); GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted; END; $$ LANGUAGE plpgsql`,
  `CREATE OR REPLACE FUNCTION prune_ingestion_logs(older_than_days INT DEFAULT 90) RETURNS INTEGER AS $$ DECLARE deleted INTEGER; BEGIN DELETE FROM ingestion_log WHERE started_at < now() - (older_than_days || ' days')::INTERVAL; GET DIAGNOSTICS deleted = ROW_COUNT; RETURN deleted; END; $$ LANGUAGE plpgsql`,

  // Section 11: Active recommendations index
  `CREATE INDEX IF NOT EXISTS idx_recommendations_active ON recommendations (user_id, created_at DESC) WHERE is_dismissed = false`,

  // Section 12: Asset polling index
  `CREATE INDEX IF NOT EXISTS idx_assets_poll ON generated_assets (provider, provider_job_id) WHERE status IN ('pending', 'processing')`,

  // Section 13: Creative brief validation
  `ALTER TABLE creative_briefs ADD CONSTRAINT chk_brief_structure CHECK (brief_json ? 'account_summary' AND brief_json ? 'audience_signals' AND brief_json ? 'creative_brief')`,
];

async function run() {
  for (const sql of statements) {
    const preview = sql.slice(0, 60).replace(/\n/g, ' ');
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log(`✓ ${preview}...`);
    } catch (e) {
      // Skip if already exists
      if (e.message.includes('already exists') || e.message.includes('does not exist')) {
        console.log(`~ ${preview}... (skipped: ${e.message.split('\n')[0]})`);
      } else {
        console.error(`✗ ${preview}...`);
        console.error(`  ${e.message}`);
      }
    }
  }
  await prisma.$disconnect();
  console.log('\nDone.');
}

run();
