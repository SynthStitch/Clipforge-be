-- ============================================================
-- PostFlow Schema Optimizations
-- Run AFTER postflow_schema.sql
-- ============================================================


-- ============================================================
-- 1. ENCRYPT OAUTH TOKENS AT REST
--    Plain-text tokens in connected_accounts are a liability.
--    Use pgcrypto symmetric encryption with an app-level key.
--    Your app sets this via: SET app.encryption_key = '...';
--    before any read/write on tokens.
-- ============================================================

-- Convert columns to bytea for encrypted storage
ALTER TABLE connected_accounts
    ALTER COLUMN access_token  TYPE BYTEA USING pgp_sym_encrypt(access_token, current_setting('app.encryption_key'))::BYTEA,
    ALTER COLUMN refresh_token TYPE BYTEA USING pgp_sym_encrypt(refresh_token, current_setting('app.encryption_key'))::BYTEA;

-- Helper views so your app code stays clean
CREATE OR REPLACE FUNCTION decrypt_token(encrypted BYTEA)
RETURNS TEXT AS $$
BEGIN
    RETURN pgp_sym_decrypt(encrypted, current_setting('app.encryption_key'));
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- 2. CHECK CONSTRAINTS ON ENUM-LIKE TEXT COLUMNS
--    Prevents garbage data from bad API responses or typos.
-- ============================================================

ALTER TABLE users
    ADD CONSTRAINT chk_users_plan
    CHECK (plan IN ('free', 'pro', 'enterprise'));

ALTER TABLE connected_accounts
    ADD CONSTRAINT chk_platform
    CHECK (platform IN ('tiktok', 'instagram'));

ALTER TABLE videos
    ADD CONSTRAINT chk_format_tag
    CHECK (format_tag IS NULL OR format_tag IN (
        'tutorial', 'story', 'product_demo', 'reaction',
        'faceless_demo', 'listicle', 'talking_head', 'opinion',
        'unboxing', 'review', 'other'
    ));

ALTER TABLE extracted_entities
    ADD CONSTRAINT chk_entity_type
    CHECK (entity_type IN (
        'product_mention', 'objection', 'desire', 'question',
        'keyword', 'brand', 'price_point', 'competitor'
    ));

ALTER TABLE extracted_entities
    ADD CONSTRAINT chk_source_type
    CHECK (source_type IN ('comment', 'caption', 'bio', 'product_link'));

ALTER TABLE generated_assets
    ADD CONSTRAINT chk_asset_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'));

ALTER TABLE generated_assets
    ADD CONSTRAINT chk_content_branch
    CHECK (content_branch IS NULL OR content_branch IN (
        'faceless_affiliate', 'avatar_explainer', 'product_demo_hybrid'
    ));

ALTER TABLE generated_assets
    ADD CONSTRAINT chk_provider
    CHECK (provider IS NULL OR provider IN (
        'elevenlabs', 'heygen', 'higgsfield', 'grok_imagine', 'runway', 'luma', 'llm'
    ));

ALTER TABLE ingestion_log
    ADD CONSTRAINT chk_run_type
    CHECK (run_type IN ('full_sync', 'incremental', 'manual_refresh'));

ALTER TABLE ingestion_log
    ADD CONSTRAINT chk_ingestion_status
    CHECK (status IN ('started', 'completed', 'failed'));


-- ============================================================
-- 3. GENERATED COLUMNS FOR COMPUTED FIELDS
--    length_bucket and engagement_rate were being computed in
--    app code — let Postgres handle them so they're always
--    consistent and indexable.
-- ============================================================

-- Replace length_bucket with a generated column
ALTER TABLE videos DROP COLUMN IF EXISTS length_bucket;
ALTER TABLE videos
    ADD COLUMN length_bucket TEXT GENERATED ALWAYS AS (
        CASE
            WHEN duration_seconds IS NULL THEN NULL
            WHEN duration_seconds < 15   THEN 'short'
            WHEN duration_seconds <= 60  THEN 'medium'
            ELSE 'long'
        END
    ) STORED;

-- Replace engagement_rate with a generated column
ALTER TABLE video_metrics_snapshots DROP COLUMN IF EXISTS engagement_rate;
ALTER TABLE video_metrics_snapshots
    ADD COLUMN engagement_rate NUMERIC(10,8) GENERATED ALWAYS AS (
        CASE
            WHEN views > 0 THEN (likes + comments + shares + saves)::NUMERIC / views
            ELSE 0
        END
    ) STORED;


-- ============================================================
-- 4. DENORMALIZE LATEST METRICS ONTO VIDEOS TABLE
--    The dashboard's "recent videos" view hits this on every
--    page load. Without denormalization, you need a lateral
--    join to video_metrics_snapshots for each video. This gets
--    expensive fast with 50+ videos per user.
-- ============================================================

