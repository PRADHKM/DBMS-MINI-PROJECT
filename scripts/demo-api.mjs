// Live API walk-through for the demo. Run through scripts/demo.sh api.
// Creates uniquely named fixtures (one employee, one task, one resignation) so it
// can be repeated; the handover record is intentionally retained as audit history.
const base = (process.env.WMS_URL || 'http://localhost:3000').replace(/\/$/, '');
const stamp = Date.now().toString(36);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

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

step('2. Contribution summary + embedding (pgvector write)');
const summary = expect('admin generates summary for Ananya (emp 2)', await admin.call('/api/employees/2/summary', { method: 'POST' }), 200, 201);
if (summary) {
  show('method', summary.generation_method);
  show('summary', clip(summary.summary_text, 240));
}
const cached = expect('second read returns cached snapshot', await admin.call('/api/employees/2/summary'), 200);
if (summary && cached) show('same snapshot id', String(cached.summary_id === summary.summary_id) + ` (stale=${cached.stale})`);

step('3. Semantic search (pgvector cosine ranking)');
const found = expect('admin searches "payment gateway load testing"', await admin.call('/api/search/semantic', { method: 'POST', body: { question: 'payment gateway load testing' } }), 200);
for (const r of found?.results ?? []) show(`${r.employee.name} (${r.employee.status})`, `similarity ${Number(r.similarity ?? r.score ?? 0).toFixed(3)} stale=${r.stale}`);
show('embedding model', found?.embedding_model);

step('4. Vector read / update (re-embed) / delete');
if (summary) {
  const id = summary.summary_id;
  const hist = expect('employee reads own snapshot history', await employee.call('/api/employees/2/summaries'), 200);
  show('snapshots', Array.isArray(hist) ? hist.length : hist);
  expect('employee cannot edit a snapshot', await employee.call(`/api/summaries/${id}`, { method: 'PUT', body: { summary_text: 'nope' } }), 403);
  const edited = expect('admin edits snapshot (re-embeds)', await admin.call(`/api/summaries/${id}`, { method: 'PUT',
    body: { summary_text: `Demo edit ${stamp}: led Kubernetes migration and cluster upgrade work.` } }), 200);
  if (edited) show('generation_method after edit', edited.generation_method);
  const k8s = expect('search now finds the edited snapshot', await admin.call('/api/search/semantic', { method: 'POST', body: { question: 'Kubernetes cluster migration' } }), 200);
  show('top hit', k8s?.results?.[0]?.employee?.name);
  expect('admin deletes the edited snapshot', await admin.call(`/api/summaries/${id}`, { method: 'DELETE' }), 200, 204);
  expect('deleted snapshot is gone', await admin.call(`/api/summaries/${id}`), 404);
}

step('5. Resignation handover (atomic task transfer)');
const emp = expect('create demo employee', await admin.call('/api/employees', { method: 'POST', body: {
  name: `Demo Leaver ${stamp}`, email: `demo.leaver.${stamp}@example.test`, designation: 'Backend Engineer',
  dept_id: 1, date_of_joining: day(-60) } }), 201);
if (emp) {
  const task = expect('assign an open task to them', await admin.call('/api/tasks', { method: 'POST', body: {
    project_id: 1, assigned_to: emp.emp_id, title: `Demo handover task ${stamp}`, status: 'in_progress', priority: 'high',
    start_date: day(-5), due_date: day(10) } }), 201);
  expect('self-handover is rejected', await admin.call('/api/resignations', { method: 'POST', body: {
    emp_id: emp.emp_id, resignation_date: day(0), last_working_day: day(14), handover_notes: 'self', handover_to: emp.emp_id } }), 400);
  expect('record resignation, hand over to Ananya (emp 2)', await admin.call('/api/resignations', { method: 'POST', body: {
    emp_id: emp.emp_id, resignation_date: day(0), last_working_day: day(14),
    handover_notes: 'Demo handover: payment service tasks move to Ananya.', handover_to: 2 } }), 201);
  if (task) {
    const moved = expect('task now belongs to successor', await admin.call(`/api/tasks/${task.task_id}`), 200);
    show('assigned_to (expect 2)', moved?.assigned_to);
  }
  expect('they cannot be handed new work during notice', await admin.call('/api/tasks', { method: 'POST', body: {
    project_id: 1, assigned_to: emp.emp_id, title: 'should fail', status: 'not_started' } }), 400, 409);
}

console.log(failures ? `\n\x1b[31m${failures} check(s) failed\x1b[0m` : '\n\x1b[32mAll API demo checks passed\x1b[0m');
process.exit(failures ? 1 : 0);
