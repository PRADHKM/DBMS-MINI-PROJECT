-- ============================================================
-- Workload Management System - Vector Database (PostgreSQL + pgvector)
-- ============================================================
-- Purpose: store AI-generated natural-language summaries of each
-- employee's work (built from MySQL WORK_LOG + TASK + PROJECT rows)
-- as vector embeddings, enabling semantic similarity search such as
-- "what has this employee done related to authentication systems?"
-- instead of relying only on exact keyword matches.
--
-- This is a SEPARATE database from the MySQL relational store.
-- emp_id here is a logical reference to EMPLOYEE(emp_id) in MySQL,
-- not an enforced foreign key (cross-database references cannot be
-- FK-constrained). Integrity is maintained at the application layer.
-- ============================================================

-- 1. Enable the pgvector extension (run once per database)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Table to store summary text + its embedding
CREATE TABLE ai_work_summaries (
    summary_id      SERIAL PRIMARY KEY,
    emp_id          INTEGER NOT NULL,          -- logical FK -> MySQL EMPLOYEE.emp_id
    generated_on    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    summary_text    TEXT NOT NULL,             -- the LLM-generated summary
    source_context  VARCHAR(255),              -- e.g. "auto-generated on resignation", "manual query"
    generation_method VARCHAR(20) NOT NULL DEFAULT 'provider',
    source_fingerprint CHAR(64),
    embedding_model VARCHAR(120),              -- NULL for a record-only, unembedded summary
    source_log_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_task_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    embedding       VECTOR(1536)               -- dimension depends on embedding model (see below)
);

-- 3. HNSW works on an initially empty table without IVFFlat training.
CREATE INDEX idx_ai_summaries_embedding
    ON ai_work_summaries
    USING hnsw (embedding vector_cosine_ops);

-- Optional: plain index to speed up lookups by employee
CREATE INDEX idx_ai_summaries_emp ON ai_work_summaries(emp_id);
CREATE INDEX idx_ai_summaries_latest ON ai_work_summaries(emp_id, generated_on DESC, summary_id DESC);

-- ============================================================
-- Design notes (for your documentation section)
-- ============================================================
-- What gets embedded:
--   The generated summary_text (itself built by an LLM from that
--   employee's WORK_LOG.notes + TASK.title/description + PROJECT.name
--   pulled from MySQL). Embedding the summary rather than every raw
--   log line keeps the vector store compact and the search results
--   coherent per employee rather than fragmented per log entry.
--
-- Embedding model:
--   Any standard text embedding model works, e.g. OpenAI
--   text-embedding-3-small (1536 dims) or a local sentence-transformers
--   model. Pick one and keep the VECTOR() dimension consistent with it.
--
-- Similarity metric:
--   Cosine similarity (vector_cosine_ops above). Query example:
--
--   SELECT summary_id, emp_id, summary_text,
--          1 - (embedding <=> :query_embedding) AS similarity
--   FROM ai_work_summaries
--   ORDER BY embedding <=> :query_embedding
--   LIMIT 5;
--
-- Retrieval flow:
--   1. User asks a natural-language question ("who has worked on
--      payment gateway integration?").
--   2. Backend embeds the question with the same model.
--   3. Query ai_work_summaries with the <=> operator to get the
--      closest-matching employee summaries.
--   4. Backend fetches the matched employees' full structured record
--      from MySQL (via emp_id) to enrich the response.
