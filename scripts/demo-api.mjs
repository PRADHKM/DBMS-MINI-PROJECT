// Live API walk-through for the demo. Run through scripts/demo.sh api.
// Creates uniquely named fixtures (one employee, one task, one resignation) so it
// can be repeated; the handover record is intentionally retained as audit history.
import { randomBytes } from 'node:crypto';

const base = (process.env.WMS_URL || 'http://localhost:3000').replace(/\/$/, '');
const stamp = Date.now().toString(36);

class Client {
  cookies = new Map();
  async call(path, { method = 'GET', body, form } = {}) {
    const headers = {};
    if (this.cookies.size) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    let payload;
    if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form); }
    else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(base + path, { method, headers, body: payload, redirect: 'manual' });
    for (const raw of res.headers.getSetCookie()) {
      const pair = raw.split(';', 1)[0], i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    const text = await res.text();
    let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: res.status, data };
  }
  async login(username, password) {
    const { data } = await this.call('/api/auth/csrf');
    return this.call('/api/auth/callback/credentials', {
      method: 'POST', form: { csrfToken: data.csrfToken, username, password, json: 'true', callbackUrl: base + '/dashboard' },
    });
  }
}

let failures = 0;
const step = (title) => console.log(`\n\x1b[1;36m== ${title}\x1b[0m`);
const show = (label, value) => console.log(`   ${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);
const expect = (label, res, ...ok) => {
  const pass = ok.includes(res.status);
  if (!pass) failures++;
  console.log(`   ${pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'} ${label} -> HTTP ${res.status}`
    + (pass ? '' : ' ' + JSON.stringify(res.data).slice(0, 200)));
  return res.data;
};
const clip = (s, n = 160) => (s.length > n ? s.slice(0, n) + '…' : s);
const check = (label, pass) => {
  if (!pass) failures++;
  show(pass ? 'PASS' : 'FAIL', label);
};

const admin = new Client(), employee = new Client(), anon = new Client();

step('1. Authentication and role boundaries');
expect('anonymous cannot list employees', await anon.call('/api/employees'), 401);
expect('admin ravi.shankar signs in', await admin.login('ravi.shankar', 'Passw0rd!'), 200);
expect('employee ananya.rao signs in', await employee.login('ananya.rao', 'Passw0rd!'), 200);
expect('employee cannot read resignations', await employee.call('/api/resignations'), 403);
expect('employee cannot use semantic search', await employee.call('/api/search/semantic', { method: 'POST', body: { question: 'x' } }), 403);
expect('employee cannot open another profile', await employee.call('/api/employees/3'), 403);
const mine = expect('employee can open own profile', await employee.call('/api/employees/2'), 200);
const me = mine?.employee ?? mine;
show('own profile', me && `${me.name} (${me.designation}), ${me.dept_name}`);

step('2. Create a demo employee with their own login and an open task');
const options = expect('read database date and handover options', await admin.call('/api/options'), 200);
const today = options?.today;
const hrDepartment = options?.departments?.find(d => d.dept_name === 'HR');
check('database date and HR department are available', Boolean(today && hrDepartment));
if (!today || !hrDepartment) process.exit(1);
const day = (n) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const username = `demo.leaver.${stamp}`;
const password = randomBytes(24).toString('base64url');
const emp = expect('create demo employee and login', await admin.call('/api/employees', { method: 'POST', body: {
  name: `Demo Leaver ${stamp}`, email: `${username}@example.test`, designation: 'HR Executive',
  dept_id: hrDepartment.dept_id, date_of_joining: day(-60), username, password } }), 201);
if (!emp?.emp_id) process.exit(1);
const applicant = new Client();
expect('demo employee signs in with their own username', await applicant.login(username, password), 200);
const task = expect('assign an open task to them', await admin.call('/api/tasks', { method: 'POST', body: {
  project_id: 1, assigned_to: emp.emp_id, title: `Demo handover task ${stamp}`, status: 'in_progress', priority: 'high',
  start_date: day(-5), due_date: day(10) } }), 201);
if (!task?.task_id) process.exit(1);

step('3. Contribution summary + embedding (pgvector write)');
const summaryPath = `/api/employees/${emp.emp_id}/summary`;
const summary = expect('admin generates a summary for the demo employee', await admin.call(summaryPath, { method: 'POST' }), 201);
if (summary) {
  show('method', summary.generation_method);
  show('summary', clip(summary.summary_text, 240));
}
const cached = expect('second read returns cached snapshot', await admin.call(summaryPath), 200);
check('same snapshot id and current source records', Boolean(summary?.summary_id && cached?.summary_id === summary.summary_id && !cached.stale));

