import { Pool } from 'pg';
import { createEmbedding, embeddingModel, vectorLiteral } from './ai.mjs';

let pgPool;
export function getPgPool() {
  if (!pgPool) {
    pgPool = new Pool({
      host: process.env.PG_HOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER, password: process.env.PG_PASSWORD,
      database: process.env.PG_DATABASE, max: 10,
      connectionTimeoutMillis: 5000, query_timeout: 15000,
    });
    pgPool.on('error', (error) => console.error('PostgreSQL pool error:', error.code));
  }
  return pgPool;
}
export const embedText = createEmbedding;

export async function insertSummary({ empId, summaryText, sourceContext, embedding,
  generationMethod, sourceFingerprint, sourceLogIds, sourceTaskIds }, pool = getPgPool()) {
  const { rows } = await pool.query(
    `INSERT INTO ai_work_summaries
      (emp_id, summary_text, source_context, embedding, generation_method,
       source_fingerprint, embedding_model, source_log_ids, source_task_ids)
     VALUES ($1,$2,$3,$4::vector,$5,$6,$7,$8::jsonb,$9::jsonb)
     RETURNING summary_id, generated_on, summary_text, generation_method,
               source_log_ids, source_task_ids`,
    [empId, summaryText, sourceContext, embedding ? vectorLiteral(embedding) : null,
      generationMethod, sourceFingerprint, embedding ? embeddingModel() : null,
      JSON.stringify(sourceLogIds), JSON.stringify(sourceTaskIds)]
  );
  return rows[0];
}

export async function searchSimilarSummaries(queryEmbedding, limit = 5, pool = getPgPool()) {
  // Select latest first so an older embedding cannot replace a newer record-only snapshot.
  const { rows } = await pool.query(
    `WITH latest AS (
       SELECT DISTINCT ON (emp_id) * FROM ai_work_summaries
       ORDER BY emp_id, generated_on DESC, summary_id DESC
     )
     SELECT summary_id, emp_id, summary_text, generated_on, source_fingerprint,
            1 - (embedding <=> $1::vector) AS similarity
     FROM latest WHERE embedding IS NOT NULL AND embedding_model = $3
     ORDER BY embedding <=> $1::vector, emp_id LIMIT $2`,
    [vectorLiteral(queryEmbedding), limit, embeddingModel()]
  );
  return rows;
}
