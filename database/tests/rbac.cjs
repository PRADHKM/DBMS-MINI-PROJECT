// Database-level RBAC check: node ../database/tests/rbac.cjs (from app/, after 08_roles.sql).
// Connects as the two demo accounts and proves MySQL itself allows or refuses each
// statement. Uses uniquely named fixtures created by the admin account and removed in finally.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const mysql = createRequire(path.resolve(__dirname, '../../app/package.json'))('mysql2/promise');

const conn = (user, password) => mysql.createConnection({
  host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3307),
  user, password, database: process.env.MYSQL_DATABASE || 'workload_management_system', dateStrings: true,
});
const DENIED = { table: 1142, column: 1143, routine: 1370, db: 1044 };
async function denied(connection, sql, ...codes) {
  try { await connection.query(sql); } catch (err) {
    assert.ok(codes.includes(err.errno), `${sql} failed with ${err.errno} ${err.message}, expected one of ${codes}`); return;
  }
  assert.fail(`Expected access denied: ${sql}`);
}

async function main() {
  const admin = await conn(process.env.WMS_ADMIN_DB_USER || 'wms_admin_db', process.env.WMS_ADMIN_DB_PASSWORD || 'wms_admin_db_demo_password');
  const emp = await conn(process.env.WMS_EMPLOYEE_DB_USER || 'wms_employee_db', process.env.WMS_EMPLOYEE_DB_PASSWORD || 'wms_employee_db_demo_password');
  const token = randomUUID().replaceAll('-', '').slice(0, 12);
  let empId, projectId, taskId, passed = 0;
  const test = async (name, run) => { await run(); passed++; console.log(JSON.stringify({ test: name, status: 'passed' })); };
  try {
    empId = (await admin.query(`INSERT INTO EMPLOYEE (name,email,date_of_joining) VALUES (?,?,DATE_SUB(CURDATE(), INTERVAL 1 YEAR))`,
      [`RBAC ${token}`, `${token}@test.invalid`]))[0].insertId;
    projectId = (await admin.query(`INSERT INTO PROJECT (project_name) VALUES (?)`, [`RBAC ${token}`]))[0].insertId;
    taskId = (await admin.query(`INSERT INTO TASK (project_id, assigned_to, title) VALUES (?,?,?)`, [projectId, empId, `RBAC ${token}`]))[0].insertId;

    await test('roles are active by default for each account', async () => {
      assert.deepEqual((await admin.query('SELECT CURRENT_ROLE() AS r'))[0][0].r, '`wms_admin_role`@`%`');
      assert.deepEqual((await emp.query('SELECT CURRENT_ROLE() AS r'))[0][0].r, '`wms_employee_role`@`%`');
    });
    await test('employee role reads operational data and permitted views', async () => {
      assert.ok((await emp.query('SELECT emp_id FROM EMPLOYEE WHERE emp_id=?', [empId]))[0].length === 1);
      assert.ok((await emp.query('SELECT * FROM v_employee_effective_status LIMIT 1'))[0].length === 1);
      assert.ok((await emp.query('SELECT fn_employee_total_hours(?, NULL, NULL) AS h', [empId]))[0].length === 1);
    });
    await test('employee role cannot read credentials, resignations or handover view', async () => {
      await denied(emp, 'SELECT password_hash FROM USER_ACCOUNT', DENIED.table);
      await denied(emp, 'SELECT * FROM RESIGNATION', DENIED.table);
      await denied(emp, 'SELECT * FROM v_resignation_handover', DENIED.table);
    });
    await test('employee role can only change progress fields and own phone column', async () => {
      assert.equal((await emp.query('UPDATE TASK SET status="in_progress" WHERE task_id=?', [taskId]))[0].affectedRows, 1);
      assert.equal((await emp.query('UPDATE EMPLOYEE SET phone="9999999999" WHERE emp_id=?', [empId]))[0].affectedRows, 1);
      await denied(emp, `UPDATE TASK SET title='x' WHERE task_id=${taskId}`, DENIED.column);
      await denied(emp, `UPDATE TASK SET assigned_to=1 WHERE task_id=${taskId}`, DENIED.column);
      await denied(emp, `UPDATE EMPLOYEE SET name='x' WHERE emp_id=${empId}`, DENIED.column);
      await denied(emp, `UPDATE EMPLOYEE SET status='resigned' WHERE emp_id=${empId}`, DENIED.column);
    });
    await test('employee role cannot create or delete master records or run handover', async () => {
      await denied(emp, `INSERT INTO TASK (project_id,title) VALUES (${projectId},'x')`, DENIED.table);
      await denied(emp, `DELETE FROM EMPLOYEE WHERE emp_id=${empId}`, DENIED.table);
      await denied(emp, `DELETE FROM TASK WHERE task_id=${taskId}`, DENIED.table);
      await denied(emp, 'CALL sp_process_resignation(1, CURDATE(), CURDATE(), NULL, 2)', DENIED.routine);
    });
    await test('employee role can write its own work log rows', async () => {
      const id = (await emp.query('INSERT INTO WORK_LOG (task_id, emp_id, log_date, hours_spent, notes) VALUES (?,?,CURDATE(),1.5,?)', [taskId, empId, `RBAC ${token}`]))[0].insertId;
      assert.equal((await emp.query('UPDATE WORK_LOG SET notes="edited" WHERE log_id=?', [id]))[0].affectedRows, 1);
      assert.equal((await emp.query('DELETE FROM WORK_LOG WHERE log_id=?', [id]))[0].affectedRows, 1);
    });
    await test('admin role has full data access but no schema, grant or user control', async () => {
      assert.ok((await admin.query('SELECT user_id FROM USER_ACCOUNT LIMIT 1'))[0].length >= 0);
      assert.equal((await admin.query('UPDATE TASK SET title=? WHERE task_id=?', [`RBAC ${token} edited`, taskId]))[0].affectedRows, 1);
      await denied(admin, 'CREATE TABLE rbac_should_fail (id INT)', DENIED.table, DENIED.db);
      await denied(admin, 'DROP TABLE SKILL', DENIED.table, DENIED.db);
      await denied(admin, 'ALTER TABLE SKILL ADD COLUMN x INT', DENIED.table, DENIED.db);
      await denied(admin, "CREATE USER 'rbac_x'@'%'", DENIED.db, 1227);
      await denied(admin, "GRANT SELECT ON workload_management_system.* TO 'wms_employee_db'@'%'", DENIED.db, 1227, 1045);
    });
    await test('admin role may execute handover procedure (input errors are not access errors)', async () => {
      try { await admin.query('CALL sp_process_resignation(0, CURDATE(), CURDATE(), NULL, NULL)'); assert.fail('expected validation error'); }
      catch (err) { assert.notEqual(err.errno, DENIED.routine); assert.equal(err.sqlState, '45000'); }
    });
    console.log(JSON.stringify({ status: 'passed', tests: passed }));
  } finally {
    if (taskId) await admin.query('DELETE FROM WORK_LOG WHERE task_id=?', [taskId]).catch(() => {});
    if (taskId) await admin.query('DELETE FROM TASK WHERE task_id=?', [taskId]).catch(() => {});
    if (projectId) await admin.query('DELETE FROM PROJECT WHERE project_id=?', [projectId]).catch(() => {});
    if (empId) await admin.query('DELETE FROM EMPLOYEE WHERE emp_id=?', [empId]).catch(() => {});
    await admin.end(); await emp.end();
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
