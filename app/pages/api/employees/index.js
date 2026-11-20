import { query, getPool } from '../../../lib/mysql';
import { requireSession, requireRole } from '../../../lib/auth';
import { apiHandler, text, date, optionalId, enumValue, assertFields, fail, requireRecord, requireAvailableEmployee } from '../../../lib/api';
import { insertEmployeeAccount, prepareEmployeeAccount } from '../../../lib/employee-account';

export default apiHandler(async (req, res) => {
  if (req.method === 'GET') {
    const session = await requireSession(req, res); if (!session) return;
    const admin = session.user.role === 'admin';
    let sql = `SELECT e.emp_id,e.name,e.designation,e.dept_id,e.manager_id,e.email,e.phone,e.date_of_joining,
      e.employment_status AS status,e.resignation_date,
      e.last_working_day,d.dept_name${admin ? ',u.username AS login_username' : ''} FROM v_employee_effective_status e
      LEFT JOIN DEPARTMENT d ON d.dept_id=e.dept_id
      ${admin ? 'LEFT JOIN USER_ACCOUNT u ON u.emp_id=e.emp_id' : ''} WHERE 1=1`;
    const params = [];
    if (!admin) { sql += ' AND e.emp_id=?'; params.push(session.user.empId); }
    if (req.query.dept) { sql += ' AND e.dept_id=?'; params.push(optionalId(req.query.dept, 'dept')); }
    if (req.query.status) { sql += ' AND e.employment_status=?'; params.push(enumValue(req.query.status, 'status', ['active','notice_period','resigned'])); }
    if (req.query.search) { sql += ' AND e.name LIKE ?'; params.push(`%${text(req.query.search, 'search', {max:100})}%`); }
    return res.status(200).json(await query(sql + ' ORDER BY e.name', params));
  }
  const session = await requireRole(req, res, ['admin']); if (!session) return;
  assertFields(req.body, ['name','email','phone','designation','dept_id','manager_id','date_of_joining','username','password','role']);
  const body = req.body;
  const values = {
    name: text(body.name, 'name', {required:true,max:100}),
    email: text(body.email, 'email', {required:true,max:100}),
    phone: text(body.phone, 'phone', {max:15}),
    designation: text(body.designation, 'designation', {max:100}),
    dept_id: optionalId(body.dept_id, 'dept_id'), manager_id: optionalId(body.manager_id, 'manager_id'),
    date_of_joining: date(body.date_of_joining, 'date_of_joining', {required:true}),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) fail(400, 'A valid email is required');
  if (values.dept_id) await requireRecord('DEPARTMENT', 'dept_id', values.dept_id);
  await requireAvailableEmployee(values.manager_id);
  const account = await prepareEmployeeAccount(body);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(`INSERT INTO EMPLOYEE (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`, Object.values(values));
    if (account) await insertEmployeeAccount(conn, result.insertId, account);
    await conn.commit();
    return res.status(201).json({emp_id:result.insertId});
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}, ['GET','POST']);
