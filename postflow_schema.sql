-- ============================================================
-- PostFlow Database Schema
-- PostgreSQL
-- ============================================================
-- Architecture note:
--   Workflow 1 (Creator Intelligence) writes to:
--     connected_accounts, account_snapshots, videos,
--     video_metrics_snapshots, comments, extracted_entities,
--     creative_briefs, recommendations
--
--   Workflow 2 (Asset Generation) reads from:
--     creative_briefs
--   and writes to:
--     generated_assets
--
--   The creative_briefs table is the canonical handoff contract.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email           TEXT UNIQUE NOT NULL,
    full_name       TEXT,
    plan            TEXT NOT NULL DEFAULT 'free',       -- free | pro | enterprise
    onboarded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_email ON users (email);

-- ============================================================
-- CONNECTED ACCOUNTS (TikTok OAuth tokens)
-- ============================================================
CREATE TABLE connected_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform        TEXT NOT NULL DEFAULT 'tiktok',     -- tiktok | instagram (future)
    platform_uid    TEXT NOT NULL,                      -- TikTok open_id or unique user id
    username        TEXT,
    display_name    TEXT,
    avatar_url      TEXT,
    access_token    TEXT NOT NULL,
    refresh_token   TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes          TEXT[],                             -- granted OAuth scopes
    is_active       BOOLEAN NOT NULL DEFAULT true,
    connected_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (user_id, platform, platform_uid)
);

CREATE INDEX idx_connected_accounts_user ON connected_accounts (user_id);

-- ============================================================
-- ACCOUNT SNAPSHOTS (point-in-time profile metrics)
-- ============================================================
CREATE TABLE account_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
    follower_count  INTEGER,
    following_count INTEGER,
    video_count     INTEGER,
    like_count      BIGINT,                             -- total likes across account
    bio_text        TEXT,
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_account_snapshots_user   ON account_snapshots (user_id, captured_at DESC);
CREATE INDEX idx_account_snapshots_acct   ON account_snapshots (account_id, captured_at DESC);

-- ============================================================
-- VIDEOS
-- ============================================================
CREATE TABLE videos (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id          UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
    platform_video_id   TEXT NOT NULL,
    caption             TEXT,
    hashtags            TEXT[],                          -- extracted from caption
    duration_seconds    NUMERIC(8,2),
    thumbnail_url       TEXT,
    video_url           TEXT,
    posted_at           TIMESTAMPTZ,
    format_tag          TEXT,                            -- detected format: tutorial, demo, talking_head, etc.
    length_bucket       TEXT,                            -- short (<15s), medium (15-60s), long (>60s)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (account_id, platform_video_id)
);

CREATE INDEX idx_videos_user       ON videos (user_id);
CREATE INDEX idx_videos_account    ON videos (account_id);
CREATE INDEX idx_videos_posted     ON videos (posted_at DESC);
CREATE INDEX idx_videos_format     ON videos (format_tag);

-- ============================================================
-- VIDEO METRICS SNAPSHOTS (captured over time for momentum)
-- ============================================================
CREATE TABLE video_metrics_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id        UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    views           BIGINT DEFAULT 0,
    likes           BIGINT DEFAULT 0,
    comments        BIGINT DEFAULT 0,
    shares          BIGINT DEFAULT 0,
    saves           BIGINT DEFAULT 0,
    engagement_rate NUMERIC(8,6),                       -- computed: (likes+comments+shares+saves) / views
    captured_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_metrics_video    ON video_metrics_snapshots (video_id, captured_at DESC);

