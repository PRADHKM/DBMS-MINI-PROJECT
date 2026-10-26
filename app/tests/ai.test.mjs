import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSummary, createEmbedding, vectorLiteral, fingerprintContext } from '../lib/ai.mjs';

const context = {
  employee: { emp_id: 1, name: 'Asha', designation: 'Engineer' },
  tasks: [{ task_id: 1, title: 'Handover', status: 'in_progress' }],
  worklog: [{ log_id: 1, task_id: 2, log_date: '2026-10-01', project_name: 'Atlas', hours_spent: '2.50', notes: 'Fixed access checks' }],
};
test('unconfigured summary uses actual historical work without calling a provider', async () => {
  const summary = await generateSummary(context, { env: {}, fetchImpl: () => assert.fail('Unexpected network request') });
  assert.equal(summary.method, 'record');
  assert.match(summary.text, /2\.5 hours across Atlas/);
  assert.match(summary.text, /Fixed access checks/);
  assert.match(summary.text, /Handover \(in progress\)/);
  assert.doesNotMatch(summary.text, /LLM-generated|would go here/);
});
test('Responses integration sends evidence as data, disables storage and reads output messages', async () => {
  const summary = await generateSummary(context, { env: { OPENAI_API_KEY: 'test-key' }, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.store, false);
    assert.match(body.instructions, /untrusted evidence/);
    assert.equal(JSON.parse(body.input).work_logs[0].log_id, 1);
    return { ok: true, json: async () => ({ status: 'completed', output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', content: [{ type: 'output_text', text: 'Asha fixed access checks.' }] },
    ] }) };
  } });
  assert.equal(summary.text, 'Asha fixed access checks.');
  assert.equal(summary.method, 'provider');
});
test('provider errors and incomplete output cannot be cached as a summary', async () => {
  await assert.rejects(generateSummary(context, { env: { OPENAI_API_KEY: 'test-key' }, fetchImpl: async () => ({ ok: false, status: 429 }) }), /quota/);
  await assert.rejects(generateSummary(context, { env: { OPENAI_API_KEY: 'test-key' }, fetchImpl: async () => ({ ok: true, json: async () => ({ status: 'incomplete', output: [] }) }) }), /complete summary/);
});
test('embeddings enforce schema dimensions and reject invalid or zero vectors', async () => {
  const expected = Array(1536).fill(0.2);
  const actual = await createEmbedding('access checks', { env: { OPENAI_API_KEY: 'test-key' }, fetchImpl: async (url, init) => {
    assert.match(url, /embeddings$/);
    assert.equal(JSON.parse(init.body).dimensions, 1536);
    return { ok: true, json: async () => ({ data: [{ embedding: expected }] }) };
  } });
  assert.deepEqual(actual, expected);
  for (const invalid of [[], Array(1536).fill(0), Array(1536).fill(NaN), Array(1536).fill('1')]) {
    assert.throws(() => vectorLiteral(invalid), /invalid/);
  }
  await assert.rejects(createEmbedding('x', { env: {} }), /needs OPENAI_API_KEY/);
});
test('editing source notes invalidates a cached summary fingerprint', () => {
  const changed = structuredClone(context);
  changed.worklog[0].notes = 'Corrected evidence';
  assert.equal(fingerprintContext(context), fingerprintContext(structuredClone(context)));
  assert.notEqual(fingerprintContext(context), fingerprintContext(changed));
});
test('large record summaries stay compact and never silently truncate embedding text', async () => {
  const large = structuredClone(context);
  large.tasks = Array.from({ length: 300 }, (_, index) => ({ task_id: index + 1,
    title: `Task ${index} ${'x'.repeat(130)}`, status: 'in_progress', priority: index === 0 ? 'critical' : 'low' }));
  const summary = await generateSummary(large, { env: {} });
  assert.ok(summary.text.length < 16000);
  assert.match(summary.text, /showing 10 of 300/);
  assert.match(summary.text, /Task 0/);
  await assert.rejects(createEmbedding('x'.repeat(16001), { env: { OPENAI_API_KEY: 'test-key' },
    fetchImpl: () => assert.fail('Oversized input must be rejected, never silently sliced') }), /shorter summary/);
});
test('bounded provider evidence prioritizes old critical open tasks and discloses all subsets', async () => {
  const large = structuredClone(context);
  large.tasks = Array.from({ length: 150 }, (_, i) => ({ task_id: i + 1,
    title: `Task ${i}`, status: i === 0 ? 'blocked' : 'completed', priority: i === 0 ? 'critical' : 'low' }));
  large.worklog = Array.from({ length: 201 }, (_, i) => ({ ...context.worklog[0], log_id: i + 1, notes: 'n'.repeat(1100) }));
  const summary = await generateSummary(large, { env: { OPENAI_API_KEY: 'test-key' }, fetchImpl: async (_, init) => {
    const request = JSON.parse(init.body), evidence = JSON.parse(request.input);
    assert.equal(evidence.assigned_tasks[0].task_id, 1);
    assert.equal(evidence.total_assigned_tasks, 150);
    assert.equal(evidence.included_assigned_tasks, 100);
    assert.equal(evidence.total_open_tasks, 1);
    assert.equal(evidence.total_work_logs, 201);
    assert.equal(evidence.included_work_logs, 200);
    assert.equal(evidence.notes_excerpted, true);
    assert.match(request.instructions, /subset of total assigned tasks/);
    return { ok: true, json: async () => ({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: 'A subset of records was reviewed.' }] }] }) };
  } });
  assert.equal(summary.sourceTaskIds[0], 1);
  assert.equal(summary.sourceTaskIds.length, 100);
  assert.equal(summary.sourceLogIds[0], 2);
  assert.equal(summary.sourceLogIds.length, 200);
});
