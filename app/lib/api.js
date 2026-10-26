import { query, getPool } from './mysql';
export { HttpError, fail, parseId, optionalId, text, date, enumValue, numberValue, assertFields, canAccessEmployee, dateOrder, TASK_STATUSES, PROJECT_STATUSES, PRIORITIES } from './domain.mjs';
import { HttpError, fail } from './domain.mjs';

export function apiHandler(handler, allowedMethods) {
  return async function guarded(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (allowedMethods && !allowedMethods.includes(req.method)) {
      res.setHeader('Allow', allowedMethods);
      return res.status(405).json({ error: 'Method not allowed' });
    }
    try { return await handler(req, res); }
    catch (err) {
      if (res.headersSent) return;
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A record with those unique details already exists' });
      if (['ER_ROW_IS_REFERENCED_2', 'ER_NO_REFERENCED_ROW_2'].includes(err.code)) return res.status(409).json({ error: 'This change conflicts with a related record' });
      if (['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(err.code)) return res.status(409).json({ error: 'Another change is in progress. Refresh and try again.' });
      if (err.sqlState === '45000') return res.status(400).json({ error: err.sqlMessage || 'The database rejected this change' });
      if (['ER_CHECK_CONSTRAINT_VIOLATED', 'WARN_DATA_TRUNCATED', 'ER_DATA_TOO_LONG', 'ER_TRUNCATED_WRONG_VALUE'].includes(err.code)) return res.status(400).json({ error: 'One or more values violate database rules' });
      console.error('API request failed:', err.code || err.name || 'Error', err.message);
      return res.status(503).json({ error: 'The service is unavailable. Check the server database and provider configuration.' });
    }
  };
}
export async function requireRecord(table, key, id) {
  const record = (await query(`SELECT * FROM ${table} WHERE ${key} = ?`, [id]))[0];
  if (!record) fail(404, 'Record not found');
  return record;
}
export async function requireAvailableEmployee(id) {
  if (id == null) return;
  const rows = await query(`SELECT e.emp_id FROM EMPLOYEE e LEFT JOIN RESIGNATION r ON r.emp_id=e.emp_id WHERE e.emp_id=? AND e.status='active' AND r.emp_id IS NULL`, [id]);
  if (!rows.length) fail(400, 'Choose an active employee who has no recorded resignation');
}
export async function updateRecord(table, key, id, values) {
  const fields = Object.keys(values);
  if (!fields.length) fail(400, 'No fields to update');
  await query(`UPDATE ${table} SET ${fields.map((field) => `${field} = ?`).join(', ')} WHERE ${key} = ?`, [...Object.values(values), id]);
}
export async function insertRecord(table, values) {
  const fields = Object.keys(values);
  const result = await query(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`, Object.values(values));
  return result.insertId;
}
// Lock the parent while checking references so a concurrent insert cannot be
// silently removed by an ON DELETE CASCADE between the check and DELETE.
export async function deleteWithoutHistory(table, key, id, historySql, historyParams, message) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(`SELECT ${key} FROM ${table} WHERE ${key}=? FOR UPDATE`, [id]);
    if (!existing.length) fail(404, 'Record not found');
    const [counts] = await conn.execute(historySql, historyParams);
    if (Number(counts[0].total)) fail(409, message);
    await conn.execute(`DELETE FROM ${table} WHERE ${key}=?`, [id]);
    await conn.commit();
  } catch (err) { await conn.rollback(); throw err; }
  finally { conn.release(); }
}
