import { requireSession } from '../../../lib/auth';
import { apiHandler, assertFields, date, fail, text } from '../../../lib/api';
import { query } from '../../../lib/mysql';
import { lockEmployees, requireNoResignation, resignationTransaction } from '../../../lib/resignation-requests';

export default apiHandler(async (req, res) => {
  const session = await requireSession(req, res);
  if (!session) return;
  const { empId, role } = session.user;
  if (req.method === 'GET') {
    const base = `SELECT q.request_id, q.emp_id, e.name AS employee_name, q.status, q.submitted_on,
      q.proposed_last_day, q.employee_notes, q.reviewed_at, r.last_working_day, h.name AS successor_name
      FROM RESIGNATION_REQUEST q JOIN EMPLOYEE e ON e.emp_id=q.emp_id
      LEFT JOIN RESIGNATION r ON r.emp_id=q.emp_id AND q.status='approved'
      LEFT JOIN EMPLOYEE h ON h.emp_id=r.handover_to`;
    const rows = role === 'admin'
      ? await query(base + " WHERE q.status='pending' ORDER BY q.request_id")
      : await query(base + ' WHERE q.emp_id=? ORDER BY q.request_id DESC', [empId]);
    return res.status(200).json(rows);
  }

  if (role !== 'employee') fail(403, 'Submit a resignation request from your employee account.');
  assertFields(req.body, ['proposed_last_day', 'employee_notes']);
  const lastDay = date(req.body.proposed_last_day, 'proposed_last_day', { required: true });
  const notes = text(req.body.employee_notes, 'employee_notes');
  const requestId = await resignationTransaction(async conn => {
    const [employee] = await lockEmployees(conn, [empId]);
    await requireNoResignation(conn, employee);
    if (lastDay < employee.today) fail(400, 'The proposed last working day must be today or later.');
    if (employee.date_of_joining > employee.today) fail(400, 'You can submit a request on or after your joining date.');
    const [pending] = await conn.execute('SELECT request_id FROM RESIGNATION_REQUEST WHERE pending_emp_id=? FOR UPDATE', [empId]);
    if (pending.length) fail(409, 'You already have a resignation request awaiting review.');
    const [result] = await conn.execute(`INSERT INTO RESIGNATION_REQUEST (emp_id, submitted_on, proposed_last_day, employee_notes)
      VALUES (?, ?, ?, ?)`, [empId, employee.today, lastDay, notes]);
    return result.insertId;
  });
  return res.status(201).json({ request_id: requestId, status: 'pending' });
}, ['GET', 'POST']);
