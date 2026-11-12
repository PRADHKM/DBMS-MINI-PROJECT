// Vector-store helper for the demo.
//   node scripts/demo-vector.mjs populate            generate/refresh a summary for every employee
//   node scripts/demo-vector.mjs search "question"   one similarity search
//   node scripts/demo-vector.mjs showcase            a preset list of searches with expected winners
// Needs the app running (WMS_URL, default http://localhost:3000) and the demo admin account.
const base = (process.env.WMS_URL || 'http://localhost:3000').replace(/\/$/, '');
const cookies = new Map();

async function call(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (cookies.size) headers.cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  let payload;
  if (form) { headers['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form); }
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(base + path, { method, headers, body: payload, redirect: 'manual' });
  for (const raw of res.headers.getSetCookie()) {
    const pair = raw.split(';', 1)[0], i = pair.indexOf('=');
    cookies.set(pair.slice(0, i), pair.slice(i + 1));
  }
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status} ${JSON.stringify(data).slice(0, 160)}`);
  return data;
}

async function login() {
  const { csrfToken } = await call('/api/auth/csrf');
  await call('/api/auth/callback/credentials', { method: 'POST',
    form: { csrfToken, username: 'ravi.shankar', password: 'Passw0rd!', json: 'true', callbackUrl: base + '/dashboard' } });
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

async function populate() {
  const employees = await call('/api/employees');
  let made = 0, kept = 0;
  for (const e of employees) {
    let latest = null;
    try { latest = await call(`/api/employees/${e.emp_id}/summary`); } catch { /* none yet */ }
    if (latest && !latest.stale) { kept++; continue; }
    try {
      await call(`/api/employees/${e.emp_id}/summary`, { method: 'POST' });
      made++; console.log(`  summary + embedding stored for #${e.emp_id} ${e.name}`);
    } catch (err) { console.log(`  skipped #${e.emp_id} ${e.name}: ${err.message}`); }
  }
  console.log(`Summaries: ${made} generated, ${kept} already current.`);
}

async function search(question) {
  const { results, embedding_model } = await call('/api/search/semantic', { method: 'POST', body: { question } });
  console.log(`\n\x1b[1;36mQ: ${question}\x1b[0m  (model ${embedding_model})`);
  if (!results.length) console.log('   no summaries stored - run: scripts/demo.sh populate');
  results.forEach((r, i) => console.log(
    `  ${i + 1}. ${String(r.employee.name).padEnd(18)} ${r.employee.status.padEnd(9)} ` +
    `similarity ${Number(r.similarity).toFixed(3)}${r.stale ? ' (stale)' : ''}\n     ${clip(r.summary_text, 150)}`));
  return results;
}

// Questions chosen so the right employee shares vocabulary with their summary.
const SHOWCASE = [
  ['Kubernetes cluster and Helm rollout', 'Suresh Pillai'],
  ['payment service load testing', 'Ananya Rao'],
  ['OAuth refresh token and Redis', 'Karthik Iyer'],
  ['campus hiring interviews', 'Lakshmi Prasad'],
  ['push notifications React Native', 'Sneha Gupta'],
  ['onboarding funnel dashboard', 'Arjun Das'],
  ['usability research wireframes', 'Priya Varma'],
];

async function showcase() {
  let hits = 0;
  for (const [question, expected] of SHOWCASE) {
    const results = await search(question);
    const top = results[0]?.employee.name;
    const ok = top === expected; if (ok) hits++;
    console.log(`   ${ok ? '\x1b[32mTOP HIT OK\x1b[0m' : '\x1b[33mtop hit differs\x1b[0m'}: expected ${expected}, got ${top ?? 'nobody'}`);
  }
  console.log(`\n${hits}/${SHOWCASE.length} questions ranked the expected employee first.`);
}

const [mode = 'showcase', ...rest] = process.argv.slice(2);
try {
  await login();
  if (mode === 'populate') await populate();
  else if (mode === 'search') { if (!rest.length) throw new Error('usage: search "your question"'); await search(rest.join(' ')); }
  else if (mode === 'showcase') await showcase();
  else throw new Error('modes: populate | search "question" | showcase');
} catch (error) { console.error('\x1b[31m' + error.message + '\x1b[0m'); process.exit(1); }
