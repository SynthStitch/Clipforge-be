-- Hybrid RAG retrieval query (vector similarity + full-text search)
-- Use this in the content generation endpoint
--
-- Parameters:
--   $1 = query embedding as vector(768)
--   $2 = search query as text
--   $3 = number of results (default 5)

SELECT
  kc.id,
  kc.content,
  kc.collection,
  kc.topic_tags,
  kc.content_type,
  ks.title AS source_title,
  -- Hybrid score: 70% vector similarity + 30% keyword match
  (0.7 * (1 - (kc.embedding <=> $1::vector))) +
  (0.3 * COALESCE(ts_rank(kc.search_vector, plainto_tsquery('english', $2)), 0)) AS score
FROM knowledge_chunks kc
JOIN knowledge_sources ks ON ks.id = kc.source_id
ORDER BY score DESC
LIMIT COALESCE($3, 5);


-- Filtered variant: search within specific collections only
-- Parameters:
--   $1 = query embedding
--   $2 = search query text
--   $3 = collections array (e.g. ARRAY['coaching_course', 'playbooks'])
--   $4 = limit

SELECT
  kc.id,
  kc.content,
  kc.collection,
  kc.topic_tags,
  ks.title AS source_title,
  (0.7 * (1 - (kc.embedding <=> $1::vector))) +
  (0.3 * COALESCE(ts_rank(kc.search_vector, plainto_tsquery('english', $2)), 0)) AS score
FROM knowledge_chunks kc
JOIN knowledge_sources ks ON ks.id = kc.source_id
WHERE kc.collection = ANY($3)
ORDER BY score DESC
LIMIT COALESCE($4, 5);
