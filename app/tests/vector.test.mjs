import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { insertSummary, searchSimilarSummaries, getSummary, listSummaries, updateSummary, deleteSummary } from '../lib/pgvector.js';
import { localEmbedding } from '../lib/ai.mjs';

test('real pgvector schema, cache metadata, latest-only ranking and model isolation', async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(await readFile(new URL('../../database/pgvector/01_setup.sql', import.meta.url), 'utf8'));
    const east = [1, ...Array(1535).fill(0)];
    const north = [0, 1, ...Array(1534).fill(0)];
    const make = (empId, embedding, text = 'Access checks') => insertSummary({
      empId, summaryText: text, sourceContext: 'integration', embedding,
      generationMethod: embedding ? 'provider' : 'record', sourceFingerprint: 'a'.repeat(64),
      sourceLogIds: [1, 2], sourceTaskIds: [3],
    }, db);
    const first = await make(1, east);
    assert.deepEqual(first.source_log_ids, [1, 2]);
    assert.equal(first.generation_method, 'provider');
    await make(1, north, 'Most recent summary');
    await make(2, east);
    let results = await searchSimilarSummaries(east, 5, db);
    assert.equal(results.length, 2);
    assert.equal(results[0].emp_id, 2);
    assert.equal(results[1].summary_text, 'Most recent summary');
    assert.ok(Math.abs(results[0].similarity - 1) < 0.000001);
    assert.ok(Math.abs(results[1].similarity) < 0.000001);
    await make(2, null, 'New record-only snapshot');
    results = await searchSimilarSummaries(east, 5, db);
    assert.deepEqual(results.map((r) => r.emp_id), [1]);
    await db.query("UPDATE ai_work_summaries SET embedding_model='a-different-model' WHERE emp_id=1");
    assert.equal((await searchSimilarSummaries(east, 5, db)).length, 0);
  } finally { await db.close(); }
});

test('runnable vector CRUD demonstration changes captured rows and rolls back cleanly', async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(await readFile(new URL('../../database/pgvector/01_setup.sql', import.meta.url), 'utf8'));
    await db.query(`INSERT INTO ai_work_summaries (emp_id,summary_text,generation_method)
                    VALUES (42,'Existing cache must be preserved','record')`);
    const demo = await readFile(new URL('../../database/pgvector/02_crud_examples.sql', import.meta.url), 'utf8');
    // Execute twice to prove the example does not rely on sequence IDs 1/999.
    for (let run = 0; run < 2; run++) {
      const results = await db.exec(demo);
      const rows = results.flatMap((result) => result.rows || []);
      const operation = (name) => rows.filter((row) => row.operation === name);
      assert.equal(operation('read').length, 2);
      assert.ok(operation('read').every((row) => row.embedding_model === 'demo-unit-vector-v1'));
      assert.deepEqual(operation('similarity').map((row) => row.label), ['primary', 'orthogonal']);
      assert.ok(Math.abs(operation('similarity')[0].similarity - 1) < 0.000001);
      assert.ok(Math.abs(operation('similarity')[1].similarity) < 0.000001);
      assert.equal(operation('update').length, 1);
      assert.equal(operation('updated_read').length, 1);
      assert.equal(operation('updated_read')[0].summary_text, 'Updated synthetic payment-service contribution.');
      assert.ok(Math.abs(operation('updated_read')[0].similarity - 0.8) < 0.000001);
      assert.equal(operation('delete').length, 1);
      assert.equal(operation('delete')[0].summary_id, operation('update')[0].summary_id);
      assert.equal(operation('deleted_read')[0].remaining_primary_rows, 0);
      const remaining = await db.query('SELECT emp_id,summary_text FROM ai_work_summaries');
      assert.deepEqual(remaining.rows, [{ emp_id: 42, summary_text: 'Existing cache must be preserved' }]);
    }
  } finally { await db.close(); }
});

test('application-level vector read, update (re-embed) and delete change the real index', async () => {
  const db = new PGlite({ extensions: { vector } });
  try {
    await db.exec(await readFile(new URL('../../database/pgvector/01_setup.sql', import.meta.url), 'utf8'));
    const payment = localEmbedding('payment gateway integration card payments');
    const cloud = localEmbedding('kubernetes cluster migration network policies');
    const make = (empId, text, embedding) => insertSummary({
      empId, summaryText: text, sourceContext: 'rud', embedding, generationMethod: 'record',
      sourceFingerprint: 'b'.repeat(64), sourceLogIds: [], sourceTaskIds: [],
    }, db);
    const { embeddingModel } = await import('../lib/ai.mjs');
    const one = await make(1, 'payment gateway integration card payments', payment);
    const two = await make(2, 'kubernetes cluster migration network policies', cloud);
    // READ
    const read = await getSummary(one.summary_id, db);
    assert.equal(read.emp_id, 1); assert.equal(read.has_embedding, true);
    assert.equal(read.embedding, undefined, 'raw vector is never returned');
    assert.equal(await getSummary(999999, db), null);
    assert.deepEqual((await listSummaries(1, 20, db)).map((r) => r.summary_id), [one.summary_id]);
    // search before update: employee 1 owns the payment vector
    let hits = await searchSimilarSummaries(payment, 5, db);
    assert.equal(hits[0].emp_id, 1);
    // UPDATE: change text AND vector; the same row now ranks first for cloud queries
    const updated = await updateSummary(one.summary_id, { summaryText: 'kubernetes migration lead', embedding: localEmbedding('kubernetes migration lead') }, db);
    assert.equal(updated.generation_method, 'edited');
    assert.equal(updated.summary_text, 'kubernetes migration lead');
    assert.equal(updated.embedding_model, embeddingModel());
    assert.equal((await db.query('SELECT count(*)::int AS n FROM ai_work_summaries')).rows[0].n, 2, 'update never inserts');
    hits = await searchSimilarSummaries(localEmbedding('kubernetes migration'), 5, db);
    assert.equal(hits[0].emp_id, 1, 'edited vector now matches kubernetes queries best');
    assert.equal(hits[0].summary_text, 'kubernetes migration lead');
    assert.equal(await updateSummary(999999, { summaryText: 'x', embedding: payment }, db), null);
    // DELETE removes the vector from search
    assert.equal(await deleteSummary(one.summary_id, db), true);
    assert.equal(await deleteSummary(one.summary_id, db), false);
    assert.equal(await getSummary(one.summary_id, db), null);
    hits = await searchSimilarSummaries(localEmbedding('kubernetes migration'), 5, db);
    assert.deepEqual(hits.map((r) => r.emp_id), [2]);
    assert.ok(two.summary_id);
  } finally { await db.close(); }
});
