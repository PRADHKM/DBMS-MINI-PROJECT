import test from 'node:test';
import assert from 'node:assert/strict';

// Run only against a disposable, seeded database:
// WMS_TEST_URL=http://127.0.0.1:3000 node --test tests/http.integration.mjs
// This suite retains its uniquely named handover records so their audit history
// can be inspected. It never changes the supplied seed employees or their work.
const base = (process.env.WMS_TEST_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const prefix = 'http_' + Date.now().toString(36);
const shiftedDay = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const today = shiftedDay(0), yesterday = shiftedDay(-1), joined = shiftedDay(-30);
const password = 'WorkerTest!2026';

class Client {
  cookies = new Map();
  async request(path, { method = 'GET', body, form } = {}, expected = 200) {
    const headers = {};
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => k + '=' + v).join('; ');
    let payload;
    if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form); }
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const response = await fetch(base + path, { method, headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';', 1)[0], split = pair.indexOf('=');
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const raw = await response.text();
    let data; try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
    assert.equal(response.status, expected, method + ' ' + path + ': ' + JSON.stringify(data).slice(0, 700));
    return data;
  }
  async login(username, pass = password, expected = 200) {
    const { csrfToken } = await this.request('/api/auth/csrf');
    const result = await this.request('/api/auth/callback/credentials', {
      method: 'POST', form: { csrfToken, username, password: pass, json: 'true', callbackUrl: base + '/dashboard' },
    }, expected);
    return result;
  }
  async expectPageRedirect(path, destination) {
    const response = await fetch(base + path, {
      headers: { cookie: [...this.cookies].map(([key, value]) => key + '=' + value).join('; ') },
      redirect: 'manual', signal: AbortSignal.timeout(20000),
    });
    assert.ok([302, 307].includes(response.status), path + ' should redirect, got ' + response.status);
    assert.equal(new URL(response.headers.get('location'), base).pathname, destination);
  }
}
const createEmployee = (client, suffix, dept, extra = {}) => client.request('/api/employees', {
  method: 'POST',
  body: { name: prefix + ' ' + suffix, email: prefix + '.' + suffix + '@example.test',
    designation: 'Integration engineer', dept_id: dept, date_of_joining: joined,
    username: prefix + '_' + suffix, password, ...extra },
}, 201);