-- ============================================================
-- COMMENTS
-- ============================================================
CREATE TABLE comments (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    video_id            UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    platform_comment_id TEXT,
    comment_text        TEXT NOT NULL,
    author_handle       TEXT,
    author_uid          TEXT,
    like_count          INTEGER DEFAULT 0,
    is_reply            BOOLEAN DEFAULT false,
    parent_comment_id   UUID REFERENCES comments(id),
    posted_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_comments_video    ON comments (video_id);
CREATE INDEX idx_comments_posted   ON comments (posted_at DESC);

-- ============================================================
-- EXTRACTED ENTITIES
-- Stores product mentions, audience signals, keywords, etc.
-- Populated by comment/caption NLP extraction in Workflow 1.
-- ============================================================
CREATE TABLE extracted_entities (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type     TEXT NOT NULL,                      -- comment | caption | bio | product_link
    source_id       UUID NOT NULL,                      -- FK to comments.id or videos.id
    entity_type     TEXT NOT NULL,                      -- product_mention | objection | desire | question | keyword | brand | price_point
    entity_value    TEXT NOT NULL,
    confidence      NUMERIC(4,3) DEFAULT 1.0,           -- 0.000 – 1.000
    metadata        JSONB DEFAULT '{}',                 -- flexible: { "sentiment": "positive", "count": 12 }
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_entities_user     ON extracted_entities (user_id);
CREATE INDEX idx_entities_type     ON extracted_entities (entity_type);
CREATE INDEX idx_entities_source   ON extracted_entities (source_type, source_id);

-- ============================================================
-- CREATIVE BRIEFS
-- The canonical handoff object between Workflow 1 and Workflow 2.
-- Workflow 1 writes this. Workflow 2 reads it.
-- ============================================================
CREATE TABLE creative_briefs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
    version         INTEGER NOT NULL DEFAULT 1,

    -- The full structured brief as JSONB so Workflow 2
    -- can query into it without schema migrations.
    -- Expected shape:
    -- {
    --   "account_summary": {
    --     "best_formats": [...],
    --     "weak_formats": [...],
    --     "best_posting_windows": [...]
    --   },
    --   "audience_signals": {
    --     "common_objections": [...],
    --     "common_desires": [...],
    --     "recurring_questions": [...]
    --   },
    --   "niche_recommendations": [
    --     { "niche": "...", "confidence": 0.82, "reason": "..." }
    --   ],
    --   "creative_brief": {
    --     "tone": "...",
    --     "cta_style": "...",
    --     "recommended_next_tests": [...]
    --   },
    --   "performance_snapshot": {
    --     "avg_engagement_rate": 0.045,
    --     "momentum_trend": "rising",
    --     "top_video_ids": [...]
    --   }
    -- }
    brief_json      JSONB NOT NULL,

    is_current      BOOLEAN NOT NULL DEFAULT true,      -- only latest version flagged true
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_briefs_user       ON creative_briefs (user_id, is_current, created_at DESC);
CREATE INDEX idx_briefs_account    ON creative_briefs (account_id, is_current);
CREATE INDEX idx_briefs_json_niche ON creative_briefs
    USING GIN ((brief_json -> 'niche_recommendations'));

-- ============================================================
-- RECOMMENDATIONS
-- Daily / per-refresh recommendation sets surfaced to the user.
-- ============================================================
CREATE TABLE recommendations (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creative_brief_id   UUID REFERENCES creative_briefs(id) ON DELETE SET NULL,

    -- Structured recommendation payload
    -- Expected shape:
    -- {
    --   "post_ideas": [
    --     {
    --       "hook": "...",
    --       "format": "faceless demo",
    --       "topic": "...",
    --       "recommended_length": "15-30s",
    --       "posting_window": "6pm-8pm CST",
    --       "product_angle": "...",
    --       "confidence": 0.78
    --     }
    --   ]
    -- }
    recommendation_json JSONB NOT NULL,

    is_dismissed        BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recommendations_user ON recommendations (user_id, created_at DESC);

-- ============================================================
-- GENERATED ASSETS (Workflow 2 output)
-- ============================================================
CREATE TABLE generated_assets (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    creative_brief_id   UUID REFERENCES creative_briefs(id) ON DELETE SET NULL,
    recommendation_id   UUID REFERENCES recommendations(id) ON DELETE SET NULL,

    asset_type          TEXT NOT NULL,                   -- script | voiceover | avatar_video | visual_scene | shot_list | full_package
    content_branch      TEXT,                            -- faceless_affiliate | avatar_explainer | product_demo_hybrid
    provider            TEXT,                            -- elevenlabs | heygen | higgsfield | grok_imagine | llm
    status              TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed | cancelled

    -- Inputs sent to the provider
    input_payload       JSONB DEFAULT '{}',

    -- Outputs from the provider
    output_url          TEXT,                            -- S3/R2 URL for stored asset
    output_metadata     JSONB DEFAULT '{}',              -- duration, resolution, file size, etc.
    provider_job_id     TEXT,                            -- for async polling (HeyGen, etc.)
    error_message       TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_assets_user       ON generated_assets (user_id, created_at DESC);
CREATE INDEX idx_assets_brief      ON generated_assets (creative_brief_id);
CREATE INDEX idx_assets_status     ON generated_assets (status) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_assets_provider   ON generated_assets (provider, status);

-- ============================================================
-- INGESTION LOG (optional, useful for debugging Workflow 1)
-- ============================================================
CREATE TABLE ingestion_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id      UUID NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
    run_type        TEXT NOT NULL,                       -- full_sync | incremental | manual_refresh
    status          TEXT NOT NULL DEFAULT 'started',     -- started | completed | failed
    videos_fetched  INTEGER DEFAULT 0,
    comments_fetched INTEGER DEFAULT 0,
    entities_extracted INTEGER DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_ingestion_user ON ingestion_log (user_id, started_at DESC);

-- ============================================================
-- HELPER: auto-update updated_at columns
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_connected_accounts_updated
    BEFORE UPDATE ON connected_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_videos_updated
    BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- HELPER: when a new creative_brief is inserted, mark older
-- versions for the same account as not current.
-- ============================================================
CREATE OR REPLACE FUNCTION set_brief_current()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_current = true THEN
        UPDATE creative_briefs
        SET is_current = false
        WHERE account_id = NEW.account_id
          AND id != NEW.id
          AND is_current = true;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brief_version
    AFTER INSERT ON creative_briefs FOR EACH ROW EXECUTE FUNCTION set_brief_current();
