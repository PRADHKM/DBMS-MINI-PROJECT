import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

// Run only against a disposable test database, with the same MYSQL_* settings
// as the running application. All uniquely named fixture rows are removed.
// node --env-file=.env.local --test tests/concurrency.integration.mjs
const base = (process.env.WMS_BASE_URL || process.env.WMS_TEST_URL || 'http://localhost:3000').replace(/\/$/, '');
const config = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT || 3307),
  user: process.env.MYSQL_USER || 'wms_app',
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || 'workload_management_system',
  dateStrings: true,
};

class Client {
  cookies = new Map();
  async request(path, { method = 'GET', body, form } = {}) {
    const headers = { cookie: [...this.cookies].map(([key,value]) => `${key}=${value}`).join('; ') };
    let payload;
    if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form); }
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const response = await fetch(base + path, { method, headers, body: payload,
      redirect: 'manual', signal: AbortSignal.timeout(25000) });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';', 1)[0], split = pair.indexOf('=');
      this.cookies.set(pair.slice(0,split), pair.slice(split+1));
    }
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    return { status: response.status, location: response.headers.get('location'), data };
  }
  async login(username, password) {
    const csrf = await this.request('/api/auth/csrf');
    assert.equal(csrf.status, 200);
    const response = await this.request('/api/auth/callback/credentials', { method:'POST',
      form: { csrfToken:csrf.data.csrfToken, username,password,json:'true',callbackUrl:base+'/dashboard' } });
    assert.equal(response.status, 200, JSON.stringify(response.data));
    const session = await this.request('/api/auth/session');
    assert.ok(session.data?.user?.empId, 'Fixture account must have a valid session');
  }
}

