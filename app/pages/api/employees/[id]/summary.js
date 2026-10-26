import { embedText, insertSummary, getPgPool } from '../../../../lib/pgvector';
import { generateSummary, hasEmbeddingKey } from '../../../../lib/ai.mjs';
import { loadWorkContext } from '../../../../lib/work-context';
import { requireSession } from '../../../../lib/auth';
import { apiHandler, parseId, fail, canAccessEmployee } from '../../../../lib/api';

export default apiHandler(async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const id = parseId(req.query.id);
  if (!canAccessEmployee(session.user, id)) fail(403, 'Forbidden');
  const source = await loadWorkContext(id);
  if (!source) fail(404, 'Employee not found');
  if (req.method === 'GET') {
    const { rows } = await getPgPool().query(
      `SELECT summary_id, summary_text, generated_on, generation_method,
              source_fingerprint, source_log_ids, source_task_ids
       FROM ai_work_summaries WHERE emp_id=$1
       ORDER BY generated_on DESC, summary_id DESC LIMIT 1`, [id]
    );
    if (!rows.length) fail(404, 'No summary generated yet');
    return res.status(200).json({ ...rows[0], stale: rows[0].source_fingerprint !== source.fingerprint });
  }
  const generated = await generateSummary(source.context);
  const embedding = hasEmbeddingKey() ? await embedText(generated.text) : null;
  const saved = await insertSummary({
    empId: id, summaryText: generated.text, embedding,
    sourceContext: 'On-demand work history and current task snapshot',
    generationMethod: generated.method, sourceFingerprint: source.fingerprint,
    sourceLogIds: generated.sourceLogIds,
    sourceTaskIds: generated.sourceTaskIds,
  });
  return res.status(201).json({ ...saved, stale: false, searchable: Boolean(embedding) });
}, ['GET', 'POST']);
