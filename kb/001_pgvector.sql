-- ClipForge Knowledge Base — pgvector setup
-- Run on clipforge_db (CT 103) after swapping to pgvector/pgvector:pg16 image

CREATE EXTENSION IF NOT EXISTS vector;

-- Source documents metadata
CREATE TABLE knowledge_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection TEXT NOT NULL,              -- 'coaching_course', 'meeting_transcripts', 'playbooks'
  title TEXT NOT NULL,                    -- 'Module 3: Hook Frameworks' or 'Weekly Call - Jan 15'
  source_type TEXT NOT NULL,              -- 'course_module', 'meeting_transcript', 'guide', 'case_study'
  original_filename TEXT,
  total_chunks INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',           -- {instructor, date, topic, duration_minutes}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunked + embedded content for RAG retrieval
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,                  -- ~500-800 token text chunk
  embedding vector(768),                 -- nomic-embed-text dimensions

  -- Denormalized for fast filtered retrieval
  collection TEXT NOT NULL,
  topic_tags TEXT[],                      -- ['hooks', 'objections', 'tiktok_shop', 'pricing']
  content_type TEXT,                      -- 'strategy', 'example', 'framework', 'case_study', 'q_and_a'

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity index (cosine distance)
CREATE INDEX idx_chunks_embedding ON knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- Filter indexes for scoped retrieval
CREATE INDEX idx_chunks_collection ON knowledge_chunks (collection);
CREATE INDEX idx_chunks_topic_tags ON knowledge_chunks USING gin (topic_tags);

-- Full-text search for hybrid retrieval
ALTER TABLE knowledge_chunks
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

CREATE INDEX idx_chunks_fts ON knowledge_chunks USING gin (search_vector);