test('concurrent writes preserve history, manager acyclicity and live page authorization', { timeout: 100000 }, async (t) => {
  const db = await mysql.createConnection(config);
  const blocker = await mysql.createConnection(config);
  const prefix = 'concurrency_' + randomUUID().replaceAll('-','').slice(0,12);
  const employees = [], projects = [];
  let fixtureTask, pendingMove;
  const q = async (sql, params=[]) => (await db.query(sql,params))[0];
  const employee = async (label) => {
    const result = await q(`INSERT INTO EMPLOYEE (name,email,date_of_joining)
      VALUES (?,?,DATE_SUB(CURDATE(),INTERVAL 1 YEAR))`, [prefix+' '+label,prefix+'.'+label+'@test.invalid']);
    employees.push(result.insertId); return result.insertId;
  };
  try {
    const actor = await employee('actor'), owner = await employee('owner');
    const alpha = await employee('alpha'), beta = await employee('beta');
    const password='ConcurrentTest!2026';
    await q('INSERT INTO USER_ACCOUNT (emp_id,username,password_hash,role) VALUES (?,?,?,\'admin\')',
      [actor,prefix,bcrypt.hashSync(password,10)]);
    for (const label of ['original','destination']) projects.push((await q(
      'INSERT INTO PROJECT (project_name) VALUES (?)',[prefix+' '+label])).insertId);
    fixtureTask=(await q(`INSERT INTO TASK (project_id,assigned_to,title,status)
      VALUES (?,?,?,'in_progress')`,[projects[0],owner,prefix+' task'])).insertId;
    const admin = new Client(); await admin.login(prefix,password);

    await t.test('a concurrent first work log prevents a task project move', async () => {
      await blocker.beginTransaction();
      await blocker.query('SELECT emp_id FROM EMPLOYEE WHERE emp_id=? FOR UPDATE',[owner]);
      await blocker.query('SELECT task_id FROM TASK WHERE task_id=? FOR UPDATE',[fixtureTask]);
      pendingMove=admin.request('/api/tasks/'+fixtureTask,{method:'PUT',body:{project_id:projects[1]}});
      // The observed pending database statement, not an arbitrary delay, proves
      // the HTTP edit reached its write boundary while the blocker owns the rows.
      const deadline=Date.now()+12000;
      let observed;
      while(Date.now()<deadline) {
        const processes=await q('SHOW FULL PROCESSLIST');
        observed=processes.find((row)=> {
          const sql=String(row.Info || '');
          const fixtureEmployeeLock=/SELECT\s+emp_id\s+FROM\s+EMPLOYEE\s+WHERE\s+emp_id\s+IN/i.test(sql)
            && new RegExp(`\\b${owner}\\b`).test(sql) && /FOR UPDATE/i.test(sql);
          const unsafeTaskUpdate=/UPDATE\s+TASK\s+SET/i.test(sql)
            && new RegExp(`\\b${fixtureTask}\\b`).test(sql);
          return row.Id!==blocker.threadId && (fixtureEmployeeLock || unsafeTaskUpdate);
        });
        if(observed)break;
        await yieldTurn();
      }
      assert.ok(observed,'Task-edit query must be observed blocked before creating its first log');
      t.diagnostic('Observed blocked task edit: '+String(observed.Info).replace(/\s+/g,' '));
      await blocker.query(`INSERT INTO WORK_LOG (task_id,emp_id,log_date,hours_spent,notes)
        VALUES (?,?,CURDATE(),1,'Inserted while project edit was blocked')`,[fixtureTask,owner]);
      await blocker.commit();
      const response=await pendingMove;pendingMove=null;
      assert.equal(response.status,409,JSON.stringify(response.data));
      const [task]=await q('SELECT project_id FROM TASK WHERE task_id=?',[fixtureTask]);
      assert.equal(task.project_id,projects[0]);
      assert.equal((await q('SELECT COUNT(*) AS total FROM WORK_LOG WHERE task_id=?',[fixtureTask]))[0].total,1);
    });

    await t.test('simultaneous opposite manager changes cannot create a cycle', async () => {
      const responses=await Promise.all([
        admin.request('/api/employees/'+alpha,{method:'PUT',body:{manager_id:beta}}),
        admin.request('/api/employees/'+beta,{method:'PUT',body:{manager_id:alpha}}),
      ]);
      assert.deepEqual(responses.map((response)=>response.status).sort((a,b)=>a-b),[200,400],JSON.stringify(responses));
      const rows=await q('SELECT emp_id,manager_id FROM EMPLOYEE WHERE emp_id IN (?,?)',[alpha,beta]);
      const byId=new Map(rows.map((row)=>[row.emp_id,row.manager_id]));
      for(const start of [alpha,beta]) {
        const visited=new Set();let cursor=start;
        while(cursor!=null) {
          assert.ok(!visited.has(cursor),'Concurrent updates must leave an acyclic hierarchy');
          visited.add(cursor);cursor=byId.get(cursor);
        }
      }
    });

    await t.test('same signed-in cookie respects database role demotion and promotion on pages', async () => {
      assert.equal((await admin.request('/manage')).status,200);
      await q("UPDATE USER_ACCOUNT SET role='employee' WHERE emp_id=?",[actor]);
      const demoted=await admin.request('/manage');
      assert.ok([302,307].includes(demoted.status),'Demoted account must redirect from /manage');
      assert.equal(new URL(demoted.location,base).pathname,'/dashboard');
      await q("UPDATE USER_ACCOUNT SET role='admin' WHERE emp_id=?",[actor]);
      assert.equal((await admin.request('/manage')).status,200,'Promotion must apply without signing in again');
    });
  } finally {
    await blocker.rollback();
    if(pendingMove) await pendingMove.catch(()=>{});
    try {
      if(fixtureTask) await q('DELETE FROM TASK WHERE task_id=?',[fixtureTask]);
      for(const project of projects) await q('DELETE FROM PROJECT WHERE project_id=?',[project]);
      for(const employee of employees) await q('DELETE FROM EMPLOYEE WHERE emp_id=?',[employee]);
    } finally { await blocker.end(); await db.end(); }
  }
});
