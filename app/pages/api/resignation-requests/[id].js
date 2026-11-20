import { requireRole } from '../../../lib/auth';
import { apiHandler, assertFields, date, dateOrder, enumValue, fail, optionalId, parseId, text } from '../../../lib/api';
import { query } from '../../../lib/mysql';
import { lockEmployees, requireNoResignation, resignationTransaction } from '../../../lib/resignation-requests';

export default apiHandler(async (req, res) => {
  const session = await requireRole(req, res, ['admin']);
  if (!session) return;
  const id = parseId(req.query.id);
  const decision = enumValue(req.body?.decision, 'decision', ['approved', 'declined']);
  const approve = decision === 'approved';
  assertFields(req.body, approve ? ['decision', 'last_working_day', 'handover_to', 'handover_notes'] : ['decision']);
  const lastDay = approve ? date(req.body.last_working_day, 'last_working_day', { required: true }) : null;
  const successor = approve ? optionalId(req.body.handover_to, 'handover_to') : null;
  const notes = approve ? text(req.body.handover_notes, 'handover_notes') : null;
  const [owner] = await query('SELECT emp_id FROM RESIGNATION_REQUEST WHERE request_id=?', [id]);
  if (!owner) fail(404, 'Resignation request not found.');
  if (successor === owner.emp_id) fail(400, 'Choose a different employee for handover.');

  await resignationTransaction(async conn => {
    const ids = [owner.emp_id];
    if (successor) ids.push(successor);
    const employees = await lockEmployees(conn, ids);
    const [[request]] = await conn.execute('SELECT * FROM RESIGNATION_REQUEST WHERE request_id=? FOR UPDATE', [id]);
    if (!request) fail(404, 'Resignation request not found.');
    if (request.status !== 'pending') fail(409, 'This request has already been reviewed.');
    if (approve) {
      await requireNoResignation(conn, employees.find(employee => employee.emp_id === owner.emp_id));
      dateOrder(request.submitted_on, lastDay, 'submission date', 'last_working_day');
    }
    await conn.execute(`UPDATE RESIGNATION_REQUEST SET status=?, reviewed_by=?, reviewed_at=NOW()
      WHERE request_id=?`, [decision, session.user.empId, id]);
    if (approve) {
      // The existing resignation triggers validate the successor and transfer
      // unfinished tasks. A failure rolls the request decision back as well.
      await conn.execute(`INSERT INTO RESIGNATION (emp_id, resignation_date, last_working_day, handover_notes, handover_to)
        VALUES (?,?,?,?,?)`, [owner.emp_id, request.submitted_on, lastDay, notes, successor]);
    }
  });
  return res.status(200).json({ status: decision });
}, ['PUT']);
