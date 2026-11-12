import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSummary, createEmbedding, vectorLiteral, fingerprintContext, localEmbedding, embeddingModel, LOCAL_EMBEDDING_MODEL } from '../lib/ai.mjs';

const context = {
  employee: { emp_id: 1, name: 'Asha', designation: 'Engineer' },
  tasks: [{ task_id: 1, title: 'Handover', status: 'in_progress' }],
  worklog: [{ log_id: 1, task_id: 2, log_date: '2026-10-01', project_name: 'Atlas', hours_spent: '2.50', notes: 'Fixed access checks' }],
};
test('summary is built from actual historical work records', () => {
  const summary = generateSummary(context);
  assert.equal(summary.method, 'record');
  assert.match(summary.text, /2\.5 hours across Atlas/);
  assert.match(summary.text, /Fixed access checks/);
  assert.match(summary.text, /Handover \(in progress\)/);
  assert.doesNotMatch(summary.text, /LLM-generated|would go here/);
});
test('vector literals enforce schema dimensions and reject invalid or zero vectors', () => {
  for (const invalid of [[], Array(1536).fill(0), Array(1536).fill(NaN), Array(1536).fill('1')]) {
    assert.throws(() => vectorLiteral(invalid), /invalid/);
  }
  assert.doesNotThrow(() => vectorLiteral(Array(1536).fill(0.2)));
});
test('editing source notes invalidates a cached summary fingerprint', () => {
  const changed = structuredClone(context);
  changed.worklog[0].notes = 'Corrected evidence';
  assert.equal(fingerprintContext(context), fingerprintContext(structuredClone(context)));
  assert.notEqual(fingerprintContext(context), fingerprintContext(changed));
});
test('large record summaries stay compact and oversized embedding text is rejected', () => {
  const large = structuredClone(context);
  large.tasks = Array.from({ length: 300 }, (_, index) => ({ task_id: index + 1,
    title: `Task ${index} ${'x'.repeat(130)}`, status: 'in_progress', priority: index === 0 ? 'critical' : 'low' }));
  const summary = generateSummary(large);
  assert.ok(summary.text.length < 16000);
  assert.match(summary.text, /showing 10 of 300/);
  assert.match(summary.text, /Task 0/);
  assert.throws(() => createEmbedding('x'.repeat(16001)), /shorter summary/);
});
test('local offline embedding is deterministic, normalised, schema-sized and lexically ranked', async () => {
  const a = localEmbedding('Built the payment gateway integration for card payments');
  assert.equal(a.length, 1536);
  assert.deepEqual(a, localEmbedding('Built the payment gateway integration for card payments'));
  assert.ok(Math.abs(Math.hypot(...a) - 1) < 1e-9);
  assert.doesNotThrow(() => vectorLiteral(a));
  const cosine = (x, y) => x.reduce((sum, n, i) => sum + n * y[i], 0);
  const related = localEmbedding('Payment gateway work and card payment testing');
  const unrelated = localEmbedding('Kubernetes cluster migration and network policies');
  assert.ok(cosine(a, related) > 0.4, 'shared vocabulary scores high');
  assert.ok(cosine(a, related) > cosine(a, unrelated) + 0.3, 'related text outranks unrelated text');
  assert.throws(() => localEmbedding('!!! ??? the of'), /searchable words/);
});
test('embedding model is the offline local model and rejects blank text', () => {
  assert.equal(embeddingModel(), LOCAL_EMBEDDING_MODEL);
  assert.equal(createEmbedding('access checks').length, 1536);
  assert.throws(() => createEmbedding('   '), /1 to 16000/);
});