test('HTTP workflow against isolated seeded databases', { timeout: 180000 }, async (t) => {
  const anonymous = new Client(), admin = new Client(), seededEmployee = new Client();
  let department, project, alpha, beta, task, completedTask, log, alphaClient, betaClient;
  await t.test('authentication and employee data isolation', async () => {
    await anonymous.request('/api/employees', {}, 401);
    await admin.login(process.env.WMS_TEST_ADMIN || 'ravi.shankar', process.env.WMS_TEST_ADMIN_PASSWORD || 'Passw0rd!');
    await seededEmployee.login('ananya.rao', 'Passw0rd!');
    const session = await seededEmployee.request('/api/auth/session');
    assert.equal(session.user.empId, 2); assert.equal(session.user.role, 'employee');
    const employees = await seededEmployee.request('/api/employees');
    assert.equal(employees.length, 1); assert.equal(employees[0].emp_id, 2);
    await seededEmployee.request('/api/employees/1', {}, 403);
    await seededEmployee.request('/api/employees/1', { method: 'PUT', body: { phone: '555' } }, 403);
    await seededEmployee.request('/api/departments', { method: 'POST', body: { dept_name: prefix } }, 403);
    await seededEmployee.request('/api/projects', { method: 'POST', body: { project_name: prefix } }, 403);
    await seededEmployee.request('/api/resignations', {}, 403);
    await seededEmployee.request('/api/search/semantic', { method: 'POST', body: { question: 'work history' } }, 403);
    const options = await seededEmployee.request('/api/options');
    assert.equal(options.employees.length, 1); assert.equal(options.employees[0].emp_id, 2);
    assert.ok(options.tasks.every((entry) => entry.assigned_to === 2));
    await admin.request('/api/employees/1%20OR%201=1', {}, 400);
    await admin.request('/api/tasks', { method: 'PATCH', body: {} }, 405);
  });
  await t.test('department, project and transactional employee/account creation', async () => {
    department = (await admin.request('/api/departments', { method: 'POST', body: { dept_name: prefix } }, 201)).dept_id;
    await admin.request('/api/departments/' + department, { method: 'PUT', body: { dept_name: prefix + ' renamed' } });
    assert.equal((await admin.request('/api/departments/' + department)).dept_name, prefix + ' renamed');
    project = (await admin.request('/api/projects', { method: 'POST', body: {
      project_name: prefix + ' project', description: 'Original description', dept_id: department,
      start_date: joined, end_date: shiftedDay(20), status: 'ongoing',
    } }, 201)).project_id;
    await admin.request('/api/projects/' + project, { method: 'PUT', body: { description: 'Updated description' } });
    assert.equal((await admin.request('/api/projects/' + project)).description, 'Updated description');
    await admin.request('/api/projects', { method: 'POST', body: { project_name: prefix, start_date: today, end_date: yesterday } }, 400);
    alpha = (await createEmployee(admin, 'alpha', department)).emp_id;
    beta = (await createEmployee(admin, 'beta', department)).emp_id;
    alphaClient = new Client(); betaClient = new Client();
    await alphaClient.login(prefix + '_alpha'); await betaClient.login(prefix + '_beta');
    assert.equal((await alphaClient.request('/api/auth/session')).user.empId, alpha);
    await alphaClient.request('/api/employees/' + alpha, { method: 'PUT', body: { phone: '9876543210' } });
    assert.equal((await admin.request('/api/employees/' + alpha)).employee.phone, '9876543210');
    await alphaClient.request('/api/employees/' + alpha, { method: 'PUT', body: { role: 'admin' } }, 400);
    await alphaClient.request('/api/employees/' + beta, {}, 403);
    await admin.request('/api/employees/' + alpha, { method: 'PUT', body: { manager_id: alpha } }, 400);
    await admin.request('/api/employees', { method: 'POST', body: {
      name: prefix + ' failed account', email: prefix + '.rollback@example.test',
      date_of_joining: joined, username: prefix + '_alpha', password,
    } }, 409);
    assert.ok(!(await admin.request('/api/employees?search=' + encodeURIComponent(prefix))).some((entry) => entry.email === prefix + '.rollback@example.test'), 'duplicate username must roll back the employee insert');
  });
  await t.test('tasks enforce assignment and employee status-only editing', async () => {
    task = (await admin.request('/api/tasks', { method: 'POST', body: {
      project_id: project, assigned_to: alpha, title: prefix + ' handover task',
      status: 'not_started', priority: 'high', start_date: joined, due_date: shiftedDay(10),
    } }, 201)).task_id;
    completedTask = (await admin.request('/api/tasks', { method: 'POST', body: {
      project_id: project, assigned_to: alpha, title: prefix + ' completed task', status: 'completed',
    } }, 201)).task_id;
    assert.equal((await admin.request('/api/tasks/' + completedTask)).completion_date, today);
    await alphaClient.request('/api/tasks/' + task, { method: 'PUT', body: { status: 'in_progress' } });
    await alphaClient.request('/api/tasks/' + task, { method: 'PUT', body: { assigned_to: beta } }, 400);
    await betaClient.request('/api/tasks/' + task, {}, 403);
    await admin.request('/api/tasks', { method: 'POST', body: { project_id: project, title: prefix, status: 'fake' } }, 400);
    await admin.request('/api/tasks', { method: 'POST', body: { project_id: '0 OR 1=1', title: prefix } }, 400);
    assert.ok((await alphaClient.request('/api/tasks')).every((entry) => entry.assigned_to === alpha));
  });
  await t.test('work-log validation, daily totals and CRUD', async () => {
    const valid = { task_id: task, emp_id: alpha, log_date: yesterday, hours_spent: 8, notes: 'Original author evidence' };
    log = (await alphaClient.request('/api/worklogs', { method: 'POST', body: valid }, 201)).log_id;
    await alphaClient.request('/api/worklogs', { method: 'POST', body: { ...valid, emp_id: beta } }, 403);
    await betaClient.request('/api/worklogs', { method: 'POST', body: { ...valid, emp_id: beta } }, 400);
    await alphaClient.request('/api/worklogs', { method: 'POST', body: { ...valid, task_id: completedTask } }, 400);
    for (const invalid of [
      { hours_spent: 25 }, { hours_spent: 17 }, { hours_spent: 1.234 }, { log_date: shiftedDay(1) }, { log_date: '2026-02-30' },
    ]) await alphaClient.request('/api/worklogs', { method: 'POST', body: { ...valid, ...invalid } }, 400);
    await alphaClient.request('/api/worklogs/' + log, { method: 'PUT', body: { hours_spent: 7.5, notes: 'Updated evidence' } });
    assert.equal(Number((await admin.request('/api/worklogs/' + log)).hours_spent), 7.5);
    await betaClient.request('/api/worklogs/' + log, { method: 'DELETE' }, 403);
    await alphaClient.request('/api/worklogs/' + log, { method: 'PUT', body: { emp_id: beta } }, 400);
    const removable = (await alphaClient.request('/api/worklogs', { method: 'POST', body: { ...valid, log_date: today, hours_spent: 1 } }, 201)).log_id;
    await alphaClient.request('/api/worklogs/' + removable, { method: 'PUT', body: { hours_spent: 2 } });
    await alphaClient.request('/api/worklogs/' + removable, { method: 'DELETE' }, 204);
    await alphaClient.request('/api/worklogs/' + removable, {}, 404);
    assert.ok((await alphaClient.request('/api/worklogs')).every((entry) => entry.emp_id === alpha));
  });
  await t.test('record summaries cache source IDs and detect changed work history', async () => {
    const path = '/api/employees/' + alpha + '/summary';
    await alphaClient.request(path, {}, 404);
    await alphaClient.request('/api/employees/' + beta + '/summary', {}, 403);
    const generated = await alphaClient.request(path, { method: 'POST' }, 201);
    assert.equal(generated.generation_method, 'record');
    assert.equal(generated.searchable, false);
    assert.equal(generated.stale, false);
    assert.ok(generated.source_log_ids.includes(log));
    assert.ok(generated.source_task_ids.includes(task));
    assert.ok(generated.summary_text.includes(prefix));
    assert.ok(!generated.summary_text.includes('LLM-generated summary would go here'));
    const cached = await alphaClient.request(path);
    assert.equal(cached.summary_id, generated.summary_id); assert.equal(cached.stale, false);
    await alphaClient.request('/api/worklogs/' + log, { method: 'PUT', body: { notes: 'Changed contribution for summary staleness verification' } });
    assert.equal((await alphaClient.request(path)).stale, true);
    const refreshed = await alphaClient.request(path, { method: 'POST' }, 201);
    assert.notEqual(refreshed.summary_id, generated.summary_id);
    assert.equal((await alphaClient.request(path)).stale, false);
    const unavailable = await admin.request('/api/search/semantic', { method: 'POST', body: { question: 'integration contribution' } }, 503);
    assert.match(unavailable.error, /OPENAI_API_KEY|EMBEDDING_API_KEY/);
  });
  await t.test('history-preserving deletion and manager cycle protections', async () => {
    await admin.request('/api/tasks/' + task, { method: 'DELETE' }, 409);
    await admin.request('/api/projects/' + project, { method: 'DELETE' }, 409);
    await admin.request('/api/departments/' + department, { method: 'DELETE' }, 409);
    await admin.request('/api/employees/' + alpha, { method: 'DELETE' }, 409);
    await admin.request('/api/employees/1', { method: 'DELETE' }, 400);
    await admin.request('/api/tasks/' + task, { method: 'PUT', body: { project_id: 1 } }, 409);
    await admin.request('/api/employees/' + alpha, { method: 'PUT', body: { date_of_joining: today } }, 409);
    await admin.request('/api/employees/' + alpha, { method: 'PUT', body: { manager_id: beta } });
    await admin.request('/api/employees/' + beta, { method: 'PUT', body: { manager_id: alpha } }, 400);
  });
  await t.test('resignation rollback, task transfer and original log attribution', async () => {
    const resignation = { emp_id: alpha, resignation_date: today, last_working_day: shiftedDay(7), handover_to: alpha, handover_notes: 'Integration handover evidence' };
    await admin.request('/api/resignations', { method: 'POST', body: resignation }, 400);
    assert.ok(!(await admin.request('/api/resignations')).some((entry) => entry.emp_id === alpha));
    assert.equal((await admin.request('/api/tasks/' + task)).assigned_to, alpha);
    await admin.request('/api/resignations', { method: 'POST', body: { ...resignation, handover_to: beta } }, 201);
    assert.equal((await admin.request('/api/tasks/' + task)).assigned_to, beta);
    assert.equal((await admin.request('/api/tasks/' + completedTask)).assigned_to, alpha, 'completed task history remains with the departing employee');
    assert.equal((await admin.request('/api/worklogs/' + log)).emp_id, alpha);
    assert.equal((await admin.request('/api/employees/' + alpha)).employee.status, 'active', 'notice period retains login until the last working day');
    assert.equal((await alphaClient.request('/api/employees/' + alpha + '/summary')).stale, true, 'handover invalidates the departing employee task snapshot');
    assert.ok(!(await admin.request('/api/options')).employees.some((entry) => entry.emp_id === alpha), 'a person on notice cannot receive new assignments');
    await admin.request('/api/tasks', { method: 'POST', body: { project_id: project, assigned_to: alpha, title: prefix + ' invalid assignment' } }, 400);
    await alphaClient.request('/api/tasks/' + task, {}, 403);
    assert.equal((await betaClient.request('/api/tasks/' + task)).assigned_to, beta);
    await alphaClient.request('/api/worklogs/' + log, { method: 'PUT', body: { notes: 'Preserved author can correct historical notes after transfer' } });
    assert.ok((await alphaClient.request('/api/worklogs')).some((entry) => entry.log_id === log && entry.emp_id === alpha));
    const handoverSummary = await alphaClient.request('/api/employees/' + alpha + '/summary', { method: 'POST' }, 201);
    assert.ok(handoverSummary.source_log_ids.includes(log));
    assert.ok(!handoverSummary.source_task_ids.includes(task), 'summary sources reflect the transferred assignment while retaining the original work log');
    const successorLog = (await betaClient.request('/api/worklogs', { method: 'POST', body: { task_id: task, log_date: today, hours_spent: 2, notes: 'Successor contribution' } }, 201)).log_id;
    assert.equal((await admin.request('/api/worklogs/' + successorLog)).emp_id, beta);
    const noticeLogin = new Client(); await noticeLogin.login(prefix + '_alpha');
  });
  await t.test('expired resignations revoke existing sessions and new logins', async () => {
    const departed = (await createEmployee(admin, 'departed', department)).emp_id;
    const departedClient = new Client(); await departedClient.login(prefix + '_departed');
    await admin.request('/api/departments/' + department, { method: 'PUT', body: { head_emp_id: departed } });
    await admin.request('/api/resignations', { method: 'POST', body: {
      emp_id: departed, resignation_date: yesterday, last_working_day: yesterday, handover_to: beta,
    } }, 201);
    await departedClient.request('/api/employees', {}, 401);
    await departedClient.expectPageRedirect('/dashboard', '/login');
    await departedClient.expectPageRedirect('/worklogs', '/login');
    await (new Client()).login(prefix + '_departed', password, 401);
    assert.equal((await admin.request('/api/employees/' + departed)).employee.status, 'resigned');
    await admin.request('/api/departments/' + department, { method: 'PUT', body: { dept_name: prefix + ' after departure', head_emp_id: departed } });
    assert.equal((await admin.request('/api/departments/' + department)).head_emp_id, departed, 'renaming preserves the unchanged historical department head');
    await admin.request('/api/departments/' + department, { method: 'PUT', body: { head_emp_id: alpha } }, 400);
    await admin.request('/api/departments', { method: 'POST', body: { dept_name: prefix + ' invalid new head', head_emp_id: departed } }, 400);
  });
  await t.test('unused records can be updated and deleted without losing history', async () => {
    const unusedDept = (await admin.request('/api/departments', { method: 'POST', body: { dept_name: prefix + ' disposable' } }, 201)).dept_id;
    const unusedProject = (await admin.request('/api/projects', { method: 'POST', body: { project_name: prefix + ' disposable', dept_id: unusedDept } }, 201)).project_id;
    const unusedEmployee = (await createEmployee(admin, 'disposable', unusedDept)).emp_id;
    const disposableClient = new Client(); await disposableClient.login(prefix + '_disposable');
    const unusedTask = (await admin.request('/api/tasks', { method: 'POST', body: { project_id: unusedProject, assigned_to: unusedEmployee, title: prefix + ' disposable' } }, 201)).task_id;
    await admin.request('/api/tasks/' + unusedTask, { method: 'PUT', body: { title: prefix + ' edited', status: 'blocked' } });
    await admin.request('/api/tasks/' + unusedTask, { method: 'DELETE' }, 204);
    await admin.request('/api/employees/' + unusedEmployee, { method: 'DELETE' }, 204);
    await disposableClient.request('/api/employees', {}, 401);
    await admin.request('/api/projects/' + unusedProject, { method: 'DELETE' }, 204);
    await admin.request('/api/departments/' + unusedDept, { method: 'DELETE' }, 204);
    await admin.request('/api/projects/' + unusedProject, {}, 404);
  });
  console.log('Retained integration fixture:', JSON.stringify({ prefix, department, project, alpha, beta, task, log }));
});
