import { embedText, getSummary, updateSummary, deleteSummary } from '../../../lib/pgvector';
import { requireSession } from '../../../lib/auth';
import { apiHandler, parseId, fail, text, assertFields, canAccessEmployee } from '../../../lib/api';

// Read/Update/Delete one vector summary snapshot. Reads follow employee access;
// edits and deletes are admin-only because summaries feed handover decisions.
export default apiHandler(async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const id = parseId(req.query.id);
  const summary = await getSummary(id);
  // 404 for both missing and inaccessible rows so IDs of other employees' summaries do not leak.
  if (!summary || !canAccessEmployee(session.user, summary.emp_id)) fail(404, 'Summary not found');
  if (req.method === 'GET') return res.status(200).json(summary);
  if (session.user.role !== 'admin') fail(403, 'Forbidden — insufficient role');
  if (req.method === 'DELETE') {
    if (!(await deleteSummary(id))) fail(404, 'Summary not found');
    return res.status(204).end();
  }
  assertFields(req.body, ['summary_text']);
  const summaryText = text(req.body.summary_text, 'summary_text', { required: true, max: 8000 });
  const updated = await updateSummary(id, { summaryText, embedding: await embedText(summaryText) });
  if (!updated) fail(404, 'Summary not found');
  return res.status(200).json(updated);
}, ['GET', 'PUT', 'DELETE']);
