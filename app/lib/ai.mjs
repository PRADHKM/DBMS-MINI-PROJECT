import { createHash } from 'node:crypto';
import { HttpError } from './domain.mjs';

export const VECTOR_DIMENSIONS = 1536;
export const LOCAL_EMBEDDING_MODEL = 'local-hash-v1';
// The only embedding model is the built-in offline one; no external service is used.
export function embeddingModel() { return LOCAL_EMBEDDING_MODEL; }

// Offline embedding: signed feature hashing of stemmed unigrams and bigrams into
// 1536 dimensions, L2-normalised. It captures shared vocabulary (lexical
// similarity), NOT neural semantics.
const STOPWORDS = new Set(('a an and are as at be been but by for from had has have in into is it its of on or that the ' +
  'their this to was were will with who what which when where how did does do about work worked working').split(' '));
function stem(word) {
  for (const suffix of ['ations', 'ation', 'ing', 'ers', 'er', 'ed', 'es', 's', 'ly']) {
    if (word.length > suffix.length + 3 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}
function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash >>> 0;
}
export function localEmbedding(input) {
  const tokens = (String(input).toLowerCase().normalize('NFKD').match(/[a-z0-9]+/g) || [])
    .filter((word) => !STOPWORDS.has(word)).map(stem);
  const counts = new Map();
  const add = (feature, weight) => counts.set(feature, (counts.get(feature) || 0) + weight);
  tokens.forEach((token, i) => { add(token, 1); if (i) add(`${tokens[i - 1]} ${token}`, 0.5); });
  const vector = Array(VECTOR_DIMENSIONS).fill(0);
  for (const [feature, weight] of counts) {
    const hash = fnv1a(feature);
    vector[hash % VECTOR_DIMENSIONS] += ((hash >>> 16) & 1 ? 1 : -1) * (1 + Math.log(weight));
  }
  const norm = Math.sqrt(vector.reduce((sum, n) => sum + n * n, 0));
  if (!norm) throw new HttpError(400, 'Text must contain searchable words (letters or numbers).');
  return vector.map((n) => n / norm);
}
export function vectorLiteral(values) {
  if (!Array.isArray(values) || values.length !== VECTOR_DIMENSIONS ||
      values.some((n) => typeof n !== 'number' || !Number.isFinite(n)) ||
      values.every((n) => n === 0)) {
    throw new HttpError(502, 'Embedding is an invalid 1536-dimensional vector');
  }
  return `[${values.join(',')}]`;
}

export function createEmbedding(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 16000) {
    throw new HttpError(400, 'Embedding text must contain 1 to 16000 characters; regenerate a shorter summary.');
  }
  return localEmbedding(input);
}

export function fingerprintContext(context) {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}
export function selectTaskEvidence(tasks, limit = 100) {
  const priorities = { critical: 0, high: 1, medium: 2, low: 3 };
  return [...tasks].sort((a, b) => {
    const aDone = ['completed', 'cancelled'].includes(a.status);
    const bDone = ['completed', 'cancelled'].includes(b.status);
    return Number(aDone) - Number(bDone) ||
      (priorities[a.priority] ?? 2) - (priorities[b.priority] ?? 2) ||
      String(a.due_date || '9999-12-31').localeCompare(String(b.due_date || '9999-12-31')) ||
      Number(a.task_id) - Number(b.task_id);
  }).slice(0, limit);
}
export function recordSummary({ employee, tasks, worklog }) {
  const projects = [...new Set(worklog.map((w) => w.project_name))];
  const hours = worklog.reduce((sum, w) => sum + Number(w.hours_spent || 0), 0);
  const open = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status));
  const completed = tasks.filter((t) => t.status === 'completed');
  const listedProjects = projects.slice(0, 10);
  const sentences = [`${employee.name} (${employee.designation || 'employee'}) has ${worklog.length} work log entries totalling ${hours.toFixed(1)} hours${projects.length ? ` across ${listedProjects.join(', ')}${projects.length > 10 ? ` and ${projects.length - 10} other projects` : ''}` : ''}.`];
  if (completed.length) sentences.push(`Currently assigned completed tasks${completed.length > 10 ? ` (showing 10 of ${completed.length})` : ''}: ${completed.slice(0, 10).map((t) => t.title).join('; ')}.`);
  sentences.push(open.length
    ? `Open tasks needing continuity${open.length > 10 ? ` (showing 10 of ${open.length}, highest priority first)` : ''}: ${selectTaskEvidence(open, 10).map((t) => `${t.title} (${t.status.replaceAll('_', ' ')})`).join('; ')}.`
    : 'No open tasks are currently assigned.');
  const recent = worklog.filter((w) => w.notes).slice(-3);
  if (recent.length) sentences.push(`Recent recorded contributions: ${recent.map((w) => `${w.log_date}: ${w.notes.slice(0, 350)}`).join('; ')}.`);
  if (!worklog.length) sentences.push('No contribution details have been logged yet.');
  return sentences.join(' ');
}

// Summaries are built deterministically from the MySQL work records; no external service is called.
export function generateSummary(context) {
  return { text: recordSummary(context), method: 'record',
    sourceTaskIds: context.tasks.map((t) => t.task_id), sourceLogIds: context.worklog.map((w) => w.log_id) };
}
