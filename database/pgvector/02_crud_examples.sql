-- Runnable pgvector CREATE/READ/UPDATE/DELETE + cosine-similarity demonstration.
-- Run AFTER 01_setup.sql, for example:
-- psql -v ON_ERROR_STOP=1 -d workload_management_vectors -f 02_crud_examples.sql
-- All rows use an explicitly synthetic model and negative logical employee IDs;
-- application searches exclude them. ROLLBACK removes every demonstration row.
-- Sequence values may advance, which is normal for rolled-back PostgreSQL INSERTs.
BEGIN;
CREATE TEMP TABLE vector_demo_ids (
    label TEXT PRIMARY KEY,
    summary_id INTEGER NOT NULL UNIQUE
) ON COMMIT DROP;

-- CREATE: capture the actual generated IDs, never guess existing cache IDs.
WITH inserted AS (
    INSERT INTO ai_work_summaries
      (emp_id, summary_text, source_context, generation_method, embedding_model, embedding)
    VALUES (-900001, 'Synthetic payment-service contribution.',
      'Rollback-only vector CRUD demonstration', 'record', 'demo-unit-vector-v1',
      (SELECT array_agg(CASE WHEN n=1 THEN 1.0 ELSE 0.0 END ORDER BY n)::vector
       FROM generate_series(1,1536) AS n))
    RETURNING summary_id
)
INSERT INTO vector_demo_ids SELECT 'primary', summary_id FROM inserted;

WITH inserted AS (
    INSERT INTO ai_work_summaries
      (emp_id, summary_text, source_context, generation_method, embedding_model, embedding)
    VALUES (-900002, 'Synthetic unrelated contribution.',
      'Rollback-only vector CRUD demonstration', 'record', 'demo-unit-vector-v1',
      (SELECT array_agg(CASE WHEN n=2 THEN 1.0 ELSE 0.0 END ORDER BY n)::vector
       FROM generate_series(1,1536) AS n))
    RETURNING summary_id
)
INSERT INTO vector_demo_ids SELECT 'orthogonal', summary_id FROM inserted;

-- READ the two rows just inserted, including their real IDs and model label.
SELECT 'read' AS operation, d.label, s.summary_id, s.summary_text, s.embedding_model
FROM vector_demo_ids d JOIN ai_work_summaries s USING (summary_id)
ORDER BY d.label;

-- Real vector FEATURE: identical direction scores 1, orthogonal direction 0.
-- Unit vectors make the expected mathematics visible; they are NOT AI outputs.
WITH query_vector AS (
    SELECT array_agg(CASE WHEN n=1 THEN 1.0 ELSE 0.0 END ORDER BY n)::vector AS value
    FROM generate_series(1,1536) AS n
)
SELECT 'similarity' AS operation, d.label, s.summary_id,
       1 - (s.embedding <=> q.value) AS similarity
FROM vector_demo_ids d JOIN ai_work_summaries s USING (summary_id)
CROSS JOIN query_vector q
WHERE s.embedding_model='demo-unit-vector-v1'
ORDER BY s.embedding <=> q.value, d.label;

-- UPDATE exactly the captured primary row. RETURNING proves a row changed.
UPDATE ai_work_summaries
SET summary_text='Updated synthetic payment-service contribution.',
    generated_on=NOW(),
    embedding=(SELECT array_agg(CASE WHEN n=1 THEN 0.8 WHEN n=2 THEN 0.6 ELSE 0.0 END ORDER BY n)::vector
               FROM generate_series(1,1536) AS n)
WHERE summary_id=(SELECT summary_id FROM vector_demo_ids WHERE label='primary')
  AND embedding_model='demo-unit-vector-v1'
RETURNING 'update' AS operation, summary_id, summary_text;

-- Re-read changed content and vector: similarity is now approximately 0.8.
SELECT 'updated_read' AS operation, s.summary_id, s.summary_text,
       1 - (s.embedding <=> (SELECT array_agg(CASE WHEN n=1 THEN 1.0 ELSE 0.0 END ORDER BY n)::vector
                            FROM generate_series(1,1536) AS n)) AS similarity
FROM ai_work_summaries s
WHERE s.summary_id=(SELECT summary_id FROM vector_demo_ids WHERE label='primary');

-- DELETE that same captured row, rather than a nonexistent hard-coded ID.
DELETE FROM ai_work_summaries
WHERE summary_id=(SELECT summary_id FROM vector_demo_ids WHERE label='primary')
  AND embedding_model='demo-unit-vector-v1'
RETURNING 'delete' AS operation, summary_id;

-- Database-side postconditions also fail visibly if READ/UPDATE/DELETE break.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM ai_work_summaries s JOIN vector_demo_ids d USING (summary_id)
               WHERE d.label='primary') THEN
        RAISE EXCEPTION 'Vector demo DELETE did not remove the captured row';
    END IF;
    IF (SELECT COUNT(*) FROM ai_work_summaries s JOIN vector_demo_ids d USING (summary_id)) <> 1 THEN
        RAISE EXCEPTION 'Vector demo unexpectedly changed another row';
    END IF;
END $$;
SELECT 'deleted_read' AS operation, COUNT(*)::INTEGER AS remaining_primary_rows
FROM ai_work_summaries
WHERE summary_id=(SELECT summary_id FROM vector_demo_ids WHERE label='primary');

ROLLBACK;