ALTER TABLE videos
    ADD COLUMN IF NOT EXISTS latest_views    BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS latest_likes    BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS latest_comments BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS latest_shares   BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS latest_saves    BIGINT DEFAULT 0,
    ADD COLUMN IF NOT EXISTS latest_engagement_rate NUMERIC(10,8) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS metrics_updated_at     TIMESTAMPTZ;

-- Auto-sync latest metrics when a new snapshot is inserted
CREATE OR REPLACE FUNCTION sync_latest_metrics()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE videos SET
        latest_views           = NEW.views,
        latest_likes           = NEW.likes,
        latest_comments        = NEW.comments,
        latest_shares          = NEW.shares,
        latest_saves           = NEW.saves,
        latest_engagement_rate = CASE WHEN NEW.views > 0
            THEN (NEW.likes + NEW.comments + NEW.shares + NEW.saves)::NUMERIC / NEW.views
            ELSE 0 END,
        metrics_updated_at     = NEW.captured_at
    WHERE id = NEW.video_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_latest_metrics
    AFTER INSERT ON video_metrics_snapshots
    FOR EACH ROW EXECUTE FUNCTION sync_latest_metrics();

-- Index for dashboard sort queries (top performing, recent, etc.)
CREATE INDEX idx_videos_engagement
    ON videos (user_id, latest_engagement_rate DESC NULLS LAST);
CREATE INDEX idx_videos_views
    ON videos (user_id, latest_views DESC NULLS LAST);


-- ============================================================
-- 5. COMMENTS DEDUPLICATION
--    TikTok API may return the same comment across syncs.
--    Add a unique constraint so upserts work cleanly.
-- ============================================================

ALTER TABLE comments
    ADD CONSTRAINT uq_comments_platform
    UNIQUE (video_id, platform_comment_id);


-- ============================================================
-- 6. BRIN INDEXES FOR TIME-SERIES TABLES
--    video_metrics_snapshots and comments are append-only and
--    naturally ordered by time. BRIN indexes are ~100x smaller
--    than btree for time columns on append-only tables.
-- ============================================================

-- Drop the existing btree time indexes on high-volume tables
DROP INDEX IF EXISTS idx_video_metrics_video;
DROP INDEX IF EXISTS idx_comments_posted;

-- BRIN for time-range scans (e.g., "metrics from last 7 days")
CREATE INDEX idx_metrics_captured_brin
    ON video_metrics_snapshots USING BRIN (captured_at)
    WITH (pages_per_range = 32);

CREATE INDEX idx_comments_posted_brin
    ON comments USING BRIN (posted_at)
    WITH (pages_per_range = 32);

