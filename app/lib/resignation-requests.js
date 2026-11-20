import { fail } from './api';
import { getPool } from './mysql';

export async function resignationTransaction(work) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await work(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function lockEmployees(conn, ids) {
  const [rows] = await conn.query(`
    SELECT emp_id, status, date_of_joining, CURDATE() AS today
    FROM EMPLOYEE WHERE emp_id IN (?) ORDER BY emp_id FOR UPDATE`, [ids]);
  return rows;
}

export async function requireNoResignation(conn, employee) {
  if (!employee || employee.status !== 'active') fail(409, 'This employee is no longer active.');
  const [rows] = await conn.execute('SELECT resignation_id FROM RESIGNATION WHERE emp_id=? FOR UPDATE', [employee.emp_id]);
  if (rows.length) fail(409, 'A resignation has already been recorded for this employee.');
}