step('4. Semantic search (pgvector cosine ranking)');
const found = expect('admin searches for the demo task', await admin.call('/api/search/semantic', { method: 'POST', body: { question: `Demo handover task ${stamp}` } }), 200);
for (const r of found?.results ?? []) show(`${r.employee.name} (${r.employee.status})`, `similarity ${Number(r.similarity ?? r.score ?? 0).toFixed(3)} stale=${r.stale}`);
show('embedding model', found?.embedding_model);
check('search returns the demo snapshot', Boolean(summary?.summary_id && found?.results?.some(r => r.summary_id === summary.summary_id)));

step('5. Vector read / update (re-embed) / delete');
if (summary?.summary_id) {
  const id = summary.summary_id;
  const hist = expect('employee reads own snapshot history', await applicant.call(`/api/employees/${emp.emp_id}/summaries`), 200);
  show('snapshots', Array.isArray(hist) ? hist.length : hist);
  expect('employee cannot edit a snapshot', await applicant.call(`/api/summaries/${id}`, { method: 'PUT', body: { summary_text: 'nope' } }), 403);
  const editedTopic = `orchidquartz${stamp} payroll migration`;
  const edited = expect('admin edits snapshot (re-embeds)', await admin.call(`/api/summaries/${id}`, { method: 'PUT',
    body: { summary_text: `Demo edit: documented ${editedTopic}.` } }), 200);
  if (edited) show('generation_method after edit', edited.generation_method);
  const ranked = expect('search now finds the edited snapshot', await admin.call('/api/search/semantic', { method: 'POST', body: { question: editedTopic } }), 200);
  check('edited snapshot ranks first for its new topic', ranked?.results?.[0]?.summary_id === id);
  expect('admin deletes the edited snapshot', await admin.call(`/api/summaries/${id}`, { method: 'DELETE' }), 200, 204);
  expect('deleted snapshot is gone', await admin.call(`/api/summaries/${id}`), 404);
}

step('6. Employee resignation request and admin approval');
const request = expect('HR employee submits their resignation request', await applicant.call('/api/resignation-requests', {
  method: 'POST', body: { proposed_last_day: day(14), employee_notes: 'Please arrange a successor for my open work.' },
}), 201);
if (request?.request_id) {
  const queue = expect('admin reads the pending request queue', await admin.call('/api/resignation-requests'), 200);
  check('request appears in the admin queue', Array.isArray(queue) && queue.some(r => r.request_id === request.request_id));
  const pendingTask = expect('employee still sees own task before approval', await applicant.call(`/api/tasks/${task.task_id}`), 200);
  check('pending request keeps existing task ownership', pendingTask?.assigned_to === emp.emp_id);
  const reviewPath = `/api/resignation-requests/${request.request_id}`;
  const approval = { decision: 'approved', last_working_day: day(14), handover_notes: 'Divya takes over the open task.', handover_to: 4 };
  expect('employee cannot approve their own request', await applicant.call(reviewPath, { method: 'PUT', body: approval }), 403);
  expect('self-handover is rejected', await admin.call(reviewPath, { method: 'PUT', body: { ...approval, handover_to: emp.emp_id } }), 400);
  expect('admin approves Divya (Frontend Engineer) as successor', await admin.call(reviewPath, { method: 'PUT', body: approval }), 200);
  const decisions = expect('employee reads their decision', await applicant.call('/api/resignation-requests'), 200);
  check('employee sees approval and Divya as successor', Array.isArray(decisions)
    && decisions.some(r => r.request_id === request.request_id && r.status === 'approved' && r.successor_name === 'Divya Menon'));
  const rows = expect('read back recorded handover', await admin.call('/api/resignations'), 200);
  const row = Array.isArray(rows) && rows.find(r => r.emp_id === emp.emp_id);
  check('employee is on notice and both departments are shown', row?.status === 'notice_period'
    && row.employee_department === 'HR' && row.successor_department === 'Engineering');
  if (row) {
    const skills = (values) => values?.map(s => `${s.name} (${s.proficiency})`).join(', ') || 'none recorded';
    show('status and dates', `${row.status}: notice ${row.resignation_date}, last day ${row.last_working_day}`);
    show('departing employee', `${row.employee_name}, ${row.employee_department} — ${row.employee_designation}; skills: ${skills(row.employee_skills)}`);
    show('successor', `${row.handover_name}, ${row.successor_department} — ${row.successor_designation}; skills: ${skills(row.successor_skills)}`);
  }
  if (task?.task_id) {
    const moved = expect('task now belongs to successor', await admin.call(`/api/tasks/${task.task_id}`), 200);
    check('task assigned to Divya (emp 4)', moved?.assigned_to === 4);
  }
  expect('they cannot be handed new work during notice', await admin.call('/api/tasks', { method: 'POST', body: {
    project_id: 1, assigned_to: emp.emp_id, title: 'should fail', status: 'not_started' } }), 400, 409);
}

console.log(failures ? `\n\x1b[31m${failures} check(s) failed\x1b[0m` : '\n\x1b[32mAll API demo checks passed\x1b[0m');
process.exit(failures ? 1 : 0);
