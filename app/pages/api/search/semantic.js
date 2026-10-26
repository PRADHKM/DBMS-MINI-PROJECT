import { embedText, searchSimilarSummaries } from '../../../lib/pgvector';
import { query } from '../../../lib/mysql';
import { loadWorkContext } from '../../../lib/work-context';
import { requireRole } from '../../../lib/auth';
import { apiHandler, text, assertFields } from '../../../lib/api';

export default apiHandler(async (req, res) => {
  const session = await requireRole(req, res, ['admin']);
  if (!session) return;
  assertFields(req.body, ['question']);
  const question = text(req.body.question, 'question', { required: true, max: 1000 });
  const matches = await searchSimilarSummaries(await embedText(question), 5);
  const ids = matches.map((m) => m.emp_id);
  const employees = ids.length ? await query(
    `SELECT emp_id, name, designation, effective_status AS status
     FROM v_employee_effective_status WHERE emp_id IN (${ids.map(() => '?').join(',')})`, ids
  ) : [];
  const byId = new Map(employees.map((e) => [e.emp_id, e]));
  const results = await Promise.all(matches.filter((m) => byId.has(m.emp_id)).map(async (match) => {
    const source = await loadWorkContext(match.emp_id);
    return { ...match, employee: byId.get(match.emp_id), stale: source?.fingerprint !== match.source_fingerprint };
  }));
  return res.status(200).json({ question, results,
    note: results.length ? 'Cosine similarity measures relatedness, not confidence. Stale summaries should be regenerated.' : 'No embedded summaries found. Generate employee summaries after configuring the embedding key.' });
}, ['POST']);
