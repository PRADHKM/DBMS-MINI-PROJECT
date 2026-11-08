import { listSummaries } from '../../../../lib/pgvector';
import { requireSession } from '../../../../lib/auth';
import { apiHandler, parseId, fail, canAccessEmployee } from '../../../../lib/api';
import { loadWorkContext } from '../../../../lib/work-context';

export default apiHandler(async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const id = parseId(req.query.id);
  if (!canAccessEmployee(session.user, id)) fail(403, 'Forbidden');
  const source = await loadWorkContext(id);
  if (!source) fail(404, 'Employee not found');
  const rows = await listSummaries(id);
  return res.status(200).json(rows.map((row) => ({ ...row, stale: row.source_fingerprint !== source.fingerprint })));
}, ['GET']);
