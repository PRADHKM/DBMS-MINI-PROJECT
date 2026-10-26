import bcrypt from 'bcryptjs';
import { query, getPool } from '../../../lib/mysql';
import { requireSession, requireRole } from '../../../lib/auth';
import { apiHandler, text, date, optionalId, enumValue, assertFields, fail, requireRecord, requireAvailableEmployee } from '../../../lib/api';

export default apiHandler(async (req, res) => {
  if (req.method === 'GET') {
    const session = await requireSession(req, res); if (!session) return;
    let sql = `SELECT e.emp_id,e.name,e.designation,e.dept_id,e.manager_id,e.email,e.phone,e.date_of_joining,
      CASE WHEN r.last_working_day<CURDATE() THEN 'resigned' ELSE e.status END AS status,
      r.last_working_day,d.dept_name FROM EMPLOYEE e
      LEFT JOIN DEPARTMENT d ON d.dept_id=e.dept_id LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id WHERE 1=1`;
    const params = [];
    if (session.user.role !== 'admin') { sql += ' AND e.emp_id=?'; params.push(session.user.empId); }
    if (req.query.dept) { sql += ' AND e.dept_id=?'; params.push(optionalId(req.query.dept, 'dept')); }
    if (req.query.status) { sql += ` AND (CASE WHEN r.last_working_day<CURDATE() THEN 'resigned' ELSE e.status END)=?`; params.push(enumValue(req.query.status, 'status', ['active','resigned'])); }
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
  const username = text(body.username, 'username', {max:50});
  const password = body.password;
  if ((username && !password) || (!username && password)) fail(400, 'Provide both username and password to create a login');
  if (password && (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) fail(400, 'Password must be at least 8 characters and at most 72 bytes');
  const role = enumValue(body.role, 'role', ['admin','employee'], 'employee');
  const hash = password ? await bcrypt.hash(password, 12) : null;
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(`INSERT INTO EMPLOYEE (${Object.keys(values).join(',')}) VALUES (${Object.keys(values).map(() => '?').join(',')})`, Object.values(values));
    if (username) await conn.execute('INSERT INTO USER_ACCOUNT (emp_id,username,password_hash,role) VALUES (?,?,?,?)', [result.insertId,username,hash,role]);
    await conn.commit();
    return res.status(201).json({emp_id:result.insertId});
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}, ['GET','POST']);
