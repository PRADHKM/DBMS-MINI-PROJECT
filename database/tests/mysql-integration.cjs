// Run from app/: node --env-file=.env.local ../database/tests/mysql-integration.cjs
// Opt in with WMS_DB_TESTS=1. Uses temporary, uniquely named fixtures and cleans
// them in finally; never creates/drops a database or changes seeded records.
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const appRequire = createRequire(path.resolve(__dirname, '../../app/package.json'));
const mysql = appRequire('mysql2/promise');
const bcrypt = appRequire('bcryptjs');

async function main() {
  assert.equal(process.env.WMS_DB_TESTS, '1', 'Set WMS_DB_TESTS=1 to run fixture-based integration tests.');
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3307),
    user: process.env.MYSQL_USER || 'wms_app',
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE || 'workload_management_system',
    dateStrings: true,
  });
  const token = randomUUID().replaceAll('-', '').slice(0, 14);
  const employeeIds = [];
  let projectId;
  let faultTrigger;
  let passed = 0;
  let skipped = 0;
  // query() supports the CREATE/DROP TRIGGER statements used for fault injection;
  // mysql2 escapes every value in params (no values are interpolated into SQL).
  const q = async (sql, params = []) => (await connection.query(sql, params))[0];
  const scalar = async (sql, params = []) => Object.values((await q(sql, params))[0])[0];
  const test = async (name, run) => {
    const result = await run();
    if (result === 'skipped') { skipped++; return; }
    passed++; console.log(JSON.stringify({ test: name, status: 'passed' }));
  };
  const employee = async (label) => {
    const result = await q(`INSERT INTO EMPLOYEE (name,email,date_of_joining)
      VALUES (?,?,DATE_SUB(CURDATE(), INTERVAL 1 YEAR))`,
      [`Integration ${token} ${label}`, `${token}-${label}@test.invalid`]);
    employeeIds.push(result.insertId);
    return result.insertId;
  };
  const task = async (owner, label, status = 'in_progress') => {
    const result = await q('INSERT INTO TASK (project_id,assigned_to,title,status) VALUES (?,?,?,?)',
      [projectId, owner, `Integration ${token} ${label}`, status]);
    return result.insertId;
  };
  const reject = async (sql, params = []) => assert.rejects(() => q(sql, params),
    (error) => error.sqlState === '45000' || error.code === 'ER_DUP_ENTRY');
  try {
    await test('demo seed password hashes verify', async () => {
      // Other suites and real users may have their own passwords. Check the
      // named demo fixtures, not every account that happens to exist.
      const names = ['ravi.shankar','harish.kumar','ananya.rao','karthik.iyer',
        'divya.menon','meera.nair','arjun.das','priya.varma','lakshmi.prasad',
        'vikram.reddy','sneha.gupta'];
      const accounts = await q(`SELECT username,password_hash FROM USER_ACCOUNT WHERE username IN (${names.map(() => '?').join(',')})`, names);
      assert.equal(accounts.length, names.length, 'All named demo accounts must exist');
      for (const account of accounts) assert.ok(await bcrypt.compare('Passw0rd!', account.password_hash), account.username);
    });
    await test('workload view does not multiply logged hours', async () => {
      const rows = await q(`SELECT v.emp_id,v.total_hours_logged,
        (SELECT COALESCE(SUM(hours_spent),0) FROM WORK_LOG w WHERE w.emp_id=v.emp_id) actual_hours
        FROM v_active_employee_workload v`);
      for (const row of rows) assert.equal(Number(row.total_hours_logged), Number(row.actual_hours));
    });
    projectId = (await q('INSERT INTO PROJECT (project_name) VALUES (?)', [`Integration ${token}`])).insertId;
    const departing = await employee('departing');
    const receiver = await employee('receiver');
    const invalid = await employee('invalid');
    const past = await employee('past');
    const today = await employee('today');
    const rollback = await employee('rollback');
    const openTask = await task(departing, 'open');
    const completedTask = await task(departing, 'complete', 'completed');
    const invalidTask = await task(invalid, 'invalid');
    const rollbackTask = await task(rollback, 'rollback');
    const logId = (await q(`INSERT INTO WORK_LOG (task_id,emp_id,log_date,hours_spent,notes)
      VALUES (?,?,CURDATE(),2,'Original author')`, [openTask, departing])).insertId;
    await test('invalid resignation inputs leave all state unchanged', async () => {
      await reject('CALL sp_process_resignation(?,CURDATE(),CURDATE(),NULL,?)', [invalid, invalid]);
      await reject('CALL sp_process_resignation(?,CURDATE(),CURDATE(),NULL,NULL)', [invalid]);
      await reject('CALL sp_process_resignation(?,CURDATE(),CURDATE(),NULL,?)', [invalid, 2147483647]);
      await reject('CALL sp_process_resignation(?,DATE_ADD(CURDATE(),INTERVAL 1 DAY),DATE_ADD(CURDATE(),INTERVAL 2 DAY),NULL,?)', [invalid, receiver]);
      await reject('CALL sp_process_resignation(?,CURDATE(),DATE_SUB(CURDATE(),INTERVAL 1 DAY),NULL,?)', [invalid, receiver]);
      await reject('CALL sp_process_resignation(?,DATE_SUB(CURDATE(),INTERVAL 2 YEAR),CURDATE(),NULL,?)', [invalid, receiver]);
      assert.equal(await scalar('SELECT COUNT(*) FROM RESIGNATION WHERE emp_id=?', [invalid]), 0);
      assert.equal(await scalar('SELECT status FROM EMPLOYEE WHERE emp_id=?', [invalid]), 'active');
      assert.equal(await scalar('SELECT assigned_to FROM TASK WHERE task_id=?', [invalidTask]), invalid);
    });
    await test('future notice transfers unfinished tasks and preserves history', async () => {
      await q(`CALL sp_process_resignation(?,DATE_SUB(CURDATE(),INTERVAL 3 DAY),
        DATE_ADD(CURDATE(),INTERVAL 7 DAY),'Integration notice',?)`, [departing, receiver]);
      assert.equal(await scalar('SELECT assigned_to FROM TASK WHERE task_id=?', [openTask]), receiver);
      assert.equal(await scalar('SELECT assigned_to FROM TASK WHERE task_id=?', [completedTask]), departing);
      assert.equal(await scalar('SELECT emp_id FROM WORK_LOG WHERE log_id=?', [logId]), departing);
      assert.equal(await scalar('SELECT effective_status FROM v_employee_effective_status WHERE emp_id=?', [departing]), 'active');
      await q('UPDATE WORK_LOG SET notes=?,hours_spent=3 WHERE log_id=?', ['Historical correction', logId]);
      assert.equal(await scalar('SELECT emp_id FROM WORK_LOG WHERE log_id=?', [logId]), departing);
      await reject('CALL sp_process_resignation(?,CURDATE(),CURDATE(),NULL,?)', [departing, receiver]);
      await reject('CALL sp_process_resignation(?,CURDATE(),CURDATE(),NULL,?)', [invalid, departing]);
      await reject('INSERT INTO TASK (project_id,assigned_to,title) VALUES (?,?,?)', [projectId, departing, 'Should fail']);
      await reject('UPDATE TASK SET assigned_to=? WHERE task_id=?', [departing, invalidTask]);
    });
    await test('last working day and automatic read-time expiry', async () => {
      await q('CALL sp_process_resignation(?,CURDATE(),CURDATE(),NULL,NULL)', [today]);
      assert.equal(await scalar('SELECT effective_status FROM v_employee_effective_status WHERE emp_id=?', [today]), 'active');
      await q(`CALL sp_process_resignation(?,DATE_SUB(CURDATE(),INTERVAL 2 DAY),
        DATE_SUB(CURDATE(),INTERVAL 1 DAY),NULL,NULL)`, [past]);
      assert.equal(await scalar('SELECT status FROM EMPLOYEE WHERE emp_id=?', [past]), 'resigned');
      await q('UPDATE RESIGNATION SET last_working_day=DATE_SUB(CURDATE(),INTERVAL 1 DAY) WHERE emp_id=?', [departing]);
      assert.equal(await scalar('SELECT status FROM EMPLOYEE WHERE emp_id=?', [departing]), 'active');
      assert.equal(await scalar('SELECT effective_status FROM v_employee_effective_status WHERE emp_id=?', [departing]), 'resigned');
      await reject('CALL sp_process_resignation(?,CURDATE(),CURDATE(),NULL,?)', [invalid, past]);
    });
    await test('mid-handover error rolls back resignation status and task ownership', async () => {
      const triggerName = `test_handover_${token}`;
      try {
        await q(`CREATE TRIGGER ${triggerName} AFTER UPDATE ON TASK FOR EACH ROW
          BEGIN IF NEW.task_id=${rollbackTask} THEN SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT='Intentional integration-test handover failure'; END IF; END`);
        faultTrigger = triggerName;
      } catch (error) {
        if (!['ER_BINLOG_CREATE_ROUTINE_NEED_SUPER', 'ER_SPECIFIC_ACCESS_DENIED_ERROR', 'ER_TABLEACCESS_DENIED_ERROR'].includes(error.code)) throw error;
        console.log(JSON.stringify({ test: 'mid-handover error rolls back resignation status and task ownership',
          status: 'skipped', reason: 'Test account cannot create the fault-injection trigger; use a disposable privileged database to verify this case.' }));
        return 'skipped';
      }
      await reject(`CALL sp_process_resignation(?,DATE_SUB(CURDATE(),INTERVAL 2 DAY),
        DATE_SUB(CURDATE(),INTERVAL 1 DAY),NULL,?)`, [rollback, receiver]);
      assert.equal(await scalar('SELECT COUNT(*) FROM RESIGNATION WHERE emp_id=?', [rollback]), 0);
      assert.equal(await scalar('SELECT status FROM EMPLOYEE WHERE emp_id=?', [rollback]), 'active');
      assert.equal(await scalar('SELECT assigned_to FROM TASK WHERE task_id=?', [rollbackTask]), rollback);
      await q(`DROP TRIGGER ${faultTrigger}`); faultTrigger = null;
    });
    await test('task completion timestamps and work-log integrity', async () => {
      await q('UPDATE TASK SET status=\'completed\' WHERE task_id=?', [invalidTask]);
      assert.ok(await scalar('SELECT completion_date FROM TASK WHERE task_id=?', [invalidTask]));
      await reject('INSERT INTO WORK_LOG (task_id,emp_id,log_date,hours_spent) VALUES (?,?,CURDATE(),1)', [invalidTask, invalid]);
      await q('UPDATE TASK SET status=\'in_progress\' WHERE task_id=?', [invalidTask]);
      assert.equal(await scalar('SELECT completion_date FROM TASK WHERE task_id=?', [invalidTask]), null);
      await reject('INSERT INTO WORK_LOG (task_id,emp_id,log_date,hours_spent) VALUES (?,?,CURDATE(),1)', [invalidTask, receiver]);
      await reject('INSERT INTO WORK_LOG (task_id,emp_id,log_date,hours_spent) VALUES (?,?,DATE_ADD(CURDATE(),INTERVAL 1 DAY),1)', [invalidTask, invalid]);
    });
    console.log(JSON.stringify({ status: 'passed', tests: passed, skipped, server: await scalar('SELECT VERSION()') }));
  } finally {
    try {
      if (faultTrigger) await q(`DROP TRIGGER IF EXISTS ${faultTrigger}`);
      if (projectId) await q('DELETE FROM PROJECT WHERE project_id=?', [projectId]);
      for (const id of employeeIds) await q('DELETE FROM EMPLOYEE WHERE emp_id=?', [id]);
    } finally { await connection.end(); }
  }
}
main().catch((error) => { console.error(JSON.stringify({ status: 'failed', error: error.message })); process.exitCode = 1; });