-- Keep a btree for the primary lookup pattern (specific video's history)
CREATE INDEX idx_video_metrics_lookup
    ON video_metrics_snapshots (video_id, captured_at DESC);

-- Btree for comment lookups by video (used in entity extraction)
CREATE INDEX idx_comments_video_posted
    ON comments (video_id, posted_at DESC);


-- ============================================================
-- 7. MATERIALIZED VIEW: FORMAT PERFORMANCE
--    Workflow 1's analytics step queries this pattern constantly:
--    "for this user, what's the avg engagement per format?"
--    Materializing it avoids a full scan every refresh.
-- ============================================================

CREATE MATERIALIZED VIEW mv_format_performance AS
SELECT
    v.user_id,
    v.account_id,
    v.format_tag,
    COUNT(*)                                       AS video_count,
    ROUND(AVG(v.latest_engagement_rate), 8)        AS avg_engagement,
    ROUND(AVG(v.latest_views), 0)                  AS avg_views,
    PERCENTILE_CONT(0.5) WITHIN GROUP
        (ORDER BY v.latest_engagement_rate)         AS median_engagement,
    MAX(v.latest_engagement_rate)                   AS peak_engagement,
    MIN(v.posted_at)                               AS earliest_post,
    MAX(v.posted_at)                               AS latest_post
FROM videos v
WHERE v.format_tag IS NOT NULL
GROUP BY v.user_id, v.account_id, v.format_tag;

CREATE UNIQUE INDEX idx_mv_format_perf
    ON mv_format_performance (user_id, account_id, format_tag);

-- Refresh this at the end of Workflow 1:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_format_performance;


-- ============================================================
-- 8. MATERIALIZED VIEW: POSTING WINDOW PERFORMANCE
--    "When should this creator post?" is a core recommendation.
-- ============================================================

CREATE MATERIALIZED VIEW mv_posting_windows AS
SELECT
    v.user_id,
    v.account_id,
    EXTRACT(DOW FROM v.posted_at)                  AS day_of_week,  -- 0=Sun
    EXTRACT(HOUR FROM v.posted_at)                 AS hour_utc,
    COUNT(*)                                       AS video_count,
    ROUND(AVG(v.latest_engagement_rate), 8)        AS avg_engagement,
    ROUND(AVG(v.latest_views), 0)                  AS avg_views
FROM videos v
WHERE v.posted_at IS NOT NULL
GROUP BY v.user_id, v.account_id,
         EXTRACT(DOW FROM v.posted_at),
         EXTRACT(HOUR FROM v.posted_at);

CREATE UNIQUE INDEX idx_mv_posting_windows
    ON mv_posting_windows (user_id, account_id, day_of_week, hour_utc);


-- ============================================================
-- 9. MOMENTUM SCORING VIEW
--    Compares a video's recent metrics velocity against the
--    user's baseline. Used by the analytics step in Workflow 1.
-- ============================================================

CREATE OR REPLACE VIEW v_video_momentum AS
WITH recent AS (
    SELECT
        vms.video_id,
        vms.views,
        vms.likes,
        vms.engagement_rate,
        vms.captured_at,
        LAG(vms.views) OVER (
            PARTITION BY vms.video_id ORDER BY vms.captured_at
        ) AS prev_views,
        LAG(vms.captured_at) OVER (
            PARTITION BY vms.video_id ORDER BY vms.captured_at
        ) AS prev_captured_at
    FROM video_metrics_snapshots vms
),
velocity AS (
    SELECT
        video_id,
        views,
        engagement_rate,
        captured_at,
        CASE
            WHEN prev_views IS NOT NULL
                 AND EXTRACT(EPOCH FROM (captured_at - prev_captured_at)) > 0
            THEN (views - prev_views)::NUMERIC /
                 (EXTRACT(EPOCH FROM (captured_at - prev_captured_at)) / 3600)
            ELSE 0
        END AS views_per_hour
    FROM recent
)
SELECT
    v.id AS video_id,
    v.user_id,
    v.account_id,
    v.format_tag,
    v.posted_at,
    vel.views,
    vel.engagement_rate,
    vel.views_per_hour,
    vel.captured_at AS measured_at
FROM velocity vel
JOIN videos v ON v.id = vel.video_id
WHERE vel.captured_at = (
    SELECT MAX(v2.captured_at)
    FROM video_metrics_snapshots v2
    WHERE v2.video_id = vel.video_id
);


-- ============================================================
-- 10. RETENTION POLICY HELPERS
--     Old metric snapshots and ingestion logs pile up fast.
--     Call these from a scheduled n8n cleanup node or pg_cron.
-- ============================================================

-- Keep only the latest N snapshots per video (default 30)
CREATE OR REPLACE FUNCTION prune_metric_snapshots(keep_count INT DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY video_id ORDER BY captured_at DESC
               ) AS rn
        FROM video_metrics_snapshots
    )
    DELETE FROM video_metrics_snapshots
    WHERE id IN (SELECT id FROM ranked WHERE rn > keep_count);

    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;

-- Purge ingestion logs older than N days (default 90)
CREATE OR REPLACE FUNCTION prune_ingestion_logs(older_than_days INT DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted INTEGER;
BEGIN
    DELETE FROM ingestion_log
    WHERE started_at < now() - (older_than_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted = ROW_COUNT;
    RETURN deleted;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 11. PARTIAL INDEX: ACTIVE RECOMMENDATIONS ONLY
--     The dashboard only shows non-dismissed recommendations.
-- ============================================================

CREATE INDEX idx_recommendations_active
    ON recommendations (user_id, created_at DESC)
    WHERE is_dismissed = false;


-- ============================================================
-- 12. GENERATED ASSETS: POLLING INDEX
--     Workflow 2 polls for pending/processing jobs by provider.
--     Tighten the partial index and add provider_job_id lookup.
-- ============================================================

CREATE INDEX idx_assets_poll
    ON generated_assets (provider, provider_job_id)
    WHERE status IN ('pending', 'processing');


-- ============================================================
-- 13. CREATIVE BRIEF VALIDATION
--     Ensure the brief_json contains required top-level keys
--     so Workflow 2 never gets a malformed handoff.
-- ============================================================

ALTER TABLE creative_briefs
    ADD CONSTRAINT chk_brief_structure CHECK (
        brief_json ? 'account_summary'
        AND brief_json ? 'audience_signals'
        AND brief_json ? 'creative_brief'
    );


-- ============================================================
-- 14. ROW-LEVEL SECURITY (prep for multi-tenant)
--     Not enforced yet, but the policies are ready to enable
--     when you add auth. Flip with: ALTER TABLE ... ENABLE ROW
--     LEVEL SECURITY;
-- ============================================================

-- Example policy (enable per-table when ready):
-- ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY user_videos ON videos
--     USING (user_id = current_setting('app.current_user_id')::UUID);
